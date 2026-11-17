import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as Fs from 'fs';

vi.mock('likec4', () => ({
  LikeC4: {
    fromWorkspace: vi.fn(),
  },
}));

vi.mock('../version-check.js', () => ({
  checkLikeC4Version: vi.fn().mockReturnValue({ found: false, minimum: '1.0.0' }),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof Fs>();
  return {
    ...actual,
    existsSync: (p: string) => p.startsWith('/workspace') || actual.existsSync(p),
  };
});

import { LikeC4 } from 'likec4';
import { LikeC4Adapter } from '../adapter.js';
import { createMockModel } from './fixtures/mock-model.js';

type LikeC4Instance = Awaited<ReturnType<typeof LikeC4.fromWorkspace>>;

const mockFromWorkspace = vi.mocked(LikeC4.fromWorkspace);
const WORKSPACE = '/workspace/model';

function mockInstance(overrides: Record<string, unknown> = {}): LikeC4Instance {
  return {
    projects: () => ['default'],
    hasErrors: () => false,
    getErrors: () => [],
    computedModel: () => Promise.resolve(createMockModel()),
    dispose: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as LikeC4Instance;
}

describe('LikeC4Adapter validation baseline', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const configModule = await import('../../../utils/config.js');
    configModule.CONFIG.adapter.likec4.excludePaths = [];
    configModule.CONFIG.adapter.likec4.excludeTags = [];
  });

  it('should capture warnings with workspace-relative file paths', async () => {
    mockFromWorkspace.mockResolvedValue(
      mockInstance({
        getWarnings: () => [
          { message: 'Old warning', line: 3, sourceFsPath: `${WORKSPACE}/views/a.c4` },
        ],
      })
    );
    const adapter = new LikeC4Adapter();

    await adapter.loadFromPath(WORKSPACE);

    expect(adapter.getValidationBaseline()).toEqual([
      { file: 'views/a.c4', message: 'Old warning' },
    ]);
  });

  it('should leave the baseline undefined when the SDK has no getWarnings', async () => {
    mockFromWorkspace.mockResolvedValue(mockInstance());
    const adapter = new LikeC4Adapter();

    await adapter.loadFromPath(WORKSPACE);

    expect(adapter.getValidationBaseline()).toBeUndefined();
  });

  it('should still load the model when getWarnings throws', async () => {
    mockFromWorkspace.mockResolvedValue(
      mockInstance({
        getWarnings: () => {
          throw new Error('warnings unavailable');
        },
      })
    );
    const adapter = new LikeC4Adapter();

    const model = await adapter.loadFromPath(WORKSPACE);

    expect(model.components.length).toBeGreaterThan(0);
    expect(adapter.getValidationBaseline()).toBeUndefined();
  });

  it('should capture an empty baseline when the model has no warnings', async () => {
    mockFromWorkspace.mockResolvedValue(mockInstance({ getWarnings: () => [] }));
    const adapter = new LikeC4Adapter();

    await adapter.loadFromPath(WORKSPACE);

    expect(adapter.getValidationBaseline()).toEqual([]);
  });
});
