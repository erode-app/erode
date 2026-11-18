import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExecException } from 'child_process';
import { resolveModelSource } from '../model-source.js';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    mkdtemp: vi.fn().mockResolvedValue('/tmp/erode-model-token'),
    rm: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    chmod: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../utils/config.js', () => ({
  CONFIG: {
    github: { token: 'gh-token', modelRepoPrToken: undefined, baseUrl: undefined },
    gitlab: { token: 'gl-token', baseUrl: undefined },
    bitbucket: { token: 'bb-token', baseUrl: undefined },
  },
}));

import { execFile } from 'child_process';
import { writeFile } from 'node:fs/promises';
import { CONFIG } from '../config.js';

type ExecFileCallback = (
  error: ExecException | null,
  stdout: string | Buffer,
  stderr: string | Buffer
) => void;

const config = CONFIG as unknown as Record<
  'github' | 'gitlab' | 'bitbucket',
  { baseUrl: string | undefined }
>;

/** The clone URL and the token written to the askpass script, if any. */
async function clone(modelRepo: string): Promise<{ url: string; token: string | undefined }> {
  vi.mocked(writeFile).mockClear();
  vi.mocked(execFile).mockClear();
  await resolveModelSource('.', modelRepo);
  const gitArgs = vi.mocked(execFile).mock.calls[0]?.[1] as string[];
  const script = vi.mocked(writeFile).mock.calls[0]?.[1] as string | undefined;
  return {
    url: gitArgs.at(-2) ?? '',
    token: script ? /echo '(.*)'/.exec(script)?.[1] : undefined,
  };
}

describe('resolveModelSource token scoping', () => {
  beforeEach(() => {
    vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback | undefined;
      if (cb) cb(null, '', '');
      return undefined as never;
    });
  });

  afterEach(() => {
    config.github.baseUrl = undefined;
    config.gitlab.baseUrl = undefined;
    config.bitbucket.baseUrl = undefined;
  });

  it.each([
    ['https://github.com/o/r', 'gh-token'],
    ['https://gitlab.com/g/p', 'gl-token'],
    ['https://bitbucket.org/ws/r', 'bb-token'],
  ])('sends the token to the public host for %s', async (repo, token) => {
    expect((await clone(repo)).token).toBe(token);
  });

  it.each([
    'https://other.example/scm/key/models',
    'https://other.example/projects/KEY/repos/models',
    'https://github.com.evil.example/o/r',
    'https://gitlab.com.evil.example/g/p',
    'https://github.com:8443/o/r',
  ])('sends no token to %s', async (repo) => {
    const result = await clone(repo);
    expect(result.token).toBeUndefined();
    expect(result.url).not.toContain('@');
  });

  it('sends the Bitbucket token only to the configured Bitbucket Server host and base path', async () => {
    config.bitbucket.baseUrl = 'https://git.corp.example/bitbucket/rest/api/1.0';
    expect((await clone('https://git.corp.example/bitbucket/scm/KEY/models')).token).toBe(
      'bb-token'
    );
    expect((await clone('https://git.corp.example/other/scm/KEY/models')).token).toBeUndefined();
    expect((await clone('https://other.example/scm/KEY/models')).token).toBeUndefined();
    expect((await clone('https://bitbucket.org/ws/r')).token).toBeUndefined();
  });

  it('sends the GitHub token only to the configured Enterprise host', async () => {
    config.github.baseUrl = 'https://ghe.corp.example/api/v3';
    expect((await clone('https://ghe.corp.example/o/r')).token).toBe('gh-token');
    expect((await clone('https://github.com/o/r')).token).toBeUndefined();
    expect((await clone('o/r')).token).toBeUndefined();
  });

  it('sends the GitLab token only to the configured GitLab host and base path', async () => {
    config.gitlab.baseUrl = 'https://corp.example/gitlab';
    expect((await clone('https://corp.example/gitlab/g/p')).token).toBe('gl-token');
    expect((await clone('https://corp.example/other/g/p')).token).toBeUndefined();
    expect((await clone('https://gitlab.com/g/p')).token).toBeUndefined();
  });
});
