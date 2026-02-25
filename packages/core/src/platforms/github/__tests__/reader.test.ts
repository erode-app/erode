import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErodeError, ApiError, ErrorCode } from '../../../errors.js';
import type { ChangeRequestRef } from '../../source-platform.js';
import { runReaderContractTests } from '../../__tests__/reader-contract.js';

// Mock @octokit/rest
const mockPullsGet = vi.fn();
const mockPullsListFiles = vi.fn();
const mockPullsListCommits = vi.fn();
const mockReposCompareCommits = vi.fn();

vi.mock('@octokit/rest', () => ({
  Octokit: class MockOctokit {
    rest = {
      pulls: {
        get: mockPullsGet,
        listFiles: mockPullsListFiles,
        listCommits: mockPullsListCommits,
      },
      repos: {
        compareCommits: mockReposCompareCommits,
      },
    };
  },
}));

// Mock config
vi.mock('../../../utils/config.js', () => ({
  CONFIG: {
    github: { token: 'test-token' },
    constraints: { maxFilesPerDiff: 50, maxLinesPerDiff: 5000 },
  },
}));

import { GitHubReader } from '../reader.js';

function makePrResponse(overrides = {}) {
  return {
    data: {
      number: 42,
      title: 'Test PR',
      body: 'PR description',
      state: 'open',
      user: { login: 'testuser', name: 'Test User' },
      base: { ref: 'main', sha: 'base123' },
      head: { ref: 'feature/test', sha: 'head456' },
      commits: 1,
      additions: 10,
      deletions: 5,
      changed_files: 2,
      ...overrides,
    },
  };
}

function makeFilesResponse(files: { filename: string; changes: number; patch?: string }[] = []) {
  return {
    data: files.map((f) => ({
      filename: f.filename,
      status: 'modified',
      additions: Math.floor(f.changes / 2),
      deletions: f.changes - Math.floor(f.changes / 2),
      changes: f.changes,
      patch: f.patch ?? `@@ -1,3 +1,3 @@\n-old\n+new`,
    })),
  };
}

function makeComparisonResponse(
  files: { filename: string; patch?: string }[] = [{ filename: 'src/index.ts', patch: '+new' }]
) {
  return {
    data: {
      files: files.map((f) => ({ filename: f.filename, patch: f.patch })),
    },
  };
}

function makeRef(overrides: Partial<ChangeRequestRef> = {}): ChangeRequestRef {
  return {
    number: 42,
    url: 'https://github.com/org/repo/pull/42',
    repositoryUrl: 'https://github.com/org/repo',
    platformId: { owner: 'org', repo: 'repo' },
    ...overrides,
  };
}

describe('GitHubReader', () => {
  let reader: GitHubReader;

  beforeEach(() => {
    vi.clearAllMocks();
    reader = new GitHubReader('test-token');
  });

  describe('parseChangeRequestUrl', () => {
    it('should parse a valid GitHub PR URL', () => {
      const result = reader.parseChangeRequestUrl('https://github.com/org/repo/pull/42');
      expect(result).toEqual({
        number: 42,
        url: 'https://github.com/org/repo/pull/42',
        repositoryUrl: 'https://github.com/org/repo',
        platformId: { owner: 'org', repo: 'repo' },
      });
    });

    it('should parse URL with http scheme', () => {
      const result = reader.parseChangeRequestUrl('http://github.com/org/repo/pull/1');
      expect(result.number).toBe(1);
      expect(result.repositoryUrl).toBe('https://github.com/org/repo');
      expect(result.platformId).toEqual({ owner: 'org', repo: 'repo' });
    });

    it('should throw ErodeError for invalid URL', () => {
      expect(() => reader.parseChangeRequestUrl('https://example.com/not-a-pr')).toThrow(
        ErodeError
      );
      try {
        reader.parseChangeRequestUrl('https://example.com/not-a-pr');
      } catch (error) {
        expect(error).toBeInstanceOf(ErodeError);
        expect((error as ErodeError).code).toBe(ErrorCode.INVALID_URL);
      }
    });

    it('should throw ErodeError for empty string', () => {
      expect(() => reader.parseChangeRequestUrl('')).toThrow(ErodeError);
    });

    it('should populate repositoryUrl correctly', () => {
      const result = reader.parseChangeRequestUrl('https://github.com/my-org/my-repo/pull/123');
      expect(result.repositoryUrl).toBe('https://github.com/my-org/my-repo');
    });

    it('should populate platformId with owner and repo', () => {
      const result = reader.parseChangeRequestUrl('https://github.com/my-org/my-repo/pull/123');
      expect(result.platformId).toEqual({ owner: 'my-org', repo: 'my-repo' });
    });
  });

  describe('fetchChangeRequest', () => {
    const ref = makeRef();

    it('should return ChangeRequestData on success', async () => {
      mockPullsGet.mockResolvedValueOnce(makePrResponse());
      mockPullsListFiles.mockResolvedValueOnce(
        makeFilesResponse([{ filename: 'src/index.ts', changes: 5 }])
      );
      mockReposCompareCommits.mockResolvedValueOnce(
        makeComparisonResponse([{ filename: 'src/index.ts', patch: '+new line' }])
      );

      const result = await reader.fetchChangeRequest(ref);

      expect(result.number).toBe(42);
      expect(result.title).toBe('Test PR');
      expect(result.author.login).toBe('testuser');
      expect(result.files).toHaveLength(1);
      expect(result.diff).toContain('src/index.ts');
      expect(result.wasTruncated).toBe(false);
    });

    it('should truncate when file count exceeds max', async () => {
      const manyFiles = Array.from({ length: 60 }, (_, i) => ({
        filename: `file${String(i)}.ts`,
        changes: 1,
      }));
      mockPullsGet.mockResolvedValueOnce(makePrResponse());
      mockPullsListFiles.mockResolvedValueOnce(makeFilesResponse(manyFiles));
      mockReposCompareCommits.mockResolvedValueOnce(makeComparisonResponse());

      const result = await reader.fetchChangeRequest(ref);

      expect(result.wasTruncated).toBe(true);
      expect(result.truncationReason).toContain('50 files');
      expect(result.files).toHaveLength(50);
    });

    it('should truncate when line count exceeds max', async () => {
      const largeFile = [{ filename: 'big.ts', changes: 6000 }];
      mockPullsGet.mockResolvedValueOnce(makePrResponse());
      mockPullsListFiles.mockResolvedValueOnce(makeFilesResponse(largeFile));
      mockReposCompareCommits.mockResolvedValueOnce(makeComparisonResponse());

      const result = await reader.fetchChangeRequest(ref);

      expect(result.wasTruncated).toBe(true);
      expect(result.truncationReason).toContain('5000');
    });

    it('should wrap API errors as ApiError with github provider', async () => {
      mockPullsGet.mockRejectedValueOnce(new Error('Not Found'));

      try {
        await reader.fetchChangeRequest(ref);
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toContain('Could not retrieve pull request');
        expect((error as ApiError).context).toHaveProperty('provider', 'github');
      }
    });

    it('should rethrow ErodeError without wrapping', async () => {
      const erodeError = new ErodeError('test', ErrorCode.INVALID_URL, 'test');
      mockPullsGet.mockRejectedValueOnce(erodeError);

      await expect(reader.fetchChangeRequest(ref)).rejects.toBe(erodeError);
    });
  });

  describe('fetchChangeRequestCommits', () => {
    const ref = makeRef();

    it('should return parsed commits', async () => {
      mockPullsListCommits.mockResolvedValueOnce({
        data: [
          {
            sha: 'abc123',
            commit: {
              message: 'Add feature',
              author: { name: 'Dev', email: 'dev@example.com' },
            },
          },
        ],
      });

      const result = await reader.fetchChangeRequestCommits(ref);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        sha: 'abc123',
        message: 'Add feature',
        author: { name: 'Dev', email: 'dev@example.com' },
      });
    });

    it('should default missing author fields', async () => {
      mockPullsListCommits.mockResolvedValueOnce({
        data: [
          {
            sha: 'abc123',
            commit: { message: 'Fix', author: null },
          },
        ],
      });

      const result = await reader.fetchChangeRequestCommits(ref);

      expect(result[0]?.author.name).toBe('Unknown');
      expect(result[0]?.author.email).toBe('unknown@example.com');
    });

    it('should wrap API errors as ApiError with github provider', async () => {
      mockPullsListCommits.mockRejectedValueOnce(new Error('Server error'));

      try {
        await reader.fetchChangeRequestCommits(ref);
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).context).toHaveProperty('provider', 'github');
      }
    });
  });
});

// Run contract tests against GitHubReader
runReaderContractTests(() => new GitHubReader('test-token'), {
  validUrl: 'https://github.com/org/repo/pull/42',
  invalidUrl: 'https://example.com/not-a-pr',
});
