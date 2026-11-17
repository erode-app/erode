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
