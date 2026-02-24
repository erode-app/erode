import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LikeC4Adapter } from '../adapter.js';
import { AdapterError, ErrorCode } from '../../../errors.js';
import type { ArchitecturalComponent } from '../../architecture-types.js';
import { createMockModel, type MockLikeC4Model } from './fixtures/mock-model.js';

class TestLikeC4Adapter extends LikeC4Adapter {
  public setMockModel(model: MockLikeC4Model): void {
    const adapter = this as unknown as {
      model: MockLikeC4Model;
      componentIndex: unknown;
      relationships: unknown;
    };
    adapter.model = model;

    const components = this.extractComponents();
    const relationships = this.extractRelationships();
    adapter.relationships = relationships;
    adapter.componentIndex = this.buildComponentIndex(components);
  }

  public override extractComponents() {
    return super.extractComponents();
  }

  public override extractRelationships() {
    return super.extractRelationships();
  }

  public override buildComponentIndex(components: ArchitecturalComponent[]) {
    return super.buildComponentIndex(components);
  }
}

describe('LikeC4Adapter', () => {
  let adapter: TestLikeC4Adapter;

  beforeEach(async () => {
    const configModule = await import('../../../utils/config.js');
    configModule.CONFIG.adapter.likec4.excludePaths = [];
    configModule.CONFIG.adapter.likec4.excludeTags = [];

    adapter = new TestLikeC4Adapter();
    adapter.setMockModel(createMockModel());
  });

  describe('Component extraction', () => {
    it('should extract all components correctly', () => {
      const components = adapter.extractComponents();

      expect(components).toHaveLength(9);

      const frontend = components.find((c) => c.id === 'frontend');
      expect(frontend).toBeDefined();
      expect(frontend?.name).toBe('Web Frontend');
      expect(frontend?.type).toBe('webApp');
      expect(frontend?.repository).toBe('https://github.com/example/frontend');
      expect(frontend?.tags).toEqual(['ui']);
    });

    it('should extract technology information from components', () => {
      const components = adapter.extractComponents();

      const frontend = components.find((c) => c.id === 'frontend');
      expect(frontend?.technology).toBe('React');

      const apiGateway = components.find((c) => c.id === 'api_gateway');
      expect(apiGateway?.technology).toBe('Node.js');

      const userService = components.find((c) => c.id === 'user_service');
      expect(userService?.technology).toBe('Java');

      const productService = components.find((c) => c.id === 'product_service');
      expect(productService?.technology).toBe('Python');

      const database = components.find((c) => c.id === 'database');
      expect(database?.technology).toBe('PostgreSQL');
    });

    it('should handle components without technology', () => {
      const components = adapter.extractComponents();
      const azureInfra = components.find((c) => c.id === 'azure_infrastructure');

      expect(azureInfra).toBeDefined();
      expect(azureInfra?.technology).toBeUndefined();
    });

    it('should handle components without repository links', () => {
      const components = adapter.extractComponents();
      const database = components.find((c) => c.id === 'database');

      expect(database).toBeDefined();
      expect(database?.repository).toBeUndefined();
    });
  });

  describe('Relationship extraction', () => {
    it('should extract relationships with proper string IDs', () => {
      const relationships = adapter.extractRelationships();

      expect(relationships).toHaveLength(7);

      relationships.forEach((rel) => {
        expect(typeof rel.source).toBe('string');
        expect(typeof rel.target).toBe('string');
      });

      const frontendToGateway = relationships.find(
        (r) => r.source === 'frontend' && r.target === 'api_gateway'
      );
      expect(frontendToGateway).toBeDefined();
      expect(frontendToGateway?.title).toBe('makes requests');
      expect(frontendToGateway?.kind).toBe('https');
    });
  });

  describe('Component dependencies', () => {
    it('should find component dependencies correctly', () => {
      const apiGatewayDeps = adapter.getComponentDependencies('api_gateway');

      expect(apiGatewayDeps).toHaveLength(3);

      const depIds = apiGatewayDeps.map((d) => d.id);
      expect(depIds).toContain('user_service');
      expect(depIds).toContain('product_service');
      expect(depIds).toContain('azure_infrastructure.vnet');
    });

    it('should find component dependents correctly', () => {
      const databaseDependents = adapter.getComponentDependents('database');

      expect(databaseDependents).toHaveLength(3);

      const dependentIds = databaseDependents.map((d) => d.id);
      expect(dependentIds).toContain('user_service');
      expect(dependentIds).toContain('product_service');
      expect(dependentIds).toContain('experimental.new_feature');
    });

    it('should handle components with no dependencies', () => {
      const frontendDeps = adapter.getComponentDependencies('frontend');
      expect(frontendDeps).toHaveLength(1);
      expect(frontendDeps[0]?.id).toBe('api_gateway');
    });

    it('should handle components with no dependents', () => {
      const frontendDependents = adapter.getComponentDependents('frontend');
      expect(frontendDependents).toHaveLength(0);
    });
  });

  describe('Repository-based lookup', () => {
    it('should find components by repository URL', () => {
      const component = adapter.findComponentByRepository(
        'https://github.com/example/user-service'
      );

      expect(component).toBeDefined();
      expect(component?.id).toBe('user_service');
      expect(component?.name).toBe('User Service');
    });

    it('should return undefined for non-existent repository', () => {
      const component = adapter.findComponentByRepository('https://github.com/example/nonexistent');
      expect(component).toBeUndefined();
    });

    it('should handle URL normalization', () => {
      const component1 = adapter.findComponentByRepository(
        'https://github.com/example/user-service/'
      );
      expect(component1).toBeDefined();
      expect(component1?.id).toBe('user_service');

      const component2 = adapter.findComponentByRepository(
        'https://github.com/example/user-service.git'
      );
      expect(component2).toBeDefined();
      expect(component2?.id).toBe('user_service');
    });
  });

  describe('Multiple components per repository', () => {
    beforeEach(() => {
      const monorepoModel: MockLikeC4Model = {
        elements: () => [
          {
            id: 'pos.pos_backend',
            title: 'POS Backend',
            kind: 'group',
            tags: [],
            links: ['https://github.com/example/checkout-apis'],
          },
          {
            id: 'pos.pos_backend.pos_api',
            title: 'Checkout-API',
            kind: 'service',
            tags: [],
            links: ['https://github.com/example/checkout-apis'],
          },
          {
            id: 'pos.pos_backend.admin_api',
            title: 'Admin-API',
            kind: 'service',
            tags: [],
            links: ['https://github.com/example/checkout-apis'],
          },
        ],
        relationships: () => [],
      };
      adapter.setMockModel(monorepoModel);
    });

    it('should find all components sharing the same repository', () => {
      const components = adapter.findAllComponentsByRepository(
        'https://github.com/example/checkout-apis'
      );

      expect(components).toHaveLength(3);
      const ids = components.map((c) => c.id);
      expect(ids).toContain('pos.pos_backend');
      expect(ids).toContain('pos.pos_backend.pos_api');
      expect(ids).toContain('pos.pos_backend.admin_api');
    });

    it('should return empty array for non-existent repository', () => {
      const components = adapter.findAllComponentsByRepository(
        'https://github.com/example/nonexistent'
      );
      expect(components).toHaveLength(0);
    });
  });

  describe('Allowed dependencies', () => {
    it('should correctly identify allowed dependencies', () => {
      const isAllowed1 = adapter.isAllowedDependency('frontend', 'api_gateway');
      expect(isAllowed1).toBe(true);

      const isAllowed2 = adapter.isAllowedDependency('user_service', 'database');
      expect(isAllowed2).toBe(true);

      const isNotAllowed = adapter.isAllowedDependency('frontend', 'database');
      expect(isNotAllowed).toBe(false);
    });
  });
});

describe('LikeC4Adapter - Model not loaded guard', () => {
  it('should throw AdapterError with MODEL_NOT_LOADED when querying before loadFromPath', () => {
    const adapter = new LikeC4Adapter();

    expect(() => adapter.getAllComponents()).toThrow(AdapterError);
    try {
      adapter.getAllComponents();
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterError);
      const adapterError = error as AdapterError;
      expect(adapterError.code).toBe(ErrorCode.MODEL_NOT_LOADED);
      expect(adapterError.adapterType).toBe('likec4');
    }
  });
});

describe('LikeC4Adapter - Component Exclusion', () => {
  let adapter: TestLikeC4Adapter;

  beforeEach(async () => {
    const configModule = await import('../../../utils/config.js');
    configModule.CONFIG.adapter.likec4.excludePaths = [];
    configModule.CONFIG.adapter.likec4.excludeTags = [];

    adapter = new TestLikeC4Adapter();
    adapter.setMockModel(createMockModel());
  });

  afterEach(async () => {
    const configModule = await import('../../../utils/config.js');
    configModule.CONFIG.adapter.likec4.excludePaths = [];
    configModule.CONFIG.adapter.likec4.excludeTags = [];
  });

  describe('Exclusion by component ID prefix', () => {
    it('should exclude components by ID prefix', async () => {
      const configModule = await import('../../../utils/config.js');
      configModule.CONFIG.adapter.likec4.excludePaths = ['azure_infrastructure'];

      adapter = new TestLikeC4Adapter();
      adapter.setMockModel(createMockModel());

      const components = adapter.extractComponents();

      const azureComponents = components.filter((c) => c.id.startsWith('azure_infrastructure'));
      expect(azureComponents).toHaveLength(0);

      expect(components.find((c) => c.id === 'frontend')).toBeDefined();
      expect(components.find((c) => c.id === 'api_gateway')).toBeDefined();
    });

    it('should exclude multiple component ID prefixes', async () => {
      const configModule = await import('../../../utils/config.js');
      configModule.CONFIG.adapter.likec4.excludePaths = ['azure_infrastructure', 'experimental', 'temp'];

      adapter = new TestLikeC4Adapter();
      adapter.setMockModel(createMockModel());

      const components = adapter.extractComponents();

      expect(components.find((c) => c.id.startsWith('azure_infrastructure'))).toBeUndefined();
      expect(components.find((c) => c.id.startsWith('experimental'))).toBeUndefined();
      expect(components.find((c) => c.id.startsWith('temp'))).toBeUndefined();

      expect(components.find((c) => c.id === 'frontend')).toBeDefined();
      expect(components.find((c) => c.id === 'database')).toBeDefined();
    });

    it('should handle hierarchical component IDs', async () => {
      const configModule = await import('../../../utils/config.js');
      configModule.CONFIG.adapter.likec4.excludePaths = ['azure_infrastructure'];

      adapter = new TestLikeC4Adapter();
      adapter.setMockModel(createMockModel());

      const components = adapter.extractComponents();

      expect(components.find((c) => c.id === 'azure_infrastructure')).toBeUndefined();
      expect(components.find((c) => c.id === 'azure_infrastructure.vnet')).toBeUndefined();
    });
  });

  describe('Exclusion by tags', () => {
    it('should exclude components by tag', async () => {
      const configModule = await import('../../../utils/config.js');
      configModule.CONFIG.adapter.likec4.excludeTags = ['infrastructure'];

      adapter = new TestLikeC4Adapter();
      adapter.setMockModel(createMockModel());

      const components = adapter.extractComponents();

      const infrastructureComponents = components.filter((c) => c.tags.includes('infrastructure'));
      expect(infrastructureComponents).toHaveLength(0);

      expect(components.find((c) => c.id === 'frontend')).toBeDefined();
      expect(components.find((c) => c.id === 'database')).toBeDefined();
    });

    it('should exclude multiple tags', async () => {
      const configModule = await import('../../../utils/config.js');
      configModule.CONFIG.adapter.likec4.excludeTags = ['infrastructure', 'experimental', 'temp'];

      adapter = new TestLikeC4Adapter();
      adapter.setMockModel(createMockModel());

      const components = adapter.extractComponents();

      expect(components.find((c) => c.id === 'azure_infrastructure')).toBeUndefined();
      expect(components.find((c) => c.id === 'azure_infrastructure.vnet')).toBeUndefined();
      expect(components.find((c) => c.id === 'experimental.new_feature')).toBeUndefined();
      expect(components.find((c) => c.id === 'temp.test_service')).toBeUndefined();

      expect(components.find((c) => c.id === 'frontend')).toBeDefined();
      expect(components.find((c) => c.id === 'database')).toBeDefined();
    });
  });

  describe('Tag inheritance', () => {
    it('should exclude child components when parent has excluded tag', async () => {
      const configModule = await import('../../../utils/config.js');
      configModule.CONFIG.adapter.likec4.excludeTags = ['infrastructure'];

      adapter = new TestLikeC4Adapter();
      adapter.setMockModel(createMockModel());

      const components = adapter.extractComponents();

      expect(components.find((c) => c.id === 'azure_infrastructure')).toBeUndefined();
      expect(components.find((c) => c.id === 'azure_infrastructure.frontdoor')).toBeUndefined();
      expect(components.find((c) => c.id === 'azure_infrastructure.vnet')).toBeUndefined();
    });

    it('should exclude grandchildren when grandparent has excluded tag', async () => {
      const configModule = await import('../../../utils/config.js');
      configModule.CONFIG.adapter.likec4.excludeTags = ['infrastructure'];

      adapter = new TestLikeC4Adapter();
      adapter.setMockModel(createMockModel());

      const components = adapter.extractComponents();

      expect(
        components.find((c) => c.id === 'azure_infrastructure.vnet.private_dns')
      ).toBeUndefined();
      expect(
        components.find((c) => c.id === 'azure_infrastructure.vnet.container_app_env')
      ).toBeUndefined();
      expect(
        components.find((c) => c.id === 'azure_infrastructure.vnet.container_app_env.axeman_api')
      ).toBeUndefined();
    });

    it('should exclude descendants when mid-level component has excluded tag', async () => {
      const configModule = await import('../../../utils/config.js');
      configModule.CONFIG.adapter.likec4.excludeTags = ['networking'];

      adapter = new TestLikeC4Adapter();
      adapter.setMockModel(createMockModel());

      const components = adapter.extractComponents();

      expect(components.find((c) => c.id === 'azure_infrastructure')).toBeDefined();
      expect(components.find((c) => c.id === 'azure_infrastructure.vnet')).toBeUndefined();
      expect(
        components.find((c) => c.id === 'azure_infrastructure.vnet.private_dns')
      ).toBeUndefined();
      expect(
        components.find((c) => c.id === 'azure_infrastructure.vnet.container_app_env')
      ).toBeUndefined();
      expect(
        components.find((c) => c.id === 'azure_infrastructure.vnet.container_app_env.axeman_api')
      ).toBeUndefined();
    });

    it('should not exclude unrelated siblings', async () => {
      const configModule = await import('../../../utils/config.js');
      configModule.CONFIG.adapter.likec4.excludeTags = ['infrastructure'];

      adapter = new TestLikeC4Adapter();
      adapter.setMockModel(createMockModel());

      const components = adapter.extractComponents();

      expect(components.find((c) => c.id === 'azure_infrastructure.frontdoor')).toBeUndefined();
      expect(components.find((c) => c.id === 'frontend')).toBeDefined();
      expect(components.find((c) => c.id === 'api_gateway')).toBeDefined();
      expect(components.find((c) => c.id === 'database')).toBeDefined();
    });
  });

  describe('Combined exclusion (paths and tags)', () => {
    it('should exclude by both paths and tags', async () => {
      const configModule = await import('../../../utils/config.js');
      configModule.CONFIG.adapter.likec4.excludePaths = ['temp'];
      configModule.CONFIG.adapter.likec4.excludeTags = ['infrastructure'];

      adapter = new TestLikeC4Adapter();
      adapter.setMockModel(createMockModel());

      const components = adapter.extractComponents();

      expect(components.find((c) => c.id.startsWith('temp'))).toBeUndefined();
      expect(components.find((c) => c.id === 'azure_infrastructure')).toBeUndefined();
      expect(components.find((c) => c.id === 'azure_infrastructure.vnet')).toBeUndefined();
      expect(components.find((c) => c.id === 'frontend')).toBeDefined();
      expect(components.find((c) => c.id === 'experimental.new_feature')).toBeDefined();
    });
  });

  describe('Relationship filtering', () => {
    it('should filter relationships involving excluded components', async () => {
      const configModule = await import('../../../utils/config.js');
      configModule.CONFIG.adapter.likec4.excludePaths = ['azure_infrastructure'];

      adapter = new TestLikeC4Adapter();
      adapter.setMockModel(createMockModel());

      const relationships = adapter.extractRelationships();

      const azureRelationships = relationships.filter(
        (r) =>
          r.source.startsWith('azure_infrastructure') || r.target.startsWith('azure_infrastructure')
      );
      expect(azureRelationships).toHaveLength(0);

      expect(
        relationships.find((r) => r.source === 'frontend' && r.target === 'api_gateway')
      ).toBeDefined();
    });

    it('should filter relationships by tag exclusion', async () => {
      const configModule = await import('../../../utils/config.js');
      configModule.CONFIG.adapter.likec4.excludeTags = ['experimental'];

      adapter = new TestLikeC4Adapter();
      adapter.setMockModel(createMockModel());

      const relationships = adapter.extractRelationships();

      const experimentalRelationships = relationships.filter((r) =>
        r.source.startsWith('experimental')
      );
      expect(experimentalRelationships).toHaveLength(0);
    });
  });

  describe('No exclusions', () => {
    it('should include all components when no exclusions are configured', async () => {
      const configModule = await import('../../../utils/config.js');
      configModule.CONFIG.adapter.likec4.excludePaths = [];
      configModule.CONFIG.adapter.likec4.excludeTags = [];

      adapter = new TestLikeC4Adapter();
      adapter.setMockModel(createMockModel());

      const components = adapter.extractComponents();

      expect(components).toHaveLength(9);
    });
  });
});
