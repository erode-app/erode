import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Command } from 'commander';

// 1. Declare mock functions via vi.hoisted() so they are available in vi.mock() factories
const {
  mockLoadFromPath,
  mockFindAll,
  mockGetDeps,
  mockGetDependents,
  mockGetRelationships,
  mockHandleCliError,
  mockFormat,
  mockProgressStart,
  mockProgressSucceed,
  mockProgressWarn,
  mockProgressInfo,
  mockProgressFail,
  mockProgressUpdate,
  mockCreateAdapter,
} = vi.hoisted(() => ({
  mockLoadFromPath: vi.fn(),
  mockFindAll: vi.fn(),
  mockGetDeps: vi.fn(),
  mockGetDependents: vi.fn(),
  mockGetRelationships: vi.fn(),
  mockHandleCliError: vi.fn(),
  mockFormat: vi.fn(),
  mockProgressStart: vi.fn(),
  mockProgressSucceed: vi.fn(),
  mockProgressWarn: vi.fn(),
  mockProgressInfo: vi.fn(),
  mockProgressFail: vi.fn(),
  mockProgressUpdate: vi.fn(),
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
  noComponentHelpLines: [],
  missingLinksHelpLines: [],
};

// 2. vi.mock() before imports
vi.mock('../../adapters/adapter-factory.js', () => ({
  createAdapter: mockCreateAdapter,
}));

vi.mock('../../utils/error-handler.js', () => ({
  ErrorHandler: {
    handleCliError: mockHandleCliError,
  },
}));

vi.mock('../../utils/validation.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/validation.js')>();
  return {
    ...actual,
    validatePath: vi.fn(),
  };
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
  OutputFormatter: {
    format: mockFormat,
  },
}));

// 3. Import after mocks
import { createConnectionsCommand } from '../connections.js';

describe('createConnectionsCommand', () => {
  let command: Command;

  function makeComponent(overrides = {}) {
    return {
      id: 'comp.api',
      name: 'API Service',
      type: 'service',
      repository: 'https://github.com/org/repo',
      tags: [],
      ...overrides,
    };
  }

  function makeMockAdapter() {
    return {
      metadata: MOCK_METADATA,
      loadFromPath: mockLoadFromPath,
      findAllComponentsByRepository: mockFindAll,
      getComponentDependencies: mockGetDeps,
      getComponentDependents: mockGetDependents,
      getComponentRelationships: mockGetRelationships,
    };
  }

  async function run(...args: string[]) {
    await command.parseAsync(['node', 'test', ...args]);
  }

  // 4. beforeEach - clear mocks and set up defaults
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    command = createConnectionsCommand();
    command.exitOverride();
    mockCreateAdapter.mockReturnValue(makeMockAdapter());
    mockLoadFromPath.mockResolvedValue(undefined);
    mockFindAll.mockReturnValue([makeComponent()]);
    mockGetDeps.mockReturnValue([]);
    mockGetDependents.mockReturnValue([]);
    mockGetRelationships.mockReturnValue([]);
    mockFormat.mockReturnValue('{}');
  });

  it('loads model and displays single component connections', async () => {
    mockGetDeps.mockReturnValue([
      makeComponent({ id: 'comp.db', name: 'DB', type: 'database' }),
    ]);

    await run('./models', '--repo', 'https://github.com/org/repo');

    expect(mockLoadFromPath).toHaveBeenCalledWith('./models');
    expect(mockFindAll).toHaveBeenCalledWith('https://github.com/org/repo');
    expect(mockGetDeps).toHaveBeenCalledWith('comp.api');
  });

  it('displays multiple components', async () => {
    mockFindAll.mockReturnValue([
      makeComponent({ id: 'a', name: 'A' }),
      makeComponent({ id: 'b', name: 'B' }),
    ]);

    await run('./models', '--repo', 'https://github.com/org/repo');

    expect(mockGetDeps).toHaveBeenCalledWith('a');
    expect(mockGetDeps).toHaveBeenCalledWith('b');
  });

  it('outputs json format', async () => {
    mockGetDeps.mockReturnValue([]);
    mockGetDependents.mockReturnValue([]);
    mockGetRelationships.mockReturnValue([]);

    await run('./models', '--repo', 'https://github.com/org/repo', '--output', 'json');

    expect(mockFormat).toHaveBeenCalledWith(expect.any(Array), 'json');
  });

  it('returns early when no components found', async () => {
    mockFindAll.mockReturnValue([]);

    await run('./models', '--repo', 'https://github.com/org/repo');

    expect(mockProgressWarn).toHaveBeenCalledWith(
      expect.stringContaining('No components found')
    );
    expect(mockGetDeps).not.toHaveBeenCalled();
  });

  it('handles adapter load failure', async () => {
    const error = new Error('load failed');
    mockLoadFromPath.mockRejectedValue(error);

    await run('./models', '--repo', 'https://github.com/org/repo');

    expect(mockHandleCliError).toHaveBeenCalledWith(error);
  });

  it('handles invalid repo URL via validation', async () => {
    await run('./models', '--repo', 'not-a-url');

    expect(mockHandleCliError).toHaveBeenCalled();
  });

  it('json output includes structured component data', async () => {
    const dep = makeComponent({
      id: 'comp.db',
      name: 'DB',
      type: 'database',
      repository: undefined,
    });
    mockGetDeps.mockReturnValue([dep]);
    mockGetDependents.mockReturnValue([]);
    mockGetRelationships.mockReturnValue([
      {
        source: 'comp.api',
        target: { id: 'comp.db', name: 'DB' },
        kind: 'http',
        title: 'calls',
      },
    ]);

    await run('./models', '--repo', 'https://github.com/org/repo', '--output', 'json');

    expect(mockFormat).toHaveBeenCalledWith(expect.any(Array), 'json');
    const callArgs = mockFormat.mock.calls[0] as unknown[];
    const jsonData = callArgs[0] as Record<string, unknown>[];
    expect(jsonData).toHaveLength(1);

    const entry = jsonData[0] as {
      component: { id: string };
      dependencies: { id: string }[];
      relationships: { kind: string }[];
    };
    expect(entry.component.id).toBe('comp.api');
    expect(entry.dependencies).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'comp.db' })])
    );
    expect(entry.relationships).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'http' })])
    );
  });
});
