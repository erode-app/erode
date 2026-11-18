import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeEach } from 'vitest';
import { StructurizrAdapter } from '../adapter.js';
import { AdapterError } from '../../../errors.js';
import type { StructurizrWorkspace } from '../structurizr-types.js';
import { TestStructurizrAdapter } from './adapter.test.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const DSL_ID = 'structurizr.dsl.identifier';

describe('StructurizrAdapter - DSL export identifiers', () => {
  let adapter: StructurizrAdapter;

  beforeEach(async () => {
    adapter = new StructurizrAdapter();
    await adapter.loadFromPath(path.join(fixtures, 'dsl-export', 'workspace.json'));
  });

  it('takes ids from structurizr.dsl.identifier and never exposes numeric JSON ids', () => {
    const ids = adapter.getAllComponents().map((c) => c.id);
    expect(ids).toEqual([
      'customer',
      'shop',
      'storefront',
      'orders',
      'orderApi',
      'orders.payment_adapter',
      'payments',
    ]);
    expect(ids.some((id) => /^\d+$/.test(id) || /(^|\.)\d+(\.|$)/.test(id))).toBe(false);
  });

  it('takes element types from the JSON arrays', () => {
    const types = Object.fromEntries(adapter.getAllComponents().map((c) => [c.id, c.type]));
    expect(types).toEqual({
      customer: 'person',
      shop: 'softwareSystem',
      storefront: 'container',
      orders: 'container',
      orderApi: 'component',
      'orders.payment_adapter': 'component',
      payments: 'softwareSystem',
    });
  });

  it('resolves numeric sourceId and destinationId to element ids', () => {
    expect(adapter.isAllowedDependency('customer', 'storefront')).toBe(true);
    expect(adapter.isAllowedDependency('storefront', 'orders')).toBe(true);
    expect(adapter.isAllowedDependency('orderApi', 'payments')).toBe(true);
    expect(adapter.findComponentByRepository('https://github.com/example/orders')?.id).toBe(
      'orders'
    );
  });

  it('maps only elements with a stable DSL identifier to a DSL reference', () => {
    const references = Object.fromEntries(adapter.getDslReferences());
    expect(references).toEqual({
      customer: 'customer',
      shop: 'shop',
      storefront: 'storefront',
      orders: 'orders',
      orderApi: 'orderApi',
      payments: 'payments',
    });
  });

  it('lists components with the same ids and kinds', async () => {
    const listed = await new StructurizrAdapter().loadAndListComponents(
      path.join(fixtures, 'dsl-export')
    );
    expect(listed.find((c) => c.id === 'orderApi')?.kind).toBe('component');
    expect(listed.find((c) => c.id === 'storefront')?.links).toEqual([
      'https://github.com/example/storefront',
    ]);
  });
});

describe('StructurizrAdapter - erode.id fixture is unchanged', () => {
  it('keeps erode.id values as ids and has no DSL references', async () => {
    const adapter = new StructurizrAdapter();
    await adapter.loadFromPath(path.join(fixtures, 'sample-workspace', 'workspace.json'));

    expect(adapter.getAllComponents().map((c) => c.id)).toEqual([
      'frontend',
      'api_gateway',
      'user_service',
      'product_service',
      'database',
    ]);
    expect(adapter.getDslReferences().size).toBe(0);
  });
});

describe('StructurizrAdapter - id resolution rules', () => {
  let adapter: TestStructurizrAdapter;

  beforeEach(() => {
    adapter = new TestStructurizrAdapter();
  });

  const load = (model: StructurizrWorkspace['model']): void => {
    adapter.setMockWorkspace({ name: 'Test', model });
  };

  it('uses hierarchical identifiers verbatim', () => {
    load({
      softwareSystems: [
        {
          id: '1',
          name: 'Shop',
          properties: { [DSL_ID]: 'shop' },
          containers: [
            {
              id: '2',
              name: 'API',
              properties: { [DSL_ID]: 'shop.api' },
              components: [{ id: '3', name: 'Auth', properties: { [DSL_ID]: 'shop.api.auth' } }],
            },
          ],
        },
      ],
    });

    expect(adapter.getAllComponents().map((c) => [c.id, c.type])).toEqual([
      ['shop', 'softwareSystem'],
      ['shop.api', 'container'],
      ['shop.api.auth', 'component'],
    ]);
    expect(adapter.getDslReferences().get('shop.api.auth')).toBe('shop.api.auth');
  });

  it('ignores identifiers with a UUID segment from anonymous hierarchical parents', () => {
    const uuid = '0f1e2d3c-4b5a-4968-8776-655443322110';
    load({
      softwareSystems: [
        {
          id: '1',
          name: 'Legacy',
          properties: { [DSL_ID]: uuid },
          containers: [{ id: '2', name: 'Worker', properties: { [DSL_ID]: `${uuid}.worker` } }],
        },
      ],
    });

    expect(adapter.getAllComponents().map((c) => c.id)).toEqual(['legacy', 'legacy.worker']);
    expect(adapter.getDslReferences().size).toBe(0);
  });

  it('types children by array, not by dots in an erode.id', () => {
    load({
      softwareSystems: [
        {
          id: '1',
          name: 'Shop',
          properties: { 'erode.id': 'shop.core' },
          containers: [{ id: '2', name: 'API', properties: { 'erode.id': 'shop.core.api' } }],
        },
      ],
    });

    expect(adapter.findComponentById('shop.core')?.type).toBe('softwareSystem');
    expect(adapter.findComponentById('shop.core.api')?.type).toBe('container');
  });

  it('keeps erode.id ahead of the DSL identifier but still exposes the DSL reference', () => {
    load({
      softwareSystems: [
        { id: '1', name: 'Svc', properties: { 'erode.id': 'custom', [DSL_ID]: 'svc' } },
      ],
    });

    expect(adapter.findComponentById('custom')).toBeDefined();
    expect(adapter.getDslReferences().get('custom')).toBe('svc');
  });

  it('builds ASCII fallback ids from accented names', () => {
    load({
      softwareSystems: [
        { id: '1', name: 'Café Résumé' },
        { id: '2', name: 'Платежи Service' },
      ],
    });

    expect(adapter.getAllComponents().map((c) => c.id)).toEqual(['cafe_resume', 'service']);
  });

  it('rejects an element whose name yields no fallback id', () => {
    expect(() => {
      load({ softwareSystems: [{ id: '1', name: '---' }] });
    }).toThrow(/Cannot derive an id/);
  });

  const expectDuplicate = (model: StructurizrWorkspace['model'], names: string[]): void => {
    let error: unknown;
    try {
      load(model);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AdapterError);
    for (const name of names) {
      expect((error as AdapterError).message).toContain(`"${name}"`);
    }
  };

  it('rejects two elements with the same erode.id', () => {
    expectDuplicate(
      {
        softwareSystems: [
          { id: '1', name: 'Alpha', properties: { 'erode.id': 'svc' } },
          { id: '2', name: 'Beta', properties: { 'erode.id': 'svc' } },
        ],
      },
      ['Alpha', 'Beta']
    );
  });

  it('rejects names that slug to the same fallback id', () => {
    expectDuplicate(
      {
        softwareSystems: [
          { id: '1', name: 'Payment Service' },
          { id: '2', name: 'Payment-Service' },
        ],
      },
      ['Payment Service', 'Payment-Service']
    );
  });

  it('rejects an erode.id that collides with another element DSL identifier', () => {
    expectDuplicate(
      {
        softwareSystems: [
          { id: '1', name: 'Orders', properties: { [DSL_ID]: 'orders' } },
          { id: '2', name: 'Billing', properties: { 'erode.id': 'orders' } },
        ],
      },
      ['Orders', 'Billing']
    );
  });
});

describe('StructurizrAdapter - fallback slug and reload', () => {
  const load = (model: StructurizrWorkspace['model']): TestStructurizrAdapter => {
    const adapter = new TestStructurizrAdapter();
    adapter.setMockWorkspace({ name: 'Test', model });
    return adapter;
  };

  it('slugs non-ASCII names to ids the response schema accepts', () => {
    const id = load({
      softwareSystems: [{ id: '1', name: 'Betalningstjänst' }],
    }).getAllComponents()[0]?.id;
    expect(id).toBe('betalningstjanst');
    expect(id).toMatch(/^[a-zA-Z0-9._-]+$/);
  });

  it('fails with an erode.id hint when no ASCII letters or digits remain', () => {
    let error: unknown;
    try {
      load({ softwareSystems: [{ id: '1', name: '支付' }] });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).suggestions?.join(' ')).toContain('erode.id');
  });

  it('drops index, relationships and references from an earlier load', async () => {
    const adapter = new StructurizrAdapter();
    await adapter.loadFromPath(path.join(fixtures, 'dsl-export', 'workspace.json'));
    expect(adapter.getDslReferences().size).toBeGreaterThan(0);

    await adapter.loadAndListComponents(path.join(fixtures, 'sample-workspace', 'workspace.json'));

    expect(() => adapter.getAllComponents()).toThrow(AdapterError);
    expect(() => adapter.getAllRelationships()).toThrow(AdapterError);
    expect(adapter.getDslReferences().has('storefront')).toBe(false);
  });

  it('builds the references map once per load', async () => {
    const adapter = new StructurizrAdapter();
    await adapter.loadFromPath(path.join(fixtures, 'dsl-export', 'workspace.json'));
    expect(adapter.getDslReferences()).toBe(adapter.getDslReferences());
  });
});
