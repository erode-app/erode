import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { LikeC4Adapter } from '../adapter.js';
import { validateLikeC4Dsl } from '../dsl-validator.js';
import { formatLikeC4Dsl } from '../dsl-formatter.js';
import { LikeC4Patcher } from '../patcher.js';
import type { AIProvider } from '../../../providers/ai-provider.js';
import { CONFIG } from '../../../utils/config.js';
import { ConfigurationError } from '../../../errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.join(__dirname, 'fixtures', 'multi-project');
const shopModel = path.join(workspace, 'storefront-model', 'model.c4');

describe('LikeC4Adapter with a multi-project workspace', () => {
  beforeEach(() => {
    CONFIG.adapter.likec4.excludePaths = [];
    CONFIG.adapter.likec4.excludeTags = [];
    CONFIG.adapter.likec4.project = undefined;
  });

  afterEach(() => {
    CONFIG.adapter.likec4.project = undefined;
  });

  it('should name the known projects and the config key when no project is set', async () => {
    const error: unknown = await new LikeC4Adapter()
      .loadFromPath(workspace)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigurationError);
    const message = (error as Error).message;
    expect(message).toContain('billing, shop');
    expect(message).toContain('adapter.likec4.project');
    expect(message).toContain('ERODE_LIKEC4_PROJECT');
  });

  it('should reject a project that is not in the workspace', async () => {
    CONFIG.adapter.likec4.project = 'warehouse';
    const error: unknown = await new LikeC4Adapter()
      .loadFromPath(workspace)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigurationError);
    expect((error as Error).message).toContain('"warehouse" not found');
    expect((error as Error).message).toContain('billing, shop');
  });

  it('should load only the configured project in loadFromPath', async () => {
    CONFIG.adapter.likec4.project = 'shop';
    const model = await new LikeC4Adapter().loadFromPath(workspace);
    const ids = model.components.map((c) => c.id).sort();
    expect(ids).toEqual(['cart', 'storefront']);
    expect(model.relationships).toEqual([
      expect.objectContaining({ source: 'storefront', target: 'cart' }),
    ]);
  });

  it('should ignore errors in projects other than the configured one', async () => {
    const copy = mkdtempSync(path.join(tmpdir(), 'erode-multi-project-'));
    try {
      cpSync(workspace, copy, { recursive: true });
      const billingModel = path.join(copy, 'billing', 'model.c4');
      writeFileSync(
        billingModel,
        readFileSync(billingModel, 'utf-8').replace('-> ledger', '-> missing_service')
      );

      CONFIG.adapter.likec4.project = 'shop';
      const model = await new LikeC4Adapter().loadFromPath(copy);
      expect(model.components.map((c) => c.id).sort()).toEqual(['cart', 'storefront']);

      CONFIG.adapter.likec4.project = 'billing';
      await expect(new LikeC4Adapter().loadFromPath(copy)).rejects.toThrow('missing_service');
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  it('should patch the selected project model file', async () => {
    CONFIG.adapter.likec4.project = 'shop';
    CONFIG.adapter.likec4.formatAfterPatch = false;
    const adapter = new LikeC4Adapter();
    const model = await adapter.loadFromPath(workspace);
    const provider: AIProvider = { extractDependencies: vi.fn(), analyzeDrift: vi.fn() };

    const result = await new LikeC4Patcher().patch({
      modelPath: workspace,
      relationships: [{ source: 'cart', target: 'storefront', description: 'sends updates' }],
      existingRelationships: adapter.getAllRelationships(),
      componentIndex: model.componentIndex,
      provider,
      elementSourceFiles: adapter.getElementSourceFiles(),
    });

    expect(result?.absolutePath).toBe(shopModel);
    expect(result?.validationSkipped).toBeUndefined();
    expect(result?.content).toContain("cart -> storefront 'sends updates'");
  });

  it('should validate a patch against errors in its own project only', async () => {
    const copy = mkdtempSync(path.join(tmpdir(), 'erode-multi-project-'));
    try {
      cpSync(workspace, copy, { recursive: true });
      const billingModel = path.join(copy, 'billing', 'model.c4');
      writeFileSync(
        billingModel,
        readFileSync(billingModel, 'utf-8').replace('-> ledger', '-> missing_service')
      );
      const copyShop = path.join(copy, 'storefront-model', 'model.c4');
      const patched = readFileSync(copyShop, 'utf-8').replace(
        'link https://github.com/example/cart',
        "link https://github.com/example/cart\n    -> storefront 'sends updates'"
      );

      expect(await validateLikeC4Dsl(copy, copyShop, patched)).toEqual({ valid: true });
      const brokenBilling = await validateLikeC4Dsl(
        copy,
        billingModel,
        readFileSync(billingModel, 'utf-8')
      );
      expect(brokenBilling.valid).toBe(false);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  it('should load only the configured project in loadAndListComponents', async () => {
    CONFIG.adapter.likec4.project = 'billing';
    const components = await new LikeC4Adapter().loadAndListComponents(workspace);
    expect(components.map((c) => c.id).sort()).toEqual(['invoicing', 'ledger']);
  });

  it('should validate patched DSL without a project setting', async () => {
    const original = readFileSync(shopModel, 'utf-8');
    const valid = original.replace(
      'link https://github.com/example/cart',
      "link https://github.com/example/cart\n    -> storefront 'sends updates'"
    );
    expect(await validateLikeC4Dsl(workspace, shopModel, valid)).toEqual({ valid: true });

    const invalid = original.replace("-> cart 'adds items'", "-> missing_service 'broken'");
    const result = await validateLikeC4Dsl(workspace, shopModel, invalid);
    expect(result.valid).toBe(false);
    expect(result.skipped).toBeUndefined();
  });

  it('should format patched DSL without a project setting', async () => {
    const original = readFileSync(shopModel, 'utf-8');
    const result = await formatLikeC4Dsl(workspace, shopModel, original);
    expect(result.formatted).toBe(true);
    expect(result.content).toContain('storefront');
  });
});
