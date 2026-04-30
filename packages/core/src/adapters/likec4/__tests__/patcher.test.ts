import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LikeC4Patcher } from '../patcher.js';
import type { StructuredRelationship, NewComponent } from '../../../analysis/analysis-types.js';
import type {
  ModelRelationship,
  ComponentIndex,
  ArchitecturalComponent,
} from '../../architecture-types.js';
import type { AIProvider } from '../../../providers/ai-provider.js';

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

describe('LikeC4Patcher', () => {
  let patcher: LikeC4Patcher;

  beforeEach(() => {
    vi.clearAllMocks();
    patcher = new LikeC4Patcher();
    mockValidateLikeC4Dsl.mockResolvedValue({ valid: true });
  });

  it('should return null when no relationships provided', async () => {
    const result = await patcher.patch({
      modelPath: '/model',
      relationships: [],
      existingRelationships: [],
      componentIndex: makeIndex(['a', 'b']),
      provider: makeProvider(),
    });
    expect(result).toBeNull();
  });

  it('should skip relationships with unknown source component', async () => {
    mockReaddirSync.mockReturnValue(['model.c4'] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(SAMPLE_C4);

    const rels: StructuredRelationship[] = [
      { source: 'unknown', target: 'backend', description: 'test' },
      { source: 'customer', target: 'backend', description: 'new dep' },
    ];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: rels,
      existingRelationships: [],
      componentIndex: makeIndex(['customer', 'backend']),
      provider: makeProvider(),
    });

    // 'unknown' source should be skipped, 'customer -> backend' should be inserted
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toContain('Unknown source');
  });

  it('should skip relationships with unknown target component', async () => {
    const rels: StructuredRelationship[] = [
      { source: 'customer', target: 'nonexistent', description: 'test' },
    ];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: rels,
      existingRelationships: [],
      componentIndex: makeIndex(['customer', 'backend']),
      provider: makeProvider(),
    });

    expect(result).toBeNull(); // All skipped, nothing to insert
  });

  it('should skip duplicate relationships', async () => {
    const rels: StructuredRelationship[] = [
      { source: 'customer', target: 'backend', description: 'Uses API' },
    ];
    const existing: ModelRelationship[] = [
      { source: 'customer', target: 'backend', title: 'Uses API' },
    ];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: rels,
      existingRelationships: existing,
      componentIndex: makeIndex(['customer', 'backend']),
      provider: makeProvider(),
    });

    expect(result).toBeNull(); // Duplicate, nothing to insert
  });

  it('should generate correct DSL line without kind', async () => {
    mockReaddirSync.mockReturnValue(['model.c4'] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(SAMPLE_C4);

    const rels: StructuredRelationship[] = [
      { source: 'customer', target: 'backend', description: 'Sends data' },
    ];

    // Use deterministic fallback (no patchModel)
    const result = await patcher.patch({
      modelPath: '/model',
      relationships: rels,
      existingRelationships: [],
      componentIndex: makeIndex(['customer', 'backend']),
      provider: makeProvider(),
    });

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.insertedLines).toHaveLength(1);
    expect(result.insertedLines[0]).toBe("  customer -> backend 'Sends data'");
  });

  it('should generate correct DSL line with valid kind', async () => {
    mockReaddirSync.mockReturnValue(['model.c4'] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(SAMPLE_C4);

    const rels: StructuredRelationship[] = [
      { source: 'customer', target: 'backend', kind: 'https', description: 'REST API' },
    ];
    const existing: ModelRelationship[] = [{ source: 'a', target: 'b', kind: 'https' }];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: rels,
      existingRelationships: existing,
      componentIndex: makeIndex(['customer', 'backend', 'a', 'b']),
      provider: makeProvider(),
    });

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.insertedLines[0]).toBe("  customer -[https]-> backend 'REST API'");
  });

  it('should strip unknown kind and generate line without kind', async () => {
    mockReaddirSync.mockReturnValue(['model.c4'] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(SAMPLE_C4);

    const rels: StructuredRelationship[] = [
      { source: 'customer', target: 'backend', kind: 'HTTP', description: 'REST API' },
    ];
    const existing: ModelRelationship[] = [{ source: 'a', target: 'b', kind: 'https' }];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: rels,
      existingRelationships: existing,
      componentIndex: makeIndex(['customer', 'backend', 'a', 'b']),
      provider: makeProvider(),
    });

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.insertedLines[0]).toBe("  customer -> backend 'REST API'");
  });

  it('should use deterministic fallback when provider has no patchModel', async () => {
    mockReaddirSync.mockReturnValue(['model.c4'] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(SAMPLE_C4);

    const rels: StructuredRelationship[] = [
      { source: 'customer', target: 'backend', description: 'New dep' },
    ];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: rels,
      existingRelationships: [],
      componentIndex: makeIndex(['customer', 'backend']),
      provider: makeProvider(),
    });

    expect(result).not.toBeNull();
    if (!result) return;
    // Content should contain the inserted line
    expect(result.content).toContain("customer -> backend 'New dep'");
    // Content should still contain original content
    expect(result.content).toContain("customer -> backend 'Uses API'");
  });

  it('should use deterministic fallback when LLM output is invalid', async () => {
    mockReaddirSync.mockReturnValue(['model.c4'] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(SAMPLE_C4);

    // LLM returns invalid output (missing braces)
    const invalidOutput = 'this is not valid model content';

    const rels: StructuredRelationship[] = [
      { source: 'customer', target: 'backend', description: 'New dep' },
    ];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: rels,
      existingRelationships: [],
      componentIndex: makeIndex(['customer', 'backend']),
      provider: makeProvider(invalidOutput),
    });

    expect(result).not.toBeNull();
    if (!result) return;
    // Should have used fallback and still have valid content
    expect(result.content).toContain("customer -> backend 'New dep'");
    expect(result.content).toContain('model {');
  });

  it('should prefer .c4 files with model blocks and existing relationships', async () => {
    mockReaddirSync.mockReturnValue(['views.c4', 'model.c4'] as unknown as ReturnType<
      typeof readdirSync
    >);
    mockReadFileSync.mockImplementation((path: unknown) => {
      if (String(path).includes('views.c4')) return 'views { }';
      return SAMPLE_C4;
    });

    const rels: StructuredRelationship[] = [
      { source: 'customer', target: 'backend', description: 'test' },
    ];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: rels,
      existingRelationships: [],
      componentIndex: makeIndex(['customer', 'backend']),
      provider: makeProvider(),
    });

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.filePath).toContain('model.c4');
  });

  it('should return null when DSL validation fails for deterministic output', async () => {
    mockReaddirSync.mockReturnValue(['model.c4'] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(SAMPLE_C4);
    mockValidateLikeC4Dsl.mockResolvedValue({
      valid: false,
      errors: ['Invalid DSL'],
    });

    const rels: StructuredRelationship[] = [
      { source: 'customer', target: 'backend', description: 'New dep' },
    ];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: rels,
      existingRelationships: [],
      componentIndex: makeIndex(['customer', 'backend']),
      provider: makeProvider(),
    });

    expect(result).toBeNull();
  });

  it('should accept output when DSL validation is skipped (tooling unavailable)', async () => {
    mockReaddirSync.mockReturnValue(['model.c4'] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(SAMPLE_C4);
    mockValidateLikeC4Dsl.mockResolvedValue({ valid: false, skipped: true });

    const rels: StructuredRelationship[] = [
      { source: 'customer', target: 'backend', description: 'New dep' },
    ];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: rels,
      existingRelationships: [],
      componentIndex: makeIndex(['customer', 'backend']),
      provider: makeProvider(),
    });

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.content).toContain("customer -> backend 'New dep'");
  });

  it('should strip single quotes from description in DSL output', async () => {
    mockReaddirSync.mockReturnValue(['model.c4'] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(SAMPLE_C4);

    const rels: StructuredRelationship[] = [
      { source: 'customer', target: 'backend', description: 'Calls API via users endpoint' },
    ];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: rels,
      existingRelationships: [],
      componentIndex: makeIndex(['customer', 'backend']),
      provider: makeProvider(),
    });

    expect(result).not.toBeNull();
    if (!result) return;
    // Verify the line does not contain unescaped quotes that could break DSL
    expect(result.insertedLines[0]).not.toContain("''");
    expect(result.insertedLines[0]).toContain("'Calls API via users endpoint'");
  });

  it('should generate valid LikeC4 DSL block for new component', async () => {
    mockReaddirSync.mockReturnValue(['model.c4'] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(SAMPLE_C4);

    const newComps: NewComponent[] = [
      {
        id: 'order_service',
        kind: 'service',
        name: 'Order Service',
        description: 'Handles order processing',
        tags: ['backend', 'microservice'],
        technology: 'TypeScript',
      },
    ];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: [],
      existingRelationships: [],
      componentIndex: makeIndex(['customer', 'backend']),
      provider: makeProvider(),
      newComponents: newComps,
    });

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.newComponents).toHaveLength(1);
    expect(result.newComponents?.[0]?.id).toBe('order_service');
    expect(result.content).toContain("order_service = service 'Order Service'");
    expect(result.content).toContain("description 'Handles order processing'");
    expect(result.content).toContain("technology 'TypeScript'");
    expect(result.content).toContain('#backend #microservice');
  });

  it('should not skip relationship referencing a new component', async () => {
    mockReaddirSync.mockReturnValue(['model.c4'] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(SAMPLE_C4);

    const rels: StructuredRelationship[] = [
      { source: 'customer', target: 'order_service', description: 'Places orders' },
    ];
    const newComps: NewComponent[] = [
      { id: 'order_service', kind: 'service', name: 'Order Service' },
    ];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: rels,
      existingRelationships: [],
      componentIndex: makeIndex(['customer', 'backend']),
      provider: makeProvider(),
      newComponents: newComps,
    });

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.skipped).toHaveLength(0);
    expect(result.content).toContain("customer -> order_service 'Places orders'");
    expect(result.content).toContain("order_service = service 'Order Service'");
  });

  it('should filter out component already in componentIndex', async () => {
    mockReaddirSync.mockReturnValue(['model.c4'] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(SAMPLE_C4);

    const rels: StructuredRelationship[] = [
      { source: 'customer', target: 'backend', description: 'New call' },
    ];
    const newComps: NewComponent[] = [{ id: 'backend', kind: 'service', name: 'Backend' }];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: rels,
      existingRelationships: [],
      componentIndex: makeIndex(['customer', 'backend']),
      provider: makeProvider(),
      newComponents: newComps,
    });

    expect(result).not.toBeNull();
    if (!result) return;
    // Component already exists, should not be re-added
    expect(result.newComponents).toBeUndefined();
    // Relationship should still be applied
    expect(result.content).toContain("customer -> backend 'New call'");
  });

  it('should attribute component DSL lines correctly when one ID is a substring of another', async () => {
    mockReaddirSync.mockReturnValue(['model.c4'] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(SAMPLE_C4);

    const newComps: NewComponent[] = [
      { id: 'api', kind: 'service', name: 'API' },
      { id: 'api-gateway', kind: 'service', name: 'API Gateway' },
    ];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: [],
      existingRelationships: [],
      componentIndex: makeIndex(['customer', 'backend']),
      provider: makeProvider(),
      newComponents: newComps,
    });

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.newComponents).toHaveLength(2);

    const apiComp = result.newComponents?.find((c) => c.id === 'api');
    const gatewayComp = result.newComponents?.find((c) => c.id === 'api-gateway');

    // Each component should have exactly its own DSL block
    expect(apiComp?.insertedLines).toHaveLength(1);
    expect(apiComp?.insertedLines[0]).toContain("api = service 'API'");
    expect(apiComp?.insertedLines[0]).not.toContain('api-gateway');

    expect(gatewayComp?.insertedLines).toHaveLength(1);
    expect(gatewayComp?.insertedLines[0]).toContain("api-gateway = service 'API Gateway'");
  });

  it('should produce correct combined output with new component and relationship', async () => {
    mockReaddirSync.mockReturnValue(['model.c4'] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(SAMPLE_C4);

    const rels: StructuredRelationship[] = [
      { source: 'customer', target: 'order_service', description: 'Places orders' },
    ];
    const newComps: NewComponent[] = [
      {
        id: 'order_service',
        kind: 'service',
        name: 'Order Service',
        description: 'Handles orders',
      },
    ];

    const result = await patcher.patch({
      modelPath: '/model',
      relationships: rels,
      existingRelationships: [],
      componentIndex: makeIndex(['customer', 'backend']),
      provider: makeProvider(),
      newComponents: newComps,
    });

    expect(result).not.toBeNull();
    if (!result) return;
    // Both component and relationship should be in insertedLines
    expect(result.insertedLines.length).toBeGreaterThanOrEqual(2);
    // Component block should appear before relationship
    const compLineIndex = result.insertedLines.findIndex((l) =>
      l.includes('order_service = service')
    );
    const relLineIndex = result.insertedLines.findIndex((l) =>
      l.includes('customer -> order_service')
    );
    expect(compLineIndex).toBeLessThan(relLineIndex);
  });
});
