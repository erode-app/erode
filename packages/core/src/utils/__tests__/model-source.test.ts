import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import type { ExecFileException } from 'child_process';
import { ErrorCode } from '../../errors.js';
import { parseModelRepo, resolveModelSource } from '../model-source.js';

// Mock child_process.execFile
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

// Mock node:fs/promises
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    mkdtemp: vi.fn(),
    rm: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    chmod: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock config
vi.mock('../../utils/config.js', () => ({
  CONFIG: {
    github: { token: 'gh-token-123', modelRepoPrToken: undefined },
    gitlab: { token: 'gl-token-456' },
    bitbucket: { token: 'bb-token-789' },
  },
}));

type ExecFileCallback = (
  error: ExecFileException | null,
  stdout: string | Buffer,
  stderr: string | Buffer
) => void;

describe('parseModelRepo', () => {
  it('parses a GitHub URL', () => {
    const result = parseModelRepo('https://github.com/owner/repo');
    expect(result).toEqual({
      cloneUrl: 'https://github.com/owner/repo.git',
      slug: 'owner/repo',
    });
  });

  it('parses a GitHub URL with .git suffix', () => {
    const result = parseModelRepo('https://github.com/owner/repo.git');
    expect(result).toEqual({
      cloneUrl: 'https://github.com/owner/repo.git',
      slug: 'owner/repo',
    });
  });

  it('parses a GitHub URL with trailing slash', () => {
    const result = parseModelRepo('https://github.com/owner/repo/');
    expect(result).toEqual({
      cloneUrl: 'https://github.com/owner/repo.git',
      slug: 'owner/repo',
    });
  });

  it('parses a GitLab URL with nested groups', () => {
    const result = parseModelRepo('https://gitlab.com/group/subgroup/project');
    expect(result).toEqual({
      cloneUrl: 'https://gitlab.com/group/subgroup/project.git',
      slug: 'group/subgroup/project',
    });
  });

  it('parses a Bitbucket URL', () => {
    const result = parseModelRepo('https://bitbucket.org/team/repo');
    expect(result).toEqual({
      cloneUrl: 'https://bitbucket.org/team/repo.git',
      slug: 'team/repo',
    });
  });

  it('treats a bare slug as GitHub', () => {
    const result = parseModelRepo('owner/repo');
    expect(result).toEqual({
      cloneUrl: 'https://github.com/owner/repo.git',
      slug: 'owner/repo',
    });
  });

  it('strips trailing slash from bare slug', () => {
    const result = parseModelRepo('owner/repo/');
    expect(result).toEqual({
      cloneUrl: 'https://github.com/owner/repo.git',
      slug: 'owner/repo',
    });
  });
});

describe('resolveModelSource', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns local path with no-op cleanup when modelRepo is undefined', async () => {
    const result = await resolveModelSource('./local-models');
    expect(result.localPath).toBe('./local-models');
    expect(result.repoSlug).toBeUndefined();
    // cleanup should be a no-op
    await expect(result.cleanup()).resolves.toBeUndefined();
  });

  it('clones a remote repo and returns joined subpath', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { execFile } = await import('child_process');

    const tmpDir = '/tmp/erode-model-abc123';
    vi.mocked(mkdtemp).mockResolvedValue(tmpDir);
    vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback | undefined;
      if (cb) cb(null, '', '');
      return undefined as never;
    });

    const result = await resolveModelSource('likec4', 'erode-app/playground-models-only');

    expect(result.localPath).toBe(join(tmpDir, 'likec4'));
    expect(result.repoSlug).toBe('erode-app/playground-models-only');

    // Verify clone was called with auth-prefixed URL
    expect(execFile).toHaveBeenCalledWith(
      'git',
      [
        'clone',
        '--depth',
        '1',
        '--branch',
        'main',
        'https://x-access-token@github.com/erode-app/playground-models-only.git',
        tmpDir,
      ],
      expect.objectContaining({ env: expect.any(Object) as unknown }),
      expect.any(Function)
    );

    // cleanup should remove temp dir
    await result.cleanup();
    expect(rm).toHaveBeenCalledWith(tmpDir, { recursive: true, force: true });
  });

  it('uses custom ref when provided', async () => {
    const { mkdtemp } = await import('node:fs/promises');
    const { execFile } = await import('child_process');

    vi.mocked(mkdtemp).mockResolvedValue('/tmp/erode-model-ref');
    vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback | undefined;
      if (cb) cb(null, '', '');
      return undefined as never;
    });

    await resolveModelSource('.', 'owner/repo', { ref: 'develop' });

    expect(execFile).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['--branch', 'develop']),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('throws IO_CLONE_FAILED and cleans up on clone failure', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { execFile } = await import('child_process');

    const tmpDir = '/tmp/erode-model-fail';
    vi.mocked(mkdtemp).mockResolvedValue(tmpDir);
    vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback | undefined;
      if (cb) cb(new Error('remote not found') as ExecFileException, '', '');
      return undefined as never;
    });

    await expect(resolveModelSource('.', 'bad/repo')).rejects.toMatchObject({
      code: ErrorCode.IO_CLONE_FAILED,
    });

    // Temp dir should be cleaned up on failure
    expect(rm).toHaveBeenCalledWith(tmpDir, { recursive: true, force: true });
  });
});
