import { describe, it, expect, vi } from 'vitest';
import { ErodeError } from '../../errors.js';

// Mock config (needed by GitHubReader/GitHubWriter/GitLabReader/GitLabWriter constructors)
vi.mock('../../utils/config.js', () => ({
  CONFIG: {
    github: { token: 'test-token', modelRepoPrToken: null },
    gitlab: { token: 'test-token', baseUrl: 'https://gitlab.com' },
    constraints: { maxFilesPerDiff: 50, maxLinesPerDiff: 5000 },
  },
}));

// Mock Octokit (needed by GitHubReader/GitHubWriter constructors)
vi.mock('@octokit/rest', () => ({
  Octokit: class MockOctokit {
    rest = {};
  },
}));

// Mock @gitbeaker/rest (needed by GitLabReader/GitLabWriter constructors)
vi.mock('@gitbeaker/rest', () => ({
  Gitlab: class MockGitlab {
    MergeRequests = {};
    Branches = {};
    Commits = {};
    MergeRequestNotes = {};
  },
}));

import { detectPlatform, createPlatformReader, createPlatformWriter } from '../platform-factory.js';
import { GitHubReader } from '../github/reader.js';
import { GitHubWriter } from '../github/writer.js';
import { GitLabReader } from '../gitlab/reader.js';
import { GitLabWriter } from '../gitlab/writer.js';

describe('detectPlatform', () => {
  it('should detect github.com URLs', () => {
    expect(detectPlatform('https://github.com/org/repo/pull/42')).toBe('github');
  });

  it('should detect www.github.com URLs', () => {
    expect(detectPlatform('https://www.github.com/org/repo/pull/42')).toBe('github');
  });

  it('should detect gitlab.com URLs', () => {
    expect(detectPlatform('https://gitlab.com/org/repo/-/merge_requests/1')).toBe('gitlab');
  });

  it('should detect www.gitlab.com URLs', () => {
    expect(detectPlatform('https://www.gitlab.com/org/repo/-/merge_requests/1')).toBe('gitlab');
  });

  it('should throw for unsupported platforms', () => {
    expect(() => detectPlatform('https://bitbucket.org/org/repo/pull-requests/1')).toThrow(
      ErodeError
    );
    expect(() => detectPlatform('https://bitbucket.org/org/repo/pull-requests/1')).toThrow(
      'Unsupported source platform'
    );
  });

  it('should throw for invalid URLs', () => {
    expect(() => detectPlatform('not-a-url')).toThrow(ErodeError);
    expect(() => detectPlatform('not-a-url')).toThrow('Invalid URL');
  });
});

describe('createPlatformReader', () => {
  it('should return a GitHubReader for GitHub URLs', () => {
    const reader = createPlatformReader('https://github.com/org/repo/pull/42');
    expect(reader).toBeInstanceOf(GitHubReader);
  });

  it('should pass token to GitHubReader', () => {
    const reader = createPlatformReader('https://github.com/org/repo/pull/42', 'custom-token');
    expect(reader).toBeInstanceOf(GitHubReader);
  });

  it('should return a GitLabReader for GitLab URLs', () => {
    const reader = createPlatformReader('https://gitlab.com/org/repo/-/merge_requests/1');
    expect(reader).toBeInstanceOf(GitLabReader);
  });

  it('should throw for unsupported platform URLs', () => {
    expect(() => createPlatformReader('https://bitbucket.org/org/repo/pull-requests/1')).toThrow(
      ErodeError
    );
  });
});

describe('createPlatformWriter', () => {
  it('should return a GitHubWriter for GitHub URLs', () => {
    const writer = createPlatformWriter('https://github.com/org/repo', 'org', 'repo');
    expect(writer).toBeInstanceOf(GitHubWriter);
  });

  it('should return a GitLabWriter for GitLab URLs', () => {
    const writer = createPlatformWriter('https://gitlab.com/org/repo', 'org', 'repo');
    expect(writer).toBeInstanceOf(GitLabWriter);
  });

  it('should throw for unsupported platform URLs', () => {
    expect(() => createPlatformWriter('https://bitbucket.org/org/repo', 'org', 'repo')).toThrow(
      ErodeError
    );
  });
});
