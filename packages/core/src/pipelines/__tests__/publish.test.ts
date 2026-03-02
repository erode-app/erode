import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock factories (hoisted so vi.mock closures can reference them) ────────
const {
  mockCreateModelPr,
  mockCloseModelPr,
  mockCommentOnChangeRequest,
  mockDeleteComment,
  mockFormatAnalysisAsComment,
  mockFormatPatchPrBody,
  mockAnalysisHasFindings,
  mockWriteGitHubActionsOutputs,
  mockWriteGitHubStepSummary,
} = vi.hoisted(() => ({
  mockCreateModelPr: vi.fn(),
  mockCloseModelPr: vi.fn(),
  mockCommentOnChangeRequest: vi.fn(),
  mockDeleteComment: vi.fn(),
  mockFormatAnalysisAsComment: vi.fn(() => 'comment body'),
  mockFormatPatchPrBody: vi.fn(() => 'patch PR body'),
  mockAnalysisHasFindings: vi.fn(() => false),
  mockWriteGitHubActionsOutputs: vi.fn(),
  mockWriteGitHubStepSummary: vi.fn(),
}));

vi.mock('../../platforms/platform-factory.js', () => ({
  createPlatformWriter: vi.fn(() => ({
    commentOnChangeRequest: mockCommentOnChangeRequest,
    deleteComment: mockDeleteComment,
    createOrUpdateChangeRequest: vi.fn(),
    closeChangeRequest: vi.fn(),
  })),
}));

vi.mock('../pr-creation.js', () => ({
  createModelPr: mockCreateModelPr,
  closeModelPr: mockCloseModelPr,
}));

vi.mock('../../output.js', () => ({
  formatAnalysisAsComment: mockFormatAnalysisAsComment,
  formatPatchPrBody: mockFormatPatchPrBody,
  analysisHasFindings: mockAnalysisHasFindings,
  COMMENT_MARKER: '<!-- erode -->',
}));

vi.mock('../../output/ci-output.js', () => ({
  writeGitHubActionsOutputs: mockWriteGitHubActionsOutputs,
  writeGitHubStepSummary: mockWriteGitHubStepSummary,
}));

vi.mock('../../utils/config.js', () => ({
  CONFIG: {
    ai: { provider: 'gemini' },
    gemini: { fastModel: 'gemini-1.5-flash', advancedModel: 'gemini-1.5-pro' },
    anthropic: { fastModel: 'claude-haiku', advancedModel: 'claude-sonnet' },
    debug: { verbose: false },
  },
}));

import { publishResults } from '../publish.js';
import type { PublishOptions } from '../publish.js';
import type { DriftAnalysisResult } from '../../analysis/analysis-types.js';
import type { StructuredAnalysisOutput } from '../../output/structured-output.js';

function makeAnalysisResult(overrides: Partial<DriftAnalysisResult> = {}): DriftAnalysisResult {
  return {
    hasViolations: false,
    violations: [],
    summary: 'No issues',
    metadata: {
      number: 42,
      title: 'Test PR',
      description: null,
      repository: 'org/repo',
      author: { login: 'dev', name: 'Dev User' },
      base: { ref: 'main', sha: 'base-sha' },
      head: { ref: 'feature', sha: 'head-sha' },
      stats: { commits: 1, additions: 5, deletions: 2, files_changed: 1 },
      commits: [{ sha: 'head-sha', message: 'Test commit', author: 'dev' }],
    },
    component: { id: 'comp.api', name: 'API', type: 'service', tags: [] },
    dependencyChanges: { dependencies: [], summary: '' },
    ...overrides,
  };
}

function makeStructured(
  overrides: Partial<StructuredAnalysisOutput> = {}
): StructuredAnalysisOutput {
  return {
    version: '0.0.1',
    timestamp: '2024-01-01T00:00:00.000Z',
    status: 'success',
    exitCode: 0,
    metadata: {
      changeRequest: {
        number: 42,
        title: 'Test PR',
        author: 'Dev User',
        base: 'main',
        head: 'feature',
        commits: 1,
        filesChanged: 1,
      },
      component: { id: 'comp.api', name: 'API', type: 'service', tags: [] },
    },
    analysis: { hasViolations: false, violations: [], summary: 'No issues' },
    dependencyChanges: [],
    modelFormat: 'LikeC4',
    ...overrides,
  };
}

function makeRef() {
  return {
    number: 42,
    url: 'https://github.com/org/repo/pull/42',
    repositoryUrl: 'https://github.com/org/repo',
    platformId: { owner: 'org', repo: 'repo' },
  };
}

function makeAdapterMetadata(overrides: Partial<{ prTitleTemplate: string }> = {}) {
  return {
    id: 'likec4',
    displayName: 'LikeC4',
    documentationUrl: 'https://example.com',
    fileExtensions: ['.c4'],
    pathDescription: 'path',
    prTitleTemplate: 'erode: update model (PR #{{prNumber}})',
    errorSuggestions: {},
    noComponentHelpLines: [],
    missingLinksHelpLines: [],
    ...overrides,
  };
}

function makeProgress() {
  return {
    section: vi.fn(),
    start: vi.fn(),
    succeed: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    fail: vi.fn(),
  };
}

function makeOptions(overrides: Partial<PublishOptions> = {}): PublishOptions {
  return {
    ref: makeRef(),
    analysisResult: makeAnalysisResult(),
    patchResult: null,
    structured: undefined,
    adapterMetadata: makeAdapterMetadata(),
    options: {},
    context: {},
    ...overrides,
  };
}

describe('publishResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateModelPr.mockResolvedValue({
      url: 'https://github.com/org/model/pull/1',
      number: 1,
      action: 'created' as const,
      branch: 'erode/org-repo/pr-42',
    });
    mockCloseModelPr.mockResolvedValue(undefined);
    mockCommentOnChangeRequest.mockResolvedValue(undefined);
    mockDeleteComment.mockResolvedValue(undefined);
  });

  it('creates PR when openPr is true and patchResult is set', async () => {
    const patchResult = {
      filePath: 'model.c4',
      content: 'new content',
      insertedLines: ['comp.a -> comp.b'],
      skipped: [],
    };

    await publishResults(
      makeOptions({
        options: { openPr: true, dryRun: false },
        patchResult,
      }),
      makeProgress()
    );

    expect(mockCreateModelPr).toHaveBeenCalledOnce();
  });

  it('skips PR creation on dry run', async () => {
    const patchResult = {
      filePath: 'model.c4',
      content: 'new content',
      insertedLines: ['comp.a -> comp.b'],
      skipped: [],
    };

    await publishResults(
      makeOptions({
        options: { openPr: true, dryRun: true },
        patchResult,
      }),
      makeProgress()
    );

    expect(mockCreateModelPr).not.toHaveBeenCalled();
  });

  it('closes model PR when openPr, no violations, and no patchResult', async () => {
    await publishResults(
      makeOptions({
        analysisResult: makeAnalysisResult({ hasViolations: false }),
        patchResult: null,
        options: { openPr: true, dryRun: false },
      }),
      makeProgress()
    );

    expect(mockCloseModelPr).toHaveBeenCalledOnce();
    expect(mockCloseModelPr).toHaveBeenCalledWith(
      expect.objectContaining({ sourceRepo: 'org/repo', prNumber: 42 })
    );
  });

  it('comments on PR when comment is true and analysisHasFindings returns true', async () => {
    mockAnalysisHasFindings.mockReturnValueOnce(true);

    await publishResults(
      makeOptions({
        options: { comment: true },
      }),
      makeProgress()
    );

    expect(mockCommentOnChangeRequest).toHaveBeenCalledOnce();
    expect(mockDeleteComment).not.toHaveBeenCalled();
  });

  it('deletes comment when comment is true and analysisHasFindings returns false', async () => {
    mockAnalysisHasFindings.mockReturnValueOnce(false);

    await publishResults(
      makeOptions({
        options: { comment: true },
      }),
      makeProgress()
    );

    expect(mockDeleteComment).toHaveBeenCalledOnce();
    expect(mockCommentOnChangeRequest).not.toHaveBeenCalled();
  });

  it('writes GitHub Actions outputs when githubActions is true and structured is set', async () => {
    const structured = makeStructured();

    await publishResults(
      makeOptions({
        structured,
        options: { githubActions: true },
      }),
      makeProgress()
    );

    expect(mockWriteGitHubActionsOutputs).toHaveBeenCalledWith(structured);
    expect(mockWriteGitHubStepSummary).toHaveBeenCalledWith(structured);
  });

  it('does not write GitHub Actions outputs when structured is undefined', async () => {
    await publishResults(
      makeOptions({
        structured: undefined,
        options: { githubActions: true },
      }),
      makeProgress()
    );

    expect(mockWriteGitHubActionsOutputs).not.toHaveBeenCalled();
  });

  it('uses parseOwnerRepo to split modelRepo for PR creation', async () => {
    const patchResult = {
      filePath: 'model.c4',
      content: 'new content',
      insertedLines: ['comp.a -> comp.b'],
      skipped: [],
    };

    await publishResults(
      makeOptions({
        options: { openPr: true, dryRun: false, modelRepo: 'org/model-repo' },
        patchResult,
      }),
      makeProgress()
    );

    expect(mockCreateModelPr).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'org', repo: 'model-repo', sourceRepo: 'org/repo' })
    );
  });
});
