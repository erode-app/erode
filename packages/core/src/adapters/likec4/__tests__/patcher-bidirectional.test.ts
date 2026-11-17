import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LikeC4Patcher } from '../patcher.js';
import type { StructuredRelationship } from '../../../analysis/analysis-types.js';
import type {
  ModelRelationship,
  ComponentIndex,
  ArchitecturalComponent,
} from '../../architecture-types.js';
import type { AIProvider } from '../../../providers/ai-provider.js';
import { CONFIG } from '../../../utils/config.js';

// Mock fs and child_process
vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal()),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFileSync: vi.fn(() => '/repo'),
  execFile: vi.fn(),
}));

vi.mock('../dsl-validator.js', () => ({
  validateLikeC4Dsl: vi.fn().mockResolvedValue({ valid: true }),
}));

vi.mock('../dsl-formatter.js', () => ({
  formatLikeC4Dsl: vi.fn().mockResolvedValue({ formatted: false, skipped: true }),
}));

import { readFileSync, readdirSync } from 'fs';
import { validateLikeC4Dsl } from '../dsl-validator.js';

const mockReadFileSync = vi.mocked(readFileSync);
const mockReaddirSync = vi.mocked(readdirSync);

function dirents(names: string[]): ReturnType<typeof readdirSync> {
  return names.map((name) => ({ name, isDirectory: () => false })) as unknown as ReturnType<
    typeof readdirSync
  >;
}
const mockValidateLikeC4Dsl = vi.mocked(validateLikeC4Dsl);

function makeComponent(id: string): ArchitecturalComponent {
  return { id, name: id, tags: [], type: 'service' };
}

function makeIndex(ids: string[]): ComponentIndex {
  const byId = new Map(ids.map((id) => [id, makeComponent(id)]));
  return { byId, byRepository: new Map() };
}

function makeProvider(patchResult?: string): AIProvider {
  return {
    extractDependencies: vi.fn(),
    analyzeDrift: vi.fn(),
    patchModel: patchResult !== undefined ? vi.fn().mockResolvedValue(patchResult) : undefined,
  };
}

const SAMPLE_C4 = `specification {
  element service
}

model {
  customer = service 'Customer'
  backend = service 'Backend'

  customer -> backend 'Uses API'
}
`;

describe('LikeC4Patcher bidirectional relationships', () => {
  let patcher: LikeC4Patcher;

  beforeEach(() => {
    vi.clearAllMocks();
    CONFIG.adapter.likec4.patchStrategy = 'text';
    patcher = new LikeC4Patcher();
    mockValidateLikeC4Dsl.mockResolvedValue({ valid: true });
  });

  it('should skip the reverse of a bidirectional relationship', async () => {
    const rels: StructuredRelationship[] = [
      { source: 'backend', target: 'customer', description: 'Pushes updates' },
    ];
    const existing: ModelRelationship[] = [
      { source: 'customer', target: 'backend', bidirectional: true },
    ];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: rels,
      existingRelationships: existing,
      componentIndex: makeIndex(['customer', 'backend']),
      provider: makeProvider(),
    });

    expect(result).toBeNull();
  });

  it('should keep the reverse of a one-way relationship', async () => {
    mockReaddirSync.mockReturnValue(dirents(['model.c4']));
    mockReadFileSync.mockReturnValue(SAMPLE_C4);

    const rels: StructuredRelationship[] = [
      { source: 'backend', target: 'customer', description: 'Pushes updates' },
    ];
    const existing: ModelRelationship[] = [{ source: 'customer', target: 'backend' }];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: rels,
      existingRelationships: existing,
      componentIndex: makeIndex(['customer', 'backend']),
      provider: makeProvider(),
    });

    expect(result?.insertedLines).toEqual(["  backend -> customer 'Pushes updates'"]);
  });
});
