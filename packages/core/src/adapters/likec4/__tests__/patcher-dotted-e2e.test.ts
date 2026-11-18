import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { LikeC4Adapter } from '../adapter.js';
import { LikeC4Patcher } from '../patcher.js';
import * as modelEdits from '../model-edits.js';
import { withTempWorkspaceCopy } from '../../dsl-validation.js';
import { CONFIG, ConfigSchema } from '../../../utils/config.js';
import type { ModelPatchOptions, PatchResult } from '../../model-patcher.js';
import type { ArchitectureModel } from '../../architecture-types.js';
import type { AIProvider } from '../../../providers/ai-provider.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.join(__dirname, 'fixtures', 'multi-file-workspace');

// No patchModel, so text patching goes straight to the deterministic insert
const provider: AIProvider = {
  extractDependencies: vi.fn(),
  analyzeDrift: vi.fn(),
};

async function reload(result: PatchResult | null): Promise<LikeC4Adapter> {
  if (!result) throw new Error('expected a patch');
  return withTempWorkspaceCopy(
    workspace,
    result.absolutePath,
    result.content,
    'erode-test',
    async (_tmpTarget, tmpDir) => {
      const adapter = new LikeC4Adapter();
      await adapter.loadFromPath(tmpDir);
      return adapter;
    }
  );
}

describe('LikeC4Patcher text strategy with dotted new components (real validator)', () => {
  const saved = { ...CONFIG.adapter.likec4 };
  let adapter: LikeC4Adapter;
  let model: ArchitectureModel;

  beforeAll(async () => {
    Object.assign(CONFIG.adapter.likec4, {
      excludePaths: [],
      excludeTags: [],
      formatAfterPatch: false,
      patchStrategy: 'text',
    });
    adapter = new LikeC4Adapter();
    model = await adapter.loadFromPath(workspace);
  });

  afterAll(() => {
    Object.assign(CONFIG.adapter.likec4, saved);
  });

  function options(overrides: Partial<ModelPatchOptions>): ModelPatchOptions {
    return {
      modelPath: workspace,
      relationships: [],
      existingRelationships: adapter.getAllRelationships(),
      componentIndex: model.componentIndex,
      provider,
      elementSourceFiles: adapter.getElementSourceFiles(),
      ...overrides,
    };
  }

  it('nests a new child under its parent and keeps the relationship', async () => {
    const result = await new LikeC4Patcher().patch(
      options({
        relationships: [{ source: 'core.payments', target: 'core.billing', description: 'pays' }],
        newComponents: [{ id: 'core.payments', kind: 'service', name: 'Payments' }],
      })
    );

    expect(result?.absolutePath).toBe(path.join(workspace, 'systems', 'core.c4'));
    expect(result?.validationSkipped).toBeUndefined();
    expect(result?.content).toContain('extend core {');
    expect(result?.content).not.toContain('core.payments = service');
    expect(result?.relationshipLines).toEqual(["  core.payments -> core.billing 'pays'"]);

    const patched = await reload(result);
    expect(patched.findComponentById('core.payments')?.name).toBe('Payments');
    expect(patched.getAllRelationships()).toContainEqual(
      expect.objectContaining({ source: 'core.payments', target: 'core.billing' })
    );
  }, 60_000);

  it('handles a two-level parent', async () => {
    const result = await new LikeC4Patcher().patch(
      options({
        relationships: [
          { source: 'edge.gateway.cache', target: 'core.orders', description: 'warms' },
        ],
        newComponents: [{ id: 'edge.gateway.cache', kind: 'service', name: 'Cache' }],
      })
    );

    expect(result?.validationSkipped).toBeUndefined();

    const patched = await reload(result);
    expect(patched.findComponentById('edge.gateway.cache')?.name).toBe('Cache');
    expect(patched.getAllRelationships()).toContainEqual(
      expect.objectContaining({ source: 'edge.gateway.cache', target: 'core.orders' })
    );
  }, 60_000);
});

describe('LikeC4 patch strategy default', () => {
  const saved = { ...CONFIG.adapter.likec4 };

  afterEach(() => {
    Object.assign(CONFIG.adapter.likec4, saved);
    vi.restoreAllMocks();
  });

  it('defaults to model-edits', () => {
    expect(ConfigSchema.shape.adapter.shape.likec4.shape.patchStrategy.parse(undefined)).toBe(
      'model-edits'
    );
  });

  it('tries model edits first and falls back to text when they return nothing', async () => {
    CONFIG.adapter.likec4.patchStrategy =
      ConfigSchema.shape.adapter.shape.likec4.shape.patchStrategy.parse(undefined);
    CONFIG.adapter.likec4.formatAfterPatch = false;
    const spy = vi
      .spyOn(modelEdits, 'previewModelEdits')
      .mockResolvedValue({ ok: false, reason: 'unavailable' });
    const adapter = new LikeC4Adapter();
    const model = await adapter.loadFromPath(workspace);

    const result = await new LikeC4Patcher().patch({
      modelPath: workspace,
      relationships: [{ source: 'edge.gateway', target: 'core.billing', description: 'bills' }],
      existingRelationships: adapter.getAllRelationships(),
      componentIndex: model.componentIndex,
      provider,
      elementSourceFiles: adapter.getElementSourceFiles(),
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(result?.content).toContain("edge.gateway -> core.billing 'bills'");
  }, 60_000);
});
