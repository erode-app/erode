import { copyFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StructurizrAdapter } from '../adapter.js';
import { StructurizrPatcher } from '../patcher.js';
import type { ModelPatchOptions } from '../../model-patcher.js';
import type { AIProvider } from '../../../providers/ai-provider.js';

vi.mock('child_process', async (importOriginal) => ({
  ...(await importOriginal()),
  execFileSync: vi.fn(() => '/repo'),
}));

vi.mock('../dsl-validator.js', () => ({
  validateStructurizrDsl: vi.fn().mockResolvedValue({ valid: true }),
}));

const fixture = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'dsl-export',
  'workspace'
);
// A relationship line the Structurizr DSL can parse: identifier references only
const RELATIONSHIP_LINE =
  /^\s*[A-Za-z_][\w-]*(\.[A-Za-z_][\w-]*)* -> [A-Za-z_][\w-]*(\.[A-Za-z_][\w-]*)* "[^"]*"( "[^"]*")?$/;

const provider: AIProvider = { extractDependencies: vi.fn(), analyzeDrift: vi.fn() };

describe('StructurizrPatcher - DSL references', () => {
  let adapter: StructurizrAdapter;
  let options: Omit<ModelPatchOptions, 'relationships'>;
  let modelDir: string;

  beforeEach(async () => {
    modelDir = mkdtempSync(path.join(tmpdir(), 'erode-structurizr-refs-'));
    copyFileSync(`${fixture}.dsl`, path.join(modelDir, 'workspace.dsl'));
    adapter = new StructurizrAdapter();
    const model = await adapter.loadFromPath(`${fixture}.json`);
    options = {
      modelPath: modelDir,
      existingRelationships: model.relationships,
      componentIndex: model.componentIndex,
      provider,
      dslReferences: adapter.getDslReferences(),
    };
  });

  afterEach(() => {
    rmSync(modelDir, { recursive: true, force: true });
  });

  it('writes relationships with DSL identifiers', async () => {
    const result = await new StructurizrPatcher().patch({
      ...options,
      relationships: [
        { source: 'storefront', target: 'payments', kind: 'HTTPS', description: 'Gets "status"' },
      ],
    });

    expect(result?.relationshipLines).toEqual([
      `        storefront -> payments "Gets 'status'" "HTTPS"`,
    ]);
    for (const line of result?.relationshipLines ?? []) {
      expect(line).toMatch(RELATIONSHIP_LINE);
    }
    expect(result?.content).toContain(`storefront -> payments "Gets 'status'" "HTTPS"`);
  });

  it('skips a relationship whose element has no DSL identifier', async () => {
    const result = await new StructurizrPatcher().patch({
      ...options,
      relationships: [
        { source: 'orders.payment_adapter', target: 'payments', description: 'Charges' },
        { source: 'orderApi', target: 'storefront', description: 'Notifies' },
      ],
    });

    expect(result?.relationshipLines).toEqual(['        orderApi -> storefront "Notifies"']);
    expect(result?.skipped).toHaveLength(1);
    expect(result?.skipped[0]).toMatchObject({
      source: 'orders.payment_adapter',
      target: 'payments',
    });
    expect(result?.skipped[0]?.reason).toContain('No DSL identifier for orders.payment_adapter');
  });

  it('returns no patch when every relationship lacks a DSL identifier', async () => {
    const result = await new StructurizrPatcher().patch({
      ...options,
      relationships: [{ source: 'orders.payment_adapter', target: 'shop', description: 'x' }],
    });

    expect(result).toBeNull();
  });

  it('writes the reference, not the erode.id, when they differ', async () => {
    const component = { name: 'Billing', tags: [], type: 'softwareSystem' };
    const result = await new StructurizrPatcher().patch({
      ...options,
      relationships: [{ source: 'billing.v2', target: 'orders', description: 'Reads' }],
      componentIndex: {
        byRepository: new Map(),
        byId: new Map([
          ['billing.v2', { id: 'billing.v2', ...component }],
          ['orders', { id: 'orders', ...component }],
        ]),
      },
      existingRelationships: [],
      dslReferences: new Map([
        ['billing.v2', 'billing'],
        ['orders', 'shop.orders'],
      ]),
    });

    expect(result?.relationshipLines).toEqual(['        billing -> shop.orders "Reads"']);
  });

  it('skips new components with non-identifier ids and the relationships to them', async () => {
    const result = await new StructurizrPatcher().patch({
      ...options,
      newComponents: [
        { id: 'shop.billing', kind: 'container', name: 'Billing', description: 'Bills' },
        { id: 'ledger', kind: 'container', name: 'Ledger', description: 'Keeps books' },
      ],
      relationships: [
        { source: 'storefront', target: 'shop.billing', description: 'Calls' },
        { source: 'storefront', target: 'ledger', description: 'Posts' },
        { source: 'storefront', target: 'payments', description: 'Pays' },
      ],
    });

    expect(result?.newComponents?.map((c) => c.id)).toEqual(['ledger']);
    expect(result?.content).not.toContain('shop.billing =');
    expect(result?.relationshipLines).toEqual([
      '        storefront -> ledger "Posts"',
      '        storefront -> payments "Pays"',
    ]);
    const reasons = result?.skipped.map((s) => s.reason).join('\n') ?? '';
    expect(reasons).toContain('"shop.billing" is not a valid DSL identifier');
    expect(
      result?.skipped.some((s) => s.target === 'shop.billing' && s.source === 'storefront')
    ).toBe(true);
  });
});
