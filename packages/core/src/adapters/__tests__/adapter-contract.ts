import { describe, it, expect } from 'vitest';
import type { ArchitectureModelAdapter } from '../architecture-adapter.js';

export function runAdapterContractTests(getAdapter: () => ArchitectureModelAdapter): void {
  describe('Component retrieval', () => {
    it('should return at least 5 components from getAllComponents', () => {
      const adapter = getAdapter();
      const components = adapter.getAllComponents();
      expect(components.length).toBeGreaterThanOrEqual(5);
    });

    it('should find frontend component with correct properties', () => {
      const adapter = getAdapter();
      const component = adapter.findComponentById('frontend');
      expect(component).toBeDefined();
      expect(component?.name).toBe('Web Frontend');
      expect(component?.technology).toBe('React');
      expect(component?.tags).toContain('ui');
    });

    it('should find api_gateway component with correct properties', () => {
      const adapter = getAdapter();
      const component = adapter.findComponentById('api_gateway');
      expect(component).toBeDefined();
      expect(component?.name).toBe('API Gateway');
      expect(component?.technology).toBe('Node.js');
      expect(component?.tags).toContain('backend');
    });

    it('should find user_service component with correct properties', () => {
      const adapter = getAdapter();
      const component = adapter.findComponentById('user_service');
      expect(component).toBeDefined();
      expect(component?.name).toBe('User Service');
      expect(component?.technology).toBe('Java');
      expect(component?.tags).toContain('backend');
      expect(component?.tags).toContain('microservice');
    });

    it('should find product_service component with correct properties', () => {
      const adapter = getAdapter();
      const component = adapter.findComponentById('product_service');
      expect(component).toBeDefined();
      expect(component?.name).toBe('Product Service');
      expect(component?.technology).toBe('Python');
      expect(component?.tags).toContain('backend');
      expect(component?.tags).toContain('microservice');
    });

    it('should find database component with correct properties', () => {
      const adapter = getAdapter();
      const component = adapter.findComponentById('database');
      expect(component).toBeDefined();
      expect(component?.name).toBe('PostgreSQL Database');
      expect(component?.technology).toBe('PostgreSQL');
      expect(component?.tags).toContain('storage');
    });
  });

  describe('Repository lookup', () => {
    it('should find component by repository URL', () => {
      const adapter = getAdapter();
      const component = adapter.findComponentByRepository(
        'https://github.com/example/user-service'
      );
      expect(component).toBeDefined();
      expect(component?.id).toBe('user_service');
      expect(component?.name).toBe('User Service');
    });

    it('should return undefined for nonexistent repository', () => {
      const adapter = getAdapter();
      const component = adapter.findComponentByRepository('https://github.com/example/nonexistent');
      expect(component).toBeUndefined();
    });

    it('should find all components by repository URL', () => {
      const adapter = getAdapter();
      const components = adapter.findAllComponentsByRepository(
        'https://github.com/example/user-service'
      );
      expect(components.length).toBeGreaterThanOrEqual(1);
      expect(components.some((c) => c.id === 'user_service')).toBe(true);
    });

    it('should have no repository link on database component', () => {
      const adapter = getAdapter();
      const component = adapter.findComponentById('database');
      expect(component).toBeDefined();
      expect(component?.repository).toBeUndefined();
    });
  });

  describe('Relationship types and deduplication', () => {
    it('should return 3 total relationships for api_gateway', () => {
      const adapter = getAdapter();
      const relationships = adapter.getComponentRelationships('api_gateway');
      expect(relationships.length).toBe(3);
    });

    it('should have multiple relationships with different kinds to user_service', () => {
      const adapter = getAdapter();
      const relationships = adapter.getComponentRelationships('api_gateway');
      const userServiceRels = relationships.filter((r) => r.target.id === 'user_service');
      expect(userServiceRels.length).toBe(2);
      const kinds = userServiceRels.map((r) => r.kind);
      expect(kinds).toContain('https');
      expect(kinds).toContain('grpc');
    });

    it('should include relationship kind and title', () => {
      const adapter = getAdapter();
      const relationships = adapter.getComponentRelationships('api_gateway');
      const httpsRel = relationships.find(
        (r) => r.target.id === 'user_service' && r.kind === 'https'
      );
      expect(httpsRel).toBeDefined();
      expect(httpsRel?.title).toBe('calls REST API');
    });

    it('should deduplicate targets in getComponentDependencies', () => {
      const adapter = getAdapter();
      const dependencies = adapter.getComponentDependencies('api_gateway');
      expect(dependencies.length).toBe(2);
      const ids = dependencies.map((d) => d.id);
      expect(ids).toContain('user_service');
      expect(ids).toContain('product_service');
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('Dependency direction', () => {
    it('should include database as dependency of user_service', () => {
      const adapter = getAdapter();
      const dependencies = adapter.getComponentDependencies('user_service');
      const ids = dependencies.map((d) => d.id);
      expect(ids).toContain('database');
    });

    it('should include user_service and product_service as dependents of database', () => {
      const adapter = getAdapter();
      const dependents = adapter.getComponentDependents('database');
      const ids = dependents.map((d) => d.id);
      expect(ids).toContain('user_service');
      expect(ids).toContain('product_service');
    });

    it('should return empty dependents for frontend', () => {
      const adapter = getAdapter();
      const dependents = adapter.getComponentDependents('frontend');
      expect(dependents).toHaveLength(0);
    });
  });

  describe('Allowed dependencies', () => {
    it('should allow frontend -> api_gateway dependency', () => {
      const adapter = getAdapter();
      expect(adapter.isAllowedDependency('frontend', 'api_gateway')).toBe(true);
    });

    it('should not allow frontend -> database dependency', () => {
      const adapter = getAdapter();
      expect(adapter.isAllowedDependency('frontend', 'database')).toBe(false);
    });
  });
}
