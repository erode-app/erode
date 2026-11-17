import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecFileSync } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFileSync: mockExecFileSync,
}));

import {
  parseRepoFromRemote,
  normalizeToHttps,
  generateGitDiff,
  getRemoteUrl,
  parseFilesFromDiff,
  filterDiffByFiles,
} from '../git-diff.js';
import { ErodeError, ErrorCode } from '../../errors.js';

describe('parseRepoFromRemote', () => {
  it('parses HTTPS URL', () => {
    const result = parseRepoFromRemote('https://github.com/erode-app/erode');
    expect(result).toEqual({ owner: 'erode-app', repo: 'erode' });
  });

  it('parses HTTPS URL with .git suffix', () => {
    const result = parseRepoFromRemote('https://github.com/erode-app/erode.git');
    expect(result).toEqual({ owner: 'erode-app', repo: 'erode' });
  });

  it('parses HTTPS URL with trailing slash', () => {
    const result = parseRepoFromRemote('https://github.com/erode-app/erode/');
    expect(result).toEqual({ owner: 'erode-app', repo: 'erode' });
  });

  it('parses SSH URL', () => {
    const result = parseRepoFromRemote('git@github.com:erode-app/erode.git');
    expect(result).toEqual({ owner: 'erode-app', repo: 'erode' });
  });

  it('parses SSH URL without .git suffix', () => {
    const result = parseRepoFromRemote('git@github.com:erode-app/erode');
    expect(result).toEqual({ owner: 'erode-app', repo: 'erode' });
  });

  it('parses GitLab HTTPS URL', () => {
    const result = parseRepoFromRemote('https://gitlab.com/group/project');
    expect(result).toEqual({ owner: 'group', repo: 'project' });
  });

  it('parses GitLab HTTPS URL with nested groups', () => {
    const result = parseRepoFromRemote('https://gitlab.com/group/subgroup/repo');
    expect(result).toEqual({ owner: 'group/subgroup', repo: 'repo' });
  });

  it('parses GitLab SSH URL with nested groups', () => {
    const result = parseRepoFromRemote('git@gitlab.com:group/subgroup/repo.git');
    expect(result).toEqual({ owner: 'group/subgroup', repo: 'repo' });
  });

  it('parses Bitbucket HTTPS URL', () => {
    const result = parseRepoFromRemote('https://bitbucket.org/team/repo');
    expect(result).toEqual({ owner: 'team', repo: 'repo' });
  });

  it('throws on invalid URL', () => {
    expect(() => parseRepoFromRemote('not-a-url')).toThrow(ErodeError);
  });

  it('throws on empty string', () => {
    expect(() => parseRepoFromRemote('')).toThrow(ErodeError);
  });
});

describe('normalizeToHttps', () => {
  it('converts SSH URL to HTTPS', () => {
    expect(normalizeToHttps('git@github.com:owner/repo.git')).toBe('https://github.com/owner/repo');
  });

  it('converts SSH URL without .git suffix', () => {
    expect(normalizeToHttps('git@github.com:owner/repo')).toBe('https://github.com/owner/repo');
  });

  it('strips .git suffix from HTTPS URL', () => {
    expect(normalizeToHttps('https://github.com/owner/repo.git')).toBe(
      'https://github.com/owner/repo'
    );
  });

  it('passes through plain HTTPS URL', () => {
    expect(normalizeToHttps('https://github.com/owner/repo')).toBe('https://github.com/owner/repo');
  });

  it('handles GitLab SSH URLs', () => {
    expect(normalizeToHttps('git@gitlab.com:group/project.git')).toBe(
      'https://gitlab.com/group/project'
    );
  });

  it('strips credentials from HTTPS URL', () => {
    expect(normalizeToHttps('https://user:token@github.com/owner/repo.git')).toBe(
      'https://github.com/owner/repo'
    );
  });

  it('strips username-only credentials from HTTPS URL', () => {
    expect(normalizeToHttps('https://user@github.com/owner/repo.git')).toBe(
      'https://github.com/owner/repo'
    );
  });

  it.each([
    ['ssh://git@gitlab.example.com:2222/g/p.git', 'https://gitlab.example.com/g/p'],
    ['alice@github.com:owner/repo', 'https://github.com/owner/repo'],
    ['git@github.com-work:owner/repo.git', 'https://github.com/owner/repo'],
    ['git+ssh://git@github.com/owner/repo.git', 'https://github.com/owner/repo'],
    ['git@ssh.dev.azure.com:v3/org/proj/repo', 'https://dev.azure.com/org/proj/_git/repo'],
  ])('normalises %s', (input, expected) => {
    expect(normalizeToHttps(input)).toBe(expected);
  });
});

describe('generateGitDiff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty result for clean working tree', () => {
    mockExecFileSync.mockReturnValue('');

    const result = generateGitDiff();

    expect(result.diff).toBe('');
    expect(result.files).toEqual([]);
    expect(result.stats).toEqual({ additions: 0, deletions: 0, filesChanged: 0 });
  });

  it('parses NUL-separated name-status output for all statuses', () => {
    mockExecFileSync.mockImplementation((_bin: string, args: string[]) => {
      if (args.includes('--name-status')) {
        return [
          ...['A', 'src/new.ts', 'M', 'src/modified.ts', 'D', 'src/deleted.ts'],
          ...['R100', 'src/old-name.ts', 'src/renamed.ts'],
          ...['C100', 'src/source.ts', 'src/copied.ts'],
          ...['T', 'src/link.ts', 'U', 'src/conflict.ts', ''],
        ].join('\0');
      }
      return '';
    });

    const result = generateGitDiff();

    expect(result.files).toEqual([
      { filename: 'src/new.ts', status: 'added' },
      { filename: 'src/modified.ts', status: 'modified' },
      { filename: 'src/deleted.ts', status: 'removed' },
      { filename: 'src/renamed.ts', status: 'renamed' },
      { filename: 'src/copied.ts', status: 'copied' },
      { filename: 'src/link.ts', status: 'changed' },
      { filename: 'src/conflict.ts', status: 'unmerged' },
    ]);
  });

  it('sums numstat output, counting binary files without lines', () => {
    mockExecFileSync.mockImplementation((_bin: string, args: string[]) => {
      if (args.includes('--numstat')) {
        return ['10\t5\ta.ts', '-\t-\timage.png', '2\t0\t', 'old.ts', 'new.ts', ''].join('\0');
      }
      return '';
    });

    const result = generateGitDiff();

    expect(result.stats).toEqual({ additions: 12, deletions: 5, filesChanged: 3 });
  });

  it('runs git with stable options and the C locale', () => {
    mockExecFileSync.mockReturnValue('');

    generateGitDiff();

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      [
        ...['-c', 'core.quotePath=false', '-c', 'diff.relative=false', 'diff'],
        ...[
          '--no-color',
          '--no-ext-diff',
          '--src-prefix=a/',
          '--dst-prefix=b/',
          '--submodule=short',
        ],
      ],
      expect.objectContaining({
        encoding: 'utf-8',
        env: expect.objectContaining({ LC_ALL: 'C' }) as unknown,
      })
    );
  });

  it('passes --staged flag to every git diff call', () => {
    mockExecFileSync.mockReturnValue('');

    generateGitDiff({ staged: true });

    const calls = mockExecFileSync.mock.calls as [string, string[]][];
    expect(calls).toHaveLength(3);
    expect(calls.every(([, args]) => args.includes('--staged'))).toBe(true);
  });

  it('passes branch arg as three-dot diff to every git diff call', () => {
    mockExecFileSync.mockReturnValue('');

    generateGitDiff({ branch: 'main' });

    const calls = mockExecFileSync.mock.calls as [string, string[]][];
    expect(calls).toHaveLength(3);
    expect(calls.every(([, args]) => args.includes('main...HEAD'))).toBe(true);
  });

  it('throws when both branch and staged are set', () => {
    expect(() => generateGitDiff({ branch: 'main', staged: true })).toThrow(ErodeError);
    expect(() => generateGitDiff({ branch: 'main', staged: true })).toThrow(
      'Cannot use --branch and --staged together'
    );
  });

  it('throws when branch starts with a dash', () => {
    expect(() => generateGitDiff({ branch: '--exec=malicious' })).toThrow(ErodeError);
    expect(() => generateGitDiff({ branch: '--exec=malicious' })).toThrow(
      'Branch name cannot start with a dash'
    );
  });

  it('classifies permission denied errors', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('error: permission denied');
    });

    try {
      generateGitDiff();
    } catch (err) {
      expect(err).toBeInstanceOf(ErodeError);
      expect((err as ErodeError).code).toBe(ErrorCode.IO_PERMISSION_DENIED);
    }
  });

  it('classifies generic git errors as IO_EXEC_FAILED', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('some unknown git error');
    });

    try {
      generateGitDiff();
    } catch (err) {
      expect(err).toBeInstanceOf(ErodeError);
      expect((err as ErodeError).code).toBe(ErrorCode.IO_EXEC_FAILED);
    }
  });

  it('passes cwd to execFileSync', () => {
    mockExecFileSync.mockReturnValue('');

    generateGitDiff({ cwd: '/custom/path' });

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      expect.any(Array),
      expect.objectContaining({ cwd: '/custom/path' })
    );
  });

  it('wraps git failures as ErodeError', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('fatal: not a git repository');
    });

    expect(() => generateGitDiff()).toThrow(ErodeError);
  });
});

describe('getRemoteUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the remote URL for origin', () => {
    mockExecFileSync.mockReturnValue('https://github.com/org/repo.git');

    expect(getRemoteUrl()).toBe('https://github.com/org/repo.git');
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['-c', 'core.quotePath=false', 'remote', 'get-url', 'origin'],
      expect.objectContaining({ encoding: 'utf-8' })
    );
  });

  it('accepts a custom remote name', () => {
    mockExecFileSync.mockReturnValue('https://github.com/org/repo.git');

    expect(getRemoteUrl('upstream')).toBe('https://github.com/org/repo.git');
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['-c', 'core.quotePath=false', 'remote', 'get-url', 'upstream'],
      expect.objectContaining({ encoding: 'utf-8' })
    );
  });

  it('passes cwd to execFileSync', () => {
    mockExecFileSync.mockReturnValue('https://github.com/org/repo.git');

    getRemoteUrl('origin', '/custom/path');

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['-c', 'core.quotePath=false', 'remote', 'get-url', 'origin'],
      expect.objectContaining({ cwd: '/custom/path' })
    );
  });

  it('wraps git failures as ErodeError', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('fatal: No such remote');
    });

    expect(() => getRemoteUrl()).toThrow(ErodeError);
  });

  it('throws when remote name starts with a dash', () => {
    expect(() => getRemoteUrl('--upload-pack=malicious')).toThrow(ErodeError);
    expect(() => getRemoteUrl('--upload-pack=malicious')).toThrow(
      'Remote name cannot start with a dash'
    );
  });
});

describe('parseFilesFromDiff', () => {
  it('extracts filenames from multi-file diff', () => {
    const diff = [
      'diff --git a/src/index.ts b/src/index.ts',
      '--- a/src/index.ts',
      '+++ b/src/index.ts',
      '@@ -1 +1,2 @@',
      '+import { foo } from "./foo";',
      'diff --git a/src/foo.ts b/src/foo.ts',
      '--- /dev/null',
      '+++ b/src/foo.ts',
      '@@ -0,0 +1 @@',
      '+export const foo = 1;',
    ].join('\n');

    const result = parseFilesFromDiff(diff);

    expect(result).toEqual([
      { filename: 'src/index.ts', status: 'modified' },
      { filename: 'src/foo.ts', status: 'modified' },
    ]);
  });

  it('deduplicates files appearing multiple times', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '+line1',
      'diff --git a/src/a.ts b/src/a.ts',
      '+line2',
    ].join('\n');

    const result = parseFilesFromDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]?.filename).toBe('src/a.ts');
  });

  it('handles renamed files (b/ path)', () => {
    const diff = 'diff --git a/old-name.ts b/new-name.ts\n--- a/old-name.ts\n+++ b/new-name.ts';

    const result = parseFilesFromDiff(diff);

    expect(result).toEqual([{ filename: 'new-name.ts', status: 'modified' }]);
  });

  it('returns empty array for empty diff', () => {
    expect(parseFilesFromDiff('')).toEqual([]);
  });

  it('returns empty array for diff without git headers', () => {
    expect(parseFilesFromDiff('just some text\nno diff headers')).toEqual([]);
  });
});

describe('filterDiffByFiles', () => {
  it('filters diff to only include specified files', () => {
    const diff = [
      'diff --git a/src/keep.ts b/src/keep.ts',
      '--- a/src/keep.ts',
      '+++ b/src/keep.ts',
      '@@ -1 +1,2 @@',
      '+kept line',
      'diff --git a/src/exclude.ts b/src/exclude.ts',
      '--- a/src/exclude.ts',
      '+++ b/src/exclude.ts',
      '@@ -1 +1,2 @@',
      '+excluded line',
    ].join('\n');

    const result = filterDiffByFiles(diff, [{ filename: 'src/keep.ts' }]);

    expect(result).toContain('src/keep.ts');
    expect(result).not.toContain('src/exclude.ts');
  });

  it('returns empty string for empty diff', () => {
    expect(filterDiffByFiles('', [{ filename: 'a.ts' }])).toBe('');
  });

  it('returns empty string for empty file list', () => {
    expect(filterDiffByFiles('diff --git a/a.ts b/a.ts\n+line', [])).toBe('');
  });
});
