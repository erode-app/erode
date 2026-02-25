import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiError, ErodeError, ErrorCode } from '../../../errors.js';
import type { ChangeRequestRef } from '../../source-platform.js';

// Mock @octokit/rest
const mockGitGetRef = vi.fn();
const mockGitGetCommit = vi.fn();
const mockGitCreateBlob = vi.fn();
const mockGitCreateTree = vi.fn();
const mockGitCreateCommit = vi.fn();
const mockGitUpdateRef = vi.fn();
const mockGitCreateRef = vi.fn();
const mockPullsList = vi.fn();
const mockPullsUpdate = vi.fn();
const mockPullsCreate = vi.fn();
const mockIssuesCreateComment = vi.fn();

vi.mock('@octokit/rest', () => ({
  Octokit: class MockOctokit {
    rest = {
      git: {
        getRef: mockGitGetRef,
        getCommit: mockGitGetCommit,
        createBlob: mockGitCreateBlob,
        createTree: mockGitCreateTree,
        createCommit: mockGitCreateCommit,
        updateRef: mockGitUpdateRef,
        createRef: mockGitCreateRef,
      },
      pulls: {
        list: mockPullsList,
        update: mockPullsUpdate,
        create: mockPullsCreate,
      },
      issues: {
        createComment: mockIssuesCreateComment,
      },
    };
  },
}));

// Mock config
vi.mock('../../../utils/config.js', () => ({
  CONFIG: {
    github: { token: 'test-token', modelRepoPrToken: null },
  },
}));

import { GitHubWriter } from '../writer.js';

function makeRef(overrides: Partial<ChangeRequestRef> = {}): ChangeRequestRef {
  return {
    number: 42,
    url: 'https://github.com/org/repo/pull/42',
    repositoryUrl: 'https://github.com/org/repo',
    platformId: { owner: 'org', repo: 'repo' },
    ...overrides,
  };
}

function setupGitMocks(branchExists: boolean) {
  mockGitGetRef.mockImplementation(({ ref }: { ref: string }) => {
    if (ref.startsWith('heads/main') || ref === 'heads/main') {
      return { data: { object: { sha: 'base-sha' } } };
    }
    if (branchExists) {
      return { data: { object: { sha: 'existing-sha' } } };
    }
    throw new Error('Not found');
  });
  mockGitGetCommit.mockResolvedValue({ data: { tree: { sha: 'tree-sha' } } });
  mockGitCreateBlob.mockResolvedValue({ data: { sha: 'blob-sha' } });
  mockGitCreateTree.mockResolvedValue({ data: { sha: 'new-tree-sha' } });
  mockGitCreateCommit.mockResolvedValue({ data: { sha: 'new-commit-sha' } });
  mockGitUpdateRef.mockResolvedValue({});
  mockGitCreateRef.mockResolvedValue({});
}

describe('GitHubWriter', () => {
  let writer: GitHubWriter;

  beforeEach(() => {
    vi.clearAllMocks();
    writer = new GitHubWriter('org', 'repo');
  });

  describe('createOrUpdateChangeRequest', () => {
    it('should create a new branch and PR when neither exist', async () => {
      setupGitMocks(false);
      mockPullsList.mockResolvedValue({ data: [] });
      mockPullsCreate.mockResolvedValue({
        data: { html_url: 'https://github.com/org/repo/pull/99', number: 99 },
      });

      const result = await writer.createOrUpdateChangeRequest({
        branchName: 'erode/pr-42',
        title: 'Update model',
        body: 'Automated update',
        fileChanges: [{ path: 'model.c4', content: 'content' }],
      });

      expect(result.action).toBe('created');
      expect(result.number).toBe(99);
      expect(result.url).toBe('https://github.com/org/repo/pull/99');
      expect(result.branch).toBe('erode/pr-42');
      expect(mockGitCreateRef).toHaveBeenCalled();
      expect(mockGitUpdateRef).not.toHaveBeenCalled();
    });

    it('should update existing branch and PR when both exist', async () => {
      setupGitMocks(true);
      mockPullsList.mockResolvedValue({
        data: [{ html_url: 'https://github.com/org/repo/pull/50', number: 50 }],
      });
      mockPullsUpdate.mockResolvedValue({});

      const result = await writer.createOrUpdateChangeRequest({
        branchName: 'erode/pr-42',
        title: 'Update model',
        body: 'Automated update',
        fileChanges: [{ path: 'model.c4', content: 'content' }],
      });

      expect(result.action).toBe('updated');
      expect(result.number).toBe(50);
      expect(mockGitUpdateRef).toHaveBeenCalled();
      expect(mockGitCreateRef).not.toHaveBeenCalled();
      expect(mockPullsUpdate).toHaveBeenCalled();
    });

    it('should wrap errors as ApiError', async () => {
      mockGitGetRef.mockRejectedValue(new Error('Network failure'));

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
      mockGitGetRef.mockRejectedValue(erodeError);

      await expect(
        writer.createOrUpdateChangeRequest({
          branchName: 'test',
          title: 'test',
          body: 'test',
          fileChanges: [],
        })
      ).rejects.toBe(erodeError);
    });
  });

  describe('commentOnChangeRequest', () => {
    it('should create a comment on the PR', async () => {
      mockIssuesCreateComment.mockResolvedValue({});
      const ref = makeRef();

      await writer.commentOnChangeRequest(ref, 'Analysis complete');

      expect(mockIssuesCreateComment).toHaveBeenCalledWith({
        owner: 'org',
        repo: 'repo',
        issue_number: 42,
        body: 'Analysis complete',
      });
    });

    it('should wrap errors as ApiError', async () => {
      mockIssuesCreateComment.mockRejectedValue(new Error('Forbidden'));
      const ref = makeRef();

      await expect(writer.commentOnChangeRequest(ref, 'test')).rejects.toThrow(ApiError);
    });

    it('should rethrow ErodeError without wrapping', async () => {
      const erodeError = new ErodeError('test', ErrorCode.MISSING_API_KEY, 'test');
      mockIssuesCreateComment.mockRejectedValue(erodeError);
      const ref = makeRef();

      await expect(writer.commentOnChangeRequest(ref, 'test')).rejects.toBe(erodeError);
    });
  });
});
