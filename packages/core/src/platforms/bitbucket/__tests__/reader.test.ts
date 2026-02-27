import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErodeError, ApiError, ErrorCode } from '../../../errors.js';
import type { ChangeRequestRef } from '../../source-platform.js';
import { runReaderContractTests } from '../../__tests__/reader-contract.js';

// Mock api-client
const mockRequest = vi.fn();
const mockRequestText = vi.fn();
const mockPaginate = vi.fn();

vi.mock('../api-client.js', () => ({
  BitbucketApiClient: class MockBitbucketApiClient {
    request = mockRequest;
    requestText = mockRequestText;
    paginate = mockPaginate;
  },
}));

// Mock config
vi.mock('../../../utils/config.js', () => ({
  CONFIG: {
    bitbucket: { token: 'test-token', baseUrl: 'https://api.bitbucket.org/2.0' },
    constraints: { maxFilesPerDiff: 50, maxLinesPerDiff: 5000 },
  },
}));

import { BitbucketReader } from '../reader.js';

function makePrResponse(overrides = {}) {
  return {
    id: 42,
    title: 'Test PR',
    description: 'PR description',
    state: 'OPEN',
    author: { display_name: 'Test User', nickname: 'testuser' },
    source: { branch: { name: 'feature/test' }, commit: { hash: 'head456' } },
    destination: { branch: { name: 'main' }, commit: { hash: 'base123' } },
    ...overrides,
  };
}

function makeDiffstatEntries(
  entries: {
    status?: string;
    lines_added?: number;
    lines_removed?: number;
    path?: string;
    old?: { path: string } | null;
    new?: { path: string } | null;
  }[] = []
) {
  return entries.map((e) => ({
    status: e.status ?? 'modified',
    lines_added: e.lines_added ?? 5,
    lines_removed: e.lines_removed ?? 3,
    old: e.old !== undefined ? e.old : { path: e.path ?? 'src/index.ts' },
    new: e.new !== undefined ? e.new : { path: e.path ?? 'src/index.ts' },
  }));
}

function makeRef(overrides: Partial<ChangeRequestRef> = {}): ChangeRequestRef {
  return {
    number: 42,
    url: 'https://bitbucket.org/workspace/repo/pull-requests/42',
    repositoryUrl: 'https://bitbucket.org/workspace/repo',
    platformId: { owner: 'workspace', repo: 'repo' },
    ...overrides,
  };
}

describe('BitbucketReader', () => {
  let reader: BitbucketReader;

  beforeEach(() => {
    vi.resetAllMocks();
    reader = new BitbucketReader('test-token');
  });

  describe('parseChangeRequestUrl', () => {
    it('should parse a valid Bitbucket PR URL', () => {
      const result = reader.parseChangeRequestUrl(
        'https://bitbucket.org/workspace/repo/pull-requests/42'
      );
      expect(result).toEqual({
        number: 42,
        url: 'https://bitbucket.org/workspace/repo/pull-requests/42',
        repositoryUrl: 'https://bitbucket.org/workspace/repo',
        platformId: { owner: 'workspace', repo: 'repo' },
      });
    });

    it('should parse URL with http scheme', () => {
      const result = reader.parseChangeRequestUrl(
        'http://bitbucket.org/myteam/myrepo/pull-requests/1'
      );
      expect(result.number).toBe(1);
      expect(result.platformId).toEqual({ owner: 'myteam', repo: 'myrepo' });
    });

    it('should be case-insensitive', () => {
      const result = reader.parseChangeRequestUrl(
        'HTTPS://BITBUCKET.ORG/workspace/repo/pull-requests/10'
      );
      expect(result.number).toBe(10);
    });

    it('should throw ErodeError for invalid URL', () => {
      expect(() => reader.parseChangeRequestUrl('https://example.com/not-a-pr')).toThrow(
        ErodeError
      );
      try {
        reader.parseChangeRequestUrl('https://example.com/not-a-pr');
      } catch (error) {
        expect(error).toBeInstanceOf(ErodeError);
        expect((error as ErodeError).code).toBe(ErrorCode.PLATFORM_INVALID_URL);
      }
    });

    it('should throw ErodeError for empty string', () => {
      expect(() => reader.parseChangeRequestUrl('')).toThrow(ErodeError);
    });

    it('should return consistent results for the same URL', () => {
      const url = 'https://bitbucket.org/workspace/repo/pull-requests/42';
      const ref1 = reader.parseChangeRequestUrl(url);
      const ref2 = reader.parseChangeRequestUrl(url);
      expect(ref1).toEqual(ref2);
    });
  });

  describe('fetchChangeRequest', () => {
    const ref = makeRef();

    it('should return ChangeRequestData on success', async () => {
      mockRequest.mockResolvedValueOnce(makePrResponse());
      mockPaginate
        .mockResolvedValueOnce(makeDiffstatEntries([{ path: 'src/index.ts' }]))
        .mockResolvedValueOnce([
          { hash: 'abc', message: 'commit 1', author: { raw: 'Dev <dev@x.com>' } },
        ]);
      mockRequestText.mockResolvedValueOnce('diff --git a/src/index.ts b/src/index.ts\n+new line');

      const result = await reader.fetchChangeRequest(ref);

      expect(result.number).toBe(42);
      expect(result.title).toBe('Test PR');
      expect(result.author.login).toBe('testuser');
      expect(result.author.name).toBe('Test User');
      expect(result.files).toHaveLength(1);
      expect(result.commits).toBe(1);
      expect(result.diff).toContain('src/index.ts');
      expect(result.wasTruncated).toBe(false);
    });

    it('should lowercase the PR state', async () => {
      mockRequest.mockResolvedValueOnce(makePrResponse({ state: 'MERGED' }));
      mockPaginate.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockRequestText.mockResolvedValueOnce('');

      const result = await reader.fetchChangeRequest(ref);

      expect(result.state).toBe('merged');
    });

    it('should handle null author', async () => {
      mockRequest.mockResolvedValueOnce(makePrResponse({ author: null }));
      mockPaginate.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockRequestText.mockResolvedValueOnce('');

      const result = await reader.fetchChangeRequest(ref);

      expect(result.author.login).toBe('unknown');
      expect(result.author.name).toBeUndefined();
    });

    it('should truncate when file count exceeds max', async () => {
      const manyEntries = Array.from({ length: 60 }, (_, i) => ({ path: `file${String(i)}.ts` }));
      mockRequest.mockResolvedValueOnce(makePrResponse());
      mockPaginate
        .mockResolvedValueOnce(makeDiffstatEntries(manyEntries))
        .mockResolvedValueOnce([]);
      mockRequestText.mockResolvedValueOnce('');

      const result = await reader.fetchChangeRequest(ref);

      expect(result.wasTruncated).toBe(true);
      expect(result.truncationReason).toContain('50 files');
      expect(result.files).toHaveLength(50);
    });

    it('should truncate when line count exceeds max', async () => {
      const bigEntry = [{ path: 'big.ts', lines_added: 3000, lines_removed: 3000 }];
      mockRequest.mockResolvedValueOnce(makePrResponse());
      mockPaginate.mockResolvedValueOnce(makeDiffstatEntries(bigEntry)).mockResolvedValueOnce([]);
      mockRequestText.mockResolvedValueOnce('');

      const result = await reader.fetchChangeRequest(ref);

      expect(result.wasTruncated).toBe(true);
      expect(result.truncationReason).toContain('5000');
    });

    it('should use old path when new path is null for removed files', async () => {
      const removedEntry = [{ status: 'removed', old: { path: 'src/deleted.ts' }, new: null }];
      mockRequest.mockResolvedValueOnce(makePrResponse());
      mockPaginate
        .mockResolvedValueOnce(makeDiffstatEntries(removedEntry))
        .mockResolvedValueOnce([]);
      mockRequestText.mockResolvedValueOnce('');

      const result = await reader.fetchChangeRequest(ref);

      expect(result.files[0]?.filename).toBe('src/deleted.ts');
    });

    it('should wrap non-ErodeError as ApiError with bitbucket provider', async () => {
      mockRequest.mockRejectedValueOnce(new Error('Not Found'));

      try {
        await reader.fetchChangeRequest(ref);
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toContain('Could not retrieve pull request');
        expect((error as ApiError).context).toHaveProperty('provider', 'bitbucket');
      }
    });

    it('should rethrow ErodeError without wrapping', async () => {
      const erodeError = new ErodeError('test', ErrorCode.PLATFORM_INVALID_URL, 'test');
      mockRequest.mockRejectedValueOnce(erodeError);

      await expect(reader.fetchChangeRequest(ref)).rejects.toBe(erodeError);
    });
  });

  describe('fetchChangeRequestCommits', () => {
    const ref = makeRef();

    it('should parse commits with "Name <email>" author format', async () => {
      mockPaginate.mockResolvedValueOnce([
        {
          hash: 'abc123',
          message: 'Add feature',
          author: { raw: 'Dev User <dev@example.com>' },
        },
      ]);

      const result = await reader.fetchChangeRequestCommits(ref);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        sha: 'abc123',
        message: 'Add feature',
        author: { name: 'Dev User', email: 'dev@example.com' },
      });
    });

    it('should handle raw string without email brackets', async () => {
      mockPaginate.mockResolvedValueOnce([
        {
          hash: 'def456',
          message: 'Fix bug',
          author: { raw: 'Someone' },
        },
      ]);

      const result = await reader.fetchChangeRequestCommits(ref);

      expect(result[0]?.author.name).toBe('Someone');
      expect(result[0]?.author.email).toBe('unknown@example.com');
    });

    it('should handle empty raw author string', async () => {
      mockPaginate.mockResolvedValueOnce([
        {
          hash: 'ghi789',
          message: 'Empty author',
          author: { raw: '' },
        },
      ]);

      const result = await reader.fetchChangeRequestCommits(ref);

      expect(result[0]?.author.name).toBe('Unknown');
      expect(result[0]?.author.email).toBe('unknown@example.com');
    });

    it('should wrap non-ErodeError as ApiError with bitbucket provider', async () => {
      mockPaginate.mockRejectedValueOnce(new Error('Server error'));

      try {
        await reader.fetchChangeRequestCommits(ref);
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).context).toHaveProperty('provider', 'bitbucket');
      }
    });

    it('should rethrow ErodeError without wrapping', async () => {
      const erodeError = new ErodeError('test', ErrorCode.PLATFORM_INVALID_URL, 'test');
      mockPaginate.mockRejectedValueOnce(erodeError);

      await expect(reader.fetchChangeRequestCommits(ref)).rejects.toBe(erodeError);
    });
  });
});

// Run contract tests against BitbucketReader
runReaderContractTests(() => new BitbucketReader('test-token'), {
  validUrl: 'https://bitbucket.org/workspace/repo/pull-requests/42',
  invalidUrl: 'https://example.com/not-a-pr',
});
