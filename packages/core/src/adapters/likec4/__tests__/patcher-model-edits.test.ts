import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LikeC4Patcher } from '../patcher.js';
import { CONFIG } from '../../../utils/config.js';
import type { ComponentIndex, ArchitecturalComponent } from '../../architecture-types.js';
import type { AIProvider } from '../../../providers/ai-provider.js';
import * as modelEdits from '../model-edits.js';

const fixture = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'sample-workspace');
const modelFile = join(fixture, 'model.c4');

function makeIndex(ids: string[]): ComponentIndex {
  const byId = new Map<string, ArchitecturalComponent>(
    ids.map((id) => [id, { id, name: id, tags: [], type: 'service' }])
  );
  return { byId, byRepository: new Map() };
}

const provider: AIProvider = {
  extractDependencies: vi.fn(),
  analyzeDrift: vi.fn(),
};

const index = makeIndex(['frontend', 'api_gateway', 'user_service', 'product_service', 'database']);

describe('LikeC4Patcher with patchStrategy model-edits', () => {
  const saved = { ...CONFIG.adapter.likec4 };

  beforeEach(() => {
    CONFIG.adapter.likec4.patchStrategy = 'model-edits';
    CONFIG.adapter.likec4.formatAfterPatch = false;
  });

  afterEach(() => {
    Object.assign(CONFIG.adapter.likec4, saved);
    vi.restoreAllMocks();
  });

  it('uses the LikeC4-placed content from the real SDK', async () => {
    const before = readFileSync(modelFile, 'utf-8');
    const result = await new LikeC4Patcher().patch({
      modelPath: fixture,
      relationships: [
        { source: 'frontend', target: 'database', description: 'reads cache' },
        { source: 'api_gateway.cache', target: 'database', description: 'warms' },
      ],
      newComponents: [{ id: 'api_gateway.cache', kind: 'service', name: 'Cache' }],
      existingRelationships: [],
      componentIndex: index,
      provider,
    });

    expect(result).not.toBeNull();
    expect(result?.absolutePath).toBe(modelFile);
    const content = result?.content ?? '';
    expect(content).not.toContain('diff ');
    expect(content).toContain("frontend -> database 'reads cache'");
    expect(content).toContain("api_gateway.cache -> database 'warms'");
    // Nested under the existing parent rather than appended as a dotted definition
    expect(content).toMatch(/api_gateway = service[\s\S]*cache = service 'Cache'/);
    expect(content).not.toContain('api_gateway.cache = service');
    expect(readFileSync(modelFile, 'utf-8')).toBe(before);
  }, 60_000);

  it('falls back to text patching when model edits fail', async () => {
    const spy = vi
      .spyOn(modelEdits, 'previewModelEdits')
      .mockResolvedValue({ ok: false, reason: 'boom' });
    const result = await new LikeC4Patcher().patch({
      modelPath: fixture,
      relationships: [{ source: 'frontend', target: 'database', description: 'reads' }],
      existingRelationships: [],
      componentIndex: index,
      provider,
    });
    expect(spy).toHaveBeenCalledOnce();
    expect(result?.content).toContain("frontend -> database 'reads'");
  }, 60_000);

  it('falls back to text patching when the model-edits result fails DSL validation', async () => {
    vi.spyOn(modelEdits, 'previewModelEdits').mockResolvedValue({
      ok: true,
      patch: { targetFile: modelFile, content: 'model { this is not valid' },
    });
    const result = await new LikeC4Patcher().patch({
      modelPath: fixture,
      relationships: [{ source: 'frontend', target: 'database', description: 'reads' }],
      existingRelationships: [],
      componentIndex: index,
      provider,
    });
    expect(result?.content).not.toContain('this is not valid');
    expect(result?.content).toContain("frontend -> database 'reads'");
  }, 60_000);

  it('falls back to text patching when model edits throw', async () => {
    vi.spyOn(modelEdits, 'previewModelEdits').mockRejectedValue(new Error('boom'));
    const result = await new LikeC4Patcher().patch({
      modelPath: fixture,
      relationships: [{ source: 'frontend', target: 'database', description: 'reads' }],
      existingRelationships: [],
      componentIndex: index,
      provider,
    });
    expect(result?.content).toContain("frontend -> database 'reads'");
  }, 60_000);

  it('does not call model edits with the text strategy', async () => {
    CONFIG.adapter.likec4.patchStrategy = 'text';
    const spy = vi.spyOn(modelEdits, 'previewModelEdits');
    const result = await new LikeC4Patcher().patch({
      modelPath: fixture,
      relationships: [{ source: 'frontend', target: 'database', description: 'reads' }],
      existingRelationships: [],
      componentIndex: index,
      provider,
    });
    expect(spy).not.toHaveBeenCalled();
    expect(result?.content).toContain("frontend -> database 'reads'");
  }, 60_000);
});
