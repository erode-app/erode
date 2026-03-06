import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecFileSync } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFileSync: mockExecFileSync,
}));

import {
  parseRepoFromRemote,
  normaliseToHttps,
  generateGitDiff,
  getRemoteUrl,
} from '../git-diff.js';
import { ErodeError } from '../../errors.js';

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

describe('normaliseToHttps', () => {
  it('converts SSH URL to HTTPS', () => {
    expect(normaliseToHttps('git@github.com:owner/repo.git')).toBe('https://github.com/owner/repo');
  });

  it('converts SSH URL without .git suffix', () => {
    expect(normaliseToHttps('git@github.com:owner/repo')).toBe('https://github.com/owner/repo');
  });

  it('strips .git suffix from HTTPS URL', () => {
    expect(normaliseToHttps('https://github.com/owner/repo.git')).toBe(
      'https://github.com/owner/repo'
    );
  });

  it('passes through plain HTTPS URL', () => {
    expect(normaliseToHttps('https://github.com/owner/repo')).toBe('https://github.com/owner/repo');
  });

  it('handles GitLab SSH URLs', () => {
    expect(normaliseToHttps('git@gitlab.com:group/project.git')).toBe(
      'https://gitlab.com/group/project'
    );
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

  it('parses name-status output for all statuses', () => {
    mockExecFileSync.mockImplementation((_bin: string, args: string[]) => {
      if (args.includes('--name-status')) {
        return 'A\tsrc/new.ts\nM\tsrc/modified.ts\nD\tsrc/deleted.ts\nR100\tsrc/old-name.ts\tsrc/renamed.ts\nC100\tsrc/source.ts\tsrc/copied.ts\n';
      }
      if (args.includes('--shortstat')) {
        return ' 5 files changed, 20 insertions(+), 3 deletions(-)';
      }
      return 'diff content';
    });

    const result = generateGitDiff();

    expect(result.files).toEqual([
      { filename: 'src/new.ts', status: 'added' },
      { filename: 'src/modified.ts', status: 'modified' },
      { filename: 'src/deleted.ts', status: 'removed' },
      { filename: 'src/renamed.ts', status: 'renamed' },
      { filename: 'src/copied.ts', status: 'copied' },
    ]);
  });

  it('parses shortstat output', () => {
    mockExecFileSync.mockImplementation((_bin: string, args: string[]) => {
      if (args.includes('--shortstat')) {
        return ' 3 files changed, 12 insertions(+), 5 deletions(-)';
      }
      return '';
    });

    const result = generateGitDiff();

    expect(result.stats).toEqual({ additions: 12, deletions: 5, filesChanged: 3 });
  });

  it('handles shortstat with only insertions', () => {
    mockExecFileSync.mockImplementation((_bin: string, args: string[]) => {
      if (args.includes('--shortstat')) {
        return ' 1 file changed, 7 insertions(+)';
      }
      return '';
    });

    const result = generateGitDiff();

    expect(result.stats).toEqual({ additions: 7, deletions: 0, filesChanged: 1 });
  });

  it('passes --staged flag to git diff', () => {
    mockExecFileSync.mockReturnValue('');

    generateGitDiff({ staged: true });

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['diff', '--staged'],
      expect.objectContaining({ encoding: 'utf-8' })
    );
  });

  it('passes branch arg as three-dot diff', () => {
    mockExecFileSync.mockReturnValue('');

    generateGitDiff({ branch: 'main' });

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['diff', 'main...HEAD'],
      expect.objectContaining({ encoding: 'utf-8' })
    );
  });

  it('throws when both branch and staged are set', () => {
    expect(() => generateGitDiff({ branch: 'main', staged: true })).toThrow(ErodeError);
    expect(() => generateGitDiff({ branch: 'main', staged: true })).toThrow(
      'Cannot use --branch and --staged together'
    );
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
      ['remote', 'get-url', 'origin'],
      expect.objectContaining({ encoding: 'utf-8' })
    );
  });

  it('accepts a custom remote name', () => {
    mockExecFileSync.mockReturnValue('https://github.com/org/repo.git');

    expect(getRemoteUrl('upstream')).toBe('https://github.com/org/repo.git');
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['remote', 'get-url', 'upstream'],
      expect.objectContaining({ encoding: 'utf-8' })
    );
  });

  it('passes cwd to execFileSync', () => {
    mockExecFileSync.mockReturnValue('https://github.com/org/repo.git');

    getRemoteUrl('origin', '/custom/path');

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['remote', 'get-url', 'origin'],
      expect.objectContaining({ cwd: '/custom/path' })
    );
  });

  it('wraps git failures as ErodeError', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('fatal: No such remote');
    });

    expect(() => getRemoteUrl()).toThrow(ErodeError);
  });
});
