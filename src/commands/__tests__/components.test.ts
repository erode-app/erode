import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Command } from 'commander';

// 1. Declare mock functions via vi.hoisted so they are available in hoisted vi.mock factories
const { mockLoadAndListComponents, mockHandleCliError, mockFormat, mockCreateAdapter } = vi.hoisted(
  () => ({
    mockLoadAndListComponents: vi.fn(),
    mockHandleCliError: vi.fn(),
    mockFormat: vi.fn(),
    mockCreateAdapter: vi.fn(),
  })
);

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
    start: vi.fn(),
    succeed: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    fail: vi.fn(),
    update: vi.fn(),
  }),
  displaySection: vi.fn(),
  OutputFormatter: {
    format: mockFormat,
  },
}));

// 3. Import after mocks
import { createComponentsCommand } from '../components.js';

describe('createComponentsCommand', () => {
  let command: Command;

  // Helper to create a component with optional overrides
  function makeComponent(overrides = {}) {
    return {
      id: 'comp.api',
      title: 'API Service',
      kind: 'service',
      links: [],
      tags: [],
      ...overrides,
    };
  }

  function makeMockAdapter() {
    return {
      metadata: MOCK_METADATA,
      loadAndListComponents: mockLoadAndListComponents,
    };
  }

  async function run(...args: string[]) {
    await command.parseAsync(['node', 'test', ...args]);
  }

  // 4. beforeEach - clear mocks and set up defaults
  beforeEach(() => {
    vi.clearAllMocks();
    command = createComponentsCommand();
    command.exitOverride(); // prevent process.exit on parse errors
    mockCreateAdapter.mockReturnValue(makeMockAdapter());
    mockLoadAndListComponents.mockResolvedValue([makeComponent()]);
    mockFormat.mockReturnValue('formatted-output');
  });

  it('lists components in default table format', async () => {
    await run('./models');

    expect(mockLoadAndListComponents).toHaveBeenCalledWith('./models');
    expect(mockFormat).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'comp.api' })]),
      'table'
    );
  });

  it('lists components in json format', async () => {
    await run('./models', '--format', 'json');

    expect(mockFormat).toHaveBeenCalledWith(expect.any(Array), 'json');
  });

  it('lists components in yaml format', async () => {
    await run('./models', '--format', 'yaml');

    expect(mockFormat).toHaveBeenCalledWith(expect.any(Array), 'yaml');
  });

  it('table format maps to subset of fields', async () => {
    mockLoadAndListComponents.mockResolvedValue([
      makeComponent({ id: 'x', title: 'X', kind: 'k', links: ['l'] }),
    ]);

    await run('./models');

    expect(mockFormat).toHaveBeenCalledWith(
      [{ id: 'x', title: 'X', kind: 'k', links: ['l'] }],
      'table'
    );
  });

  it('handles empty component list', async () => {
    mockLoadAndListComponents.mockResolvedValue([]);

    await run('./models');

    expect(mockFormat).toHaveBeenCalledWith([], 'table');
  });

  it('handles adapter load failure', async () => {
    const error = new Error('load failed');
    mockLoadAndListComponents.mockRejectedValue(error);

    await run('./models');

    expect(mockHandleCliError).toHaveBeenCalledWith(error);
  });
});
