import { describe, it, expect, beforeAll, vi } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { LikeC4Adapter } from '../adapter.js';
import { LikeC4Patcher } from '../patcher.js';
import type { ArchitectureModel } from '../../architecture-types.js';
import type { AIProvider } from '../../../providers/ai-provider.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.join(__dirname, 'fixtures', 'multi-file-workspace');
const coreFile = path.join(workspace, 'systems', 'core.c4');
const edgeFile = path.join(workspace, 'systems', 'edge.c4');

const provider: AIProvider = {
  extractDependencies: vi.fn(),
  analyzeDrift: vi.fn(),
};

describe('LikeC4 multi-file workspace', () => {
  let adapter: LikeC4Adapter;
  let model: ArchitectureModel;

  beforeAll(async () => {
    const { CONFIG } = await import('../../../utils/config.js');
    CONFIG.adapter.likec4.excludePaths = [];
    CONFIG.adapter.likec4.excludeTags = [];
    CONFIG.adapter.likec4.formatAfterPatch = false;
    CONFIG.adapter.likec4.patchStrategy = 'text';

    adapter = new LikeC4Adapter();
    model = await adapter.loadFromPath(workspace);
  });

  it('maps each element to the file that declares it', () => {
    const files = adapter.getElementSourceFiles();
    expect(files.get('shared')).toBe(path.join(workspace, 'spec.c4'));
    expect(files.get('core.orders')).toBe(coreFile);
    expect(files.get('edge')).toBe(edgeFile);
    expect(files.get('edge.gateway')).toBe(edgeFile);
  });

  it('patches the file declaring the relationship source', async () => {
    const result = await new LikeC4Patcher().patch({
      modelPath: workspace,
      relationships: [{ source: 'edge.gateway', target: 'core.billing', description: 'bills' }],
      existingRelationships: adapter.getAllRelationships(),
      componentIndex: model.componentIndex,
      provider,
      elementSourceFiles: adapter.getElementSourceFiles(),
    });

    expect(result?.absolutePath).toBe(edgeFile);
    expect(result?.validationSkipped).toBeUndefined();
    expect(result?.content).toContain("edge.gateway -> core.billing 'bills'");
  });

  it('inserts into a one-line model block', async () => {
    const result = await new LikeC4Patcher().patch({
      modelPath: workspace,
      relationships: [{ source: 'shared', target: 'core.billing', description: 'hosts' }],
      existingRelationships: adapter.getAllRelationships(),
      componentIndex: model.componentIndex,
      provider,
      elementSourceFiles: adapter.getElementSourceFiles(),
    });

    expect(result?.absolutePath).toBe(path.join(workspace, 'spec.c4'));
    expect(result?.validationSkipped).toBeUndefined();
    expect(result?.content).toMatch(
      /model \{ shared = system 'Shared Platform'\n\n {2}shared -> core\.billing 'hosts'\n\}/
    );
  });

  it('falls back to the recursive heuristic without element locations', async () => {
    const result = await new LikeC4Patcher().patch({
      modelPath: workspace,
      relationships: [{ source: 'edge.gateway', target: 'core.billing', description: 'bills' }],
      existingRelationships: adapter.getAllRelationships(),
      componentIndex: model.componentIndex,
      provider,
    });

    // spec.c4 has a model block but no relationships, so the first nested file with both wins
    expect(result?.absolutePath).toBe(coreFile);
  });
});
