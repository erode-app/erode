import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StructurizrPatcher } from '../structurizr-patcher.js';
import type { StructuredRelationship } from '../../analysis/analysis-types.js';
import type {
  ModelRelationship,
  ComponentIndex,
  ArchitecturalComponent,
} from '../../adapters/architecture-types.js';
import type { AIProvider } from '../../providers/ai-provider.js';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(() => ({ isDirectory: () => true })),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(() => '/repo'),
}));

import { readFileSync, readdirSync } from 'fs';

const mockReadFileSync = vi.mocked(readFileSync);
const mockReaddirSync = vi.mocked(readdirSync);

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
  } as unknown as AIProvider;
}

const SAMPLE_DSL = `workspace {
    model {
        user = person "User"
        system = softwareSystem "System"

        user -> system "Uses"
    }
}
`;

describe('StructurizrPatcher', () => {
  let patcher: StructurizrPatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    patcher = new StructurizrPatcher();
  });

  it('should return null when no relationships provided', async () => {
    const result = await patcher.patch({
      modelPath: '/model',
      relationships: [],
      existingRelationships: [],
      componentIndex: makeIndex(['user', 'system']),
      provider: makeProvider(),
    });
    expect(result).toBeNull();
  });

  it('should skip unknown components', async () => {
    const rels: StructuredRelationship[] = [
      { source: 'nonexistent', target: 'system', description: 'test' },
    ];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: rels,
      existingRelationships: [],
      componentIndex: makeIndex(['user', 'system']),
      provider: makeProvider(),
    });

    expect(result).toBeNull();
  });

  it('should skip duplicate relationships', async () => {
    const rels: StructuredRelationship[] = [
      { source: 'user', target: 'system', description: 'Uses' },
    ];
    const existing: ModelRelationship[] = [{ source: 'user', target: 'system', title: 'Uses' }];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: rels,
      existingRelationships: existing,
      componentIndex: makeIndex(['user', 'system']),
      provider: makeProvider(),
    });

    expect(result).toBeNull();
  });

  it('should generate correct Structurizr DSL line with technology', async () => {
    mockReaddirSync.mockReturnValue(['workspace.dsl'] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(SAMPLE_DSL);

    const rels: StructuredRelationship[] = [
      { source: 'user', target: 'system', kind: 'HTTPS', description: 'Web interface' },
    ];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: rels,
      existingRelationships: [],
      componentIndex: makeIndex(['user', 'system']),
      provider: makeProvider(),
    });

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.insertedLines[0]).toBe('        user -> system "Web interface" "HTTPS"');
  });

  it('should generate Structurizr DSL line without technology', async () => {
    mockReaddirSync.mockReturnValue(['workspace.dsl'] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(SAMPLE_DSL);

    const rels: StructuredRelationship[] = [
      { source: 'user', target: 'system', description: 'Accesses' },
    ];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: rels,
      existingRelationships: [],
      componentIndex: makeIndex(['user', 'system']),
      provider: makeProvider(),
    });

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.insertedLines[0]).toBe('        user -> system "Accesses"');
  });

  it('should use deterministic fallback and insert before model closing brace', async () => {
    mockReaddirSync.mockReturnValue(['workspace.dsl'] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(SAMPLE_DSL);

    const rels: StructuredRelationship[] = [
      { source: 'user', target: 'system', description: 'New dep' },
    ];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: rels,
      existingRelationships: [],
      componentIndex: makeIndex(['user', 'system']),
      provider: makeProvider(),
    });

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.content).toContain('user -> system "New dep"');
    expect(result.content).toContain('user -> system "Uses"');
  });

  it('should prefer workspace.dsl file', async () => {
    mockReaddirSync.mockReturnValue(['other.dsl', 'workspace.dsl'] as unknown as ReturnType<
      typeof readdirSync
    >);
    mockReadFileSync.mockReturnValue(SAMPLE_DSL);

    const rels: StructuredRelationship[] = [
      { source: 'user', target: 'system', description: 'test' },
    ];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: rels,
      existingRelationships: [],
      componentIndex: makeIndex(['user', 'system']),
      provider: makeProvider(),
    });

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.filePath).toContain('workspace.dsl');
  });
});
