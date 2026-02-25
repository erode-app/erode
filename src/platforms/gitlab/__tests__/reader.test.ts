import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErodeError, ApiError, ErrorCode } from '../../../errors.js';
import type { ChangeRequestRef } from '../../source-platform.js';
import { runReaderContractTests } from '../../__tests__/reader-contract.js';

// Mock @gitbeaker/rest
const mockMrShow = vi.fn();
const mockMrAllDiffs = vi.fn();
const mockMrAllCommits = vi.fn();

vi.mock('@gitbeaker/rest', () => ({
  Gitlab: class MockGitlab {
    MergeRequests = {
      show: mockMrShow,
      allDiffs: mockMrAllDiffs,
      allCommits: mockMrAllCommits,
    };
  },
}));

// Mock config
vi.mock('../../../utils/config.js', () => ({
  CONFIG: {
    gitlab: { token: 'test-token', baseUrl: 'https://gitlab.com' },
    constraints: { maxFilesPerDiff: 50, maxLinesPerDiff: 5000 },
  },
}));

import { GitLabReader } from '../reader.js';

function makeMrResponse(overrides = {}) {
  return {
    iid: 42,
    title: 'Test MR',
    description: 'MR description',
    state: 'opened',
    author: { username: 'testuser', name: 'Test User' },
    target_branch: 'main',
    source_branch: 'feature/test',
    diff_refs: { base_sha: 'base123', head_sha: 'head456' },
    commits_count: 1,
    ...overrides,
  };
}

function makeDiffsResponse(
  diffs: {
    old_path: string;
    new_path: string;
    diff?: string;
    new_file?: boolean;
    deleted_file?: boolean;
    renamed_file?: boolean;
  }[] = []
) {
  return diffs.map((d) => ({
    old_path: d.old_path,
    new_path: d.new_path,
    diff: d.diff ?? '@@ -1,3 +1,3 @@\n-old\n+new',
    new_file: d.new_file ?? false,
    deleted_file: d.deleted_file ?? false,
    renamed_file: d.renamed_file ?? false,
  }));
}

function makeRef(overrides: Partial<ChangeRequestRef> = {}): ChangeRequestRef {
  return {
    number: 42,
    url: 'https://gitlab.com/org/repo/-/merge_requests/42',
    repositoryUrl: 'https://gitlab.com/org/repo',
    platformId: { owner: 'org', repo: 'repo' },
    ...overrides,
  };
}

describe('GitLabReader', () => {
  let reader: GitLabReader;

  beforeEach(() => {
    vi.clearAllMocks();
    reader = new GitLabReader('test-token');
  });

  describe('parseChangeRequestUrl', () => {
    it('should parse a valid GitLab MR URL', () => {
      const result = reader.parseChangeRequestUrl(
        'https://gitlab.com/org/repo/-/merge_requests/42'
      );
      expect(result).toEqual({
        number: 42,
        url: 'https://gitlab.com/org/repo/-/merge_requests/42',
        repositoryUrl: 'https://gitlab.com/org/repo',
        platformId: { owner: 'org', repo: 'repo' },
      });
    });

    it('should parse URL with subgroups', () => {
      const result = reader.parseChangeRequestUrl(
        'https://gitlab.com/group/subgroup/repo/-/merge_requests/10'
      );
      expect(result).toEqual({
        number: 10,
        url: 'https://gitlab.com/group/subgroup/repo/-/merge_requests/10',
        repositoryUrl: 'https://gitlab.com/group/subgroup/repo',
        platformId: { owner: 'group/subgroup', repo: 'repo' },
      });
    });

    it('should parse URL with deeply nested subgroups', () => {
      const result = reader.parseChangeRequestUrl(
        'https://gitlab.com/a/b/c/d/repo/-/merge_requests/5'
      );
      expect(result.platformId).toEqual({ owner: 'a/b/c/d', repo: 'repo' });
      expect(result.repositoryUrl).toBe('https://gitlab.com/a/b/c/d/repo');
    });

    it('should parse URL with http scheme', () => {
      const result = reader.parseChangeRequestUrl('http://gitlab.com/org/repo/-/merge_requests/1');
      expect(result.number).toBe(1);
      expect(result.platformId).toEqual({ owner: 'org', repo: 'repo' });
    });

    it('should throw ErodeError for invalid URL', () => {
      expect(() => reader.parseChangeRequestUrl('https://example.com/not-a-mr')).toThrow(
        ErodeError
      );
      try {
        reader.parseChangeRequestUrl('https://example.com/not-a-mr');
      } catch (error) {
        expect(error).toBeInstanceOf(ErodeError);
        expect((error as ErodeError).code).toBe(ErrorCode.INVALID_URL);
      }
    });

    it('should throw ErodeError for empty string', () => {
      expect(() => reader.parseChangeRequestUrl('')).toThrow(ErodeError);
    });

    it('should return consistent results for the same URL', () => {
      const url = 'https://gitlab.com/org/repo/-/merge_requests/42';
      const ref1 = reader.parseChangeRequestUrl(url);
      const ref2 = reader.parseChangeRequestUrl(url);
      expect(ref1).toEqual(ref2);
    });
  });

  describe('fetchChangeRequest', () => {
    const ref = makeRef();

    it('should return ChangeRequestData on success', async () => {
      mockMrShow.mockResolvedValueOnce(makeMrResponse());
      mockMrAllDiffs.mockResolvedValueOnce(
        makeDiffsResponse([
          {
            old_path: 'src/index.ts',
            new_path: 'src/index.ts',
            diff: '@@ -1,3 +1,3 @@\n-old\n+new line',
          },
        ])
      );

      const result = await reader.fetchChangeRequest(ref);

      expect(result.number).toBe(42);
      expect(result.title).toBe('Test MR');
      expect(result.author.login).toBe('testuser');
      expect(result.files).toHaveLength(1);
      expect(result.diff).toContain('src/index.ts');
      expect(result.wasTruncated).toBe(false);
    });

    it('should truncate when file count exceeds max', async () => {
      const manyDiffs = Array.from({ length: 60 }, (_, i) => ({
        old_path: `file${String(i)}.ts`,
        new_path: `file${String(i)}.ts`,
      }));
      mockMrShow.mockResolvedValueOnce(makeMrResponse());
      mockMrAllDiffs.mockResolvedValueOnce(makeDiffsResponse(manyDiffs));

      const result = await reader.fetchChangeRequest(ref);

      expect(result.wasTruncated).toBe(true);
      expect(result.truncationReason).toContain('50 files');
      expect(result.files).toHaveLength(50);
    });

    it('should truncate when line count exceeds max', async () => {
      const longDiff = Array.from({ length: 6000 }, (_, i) => `+line${String(i)}`).join('\n');
      mockMrShow.mockResolvedValueOnce(makeMrResponse());
      mockMrAllDiffs.mockResolvedValueOnce(
        makeDiffsResponse([{ old_path: 'big.ts', new_path: 'big.ts', diff: longDiff }])
      );

      const result = await reader.fetchChangeRequest(ref);

      expect(result.wasTruncated).toBe(true);
      expect(result.truncationReason).toContain('5000');
    });

    it('should map file statuses correctly', async () => {
      mockMrShow.mockResolvedValueOnce(makeMrResponse());
      mockMrAllDiffs.mockResolvedValueOnce(
        makeDiffsResponse([
          { old_path: 'new.ts', new_path: 'new.ts', new_file: true },
          { old_path: 'deleted.ts', new_path: 'deleted.ts', deleted_file: true },
          { old_path: 'old-name.ts', new_path: 'new-name.ts', renamed_file: true },
          { old_path: 'modified.ts', new_path: 'modified.ts' },
        ])
      );

      const result = await reader.fetchChangeRequest(ref);

      expect(result.files[0]?.status).toBe('added');
      expect(result.files[1]?.status).toBe('removed');
      expect(result.files[2]?.status).toBe('renamed');
      expect(result.files[3]?.status).toBe('modified');
    });

    it('should wrap API errors as ApiError with gitlab provider', async () => {
      mockMrShow.mockRejectedValueOnce(new Error('Not Found'));

      try {
        await reader.fetchChangeRequest(ref);
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toContain('Failed to fetch merge request');
        expect((error as ApiError).context).toHaveProperty('provider', 'gitlab');
      }
    });

    it('should rethrow ErodeError without wrapping', async () => {
      const erodeError = new ErodeError('test', ErrorCode.INVALID_URL, 'test');
      mockMrShow.mockRejectedValueOnce(erodeError);

      await expect(reader.fetchChangeRequest(ref)).rejects.toBe(erodeError);
    });

    it('should handle MR with null author', async () => {
      mockMrShow.mockResolvedValueOnce(makeMrResponse({ author: null }));
      mockMrAllDiffs.mockResolvedValueOnce(makeDiffsResponse([]));

      const result = await reader.fetchChangeRequest(ref);

      expect(result.author.login).toBe('unknown');
    });
  });

  describe('fetchChangeRequestCommits', () => {
    const ref = makeRef();

    it('should return parsed commits', async () => {
      mockMrAllCommits.mockResolvedValueOnce([
        {
          id: 'abc123',
          message: 'Add feature',
          author_name: 'Dev',
          author_email: 'dev@example.com',
        },
      ]);

      const result = await reader.fetchChangeRequestCommits(ref);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        sha: 'abc123',
        message: 'Add feature',
        author: { name: 'Dev', email: 'dev@example.com' },
      });
    });

    it('should default missing author fields', async () => {
      mockMrAllCommits.mockResolvedValueOnce([
        {
          id: 'abc123',
          message: 'Fix',
          author_name: null,
          author_email: null,
        },
      ]);

      const result = await reader.fetchChangeRequestCommits(ref);

      expect(result[0]?.author.name).toBe('Unknown');
      expect(result[0]?.author.email).toBe('unknown@example.com');
    });

    it('should wrap API errors as ApiError with gitlab provider', async () => {
      mockMrAllCommits.mockRejectedValueOnce(new Error('Server error'));

      try {
        await reader.fetchChangeRequestCommits(ref);
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).context).toHaveProperty('provider', 'gitlab');
      }
    });

    it('should rethrow ErodeError without wrapping', async () => {
      const erodeError = new ErodeError('test', ErrorCode.INVALID_URL, 'test');
      mockMrAllCommits.mockRejectedValueOnce(erodeError);

      await expect(reader.fetchChangeRequestCommits(ref)).rejects.toBe(erodeError);
    });
  });
});

// Run contract tests against GitLabReader
runReaderContractTests(() => new GitLabReader('test-token'), {
  validUrl: 'https://gitlab.com/org/repo/-/merge_requests/42',
  invalidUrl: 'https://example.com/not-a-mr',
});
