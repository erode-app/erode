import { describe, beforeAll, it, expect } from 'vitest';
import { LikeC4Adapter } from '../adapter.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAdapterContractTests } from '../../__tests__/adapter-contract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('LikeC4Adapter Integration', () => {
  const fixtureWorkspace = path.join(__dirname, 'fixtures', 'sample-workspace');
  let adapter: LikeC4Adapter;

  beforeAll(async () => {
    const configModule = await import('../../../utils/config.js');
    configModule.CONFIG.adapter.likec4.excludePaths = [];
    configModule.CONFIG.adapter.likec4.excludeTags = [];

    adapter = new LikeC4Adapter();
    await adapter.loadFromPath(fixtureWorkspace);
  });

  runAdapterContractTests(() => adapter);

  it('should read element descriptions from the computed model', () => {
    expect(adapter.findComponentById('frontend')?.description).toBe(
      'Customer-facing web application'
    );
    expect(adapter.findComponentById('database')?.description).toBe('Primary data store');
    expect(adapter.getAllComponents().every((c) => typeof c.description === 'string')).toBe(true);
  });

  it('should read element technology from the computed model', () => {
    expect(adapter.findComponentById('api_gateway')?.technology).toBe('Node.js');
  });

  describe('Relationship details', () => {
    it('should include technology, description and tags on relationships', () => {
      const rel = adapter
        .getComponentRelationships('api_gateway')
        .find((r) => r.target.id === 'product_service');
      expect(rel).toMatchObject({
        title: 'fetches catalog',
        technology: 'REST/JSON',
        description: 'Reads product listings for the storefront',
        tags: ['backend'],
      });
    });

    it('should expose relationship details in getAllRelationships', () => {
      const rel = adapter
        .getAllRelationships()
        .find((r) => r.source === 'api_gateway' && r.target === 'product_service');
      expect(rel?.technology).toBe('REST/JSON');
      expect(rel?.description).toBe('Reads product listings for the storefront');
      expect(rel?.tags).toEqual(['backend']);
    });

    it('should omit details on relationships that declare none', () => {
      const rel = adapter
        .getComponentRelationships('user_service')
        .find((r) => r.target.id === 'database');
      expect(rel).toBeDefined();
      expect(rel?.technology).toBeUndefined();
      expect(rel?.description).toBeUndefined();
      expect(rel?.tags).toBeUndefined();
    });
  });
});
