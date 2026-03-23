import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LikeC4Patcher } from '../patcher.js';
import type { StructuredRelationship } from '../../../analysis/analysis-types.js';
import type { ComponentIndex, ArchitecturalComponent } from '../../architecture-types.js';
import type { AIProvider } from '../../../providers/ai-provider.js';

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
import { formatLikeC4Dsl } from '../dsl-formatter.js';

const mockReadFileSync = vi.mocked(readFileSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockValidateLikeC4Dsl = vi.mocked(validateLikeC4Dsl);
const mockFormatLikeC4Dsl = vi.mocked(formatLikeC4Dsl);

function makeComponent(id: string): ArchitecturalComponent {
  return { id, name: id, tags: [], type: 'service' };
}

function makeIndex(ids: string[]): ComponentIndex {
  const byId = new Map(ids.map((id) => [id, makeComponent(id)]));
  return { byId, byRepository: new Map() };
}

function makeProvider(): AIProvider {
  return {
    extractDependencies: vi.fn(),
    analyzeDrift: vi.fn(),
  } as unknown as AIProvider;
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

describe('LikeC4Patcher post-format', () => {
  let patcher: LikeC4Patcher;

  beforeEach(() => {
    vi.clearAllMocks();
    patcher = new LikeC4Patcher();
    mockValidateLikeC4Dsl.mockResolvedValue({ valid: true });
  });

  it('should apply post-patch formatting when formatter returns content', async () => {
    mockReaddirSync.mockReturnValue(['model.c4'] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(SAMPLE_C4);

    const formattedContent = SAMPLE_C4 + "\n  customer -> backend 'Formatted'\n";
    mockFormatLikeC4Dsl.mockResolvedValue({
      formatted: true,
      content: formattedContent,
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

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.content).toBe(formattedContent);
    expect(result.formatted).toBe(true);
    expect(mockFormatLikeC4Dsl).toHaveBeenCalled();
  });

  it('should set formatted to undefined when formatting is skipped', async () => {
    mockReaddirSync.mockReturnValue(['model.c4'] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(SAMPLE_C4);
    mockFormatLikeC4Dsl.mockResolvedValue({ formatted: false, skipped: true });

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
    expect(result.formatted).toBeUndefined();
  });
});
