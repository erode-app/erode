import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Command } from 'commander';

// 1. Declare mock functions via vi.hoisted() so they are available in vi.mock() factories
const {
  mockLoadAndListComponents,
  mockCheckVersion,
  mockHandleCliError,
  mockFormat,
  mockProgressStart,
  mockProgressSucceed,
  mockProgressWarn,
  mockProgressInfo,
  mockCreateAdapter,
} = vi.hoisted(() => ({
  mockLoadAndListComponents: vi.fn(),
  mockCheckVersion: vi.fn(),
  mockHandleCliError: vi.fn(),
  mockFormat: vi.fn(),
  mockProgressStart: vi.fn(),
  mockProgressSucceed: vi.fn(),
  mockProgressWarn: vi.fn(),
  mockProgressInfo: vi.fn(),
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
  missingLinksHelpLines: [
    'Add a link directive to connect components to their repositories:',
    "  my_component = service 'My Service' { link https://github.com/org/repo }",
    'Multiple components can share the same URL (monorepo support).',
    'See: https://likec4.dev/dsl/links/',
  ],
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
  }),
  OutputFormatter: {
    format: mockFormat,
  },
}));

// 3. Import after mocks
import { createValidateCommand } from '../validate.js';

describe('createValidateCommand', () => {
  let command: Command;

  function makeComponent(overrides = {}) {
    return {
      id: 'comp.api',
      title: 'API Service',
      kind: 'service',
      links: ['https://github.com/org/repo'],
      tags: [],
      ...overrides,
    };
  }

  function makeMockAdapter() {
    return {
      metadata: MOCK_METADATA,
      loadAndListComponents: mockLoadAndListComponents,
      checkVersion: mockCheckVersion,
    };
  }

  async function run(...args: string[]) {
    await command.parseAsync(['node', 'test', ...args]);
  }

  // 4. beforeEach - clear mocks and set up defaults
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    process.exitCode = undefined;
    command = createValidateCommand();
    command.exitOverride();
    mockCreateAdapter.mockReturnValue(makeMockAdapter());
    mockLoadAndListComponents.mockResolvedValue([makeComponent()]);
    mockFormat.mockReturnValue('formatted');
    mockCheckVersion.mockReturnValue({
      found: true,
      version: '1.45.0',
      compatible: true,
      minimum: '1.45.0',
    });
  });

  it('succeeds when all components have GitHub links', async () => {
    await run('./models');

    expect(mockLoadAndListComponents).toHaveBeenCalledWith('./models');
    expect(mockProgressSucceed).toHaveBeenCalledWith(
      expect.stringContaining('All components have repository links')
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('warns when some components are missing links', async () => {
    mockLoadAndListComponents.mockResolvedValue([
      makeComponent({ id: 'a', links: ['https://github.com/org/repo'] }),
      makeComponent({ id: 'b', links: [] }),
    ]);

    await run('./models');

    expect(mockProgressWarn).toHaveBeenCalledWith(
      expect.stringContaining('1 of 2 component(s) are missing repository links')
    );
    expect(process.exitCode).toBe(1);
  });

  it('warns when all components are missing links', async () => {
    mockLoadAndListComponents.mockResolvedValue([
      makeComponent({ id: 'a', links: [] }),
      makeComponent({ id: 'b', links: ['https://example.com'] }),
    ]);

    await run('./models');

    expect(mockProgressWarn).toHaveBeenCalledWith(
      expect.stringContaining('2 of 2 component(s) are missing repository links')
    );
    expect(process.exitCode).toBe(1);
  });

  it('handles empty model gracefully', async () => {
    mockLoadAndListComponents.mockResolvedValue([]);

    await run('./models');

    expect(mockProgressWarn).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('outputs JSON format with structured data', async () => {
    mockLoadAndListComponents.mockResolvedValue([
      makeComponent({ id: 'a', title: 'A', links: ['https://github.com/org/repo'] }),
      makeComponent({ id: 'b', title: 'B', links: [] }),
    ]);

    await run('./models', '--format', 'json');

    expect(mockFormat).toHaveBeenCalledWith(expect.any(Object), 'json');
    const callArgs = mockFormat.mock.calls[0] as unknown[];
    const jsonData = callArgs[0] as {
      total: number;
      linked: number;
      unlinked: number;
      components: { id: string; repository: string }[];
    };
    expect(jsonData.total).toBe(2);
    expect(jsonData.linked).toBe(1);
    expect(jsonData.unlinked).toBe(1);
    expect(jsonData.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'a', repository: 'https://github.com/org/repo' }),
        expect.objectContaining({ id: 'b', repository: 'MISSING' }),
      ])
    );
  });

  it('reports monorepo components (same URL) as all linked', async () => {
    mockLoadAndListComponents.mockResolvedValue([
      makeComponent({ id: 'a', links: ['https://github.com/org/monorepo'] }),
      makeComponent({ id: 'b', links: ['https://github.com/org/monorepo'] }),
    ]);

    await run('./models');

    expect(mockProgressSucceed).toHaveBeenCalledWith(
      expect.stringContaining('All components have repository links')
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('detects GitLab links as valid repository links', async () => {
    mockLoadAndListComponents.mockResolvedValue([
      makeComponent({ id: 'a', links: ['https://gitlab.com/group/project'] }),
    ]);

    await run('./models');

    expect(mockProgressSucceed).toHaveBeenCalledWith(
      expect.stringContaining('All components have repository links')
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('handles adapter load failure', async () => {
    const error = new Error('load failed');
    mockLoadAndListComponents.mockRejectedValue(error);

    await run('./models');

    expect(mockHandleCliError).toHaveBeenCalledWith(error);
  });

  describe('version check', () => {
    it('shows success when version is compatible', async () => {
      await run('./models');

      expect(mockProgressSucceed).toHaveBeenCalledWith(
        expect.stringContaining('LikeC4 version 1.45.0 is compatible')
      );
    });

    it('warns and sets exit code when version is incompatible', async () => {
      mockCheckVersion.mockReturnValue({
        found: true,
        version: '1.30.0',
        compatible: false,
        minimum: '1.45.0',
      });

      await run('./models');

      expect(mockProgressWarn).toHaveBeenCalledWith(
        expect.stringContaining('LikeC4 version 1.30.0 is below minimum 1.45.0')
      );
      expect(process.exitCode).toBe(1);
    });

    it('warns when version is not detectable', async () => {
      mockCheckVersion.mockReturnValue({
        found: false,
        minimum: '1.45.0',
      });

      await run('./models');

      expect(mockProgressWarn).toHaveBeenCalledWith(
        expect.stringContaining('Could not detect LikeC4 version')
      );
    });

    it('includes modelVersion in JSON output', async () => {
      await run('./models', '--format', 'json');

      const callArgs = mockFormat.mock.calls[0] as unknown[];
      const jsonData = callArgs[0] as {
        modelVersion: { detected: string | null; minimum: string; compatible: boolean | null };
      };
      expect(jsonData.modelVersion).toEqual({
        detected: '1.45.0',
        minimum: '1.45.0',
        compatible: true,
      });
    });
  });
});
