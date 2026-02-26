import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiError, ErodeError, ErrorCode } from '../../../errors.js';
import type { ChangeRequestRef } from '../../source-platform.js';

// Mock api-client
const mockRequest = vi.fn();
const mockRequestVoid = vi.fn();
const mockPaginate = vi.fn();

vi.mock('../api-client.js', () => ({
  BitbucketApiClient: class MockBitbucketApiClient {
    request = mockRequest;
    requestVoid = mockRequestVoid;
    paginate = mockPaginate;
  },
}));

// Mock config
vi.mock('../../../utils/config.js', () => ({
  CONFIG: {
    bitbucket: { token: 'test-token', baseUrl: 'https://api.bitbucket.org/2.0' },
  },
}));

import { BitbucketWriter } from '../writer.js';

function makeRef(overrides: Partial<ChangeRequestRef> = {}): ChangeRequestRef {
  return {
    number: 42,
    url: 'https://bitbucket.org/workspace/repo/pull-requests/42',
    repositoryUrl: 'https://bitbucket.org/workspace/repo',
    platformId: { owner: 'workspace', repo: 'repo' },
    ...overrides,
  };
}

describe('BitbucketWriter', () => {
  let writer: BitbucketWriter;

  beforeEach(() => {
    vi.clearAllMocks();
    writer = new BitbucketWriter('workspace', 'repo');
  });

  describe('constructor', () => {
    it('should throw ErodeError when no token is configured', async () => {
      const { CONFIG } = await import('../../../utils/config.js');
      const originalToken = CONFIG.bitbucket.token;
      CONFIG.bitbucket.token = undefined;

      try {
        expect(() => new BitbucketWriter('workspace', 'repo')).toThrow(ErodeError);
        expect(() => new BitbucketWriter('workspace', 'repo')).toThrow(
          'A Bitbucket token is needed'
        );
      } finally {
        CONFIG.bitbucket.token = originalToken;
      }
    });
  });

  describe('createOrUpdateChangeRequest', () => {
    it('should create a new branch and PR when neither exist', async () => {
      // requestVoid: branch existence check → 404, branch creation POST, file commit
      mockRequestVoid
        .mockRejectedValueOnce(new ApiError('Not found', 404, { provider: 'bitbucket' }))
        .mockResolvedValueOnce(undefined) // branch creation POST
        .mockResolvedValue(undefined); // file commit via /src
      // request: base branch lookup, PR list, PR create
      mockRequest
        .mockResolvedValueOnce({ name: 'main', target: { hash: 'base-sha' } })
        .mockResolvedValueOnce({ values: [] }) // PR list
        .mockResolvedValueOnce({
          id: 99,
          links: { html: { href: 'https://bitbucket.org/workspace/repo/pull-requests/99' } },
        }); // PR create

      const result = await writer.createOrUpdateChangeRequest({
        branchName: 'erode/pr-42',
        title: 'Update model',
        body: 'Automated update',
        fileChanges: [{ path: 'model.c4', content: 'content' }],
      });

      expect(result.action).toBe('created');
      expect(result.number).toBe(99);
      expect(result.url).toBe('https://bitbucket.org/workspace/repo/pull-requests/99');
      expect(result.branch).toBe('erode/pr-42');
      // Branch was created (POST to /refs/branches via requestVoid)
      expect(mockRequestVoid).toHaveBeenCalledWith(
        expect.stringContaining('/refs/branches'),
        expect.objectContaining({ method: 'POST' })
      );
      // File was committed via src endpoint
      expect(mockRequestVoid).toHaveBeenCalledWith(
        expect.stringContaining('/src'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should update existing PR when branch and PR exist', async () => {
      // Branch existence check succeeds (via requestVoid)
      mockRequestVoid.mockResolvedValue(undefined);
      mockRequest.mockImplementation((path: string) => {
        // PR list → existing PR
        if (path.includes('/pullrequests?q=')) {
          return Promise.resolve({
            values: [
              {
                id: 50,
                links: { html: { href: 'https://bitbucket.org/workspace/repo/pull-requests/50' } },
              },
            ],
          });
        }
        // PR update (PUT)
        if (path.includes('/pullrequests/50')) {
          return Promise.resolve({
            id: 50,
            links: { html: { href: 'https://bitbucket.org/workspace/repo/pull-requests/50' } },
          });
        }
        return Promise.resolve({});
      });

      const result = await writer.createOrUpdateChangeRequest({
        branchName: 'erode/pr-42',
        title: 'Update model',
        body: 'Automated update',
        fileChanges: [{ path: 'model.c4', content: 'content' }],
      });

      expect(result.action).toBe('updated');
      expect(result.number).toBe(50);
      expect(result.url).toBe('https://bitbucket.org/workspace/repo/pull-requests/50');
      // Branch was NOT created (no POST to /refs/branches via requestVoid)
      expect(mockRequestVoid).not.toHaveBeenCalledWith(
        expect.stringContaining('/refs/branches'),
        expect.objectContaining({ method: 'POST' })
      );
      // PR was updated via PUT
      expect(mockRequest).toHaveBeenCalledWith(
        expect.stringContaining('/pullrequests/50'),
        expect.anything(),
        expect.objectContaining({ method: 'PUT' })
      );
    });

    it('should wrap errors as ApiError', async () => {
      // Branch check succeeds, but PR list query fails
      mockRequestVoid.mockResolvedValue(undefined);
      mockRequest.mockRejectedValue(new Error('Network failure'));

      await expect(
        writer.createOrUpdateChangeRequest({
          branchName: 'test',
          title: 'test',
          body: 'test',
          fileChanges: [],
        })
      ).rejects.toThrow(ApiError);
    });

    it('should rethrow ErodeError without wrapping', async () => {
      const erodeError = new ErodeError('test', ErrorCode.MISSING_API_KEY, 'test');
      // Branch check succeeds, but base branch lookup throws ErodeError
      mockRequestVoid.mockResolvedValue(undefined);
      mockRequest.mockRejectedValue(erodeError);

      await expect(
        writer.createOrUpdateChangeRequest({
          branchName: 'test',
          title: 'test',
          body: 'test',
          fileChanges: [],
        })
      ).rejects.toBe(erodeError);
    });

    it('should ignore the draft option and create a regular PR', async () => {
      // Branch check fails (404), branch creation succeeds
      mockRequestVoid.mockImplementation((path: string) => {
        if (path.includes('/refs/branches/') && !path.endsWith('/refs/branches')) {
          return Promise.reject(new ApiError('Not found', 404, { provider: 'bitbucket' }));
        }
        return Promise.resolve(undefined);
      });
      mockRequest.mockImplementation((path: string) => {
        if (path.includes('/refs/branches/') && !path.endsWith('/refs/branches')) {
          return Promise.resolve({ name: 'main', target: { hash: 'base-sha' } });
        }
        if (path.includes('/pullrequests?q=')) {
          return Promise.resolve({ values: [] });
        }
        if (path.endsWith('/pullrequests')) {
          return Promise.resolve({
            id: 99,
            links: { html: { href: 'https://bitbucket.org/workspace/repo/pull-requests/99' } },
          });
        }
        return Promise.resolve({});
      });

      await writer.createOrUpdateChangeRequest({
        branchName: 'erode/pr-42',
        title: 'Update model',
        body: 'Automated update',
        fileChanges: [],
        draft: true,
      });

      // The PR creation body must not include any draft-related field
      const prCreateCall = mockRequest.mock.calls.find(
        (args) => typeof args[0] === 'string' && args[0].endsWith('/pullrequests')
      );
      expect(prCreateCall).toBeDefined();
      const prBody = JSON.parse(
        (prCreateCall as [string, unknown, { body: string }])[2].body
      ) as Record<string, unknown>;
      expect(prBody).not.toHaveProperty('draft');
    });
  });

  describe('commentOnChangeRequest', () => {
    it('should create a comment when no upsertMarker is given', async () => {
      mockRequestVoid.mockResolvedValue(undefined);
      const ref = makeRef();

      await writer.commentOnChangeRequest(ref, 'Analysis complete');

      expect(mockRequestVoid).toHaveBeenCalledWith(
        expect.stringContaining('/comments'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should update an existing comment when upsertMarker matches', async () => {
      mockPaginate.mockResolvedValue([
        { id: 7, content: { raw: '<!-- marker --> existing text' } },
      ]);
      mockRequestVoid.mockResolvedValue(undefined);
      const ref = makeRef();

      await writer.commentOnChangeRequest(ref, 'new body', { upsertMarker: '<!-- marker -->' });

      expect(mockRequestVoid).toHaveBeenCalledWith(
        expect.stringContaining('/comments/7'),
        expect.objectContaining({ method: 'PUT' })
      );
      // Must not also POST a new comment
      expect(mockRequestVoid).not.toHaveBeenCalledWith(
        expect.stringContaining('/comments'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should create a new comment when upsertMarker is not found', async () => {
      mockPaginate.mockResolvedValue([{ id: 7, content: { raw: 'some other comment' } }]);
      mockRequestVoid.mockResolvedValue(undefined);
      const ref = makeRef();

      await writer.commentOnChangeRequest(ref, 'new body', { upsertMarker: '<!-- marker -->' });

      expect(mockRequestVoid).toHaveBeenCalledWith(
        expect.stringContaining('/comments'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should wrap errors as ApiError', async () => {
      mockRequestVoid.mockRejectedValue(new Error('Forbidden'));
      const ref = makeRef();

      await expect(writer.commentOnChangeRequest(ref, 'test')).rejects.toThrow(ApiError);
    });

    it('should rethrow ErodeError without wrapping', async () => {
      const erodeError = new ErodeError('test', ErrorCode.MISSING_API_KEY, 'test');
      mockRequestVoid.mockRejectedValue(erodeError);
      const ref = makeRef();

      await expect(writer.commentOnChangeRequest(ref, 'test')).rejects.toBe(erodeError);
    });
  });

  describe('deleteComment', () => {
    it('should delete the comment matching the marker', async () => {
      mockPaginate.mockResolvedValue([
        { id: 5, content: { raw: '<!-- erode --> some drift analysis' } },
      ]);
      mockRequestVoid.mockResolvedValue(undefined);
      const ref = makeRef();

      await writer.deleteComment(ref, '<!-- erode -->');

      expect(mockRequestVoid).toHaveBeenCalledWith(
        expect.stringContaining('/comments/5'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should be a no-op when no comment matches the marker', async () => {
      mockPaginate.mockResolvedValue([{ id: 5, content: { raw: 'unrelated comment' } }]);
      const ref = makeRef();

      await writer.deleteComment(ref, '<!-- erode -->');

      expect(mockRequestVoid).not.toHaveBeenCalled();
    });

    it('should wrap errors as ApiError', async () => {
      mockPaginate.mockRejectedValue(new Error('Server error'));
      const ref = makeRef();

      await expect(writer.deleteComment(ref, '<!-- erode -->')).rejects.toThrow(ApiError);
    });
  });
});
