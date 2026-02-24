import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiError, ErodeError, ErrorCode } from '../../../errors.js';
import type { ChangeRequestRef } from '../../source-platform.js';

// Mock @gitbeaker/rest
const mockBranchesShow = vi.fn();
const mockBranchesCreate = vi.fn();
const mockCommitsCreate = vi.fn();
const mockMrAll = vi.fn();
const mockMrEdit = vi.fn();
const mockMrCreate = vi.fn();
const mockMrNotesCreate = vi.fn();

vi.mock('@gitbeaker/rest', () => ({
  Gitlab: class MockGitlab {
    Branches = {
      show: mockBranchesShow,
      create: mockBranchesCreate,
    };
    Commits = {
      create: mockCommitsCreate,
    };
    MergeRequests = {
      all: mockMrAll,
      edit: mockMrEdit,
      create: mockMrCreate,
    };
    MergeRequestNotes = {
      create: mockMrNotesCreate,
    };
  },
}));

// Mock config
vi.mock('../../../utils/config.js', () => ({
  CONFIG: {
    gitlab: { token: 'test-token', baseUrl: 'https://gitlab.com' },
  },
}));

import { GitLabWriter } from '../writer.js';

function makeRef(overrides: Partial<ChangeRequestRef> = {}): ChangeRequestRef {
  return {
    number: 42,
    url: 'https://gitlab.com/org/repo/-/merge_requests/42',
    repositoryUrl: 'https://gitlab.com/org/repo',
    platformId: { owner: 'org', repo: 'repo' },
    ...overrides,
  };
}

describe('GitLabWriter', () => {
  let writer: GitLabWriter;

  beforeEach(() => {
    vi.clearAllMocks();
    writer = new GitLabWriter('org', 'repo');
  });

  describe('constructor', () => {
    it('should throw ErodeError when no token is configured', async () => {
      const { CONFIG } = await import('../../../utils/config.js');
      const originalToken = CONFIG.gitlab.token;
      CONFIG.gitlab.token = undefined;

      try {
        expect(() => new GitLabWriter('org', 'repo')).toThrow(ErodeError);
        expect(() => new GitLabWriter('org', 'repo')).toThrow('GitLab token is required');
      } finally {
        CONFIG.gitlab.token = originalToken;
      }
    });
  });

  describe('createOrUpdateChangeRequest', () => {
    it('should create a new branch and MR when neither exist', async () => {
      mockBranchesShow.mockRejectedValue(new Error('Not found'));
      mockBranchesCreate.mockResolvedValue({});
      mockCommitsCreate.mockResolvedValue({});
      mockMrAll.mockResolvedValue([]);
      mockMrCreate.mockResolvedValue({
        web_url: 'https://gitlab.com/org/repo/-/merge_requests/99',
        iid: 99,
      });

      const result = await writer.createOrUpdateChangeRequest({
        branchName: 'erode/mr-42',
        title: 'Update model',
        body: 'Automated update',
        fileChanges: [{ path: 'model.c4', content: 'content' }],
      });

      expect(result.action).toBe('created');
      expect(result.number).toBe(99);
      expect(result.url).toBe('https://gitlab.com/org/repo/-/merge_requests/99');
      expect(result.branch).toBe('erode/mr-42');
      expect(mockBranchesCreate).toHaveBeenCalled();
      expect(mockCommitsCreate).toHaveBeenCalledWith(
        'org/repo',
        'erode/mr-42',
        'Update model',
        expect.arrayContaining([
          expect.objectContaining({ action: 'create', filePath: 'model.c4', content: 'content' }),
        ])
      );
    });

    it('should update existing branch and MR when both exist', async () => {
      mockBranchesShow.mockResolvedValue({});
      mockCommitsCreate.mockResolvedValue({});
      mockMrAll.mockResolvedValue([
        { web_url: 'https://gitlab.com/org/repo/-/merge_requests/50', iid: 50 },
      ]);
      mockMrEdit.mockResolvedValue({});

      const result = await writer.createOrUpdateChangeRequest({
        branchName: 'erode/mr-42',
        title: 'Update model',
        body: 'Automated update',
        fileChanges: [{ path: 'model.c4', content: 'content' }],
      });

      expect(result.action).toBe('updated');
      expect(result.number).toBe(50);
      expect(mockBranchesCreate).not.toHaveBeenCalled();
      expect(mockMrEdit).toHaveBeenCalled();
    });

    it('should use update action for file changes when branch exists', async () => {
      mockBranchesShow.mockResolvedValue({});
      mockCommitsCreate.mockResolvedValue({});
      mockMrAll.mockResolvedValue([]);
      mockMrCreate.mockResolvedValue({
        web_url: 'https://gitlab.com/org/repo/-/merge_requests/99',
        iid: 99,
      });

      await writer.createOrUpdateChangeRequest({
        branchName: 'erode/mr-42',
        title: 'Update model',
        body: 'Automated update',
        fileChanges: [{ path: 'model.c4', content: 'content' }],
      });

      expect(mockCommitsCreate).toHaveBeenCalledWith(
        'org/repo',
        'erode/mr-42',
        'Update model',
        expect.arrayContaining([
          expect.objectContaining({ action: 'update' }),
        ])
      );
    });

    it('should prepend "Draft: " to the title when draft is true', async () => {
      mockBranchesShow.mockRejectedValue(new Error('Not found'));
      mockBranchesCreate.mockResolvedValue({});
      mockCommitsCreate.mockResolvedValue({});
      mockMrAll.mockResolvedValue([]);
      mockMrCreate.mockResolvedValue({
        web_url: 'https://gitlab.com/org/repo/-/merge_requests/99',
        iid: 99,
      });

      await writer.createOrUpdateChangeRequest({
        branchName: 'erode/mr-42',
        title: 'Update model',
        body: 'Automated update',
        fileChanges: [],
        draft: true,
      });

      expect(mockMrCreate).toHaveBeenCalledWith(
        'org/repo',
        'erode/mr-42',
        'main',
        'Draft: Update model',
        expect.objectContaining({ description: 'Automated update' })
      );
    });

    it('should not prepend "Draft: " when draft is false', async () => {
      mockBranchesShow.mockRejectedValue(new Error('Not found'));
      mockBranchesCreate.mockResolvedValue({});
      mockCommitsCreate.mockResolvedValue({});
      mockMrAll.mockResolvedValue([]);
      mockMrCreate.mockResolvedValue({
        web_url: 'https://gitlab.com/org/repo/-/merge_requests/99',
        iid: 99,
      });

      await writer.createOrUpdateChangeRequest({
        branchName: 'erode/mr-42',
        title: 'Update model',
        body: 'Automated update',
        fileChanges: [],
        draft: false,
      });

      expect(mockMrCreate).toHaveBeenCalledWith(
        'org/repo',
        'erode/mr-42',
        'main',
        'Update model',
        expect.objectContaining({ description: 'Automated update' })
      );
    });

    it('should skip commit creation when no file changes', async () => {
      mockBranchesShow.mockRejectedValue(new Error('Not found'));
      mockBranchesCreate.mockResolvedValue({});
      mockMrAll.mockResolvedValue([]);
      mockMrCreate.mockResolvedValue({
        web_url: 'https://gitlab.com/org/repo/-/merge_requests/99',
        iid: 99,
      });

      await writer.createOrUpdateChangeRequest({
        branchName: 'erode/mr-42',
        title: 'Update model',
        body: 'Automated update',
        fileChanges: [],
      });

      expect(mockCommitsCreate).not.toHaveBeenCalled();
    });

    it('should wrap errors as ApiError', async () => {
      mockBranchesShow.mockRejectedValue(new Error('Network failure'));
      mockBranchesCreate.mockRejectedValue(new Error('Network failure'));

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
      mockBranchesShow.mockResolvedValue({});
      mockMrAll.mockRejectedValue(erodeError);

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
    it('should create a note on the MR', async () => {
      mockMrNotesCreate.mockResolvedValue({});
      const ref = makeRef();

      await writer.commentOnChangeRequest(ref, 'Analysis complete');

      expect(mockMrNotesCreate).toHaveBeenCalledWith('org/repo', 42, 'Analysis complete');
    });

    it('should wrap errors as ApiError', async () => {
      mockMrNotesCreate.mockRejectedValue(new Error('Forbidden'));
      const ref = makeRef();

      await expect(writer.commentOnChangeRequest(ref, 'test')).rejects.toThrow(ApiError);
    });

    it('should rethrow ErodeError without wrapping', async () => {
      const erodeError = new ErodeError('test', ErrorCode.MISSING_API_KEY, 'test');
      mockMrNotesCreate.mockRejectedValue(erodeError);
      const ref = makeRef();

      await expect(writer.commentOnChangeRequest(ref, 'test')).rejects.toBe(erodeError);
    });
  });
});
