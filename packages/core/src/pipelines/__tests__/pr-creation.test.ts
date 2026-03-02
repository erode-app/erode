import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateOrUpdateChangeRequest = vi.fn();
const mockCloseChangeRequest = vi.fn();

vi.mock('../../platforms/platform-factory.js', () => ({
  createPlatformWriter: vi.fn(() => ({
    createOrUpdateChangeRequest: mockCreateOrUpdateChangeRequest,
    closeChangeRequest: mockCloseChangeRequest,
    commentOnChangeRequest: vi.fn(),
    deleteComment: vi.fn(),
  })),
}));

import { modelPrBranchName, createModelPr, closeModelPr } from '../pr-creation.js';
import { createPlatformWriter } from '../../platforms/platform-factory.js';

describe('modelPrBranchName', () => {
  it('returns branch name in erode/pr-<number> format', () => {
    expect(modelPrBranchName(42)).toBe('erode/pr-42');
    expect(modelPrBranchName(1)).toBe('erode/pr-1');
    expect(modelPrBranchName(999)).toBe('erode/pr-999');
  });
});

describe('createModelPr', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateOrUpdateChangeRequest.mockResolvedValue({
      url: 'https://github.com/org/model-repo/pull/10',
      number: 10,
      action: 'created' as const,
      branch: 'erode/pr-42',
    });
  });

  it('calls writer.createOrUpdateChangeRequest with branch name and substituted title', async () => {
    const result = await createModelPr({
      repositoryUrl: 'https://github.com/org/repo',
      owner: 'org',
      repo: 'model-repo',
      prNumber: 42,
      prTitle: 'My feature',
      sourceRepo: 'org/repo',
      adapterMetadata: {
        id: 'likec4',
        displayName: 'LikeC4',
        documentationUrl: 'https://example.com',
        fileExtensions: ['.c4'],
        pathDescription: 'path',
        prTitleTemplate: 'erode: update model (PR #{{prNumber}})',
        errorSuggestions: {},
        noComponentHelpLines: [],
        missingLinksHelpLines: [],
      },
      fileChanges: [{ path: 'model.c4', content: 'new content' }],
      body: 'PR body text',
    });

    expect(mockCreateOrUpdateChangeRequest).toHaveBeenCalledWith({
      branchName: 'erode/pr-42',
      title: 'erode: update model (PR #42)',
      body: 'PR body text',
      fileChanges: [{ path: 'model.c4', content: 'new content' }],
      draft: undefined,
    });

    expect(result.branch).toBe('erode/pr-42');
    expect(result.url).toBe('https://github.com/org/model-repo/pull/10');
    expect(result.action).toBe('created');
  });

  it('uses adapterMetadata.prTitleTemplate to substitute PR number', async () => {
    await createModelPr({
      repositoryUrl: 'https://github.com/org/repo',
      owner: 'org',
      repo: 'model-repo',
      prNumber: 7,
      prTitle: 'Another PR',
      sourceRepo: 'org/repo',
      adapterMetadata: {
        id: 'structurizr',
        displayName: 'Structurizr',
        documentationUrl: 'https://example.com',
        fileExtensions: ['.dsl'],
        pathDescription: 'path',
        prTitleTemplate: 'chore: sync architecture model for PR #{{prNumber}}',
        errorSuggestions: {},
        noComponentHelpLines: [],
        missingLinksHelpLines: [],
      },
      fileChanges: [],
      body: 'body',
    });

    expect(mockCreateOrUpdateChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'chore: sync architecture model for PR #7',
      })
    );
  });

  it('substitutes {{sourceRepo}} and {{prTitle}} in the title template', async () => {
    await createModelPr({
      repositoryUrl: 'https://github.com/org/repo',
      owner: 'org',
      repo: 'model-repo',
      prNumber: 3,
      prTitle: 'feat: enrich products with creator info',
      sourceRepo: 'erode-app/playground',
      adapterMetadata: {
        id: 'likec4',
        displayName: 'LikeC4',
        documentationUrl: 'https://example.com',
        fileExtensions: ['.c4'],
        pathDescription: 'path',
        prTitleTemplate: 'chore: update LikeC4 model for {{sourceRepo}}#{{prNumber}} — {{prTitle}}',
        errorSuggestions: {},
        noComponentHelpLines: [],
        missingLinksHelpLines: [],
      },
      fileChanges: [],
      body: 'body',
    });

    expect(mockCreateOrUpdateChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        title:
          'chore: update LikeC4 model for erode-app/playground#3 — feat: enrich products with creator info',
      })
    );
  });

  it('creates the writer with the provided repositoryUrl, owner and repo', async () => {
    await createModelPr({
      repositoryUrl: 'https://github.com/myorg/source-repo',
      owner: 'myorg',
      repo: 'model-repo',
      prNumber: 5,
      prTitle: 'Fix',
      sourceRepo: 'myorg/source-repo',
      adapterMetadata: {
        id: 'likec4',
        displayName: 'LikeC4',
        documentationUrl: 'https://example.com',
        fileExtensions: ['.c4'],
        pathDescription: 'path',
        prTitleTemplate: 'update model PR #{{prNumber}}',
        errorSuggestions: {},
        noComponentHelpLines: [],
        missingLinksHelpLines: [],
      },
      fileChanges: [],
      body: 'body',
    });

    expect(createPlatformWriter).toHaveBeenCalledWith(
      'https://github.com/myorg/source-repo',
      'myorg',
      'model-repo'
    );
  });
});

describe('closeModelPr', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCloseChangeRequest.mockResolvedValue(undefined);
  });

  it('calls writer.closeChangeRequest with the correct branch name', async () => {
    await closeModelPr({
      repositoryUrl: 'https://github.com/org/repo',
      owner: 'org',
      repo: 'model-repo',
      prNumber: 42,
    });

    expect(mockCloseChangeRequest).toHaveBeenCalledWith('erode/pr-42');
  });

  it('constructs the branch name using modelPrBranchName', async () => {
    await closeModelPr({
      repositoryUrl: 'https://github.com/org/repo',
      owner: 'org',
      repo: 'model-repo',
      prNumber: 100,
    });

    expect(mockCloseChangeRequest).toHaveBeenCalledWith('erode/pr-100');
  });
});
