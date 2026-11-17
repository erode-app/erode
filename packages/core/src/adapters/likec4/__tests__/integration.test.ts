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

  describe('Bidirectional relationships', () => {
    it('should keep a <-> b as one relationship flagged bidirectional', () => {
      const rels = adapter
        .getAllRelationships()
        .filter((r) => [r.source, r.target].includes('payment_service'));
      expect(rels).toEqual([
        {
          source: 'order_service',
          target: 'payment_service',
          title: 'settles payments',
          kind: undefined,
          bidirectional: true,
        },
      ]);
    });

    it('should allow both directions of a <-> b', () => {
      expect(adapter.isAllowedDependency('order_service', 'payment_service')).toBe(true);
      expect(adapter.isAllowedDependency('payment_service', 'order_service')).toBe(true);
    });

    it('should allow both directions of a kinded <-> relationship', () => {
      expect(adapter.isAllowedDependency('notification_service', 'order_service')).toBe(true);
      expect(adapter.isAllowedDependency('order_service', 'notification_service')).toBe(true);
      const reverse = adapter
        .getComponentRelationships('order_service')
        .find((r) => r.target.id === 'notification_service');
      expect(reverse?.kind).toBe('grpc');
    });

    it('should list both ends as dependencies and dependents', () => {
      const ids = (cs: { id: string }[]) => cs.map((c) => c.id).sort();
      expect(ids(adapter.getComponentDependencies('payment_service'))).toEqual(['order_service']);
      expect(ids(adapter.getComponentDependents('payment_service'))).toEqual(['order_service']);
      expect(ids(adapter.getComponentDependencies('order_service'))).toEqual([
        'notification_service',
        'payment_service',
      ]);
    });

    it('should not allow undeclared directions', () => {
      expect(adapter.isAllowedDependency('payment_service', 'notification_service')).toBe(false);
    });
  });
});
