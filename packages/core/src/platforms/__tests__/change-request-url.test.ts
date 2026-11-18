import { describe, it, expect, vi } from 'vitest';
import { ErodeError } from '../../errors.js';

vi.mock('../../utils/config.js', () => ({
  CONFIG: {
    github: { baseUrl: 'https://ghe.example.com/api/v3' },
    gitlab: { baseUrl: 'https://gitlab.example.com' },
    bitbucket: { baseUrl: 'https://api.bitbucket.org/2.0' },
  },
}));

import { CONFIG } from '../../utils/config.js';
import { parseChangeRequestRef } from '../change-request-url.js';

type Platform = 'github' | 'gitlab' | 'bitbucket';

const cases: [Platform, string, number, string, string, string][] = [
  ['github', 'https://github.com/o/r/pull/42', 42, 'https://github.com/o/r', 'o', 'r'],
  ['github', 'https://www.github.com/o/r/pull/42', 42, 'https://github.com/o/r', 'o', 'r'],
  ['github', 'https://github.com/o/r/pull/42/files', 42, 'https://github.com/o/r', 'o', 'r'],
  ['github', 'https://github.com/o/r/pull/42/', 42, 'https://github.com/o/r', 'o', 'r'],
  ['github', 'https://github.com/o/r/pull/42?tab=files#r1', 42, 'https://github.com/o/r', 'o', 'r'],
  ['github', 'https://ghe.example.com/o/r/pull/7', 7, 'https://ghe.example.com/o/r', 'o', 'r'],
  [
    'gitlab',
    'https://gitlab.com/g/s/p/-/merge_requests/5/diffs',
    5,
    'https://gitlab.com/g/s/p',
    'g/s',
    'p',
  ],
  [
    'gitlab',
    'https://www.gitlab.com/g/p/-/merge_requests/5/',
    5,
    'https://gitlab.com/g/p',
    'g',
    'p',
  ],
  [
    'gitlab',
    'https://gitlab.com/g/p/-/merge_requests/5#note_1',
    5,
    'https://gitlab.com/g/p',
    'g',
    'p',
  ],
  [
    'gitlab',
    'https://gitlab.example.com/g/p/-/merge_requests/9',
    9,
    'https://gitlab.example.com/g/p',
    'g',
    'p',
  ],

  [
    'bitbucket',
    'https://bitbucket.org/w/r/pull-requests/3/overview',
    3,
    'https://bitbucket.org/w/r',
    'w',
    'r',
  ],
  [
    'bitbucket',
    'https://bitbucket.org/w/r/pull-requests/3?tab=diff',
    3,
    'https://bitbucket.org/w/r',
    'w',
    'r',
  ],
];

describe('parseChangeRequestRef', () => {
  it.each(cases)('%s: %s', (platform, url, number, repositoryUrl, owner, repo) => {
    expect(parseChangeRequestRef(url, platform, 'bad')).toEqual({
      number,
      url,
      repositoryUrl,
      platformId: { owner, repo },
    });
  });

  it.each([
    ['github', 'https://gitlab.com/g/p/-/merge_requests/1'],
    ['github', 'https://github.com/o/r/pull/abc'],
    ['github', 'https://github.com/o/r/pull'],
    ['github', 'https://github.com/o/r/issues/1'],
    ['github', 'https://code.example.org/o/r/pull/1'],
    ['github', 'git@github.com:o/r.git'],
    ['gitlab', 'https://gitlab.com/g/p/merge_requests/1'],
    ['bitbucket', 'https://bitbucket.org/w/r/pull-requests/'],
    ['bitbucket', ''],
    ['github', 'https://github.com/o/r/tree/pull/12'],
    ['bitbucket', 'https://bitbucket.org/w/r/src/pull-requests/3'],
    ['gitlab', 'https://gitlab.com/g/p/-/tree/x/-/merge_requests/5'],
  ] as [Platform, string][])('%s rejects %s', (platform, url) => {
    expect(() => parseChangeRequestRef(url, platform, 'bad')).toThrow(ErodeError);
  });

  it('parses an MR on a GitLab instance under a context path', () => {
    const gitlab = CONFIG.gitlab as { baseUrl: string };
    const saved = gitlab.baseUrl;
    gitlab.baseUrl = 'https://example.com/gitlab';
    try {
      const url = 'https://example.com/gitlab/g/s/p/-/merge_requests/4';
      expect(parseChangeRequestRef(url, 'gitlab', 'bad')).toEqual({
        number: 4,
        url,
        repositoryUrl: 'https://example.com/gitlab/g/s/p',
        platformId: { owner: 'g/s', repo: 'p' },
      });
    } finally {
      gitlab.baseUrl = saved;
    }
  });
});
