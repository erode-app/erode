import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Command } from 'commander';
import type { ArchitecturalComponent } from '../../adapters/architecture-types.js';
import type { ChangeRequestRef, ChangeRequestData } from '../../platforms/source-platform.js';
import type { DriftAnalysisResult } from '../../analysis/analysis-types.js';

// 1. Declare mock functions via vi.hoisted so they are available in hoisted vi.mock factories
const {
  mockLoadFromPath,
  mockFindAll,
  mockGetDeps,
  mockGetDependents,
  mockGetRelationships,
  mockGetAllComponents,
  mockHandleCliError,
  mockOutputFormat,
  mockProgressStart,
  mockProgressSucceed,
  mockProgressWarn,
  mockProgressInfo,
  mockProgressFail,
  mockProgressUpdate,
  mockParseUrl,
  mockFetchPr,
  mockFetchCommits,
  mockCreatePr,
  mockCreateAIProvider,
  mockSelectComponent,
  mockExtractDeps,
  mockAnalyzePr,
  mockGenerateModel,
  mockBuildStructured,
  mockFormatConsole,
  mockWriteOutput,
  mockLoadSkipPatterns,
  mockApplySkipPatterns,
  mockCreateAdapter,
} = vi.hoisted(() => ({
  mockLoadFromPath: vi.fn(),
  mockFindAll: vi.fn(),
  mockGetDeps: vi.fn(),
  mockGetDependents: vi.fn(),
  mockGetRelationships: vi.fn(),
  mockGetAllComponents: vi.fn(),
  mockHandleCliError: vi.fn(),
  mockOutputFormat: vi.fn(),
  mockProgressStart: vi.fn(),
  mockProgressSucceed: vi.fn(),
  mockProgressWarn: vi.fn(),
  mockProgressInfo: vi.fn(),
  mockProgressFail: vi.fn(),
  mockProgressUpdate: vi.fn(),
  mockParseUrl: vi.fn(),
  mockFetchPr: vi.fn(),
  mockFetchCommits: vi.fn(),
  mockCreatePr: vi.fn(),
  mockCreateAIProvider: vi.fn(),
  mockSelectComponent: vi.fn(),
  mockExtractDeps: vi.fn(),
  mockAnalyzePr: vi.fn(),
  mockGenerateModel: vi.fn(),
  mockBuildStructured: vi.fn(),
  mockFormatConsole: vi.fn(),
  mockWriteOutput: vi.fn(),
  mockLoadSkipPatterns: vi.fn(),
  mockApplySkipPatterns: vi.fn(),
  mockCreateAdapter: vi.fn(),
}));

const MOCK_METADATA = {
  id: 'likec4',
  displayName: 'LikeC4',
  documentationUrl: 'https://likec4.dev/dsl/links/',
  fileExtensions: ['.c4'],
  pathDescription: 'Path to LikeC4 models directory',
  generatedFileExtension: '.c4',
  prTitleTemplate: 'chore: update LikeC4 model for PR #{{prNumber}}',
  errorSuggestions: {},
  noComponentHelpLines: [
    'Add a link directive to a component in your LikeC4 model:',
    "  my_component = service 'My Service' { link {{repoUrl}} }",
    'Multiple components can share the same URL (monorepo support).',
    'Run "erode validate <model-path>" to check your model.',
    'See: https://likec4.dev/dsl/links/',
  ],
  missingLinksHelpLines: [],
};

// 2. vi.mock() before imports
vi.mock('../../adapters/adapter-factory.js', () => ({
  createAdapter: mockCreateAdapter,
}));

vi.mock('../../utils/error-handler.js', () => ({
  ErrorHandler: { handleCliError: mockHandleCliError },
}));

vi.mock('../../utils/validation.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/validation.js')>();
  return { ...actual, validatePath: vi.fn() };
});

vi.mock('../../utils/cli-helpers.js', () => ({
  createProgress: () => ({
    start: mockProgressStart,
    succeed: mockProgressSucceed,
    warn: mockProgressWarn,
    info: mockProgressInfo,
    fail: mockProgressFail,
    update: mockProgressUpdate,
  }),
  displaySection: vi.fn(),
  OutputFormatter: { format: mockOutputFormat },
}));

vi.mock('../../platforms/platform-factory.js', () => ({
  createPlatformReader: () => ({
    parseChangeRequestUrl: mockParseUrl,
    fetchChangeRequest: mockFetchPr,
    fetchChangeRequestCommits: mockFetchCommits,
  }),
  createPlatformWriter: () => ({
    createOrUpdateChangeRequest: mockCreatePr,
  }),
}));

vi.mock('../../providers/provider-factory.js', () => ({
  createAIProvider: mockCreateAIProvider,
}));

vi.mock('../../output.js', () => ({
  buildStructuredOutput: mockBuildStructured,
  formatAnalysisForConsole: mockFormatConsole,
  writeOutputToFile: mockWriteOutput,
}));

vi.mock('../../utils/skip-patterns.js', () => ({
  loadSkipPatterns: mockLoadSkipPatterns,
  applySkipPatterns: mockApplySkipPatterns,
}));

// 3. Import after mocks
import { createAnalyzeCommand } from '../analyze.js';

// 4. Factory helpers
function makeComponent(overrides = {}): ArchitecturalComponent {
  return {
    id: 'comp.api',
    name: 'API Service',
    type: 'service',
    repository: 'https://github.com/org/repo',
    tags: [],
    ...overrides,
  };
}

function makeRef(overrides = {}): ChangeRequestRef {
  return {
    number: 42,
    url: 'https://github.com/org/repo/pull/42',
    repositoryUrl: 'https://github.com/org/repo',
    platformId: { owner: 'org', repo: 'repo' },
    ...overrides,
  };
}

function makeChangeRequestData(overrides = {}): ChangeRequestData {
  return {
    number: 42,
    title: 'Test PR',
    body: 'PR body',
    state: 'open',
    author: { login: 'testuser', name: 'Test User' },
    base: { ref: 'main', sha: 'base123' },
    head: { ref: 'feature/test', sha: 'head456' },
    commits: 1,
    additions: 10,
    deletions: 5,
    changed_files: 1,
    files: [
      {
        filename: 'src/index.ts',
        status: 'modified',
        additions: 10,
        deletions: 5,
        changes: 15,
        patch: '@@ -1,3 +1,3 @@\n-old\n+new',
      },
    ],
    diff: 'diff --git a/src/index.ts\n-old\n+new',
    stats: { total: 15, additions: 10, deletions: 5 },
    ...overrides,
  };
}

function makeAnalysisResult(overrides = {}): DriftAnalysisResult {
  return {
    hasViolations: false,
    violations: [],
    summary: 'No issues found',
    metadata: {
      number: 42,
      title: 'Test PR',
      description: 'PR body',
      repository: 'org/repo',
      author: { login: 'testuser' },
      base: { ref: 'main', sha: 'base123' },
      head: { ref: 'feature/test', sha: 'head456' },
      stats: { commits: 1, additions: 10, deletions: 5, files_changed: 1 },
      commits: [{ sha: 'abc123', message: 'Add feature', author: 'Dev' }],
    },
    component: makeComponent(),
    dependencyChanges: { dependencies: [], summary: 'No changes' },
    ...overrides,
  };
}

function makeDefaultProvider() {
  return {
    selectComponent: mockSelectComponent,
    extractDependencies: mockExtractDeps,
    analyzeDrift: mockAnalyzePr,
    generateArchitectureCode: mockGenerateModel,
  };
}

function makeMockAdapter() {
  return {
    metadata: MOCK_METADATA,
    loadFromPath: mockLoadFromPath,
    loadAndListComponents: vi.fn(),
    findComponentByRepository: vi.fn(),
    findAllComponentsByRepository: mockFindAll,
    findComponentById: vi.fn(),
    getComponentDependencies: mockGetDeps,
    getComponentDependents: mockGetDependents,
    getComponentRelationships: mockGetRelationships,
    getAllComponents: mockGetAllComponents,
    isAllowedDependency: vi.fn(),
  };
}

describe('createAnalyzeCommand', () => {
  let command: Command;

  async function run(...args: string[]) {
    await command.parseAsync(['node', 'test', ...args]);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    command = createAnalyzeCommand();
    command.exitOverride();

    // Default mock returns
    mockCreateAdapter.mockReturnValue(makeMockAdapter());
    mockCreateAIProvider.mockReturnValue(makeDefaultProvider());
    mockParseUrl.mockReturnValue(makeRef());
    mockFetchPr.mockResolvedValue(makeChangeRequestData());
    mockFetchCommits.mockResolvedValue([
      { sha: 'abc123', message: 'Add feature', author: { name: 'Dev', email: 'dev@test.com' } },
    ]);
    mockFindAll.mockReturnValue([makeComponent()]);
    mockGetDeps.mockReturnValue([]);
    mockGetDependents.mockReturnValue([]);
    mockGetRelationships.mockReturnValue([]);
    mockGetAllComponents.mockReturnValue([makeComponent()]);
    mockExtractDeps.mockResolvedValue({ dependencies: [], summary: 'No changes' });
    mockAnalyzePr.mockResolvedValue(makeAnalysisResult());
    mockSelectComponent.mockResolvedValue('comp.api');
    mockGenerateModel.mockResolvedValue('model code');
    mockFormatConsole.mockReturnValue('console output');
    mockBuildStructured.mockReturnValue({ version: '1.0.0' });
    mockOutputFormat.mockReturnValue('json output');
    mockLoadSkipPatterns.mockReturnValue(['*.lock']);
    mockApplySkipPatterns.mockReturnValue({
      included: makeChangeRequestData().files,
      excluded: 0,
    });
    mockCreatePr.mockResolvedValue({
      url: 'https://github.com/org/repo/pull/99',
      number: 99,
      action: 'created',
      branch: 'erode/pr-42',
    });
  });

  it('analyzes PR with single component and console output', async () => {
    await run('./models', '--url', 'https://github.com/org/repo/pull/42');

    expect(mockLoadFromPath).toHaveBeenCalledWith('./models');
    expect(mockExtractDeps).toHaveBeenCalled();
    expect(mockAnalyzePr).toHaveBeenCalled();
    expect(mockFormatConsole).toHaveBeenCalled();
  });

  it('outputs analysis with violations', async () => {
    mockAnalyzePr.mockResolvedValue(
      makeAnalysisResult({
        hasViolations: true,
        violations: [
          {
            severity: 'high',
            description: 'Undeclared dep',
            file: 'src/index.ts',
            line: 10,
            commit: 'abc123',
          },
        ],
      })
    );

    await run('./models', '--url', 'https://github.com/org/repo/pull/42');

    expect(mockFormatConsole).toHaveBeenCalled();
  });

  it('calls selectComponent when multiple components found', async () => {
    mockFindAll.mockReturnValue([makeComponent({ id: 'a' }), makeComponent({ id: 'b' })]);
    mockSelectComponent.mockResolvedValue('b');

    await run('./models', '--url', 'https://github.com/org/repo/pull/42');

    expect(mockSelectComponent).toHaveBeenCalled();
  });

  it('exits early when no components found', async () => {
    mockFindAll.mockReturnValue([]);

    await run('./models', '--url', 'https://github.com/org/repo/pull/42');

    expect(mockProgressWarn).toHaveBeenCalledWith(expect.stringContaining('No components found'));
    expect(mockExtractDeps).not.toHaveBeenCalled();
  });

  it('applies skip patterns to filter files', async () => {
    mockApplySkipPatterns.mockReturnValue({ included: [], excluded: 2 });

    await run('./models', '--url', 'https://github.com/org/repo/pull/42');

    expect(mockLoadSkipPatterns).toHaveBeenCalled();
    expect(mockApplySkipPatterns).toHaveBeenCalled();
    expect(mockProgressInfo).toHaveBeenCalledWith(expect.stringContaining('Filtered out 2'));
  });

  it('skips file filtering when --skip-file-filtering', async () => {
    await run('./models', '--url', 'https://github.com/org/repo/pull/42', '--skip-file-filtering');

    expect(mockLoadSkipPatterns).not.toHaveBeenCalled();
  });

  it('outputs json format when --format json', async () => {
    await run('./models', '--url', 'https://github.com/org/repo/pull/42', '--format', 'json');

    expect(mockBuildStructured).toHaveBeenCalled();
    expect(mockOutputFormat).toHaveBeenCalledWith(expect.anything(), 'json');
  });

  it('writes output to file when --output-file', async () => {
    await run(
      './models',
      '--url',
      'https://github.com/org/repo/pull/42',
      '--output-file',
      'out.json'
    );

    expect(mockBuildStructured).toHaveBeenCalled();
    expect(mockWriteOutput).toHaveBeenCalledWith(expect.anything(), 'out.json');
  });

  it('generates model code when --generate-model', async () => {
    await run('./models', '--url', 'https://github.com/org/repo/pull/42', '--generate-model');

    expect(mockGetAllComponents).toHaveBeenCalled();
    expect(mockGenerateModel).toHaveBeenCalled();
  });

  it('creates PR when --open-pr and --generate-model', async () => {
    await run(
      './models',
      '--url',
      'https://github.com/org/repo/pull/42',
      '--generate-model',
      '--open-pr'
    );

    expect(mockCreatePr).toHaveBeenCalledWith(
      expect.objectContaining({ branchName: 'erode/pr-42' })
    );
  });

  it('skips PR creation on dry run', async () => {
    await run(
      './models',
      '--url',
      'https://github.com/org/repo/pull/42',
      '--generate-model',
      '--open-pr',
      '--dry-run'
    );

    expect(mockCreatePr).not.toHaveBeenCalled();
    expect(mockProgressInfo).toHaveBeenCalledWith(expect.stringContaining('Dry run'));
  });

  it('warns when --open-pr without --generate-model', async () => {
    await run('./models', '--url', 'https://github.com/org/repo/pull/42', '--open-pr');

    expect(mockProgressWarn).toHaveBeenCalledWith(
      expect.stringContaining('--open-pr requires --generate-model')
    );
    expect(mockCreatePr).not.toHaveBeenCalled();
  });

  it('falls back to first component when provider has no selectComponent', async () => {
    mockFindAll.mockReturnValue([makeComponent({ id: 'a' }), makeComponent({ id: 'b' })]);
    mockCreateAIProvider.mockReturnValue({
      extractDependencies: mockExtractDeps,
      analyzeDrift: mockAnalyzePr,
    });

    await run('./models', '--url', 'https://github.com/org/repo/pull/42');

    expect(mockProgressWarn).toHaveBeenCalledWith(
      expect.stringContaining('does not support component selection')
    );
  });

  it('warns when provider has no generateModelCode', async () => {
    mockCreateAIProvider.mockReturnValue({
      selectComponent: mockSelectComponent,
      extractDependencies: mockExtractDeps,
      analyzeDrift: mockAnalyzePr,
    });

    await run('./models', '--url', 'https://github.com/org/repo/pull/42', '--generate-model');

    expect(mockProgressWarn).toHaveBeenCalledWith(
      expect.stringContaining('does not support LikeC4 model generation')
    );
  });
});
