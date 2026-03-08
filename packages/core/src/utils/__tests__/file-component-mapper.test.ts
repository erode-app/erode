import { describe, it, expect } from 'vitest';

import { mapFilesToComponents } from '../file-component-mapper.js';

describe('mapFilesToComponents', () => {
  it('maps files in separate directories to their respective components', () => {
    const files = [
      { filename: 'api-gateway/src/index.ts' },
      { filename: 'order-service/src/handler.ts' },
    ];
    const components = [
      { id: 'system.backend.api_gateway', name: 'API Gateway' },
      { id: 'system.backend.order_service', name: 'Order Service' },
    ];

    const result = mapFilesToComponents(files, components, 'system.backend.api_gateway');

    expect(result.thisComponent).toEqual({
      componentId: 'system.backend.api_gateway',
      componentName: 'API Gateway',
      files: ['api-gateway/src/index.ts'],
    });
    expect(result.otherComponents).toEqual([
      {
        componentId: 'system.backend.order_service',
        componentName: 'Order Service',
        files: ['order-service/src/handler.ts'],
      },
    ]);
    expect(result.unmapped).toEqual([]);
  });

  it('matches underscore, hyphen, and collapsed normalization variants', () => {
    const components = [{ id: 'system.backend.api-gateway', name: 'API Gateway' }];

    const files = [{ filename: 'api_gateway/foo.ts' }, { filename: 'apigateway/bar.ts' }];

    const result = mapFilesToComponents(files, components, 'system.backend.api-gateway');

    expect(result.thisComponent).toEqual({
      componentId: 'system.backend.api-gateway',
      componentName: 'API Gateway',
      files: ['api_gateway/foo.ts', 'apigateway/bar.ts'],
    });
    expect(result.otherComponents).toEqual([]);
    expect(result.unmapped).toEqual([]);
  });

  it('matches directories based on component name when ID does not match', () => {
    const components = [{ id: 'system.checkout', name: 'Checkout Flow' }];

    const files = [{ filename: 'checkout-flow/src/process.ts' }];

    const result = mapFilesToComponents(files, components, 'system.checkout');

    expect(result.thisComponent).toEqual({
      componentId: 'system.checkout',
      componentName: 'Checkout Flow',
      files: ['checkout-flow/src/process.ts'],
    });
  });

  it('places files in shared or root-level directories into unmapped', () => {
    const components = [{ id: 'system.backend.api_gateway', name: 'API Gateway' }];

    const files = [{ filename: 'shared/utils.ts' }, { filename: 'README.md' }];

    const result = mapFilesToComponents(files, components, 'system.backend.api_gateway');

    expect(result.thisComponent).toBeNull();
    expect(result.otherComponents).toEqual([]);
    expect(result.unmapped).toEqual(['shared/utils.ts', 'README.md']);
  });

  it('returns empty result for empty files array', () => {
    const components = [{ id: 'system.backend.api_gateway', name: 'API Gateway' }];

    const result = mapFilesToComponents([], components, 'system.backend.api_gateway');

    expect(result.thisComponent).toBeNull();
    expect(result.otherComponents).toEqual([]);
    expect(result.unmapped).toEqual([]);
  });

  it('maps everything to thisComponent or unmapped with a single component', () => {
    const components = [{ id: 'system.backend.api_gateway', name: 'API Gateway' }];

    const files = [
      { filename: 'api-gateway/src/index.ts' },
      { filename: 'api-gateway/src/routes.ts' },
      { filename: 'config.yaml' },
    ];

    const result = mapFilesToComponents(files, components, 'system.backend.api_gateway');

    expect(result.thisComponent).toEqual({
      componentId: 'system.backend.api_gateway',
      componentName: 'API Gateway',
      files: ['api-gateway/src/index.ts', 'api-gateway/src/routes.ts'],
    });
    expect(result.otherComponents).toEqual([]);
    expect(result.unmapped).toEqual(['config.yaml']);
  });

  it('correctly partitions thisComponent vs otherComponents based on selectedComponentId', () => {
    const components = [
      { id: 'system.backend.api_gateway', name: 'API Gateway' },
      { id: 'system.backend.order_service', name: 'Order Service' },
      { id: 'system.frontend.dashboard', name: 'Dashboard' },
    ];

    const files = [
      { filename: 'api-gateway/src/index.ts' },
      { filename: 'order-service/src/handler.ts' },
      { filename: 'dashboard/src/app.tsx' },
    ];

    const result = mapFilesToComponents(files, components, 'system.backend.order_service');

    expect(result.thisComponent).toEqual({
      componentId: 'system.backend.order_service',
      componentName: 'Order Service',
      files: ['order-service/src/handler.ts'],
    });
    expect(result.otherComponents).toHaveLength(2);
    expect(result.otherComponents.map((c) => c.componentId)).toContain(
      'system.backend.api_gateway'
    );
    expect(result.otherComponents.map((c) => c.componentId)).toContain('system.frontend.dashboard');
  });

  it('matches components via path segments in nested paths', () => {
    const components = [{ id: 'system.backend.api_gateway', name: 'API Gateway' }];

    const files = [{ filename: 'packages/api-gateway/src/index.ts' }];

    const result = mapFilesToComponents(files, components, 'system.backend.api_gateway');

    expect(result.thisComponent).toEqual({
      componentId: 'system.backend.api_gateway',
      componentName: 'API Gateway',
      files: ['packages/api-gateway/src/index.ts'],
    });
  });

  it('puts all files in unmapped when allComponents is empty', () => {
    const files = [
      { filename: 'api-gateway/src/index.ts' },
      { filename: 'order-service/src/handler.ts' },
    ];

    const result = mapFilesToComponents(files, [], 'nonexistent');

    expect(result.thisComponent).toBeNull();
    expect(result.otherComponents).toEqual([]);
    expect(result.unmapped).toEqual(['api-gateway/src/index.ts', 'order-service/src/handler.ts']);
  });
});
