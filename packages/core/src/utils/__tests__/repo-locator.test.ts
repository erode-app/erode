import { afterEach, describe, it, expect, vi } from 'vitest';

vi.mock('../config.js', () => ({
  CONFIG: {
    github: { baseUrl: 'https://ghe.example.com/api/v3' },
    gitlab: { baseUrl: 'https://gitlab.example.com' },
    bitbucket: { baseUrl: 'https://bitbucket.example.com/rest/api/1.0' },
  },
}));

import { CONFIG } from '../config.js';
import {
  parseRepoLocator,
  isRepositoryHostUrl,
  normalizeRepositoryUrl,
  platformForHost,
  type RepoLocator,
} from '../repo-locator.js';

type Expected = Pick<RepoLocator, 'platform' | 'host' | 'owner' | 'repo' | 'canonicalUrl'> &
  Partial<Pick<RepoLocator, 'port' | 'protocol'>>;

const gh = (owner: string, repo: string, extra: Partial<Expected> = {}): Expected => ({
  platform: 'github',
  host: 'github.com',
  owner,
  repo,
  canonicalUrl: `https://github.com/${owner}/${repo}`,
  ...extra,
});

const cases: [string, Expected][] = [
  // HTTPS and HTTP
  ['https://github.com/Owner/Repo', gh('Owner', 'Repo', { protocol: 'https' })],
  ['https://github.com/owner/repo.git', gh('owner', 'repo')],
  ['https://github.com/owner/repo/', gh('owner', 'repo')],
  ['http://github.com/owner/repo', gh('owner', 'repo', { protocol: 'http' })],
  ['https://user:token@github.com/owner/repo.git', gh('owner', 'repo')],
  ['https://www.github.com/owner/repo', gh('owner', 'repo')],
  ['https://GitHub.com/owner/repo', gh('owner', 'repo')],
  // Platform suffixes
  ['https://github.com/owner/repo/tree/main/docs', gh('owner', 'repo')],
  ['https://github.com/owner/repo/blob/main/src/x.ts', gh('owner', 'repo')],
  ['https://github.com/owner/repo/pull/42/files', gh('owner', 'repo')],
  // SSH
  ['git@github.com:owner/repo.git', gh('owner', 'repo', { protocol: 'ssh' })],
  ['alice@github.com:owner/repo', gh('owner', 'repo', { protocol: 'ssh' })],
  ['git@github.com-work:owner/repo.git', gh('owner', 'repo')],
  ['ssh://git@github.com/owner/repo.git', gh('owner', 'repo', { protocol: 'ssh' })],
  ['git+ssh://git@github.com/owner/repo.git', gh('owner', 'repo', { protocol: 'ssh' })],
  [
    'ssh://git@gitlab.example.com:2222/g/p.git',
    {
      platform: 'gitlab',
      host: 'gitlab.example.com',
      port: 2222,
      owner: 'g',
      repo: 'p',
      canonicalUrl: 'https://gitlab.example.com/g/p',
    },
  ],
  // GitLab nested groups and /-/ suffixes
  [
    'https://gitlab.com/group/sub/project/-/tree/main',
    {
      platform: 'gitlab',
      host: 'gitlab.com',
      owner: 'group/sub',
      repo: 'project',
      canonicalUrl: 'https://gitlab.com/group/sub/project',
    },
  ],
  [
    'https://www.gitlab.com/group/project/-/merge_requests/3',
    {
      platform: 'gitlab',
      host: 'gitlab.com',
      owner: 'group',
      repo: 'project',
      canonicalUrl: 'https://gitlab.com/group/project',
    },
  ],
  [
    'git@gitlab.com:group/sub/project.git',
    {
      platform: 'gitlab',
      host: 'gitlab.com',
      owner: 'group/sub',
      repo: 'project',
      canonicalUrl: 'https://gitlab.com/group/sub/project',
    },
  ],
  // Bitbucket Cloud
  [
    'https://bitbucket.org/ws/repo/pull-requests/1',
    {
      platform: 'bitbucket',
      host: 'bitbucket.org',
      owner: 'ws',
      repo: 'repo',
      canonicalUrl: 'https://bitbucket.org/ws/repo',
    },
  ],
  [
    'git@bitbucket.org:ws/repo.git',
    {
      platform: 'bitbucket',
      host: 'bitbucket.org',
      owner: 'ws',
      repo: 'repo',
      canonicalUrl: 'https://bitbucket.org/ws/repo',
    },
  ],
  // Bitbucket Server and Data Center
  [
    'https://bitbucket.example.com/projects/KEY/repos/repo/browse',
    {
      platform: 'bitbucket-server',
      host: 'bitbucket.example.com',
      owner: 'KEY',
      repo: 'repo',
      canonicalUrl: 'https://bitbucket.example.com/projects/KEY/repos/repo',
    },
  ],
  [
    'https://bitbucket.example.com/scm/key/repo.git',
    {
      platform: 'bitbucket-server',
      host: 'bitbucket.example.com',
      owner: 'key',
      repo: 'repo',
      canonicalUrl: 'https://bitbucket.example.com/projects/key/repos/repo',
    },
  ],
  [
    'ssh://git@bitbucket.example.com:7999/key/repo.git',
    {
      platform: 'bitbucket-server',
      host: 'bitbucket.example.com',
      port: 7999,
      owner: 'key',
      repo: 'repo',
      canonicalUrl: 'https://bitbucket.example.com/projects/key/repos/repo',
    },
  ],
  // Azure DevOps
  [
    'https://dev.azure.com/Org/Project/_git/Repo',
    {
      platform: 'azure-devops',
      host: 'dev.azure.com',
      owner: 'Org/Project',
      repo: 'Repo',
      canonicalUrl: 'https://dev.azure.com/Org/Project/_git/Repo',
    },
  ],
  [
    'git@ssh.dev.azure.com:v3/Org/Project/Repo',
    {
      platform: 'azure-devops',
      host: 'dev.azure.com',
      owner: 'Org/Project',
      repo: 'Repo',
      canonicalUrl: 'https://dev.azure.com/Org/Project/_git/Repo',
    },
  ],
  // Configured GitHub Enterprise host
  [
    'https://ghe.example.com/org/repo/pull/7',
    {
      platform: 'github',
      host: 'ghe.example.com',
      owner: 'org',
      repo: 'repo',
      canonicalUrl: 'https://ghe.example.com/org/repo',
    },
  ],
  // git:// keeps its port out of the canonical URL
  [
    'git://git.example.com:9418/group/project.git',
    {
      platform: 'unknown',
      host: 'git.example.com',
      port: 9418,
      protocol: 'git',
      owner: 'group',
      repo: 'project',
      canonicalUrl: 'https://git.example.com/group/project',
    },
  ],
  // Scheme-less host:port is HTTPS with that port, not scp
  [
    'gitlab.example.com:8443/group/proj',
    {
      platform: 'gitlab',
      host: 'gitlab.example.com',
      port: 8443,
      protocol: 'https',
      owner: 'group',
      repo: 'proj',
      canonicalUrl: 'https://gitlab.example.com:8443/group/proj',
    },
  ],
  [
    'git@gitlab.example.com:8443/proj.git',
    {
      platform: 'gitlab',
      host: 'gitlab.example.com',
      protocol: 'ssh',
      owner: '8443',
      repo: 'proj',
      canonicalUrl: 'https://gitlab.example.com/8443/proj',
    },
  ],
  // Unknown hosts keep the full path and an explicit HTTPS port
  [
    'https://code.example.org:8443/team/sub/app.git',
    {
      platform: 'unknown',
      host: 'code.example.org',
      port: 8443,
      owner: 'team/sub',
      repo: 'app',
      canonicalUrl: 'https://code.example.org:8443/team/sub/app',
    },
  ],
];

describe('parseRepoLocator', () => {
  it.each(cases)('parses %s', (input, expected) => {
    const locator = parseRepoLocator(input);
    expect(locator).toMatchObject(expected);
    expect(locator?.slug).toBe(`${expected.owner}/${expected.repo}`);
    if (expected.port === undefined) expect(locator?.port).toBeUndefined();
  });

  it.each([
    '',
    'not-a-url',
    'owner/repo',
    'docs/readme.md',
    'https://github.com/owner',
    'https://dev.azure.com/org/project',
    'ftp://github.com/owner/repo',
    'C:\\repos\\app',
    'localhost:repo',
  ])('returns null for %j', (input) => {
    expect(parseRepoLocator(input)).toBeNull();
  });

  it.each([
    ['owner/repo', 'owner', 'repo'],
    ['owner/repo.git', 'owner', 'repo'],
    ['owner/repo///', 'owner', 'repo'],
  ])('accepts %s as GitHub shorthand when allowed', (input, owner, repo) => {
    expect(parseRepoLocator(input, { allowShorthand: true })).toMatchObject({
      platform: 'github',
      protocol: 'shorthand',
      owner,
      repo,
      canonicalUrl: `https://github.com/${owner}/${repo}`,
    });
  });

  it('never keeps credentials in the canonical URL', () => {
    const locator = parseRepoLocator('https://x-access-token:secret@github.com/o/r.git');
    expect(JSON.stringify(locator)).not.toContain('secret');
  });
});

describe('repository matching with configured hosts', () => {
  it('maps API base URLs to their web hosts', () => {
    expect(platformForHost('ghe.example.com')).toBe('github');
    expect(platformForHost('gitlab.example.com')).toBe('gitlab');
    expect(platformForHost('bitbucket.example.com')).toBe('bitbucket-server');
    expect(platformForHost('api.github.com')).toBe('unknown');
  });

  it('accepts model links to self-hosted instances', () => {
    expect(isRepositoryHostUrl('https://gitlab.example.com/group/project')).toBe(true);
    expect(isRepositoryHostUrl('https://ghe.example.com/org/repo')).toBe(true);
    expect(isRepositoryHostUrl('https://code.example.org/team/app')).toBe(false);
  });

  it('matches an SSH remote with a web link regardless of case', () => {
    expect(normalizeRepositoryUrl('git@gitlab.example.com:Group/Project.git')).toBe(
      normalizeRepositoryUrl('https://gitlab.example.com/group/project/-/tree/main')
    );
    expect(normalizeRepositoryUrl('git@github.com-work:Owner/Repo.git')).toBe(
      'https://github.com/owner/repo'
    );
  });

  it('ignores ports when matching an SSH remote with a web link', () => {
    expect(normalizeRepositoryUrl('ssh://git@gitlab.example.com:2222/g/p.git')).toBe(
      normalizeRepositoryUrl('https://gitlab.example.com:8443/g/p')
    );
  });

  it('does not treat a dotted host with a dash as an SSH alias', () => {
    expect(parseRepoLocator('git@github.com-mirror.corp.example:o/r.git')).toMatchObject({
      platform: 'unknown',
      host: 'github.com-mirror.corp.example',
    });
  });
});

describe('self-hosted base paths', () => {
  const config = CONFIG as unknown as Record<'gitlab' | 'bitbucket', { baseUrl: string }>;
  const saved = { gitlab: config.gitlab.baseUrl, bitbucket: config.bitbucket.baseUrl };
  afterEach(() => {
    config.gitlab.baseUrl = saved.gitlab;
    config.bitbucket.baseUrl = saved.bitbucket;
  });

  it('strips the GitLab context path from owner and keeps it in the canonical URL', () => {
    config.gitlab.baseUrl = 'https://example.com/gitlab/api/v4';
    expect(parseRepoLocator('https://example.com/gitlab/group/proj/-/tree/main')).toMatchObject({
      platform: 'gitlab',
      owner: 'group',
      repo: 'proj',
      slug: 'group/proj',
      canonicalUrl: 'https://example.com/gitlab/group/proj',
    });
    expect(parseRepoLocator('git@example.com:group/proj.git')).toMatchObject({
      platform: 'gitlab',
      slug: 'group/proj',
      canonicalUrl: 'https://example.com/gitlab/group/proj',
    });
    expect(parseRepoLocator('https://example.com/other/proj')?.platform).toBe('unknown');
    expect(parseRepoLocator('git@example.com:gitlab/proj.git')).toMatchObject({
      platform: 'gitlab',
      slug: 'gitlab/proj',
      canonicalUrl: 'https://example.com/gitlab/gitlab/proj',
    });
  });

  it('tells GitLab and Bitbucket Server apart on one host by base path', () => {
    config.gitlab.baseUrl = 'https://example.com/gitlab';
    config.bitbucket.baseUrl = 'https://example.com/bitbucket/rest/api/1.0';
    expect(parseRepoLocator('https://example.com/bitbucket/projects/KEY/repos/r')).toMatchObject({
      platform: 'bitbucket-server',
      slug: 'KEY/r',
      canonicalUrl: 'https://example.com/bitbucket/projects/KEY/repos/r',
    });
    expect(parseRepoLocator('https://example.com/gitlab/g/p')?.platform).toBe('gitlab');
  });

  it('picks up a changed base URL between calls', () => {
    expect(platformForHost('git.corp.example')).toBe('unknown');
    config.gitlab.baseUrl = 'https://git.corp.example';
    expect(platformForHost('git.corp.example')).toBe('gitlab');
  });
});
