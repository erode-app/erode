import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mock functions ────────────────────────────────────────────────
const {
  mockLoadFromPath,
  mockFindAllComponentsByRepository,
  mockFindComponentById,
  mockGetComponentDependencies,
  mockGetComponentDependents,
  mockGetComponentRelationships,
  mockGetAllRelationships,
  mockSelectComponent,
  mockExtractDependencies,
  mockAnalyzeDrift,
  mockFetchChangeRequest,
  mockFetchChangeRequestCommits,
  mockParseChangeRequestUrl,
  mockLoadSkipPatterns,
  mockApplySkipPatterns,
  mockValidatePath,
  mockBuildStructuredOutput,
  mockWriteOutputToFile,
  mockPublishResults,
  mockPatcherPatch,
  mockWriteFile,
  mockResolveModelSource,
} = vi.hoisted(() => ({
  mockLoadFromPath: vi.fn(),
  mockFindAllComponentsByRepository: vi.fn(),
  mockFindComponentById: vi.fn(),
  mockGetComponentDependencies: vi.fn(),
  mockGetComponentDependents: vi.fn(),
  mockGetComponentRelationships: vi.fn(),
  mockGetAllRelationships: vi.fn(),
  mockSelectComponent: vi.fn(),
  mockExtractDependencies: vi.fn(),
  mockAnalyzeDrift: vi.fn(),
  mockFetchChangeRequest: vi.fn(),
  mockFetchChangeRequestCommits: vi.fn(),
  mockParseChangeRequestUrl: vi.fn(),
  mockLoadSkipPatterns: vi.fn(),
  mockApplySkipPatterns: vi.fn(),
  mockValidatePath: vi.fn(),
  mockBuildStructuredOutput: vi.fn(),
  mockWriteOutputToFile: vi.fn(),
  mockPublishResults: vi.fn(),
  mockPatcherPatch: vi.fn(),
  mockWriteFile: vi.fn(),
  mockResolveModelSource: vi.fn(),
}));

// ── Module mocks ──────────────────────────────────────────────────────────
vi.mock('../../adapters/adapter-factory.js', () => ({
  createAdapter: vi.fn(() => ({
    metadata: {
      id: 'likec4',
      displayName: 'LikeC4',
      documentationUrl: 'https://example.com',
      fileExtensions: ['.c4'],
      pathDescription: 'LikeC4 model directory',
      prTitleTemplate: 'erode: update model (PR #{{prNumber}})',
      errorSuggestions: {},
      noComponentHelpLines: [],
      missingLinksHelpLines: [],
    },
    loadFromPath: mockLoadFromPath,
    findAllComponentsByRepository: mockFindAllComponentsByRepository,
    findComponentById: mockFindComponentById,
    getComponentDependencies: mockGetComponentDependencies,
    getComponentDependents: mockGetComponentDependents,
    getComponentRelationships: mockGetComponentRelationships,
    getAllRelationships: mockGetAllRelationships,
    loadAndListComponents: vi.fn(),
    findComponentByRepository: vi.fn(),
    getAllComponents: vi.fn(),
    isAllowedDependency: vi.fn(),
  })),
}));

vi.mock('../../platforms/platform-factory.js', () => ({
  createPlatformReader: vi.fn(() => ({
    parseChangeRequestUrl: mockParseChangeRequestUrl,
    fetchChangeRequest: mockFetchChangeRequest,
    fetchChangeRequestCommits: mockFetchChangeRequestCommits,
  })),
}));

vi.mock('../../providers/provider-factory.js', () => ({
  createAIProvider: vi.fn(() => ({
    selectComponent: mockSelectComponent,
    extractDependencies: mockExtractDependencies,
    analyzeDrift: mockAnalyzeDrift,
  })),
}));

vi.mock('../../adapters/model-patcher.js', () => ({
  createModelPatcher: vi.fn(() => ({
    patch: mockPatcherPatch,
  })),
}));

vi.mock('../../output.js', () => ({
  buildStructuredOutput: mockBuildStructuredOutput,
  writeOutputToFile: mockWriteOutputToFile,
}));

vi.mock('../publish.js', () => ({
  publishResults: mockPublishResults,
}));

vi.mock('../../utils/validation.js', () => ({
  validatePath: mockValidatePath,
}));

vi.mock('../../utils/skip-patterns.js', () => ({
  loadSkipPatterns: mockLoadSkipPatterns,
  applySkipPatterns: mockApplySkipPatterns,
}));

vi.mock('node:fs/promises', () => ({
  writeFile: mockWriteFile,
}));

vi.mock('../../utils/model-source.js', () => ({
  resolveModelSource: mockResolveModelSource,
}));

vi.mock('../../utils/config.js', () => ({
  CONFIG: {
    debug: { verbose: false },
    ai: { provider: 'gemini' },
    gemini: { fastModel: 'gemini-1.5-flash', advancedModel: 'gemini-1.5-pro' },
    anthropic: { fastModel: 'claude-haiku', advancedModel: 'claude-sonnet' },
  },
}));

import { runAnalyze } from '../analyze.js';
import { createModelPatcher } from '../../adapters/model-patcher.js';
import type { AnalyzeOptions } from '../analyze.js';
import type { DriftAnalysisResult } from '../../analysis/analysis-types.js';
import type { ArchitecturalComponent } from '../../adapters/architecture-types.js';

// ── Test data builders ────────────────────────────────────────────────────

function makeComponent(id = 'comp.api', name = 'API Service'): ArchitecturalComponent {
  return { id, name, type: 'service', tags: [], repository: 'https://github.com/org/repo' };
}

function makePrData() {
  return {
    number: 42,
    title: 'Add auth middleware',
    body: 'This PR adds auth middleware',
    state: 'open',
    author: { login: 'dev', name: 'Dev User' },
    base: { ref: 'main', sha: 'base-sha' },
    head: { ref: 'feature/auth', sha: 'head-sha' },
    commits: 1,
    additions: 20,
    deletions: 5,
    changed_files: 2,
    files: [
      {
        filename: 'src/middleware/auth.ts',
        status: 'added',
        additions: 20,
        deletions: 5,
        changes: 25,
        patch: '@@ -0,0 +1,20 @@\n+export function auth() {}',
      },
    ],
    diff: 'diff --git a/src/middleware/auth.ts b/src/middleware/auth.ts\n+export function auth() {}',
    stats: { total: 25, additions: 20, deletions: 5 },
  };
}

function makeCommits() {
  return [
    {
      sha: 'head-sha',
      message: 'Add auth middleware',
      author: { name: 'Dev User', email: 'dev@example.com' },
    },
  ];
}

function makeRef() {
  return {
    number: 42,
    url: 'https://github.com/org/repo/pull/42',
    repositoryUrl: 'https://github.com/org/repo',
    platformId: { owner: 'org', repo: 'repo' },
  };
}

function makeDriftResult(overrides: Partial<DriftAnalysisResult> = {}): DriftAnalysisResult {
  return {
    hasViolations: false,
    violations: [],
    summary: 'No issues found',
    metadata: {
      number: 42,
      title: 'Add auth middleware',
      description: 'This PR adds auth middleware',
      repository: 'org/repo',
      author: { login: 'dev', name: 'Dev User' },
      base: { ref: 'main', sha: 'base-sha' },
      head: { ref: 'feature/auth', sha: 'head-sha' },
      stats: { commits: 1, additions: 20, deletions: 5, files_changed: 2 },
      commits: [{ sha: 'head-sha', message: 'Add auth middleware', author: 'Dev User' }],
    },
    component: makeComponent(),
    dependencyChanges: { dependencies: [], summary: '' },
    ...overrides,
  };
}

function makeOptions(overrides: Partial<AnalyzeOptions> = {}): AnalyzeOptions {
  return {
    modelPath: '/path/to/model',
    url: 'https://github.com/org/repo/pull/42',
    ...overrides,
  };
}

// ── Test setup ────────────────────────────────────────────────────────────

function setupDefaultMocks() {
  mockResolveModelSource.mockResolvedValue({
    localPath: '/path/to/model',
    repoSlug: undefined,
    cleanup: vi.fn().mockResolvedValue(undefined),
  });
  mockValidatePath.mockReturnValue(undefined);
  mockLoadFromPath.mockResolvedValue({
    components: [makeComponent()],
    relationships: [],
    componentIndex: { byId: new Map(), byRepository: new Map() },
  });
  mockParseChangeRequestUrl.mockReturnValue(makeRef());
  mockFetchChangeRequest.mockResolvedValue(makePrData());
  mockFetchChangeRequestCommits.mockResolvedValue(makeCommits());
  mockLoadSkipPatterns.mockReturnValue([]);
  mockApplySkipPatterns.mockReturnValue({ included: makePrData().files, excluded: 0 });
  mockFindAllComponentsByRepository.mockReturnValue([makeComponent()]);
  mockGetComponentDependencies.mockReturnValue([]);
  mockGetComponentDependents.mockReturnValue([]);
  mockGetComponentRelationships.mockReturnValue([]);
  mockGetAllRelationships.mockReturnValue([]);
  mockExtractDependencies.mockResolvedValue({ dependencies: [], summary: 'no deps' });
  mockAnalyzeDrift.mockResolvedValue(makeDriftResult());
  mockPublishResults.mockResolvedValue({
    generatedChangeRequest: undefined,
  });
  mockBuildStructuredOutput.mockReturnValue({ analysis: { hasViolations: false } });
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('runAnalyze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('returns empty result when no components found', async () => {
    mockFindAllComponentsByRepository.mockReturnValue([]);

    const result = await runAnalyze(makeOptions());

    expect(result.hasViolations).toBe(false);
    expect(result.analysisResult.violations).toEqual([]);
    expect(result.analysisResult.component.id).toBe('');
    expect(mockExtractDependencies).not.toHaveBeenCalled();
    expect(mockAnalyzeDrift).not.toHaveBeenCalled();
  });

  it('skips selectComponent when only a single component is found', async () => {
    mockFindAllComponentsByRepository.mockReturnValue([makeComponent()]);

    await runAnalyze(makeOptions());

    expect(mockSelectComponent).not.toHaveBeenCalled();
  });

  it('calls selectComponent when multiple components are found', async () => {
    const components = [
      makeComponent('comp.api', 'API Service'),
      makeComponent('comp.worker', 'Worker Service'),
    ];
    mockFindAllComponentsByRepository.mockReturnValue(components);
    mockSelectComponent.mockResolvedValue('comp.api');

    await runAnalyze(makeOptions());

    expect(mockSelectComponent).toHaveBeenCalledOnce();
    expect(mockSelectComponent).toHaveBeenCalledWith(
      expect.objectContaining({
        components,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        files: expect.arrayContaining([
          expect.objectContaining({ filename: 'src/middleware/auth.ts' }),
        ]),
      })
    );
  });

  it('extracts dependencies using the full diff', async () => {
    const prData = makePrData();
    mockFetchChangeRequest.mockResolvedValue(prData);

    await runAnalyze(makeOptions());

    expect(mockExtractDependencies).toHaveBeenCalledOnce();
    const callArgs = mockExtractDependencies.mock.calls[0]?.[0] as { diff: string } | undefined;
    expect(callArgs).toBeDefined();
    expect(typeof callArgs?.diff).toBe('string');
  });

  it('runs drift analysis with the correct component and extracted deps', async () => {
    const component = makeComponent('comp.api', 'API Service');
    mockFindAllComponentsByRepository.mockReturnValue([component]);

    await runAnalyze(makeOptions());

    expect(mockAnalyzeDrift).toHaveBeenCalledOnce();
    const callArgs = mockAnalyzeDrift.mock.calls[0]?.[0] as
      | { component: ArchitecturalComponent }
      | undefined;
    expect(callArgs?.component).toMatchObject({ id: 'comp.api', name: 'API Service' });
  });

  it('patches model when openPr is set and modelUpdates has relationships', async () => {
    const driftResult = makeDriftResult({
      modelUpdates: {
        relationships: [
          { source: 'comp.api', target: 'comp.db', kind: 'uses', description: 'API uses DB' },
        ],
      },
    });
    mockAnalyzeDrift.mockResolvedValue(driftResult);
    mockPatcherPatch.mockResolvedValue({
      filePath: 'model.c4',
      content: 'patched content',
      insertedLines: ['  comp.api -> comp.db'],
      skipped: [],
    });

    await runAnalyze(makeOptions({ openPr: true }));

    expect(createModelPatcher).toHaveBeenCalledWith('likec4');
    expect(mockPatcherPatch).toHaveBeenCalledOnce();
  });

  it('skips patching when no modelUpdates relationships are present', async () => {
    const driftResult = makeDriftResult({ modelUpdates: undefined });
    mockAnalyzeDrift.mockResolvedValue(driftResult);

    await runAnalyze(makeOptions({ openPr: true }));

    expect(mockPatcherPatch).not.toHaveBeenCalled();
  });

  it('surfaces generatedChangeRequest from publishResults in the return value', async () => {
    const cr = {
      url: 'https://github.com/org/model/pull/1',
      number: 1,
      action: 'created' as const,
      branch: 'erode/pr-42',
    };
    mockPublishResults.mockResolvedValue({ generatedChangeRequest: cr });

    const result = await runAnalyze(makeOptions({ openPr: true }));

    expect(result.generatedChangeRequest).toEqual(cr);
  });

  it('calls publishResults with the correct arguments', async () => {
    const driftResult = makeDriftResult();
    mockAnalyzeDrift.mockResolvedValue(driftResult);

    const options = makeOptions({ openPr: true, dryRun: false, modelRepo: 'org/model-repo' });
    await runAnalyze(options);

    expect(mockPublishResults).toHaveBeenCalledOnce();
    const publishCall = mockPublishResults.mock.calls[0]?.[0] as
      | { options: Record<string, unknown> }
      | undefined;
    expect(publishCall?.options).toMatchObject({
      openPr: true,
      dryRun: false,
      modelRepo: 'org/model-repo',
    });
  });
});
