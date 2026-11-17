import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErodeError, ErrorCode } from '../../errors.js';

const octokitOptions: Record<string, unknown>[] = [];
const gitlabOptions: Record<string, unknown>[] = [];

vi.mock('@octokit/rest', () => ({
  Octokit: class MockOctokit {
    constructor(options: Record<string, unknown>) {
      octokitOptions.push(options);
    }
    rest = {
      pulls: {
        get: vi.fn().mockRejectedValue(new Error('stop')),
        listCommits: vi.fn().mockRejectedValue(new Error('stop')),
      },
    };
  },
}));

vi.mock('@gitbeaker/rest', () => ({
  Gitlab: class MockGitlab {
    constructor(options: Record<string, unknown>) {
      gitlabOptions.push(options);
    }
    MergeRequests = {
      show: vi.fn().mockRejectedValue(new Error('stop')),
      allCommits: vi.fn().mockRejectedValue(new Error('stop')),
    };
  },
}));

vi.mock('../../utils/config.js', async (importOriginal) => ({
  ...(await importOriginal()),
  CONFIG: {
    github: { token: 'gh-token', modelRepoPrToken: null, baseUrl: 'https://api.github.com' },
    gitlab: { token: 'gl-token', baseUrl: 'https://gitlab.com' },
    bitbucket: { token: 'bb-token', baseUrl: 'https://api.bitbucket.org/2.0' },
    constraints: { maxFilesPerDiff: 50, maxLinesPerDiff: 5000 },
  },
}));

import { CONFIG } from '../../utils/config.js';
import { resolvePlatformEndpoint } from '../api-endpoint.js';
import { GitHubReader } from '../github/reader.js';
import { GitHubWriter } from '../github/writer.js';
import { GitLabReader } from '../gitlab/reader.js';
import { GitLabWriter } from '../gitlab/writer.js';
import { BitbucketWriter } from '../bitbucket/writer.js';

const GHE_API = 'https://ghe.example.com/api/v3';
const GITLAB_SELF_HOSTED = 'https://git.example.com/gitlab';

function useDefaults(): void {
  CONFIG.github.baseUrl = 'https://api.github.com';
  CONFIG.gitlab.baseUrl = 'https://gitlab.com';
  CONFIG.bitbucket.baseUrl = 'https://api.bitbucket.org/2.0';
}

beforeEach(() => {
  octokitOptions.length = 0;
  gitlabOptions.length = 0;
  useDefaults();
});

describe('resolvePlatformEndpoint', () => {
  it('uses the public API and token without a self-hosted setting', () => {
    expect(resolvePlatformEndpoint('https://github.com/o/r', 'github')).toEqual({
      baseUrl: 'https://api.github.com',
      tokenApplies: true,
    });
  });

  it('uses the public API without the token for a public URL when GHE is configured', () => {
    CONFIG.github.baseUrl = GHE_API;
    expect(resolvePlatformEndpoint('https://github.com/o/r', 'github')).toEqual({
      baseUrl: 'https://api.github.com',
      tokenApplies: false,
    });
  });

  it('uses the configured base URL and token for the GHE host', () => {
    CONFIG.github.baseUrl = GHE_API;
    expect(resolvePlatformEndpoint('https://ghe.example.com/o/r', 'github')).toEqual({
      baseUrl: GHE_API,
      tokenApplies: true,
    });
  });

  it('rejects an unrelated host and names the host and the setting', () => {
    CONFIG.github.baseUrl = GHE_API;
    expect(() => resolvePlatformEndpoint('https://other.example.org/o/r', 'github')).toThrow(
      /other\.example\.org.*ERODE_GITHUB_BASE_URL/
    );
    try {
      resolvePlatformEndpoint('https://other.example.org/o/r', 'github');
    } catch (error) {
      expect(error).toBeInstanceOf(ErodeError);
      expect((error as ErodeError).code).toBe(ErrorCode.PLATFORM_INVALID_URL);
    }
  });

  it('rejects the GHE host on a different port', () => {
    CONFIG.github.baseUrl = GHE_API;
    expect(() => resolvePlatformEndpoint('https://ghe.example.com:8443/o/r', 'github')).toThrow(
      ErodeError
    );
  });

  it('uses the public API without the token for gitlab.com when self-hosted is configured', () => {
    CONFIG.gitlab.baseUrl = GITLAB_SELF_HOSTED;
    expect(resolvePlatformEndpoint('https://gitlab.com/g/p', 'gitlab')).toEqual({
      baseUrl: 'https://gitlab.com',
      tokenApplies: false,
    });
  });

  it('uses the configured base URL and token for the self-hosted GitLab', () => {
    CONFIG.gitlab.baseUrl = GITLAB_SELF_HOSTED;
    expect(resolvePlatformEndpoint(`${GITLAB_SELF_HOSTED}/g/p`, 'gitlab')).toEqual({
      baseUrl: GITLAB_SELF_HOSTED,
      tokenApplies: true,
    });
  });

  it('rejects an unrelated host for GitLab', () => {
    CONFIG.gitlab.baseUrl = GITLAB_SELF_HOSTED;
    expect(() => resolvePlatformEndpoint('https://other.example.org/g/p', 'gitlab')).toThrow(
      /other\.example\.org.*ERODE_GITLAB_BASE_URL/
    );
  });
});

describe('GitHub with GHE configured', () => {
  beforeEach(() => {
    CONFIG.github.baseUrl = GHE_API;
  });

  it('reader sends a github.com PR to api.github.com without the GHE token', async () => {
    const reader = new GitHubReader();
    const ref = reader.parseChangeRequestUrl('https://github.com/o/r/pull/1');
    await expect(reader.fetchChangeRequest(ref)).rejects.toThrow();
    expect(octokitOptions).toEqual([{ baseUrl: 'https://api.github.com' }]);
  });

  it('reader sends a GHE PR to the GHE base URL with the token', async () => {
    const reader = new GitHubReader();
    const ref = reader.parseChangeRequestUrl('https://ghe.example.com/o/r/pull/1');
    await expect(reader.fetchChangeRequest(ref)).rejects.toThrow();
    expect(octokitOptions).toEqual([{ auth: 'gh-token', baseUrl: GHE_API }]);
  });

  it('reader rejects a ref on an unrelated host before any API call', async () => {
    const reader = new GitHubReader();
    const ref = {
      number: 1,
      url: 'https://other.example.org/o/r/pull/1',
      repositoryUrl: 'https://other.example.org/o/r',
      platformId: { owner: 'o', repo: 'r' },
    };
    await expect(reader.fetchChangeRequest(ref)).rejects.toThrow(/ERODE_GITHUB_BASE_URL/);
    expect(octokitOptions).toEqual([]);
  });

  it('reader rejects an unrelated host URL when parsing', () => {
    expect(() =>
      new GitHubReader().parseChangeRequestUrl('https://other.example.org/o/r/pull/1')
    ).toThrow(ErodeError);
  });

  it('writer refuses a github.com repository instead of using the GHE token', () => {
    expect(() => new GitHubWriter('o', 'r', 'https://github.com/o/r')).toThrow(
      'A GitHub token is needed'
    );
    expect(octokitOptions).toEqual([]);
  });

  it('writer uses the GHE base URL for a GHE repository', () => {
    new GitHubWriter('o', 'r', 'https://ghe.example.com/o/r');
    expect(octokitOptions).toEqual([{ auth: 'gh-token', baseUrl: GHE_API }]);
  });

  it('writer rejects an unrelated host', () => {
    expect(() => new GitHubWriter('o', 'r', 'https://other.example.org/o/r')).toThrow(
      /ERODE_GITHUB_BASE_URL/
    );
  });
});

describe('GitLab with a self-hosted instance configured', () => {
  beforeEach(() => {
    CONFIG.gitlab.baseUrl = GITLAB_SELF_HOSTED;
  });

  it('reader sends a gitlab.com MR to gitlab.com without the self-hosted token', async () => {
    const reader = new GitLabReader();
    const ref = reader.parseChangeRequestUrl('https://gitlab.com/g/p/-/merge_requests/1');
    await expect(reader.fetchChangeRequest(ref)).rejects.toThrow();
    expect(gitlabOptions).toEqual([{ host: 'https://gitlab.com' }]);
  });

  it('reader sends a self-hosted MR to the configured base URL with the token', async () => {
    const reader = new GitLabReader();
    const ref = reader.parseChangeRequestUrl(`${GITLAB_SELF_HOSTED}/g/p/-/merge_requests/1`);
    await expect(reader.fetchChangeRequest(ref)).rejects.toThrow();
    expect(gitlabOptions).toEqual([{ token: 'gl-token', host: GITLAB_SELF_HOSTED }]);
  });

  it('reader rejects a ref on an unrelated host before any API call', async () => {
    const reader = new GitLabReader();
    const ref = {
      number: 1,
      url: 'https://other.example.org/g/p/-/merge_requests/1',
      repositoryUrl: 'https://other.example.org/g/p',
      platformId: { owner: 'g', repo: 'p' },
    };
    await expect(reader.fetchChangeRequest(ref)).rejects.toThrow(/ERODE_GITLAB_BASE_URL/);
    expect(gitlabOptions).toEqual([]);
  });

  it('writer refuses a gitlab.com repository instead of using the self-hosted token', () => {
    expect(() => new GitLabWriter('g', 'p', 'https://gitlab.com/g/p')).toThrow(
      'A GitLab token is needed'
    );
  });

  it('writer uses the configured base URL for a self-hosted repository', () => {
    new GitLabWriter('g', 'p', `${GITLAB_SELF_HOSTED}/g/p`);
    expect(gitlabOptions).toEqual([{ token: 'gl-token', host: GITLAB_SELF_HOSTED }]);
  });

  it('writer rejects an unrelated host', () => {
    expect(() => new GitLabWriter('g', 'p', 'https://other.example.org/g/p')).toThrow(
      /ERODE_GITLAB_BASE_URL/
    );
  });
});

describe('Bitbucket with a custom base URL configured', () => {
  it('writer refuses bitbucket.org instead of using the custom instance token', () => {
    CONFIG.bitbucket.baseUrl = 'https://bb.example.com/rest/api/1.0';
    expect(() => new BitbucketWriter('w', 'r', 'https://bitbucket.org/w/r')).toThrow(
      'A Bitbucket token is needed'
    );
  });
});
