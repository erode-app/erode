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

  describe('Relationship queries', () => {
    it('should return all relationships via getAllRelationships', () => {
      const relationships = adapter.getAllRelationships();
      expect(relationships).toHaveLength(7);
    });

    it('should return empty array for component with no outgoing relationships', () => {
      const rels = adapter.getComponentRelationships('database');
      expect(rels).toEqual([]);
    });

    it('should return outgoing relationships with resolved targets', () => {
      const rels = adapter.getComponentRelationships('frontend');
      expect(rels).toHaveLength(1);
      expect(rels[0]?.target.id).toBe('api_gateway');
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

  describe('GitLab and Bitbucket repository extraction', () => {
    it.each([
      ['GitLab', 'https://gitlab.com/org/my-service', 'https://gitlab.com/org/my-service'],
      ['Bitbucket', 'https://bitbucket.org/org/my-service', 'https://bitbucket.org/org/my-service'],
    ])('should extract and look up %s repository', (_platform, url, expected) => {
      const model: MockLikeC4Model = {
        elements: () => [{ id: 'svc', title: 'Svc', kind: 'service', tags: [], links: [url] }],
        relationships: () => [],
      };
      adapter.setMockModel(model);
      expect(adapter.extractComponents().find((c) => c.id === 'svc')?.repository).toBe(expected);
      expect(adapter.findComponentByRepository(url)?.id).toBe('svc');
    });
  });

  describe('URL spoofing protection', () => {
    it('should reject URLs from lookalike domains', () => {
      const spoofedModel: MockLikeC4Model = {
        elements: () => [
          {
            id: 'spoofed_service',
            title: 'Spoofed Service',
            kind: 'service',
            tags: [],
            links: ['https://evil-github.com/owner/repo'],
          },
        ],
        relationships: () => [],
      };
      adapter.setMockModel(spoofedModel);
      const components = adapter.extractComponents();
      const spoofed = components.find((c) => c.id === 'spoofed_service');
      expect(spoofed?.repository).toBeUndefined();
    });

    it('should reject URLs with github.com as query parameter', () => {
      const spoofedModel: MockLikeC4Model = {
        elements: () => [
          {
            id: 'query_spoofed',
            title: 'Query Spoofed',
            kind: 'service',
            tags: [],
            links: ['https://evil.com?redirect=github.com/owner/repo'],
          },
        ],
        relationships: () => [],
      };
      adapter.setMockModel(spoofedModel);
      const components = adapter.extractComponents();
      const spoofed = components.find((c) => c.id === 'query_spoofed');
      expect(spoofed?.repository).toBeUndefined();
    });

    it('should accept legitimate github.com URLs', () => {
      const components = adapter.extractComponents();
      const frontend = components.find((c) => c.id === 'frontend');
      expect(frontend?.repository).toBe('https://github.com/example/frontend');
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
  it('should throw AdapterError with MODEL_NOT_INITIALIZED when querying before loadFromPath', () => {
    const adapter = new LikeC4Adapter();

    expect(() => adapter.getAllComponents()).toThrow(AdapterError);
    try {
      adapter.getAllComponents();
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterError);
      const adapterError = error as AdapterError;
      expect(adapterError.code).toBe(ErrorCode.MODEL_NOT_INITIALIZED);
      expect(adapterError.adapterType).toBe('likec4');
    }
  });

  it('should throw AdapterError when getComponentRelationships is called before load', () => {
    const adapter = new LikeC4Adapter();

    expect(() => adapter.getComponentRelationships('any')).toThrow(AdapterError);
    try {
      adapter.getComponentRelationships('any');
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterError);
      const adapterError = error as AdapterError;
      expect(adapterError.code).toBe(ErrorCode.MODEL_NOT_INITIALIZED);
      expect(adapterError.adapterType).toBe('likec4');
    }
  });

  it('should throw AdapterError when getComponentDependents is called before load', () => {
    const adapter = new LikeC4Adapter();

    expect(() => adapter.getComponentDependents('any')).toThrow(AdapterError);
    try {
      adapter.getComponentDependents('any');
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterError);
      const adapterError = error as AdapterError;
      expect(adapterError.code).toBe(ErrorCode.MODEL_NOT_INITIALIZED);
      expect(adapterError.adapterType).toBe('likec4');
    }
  });

  it('should throw AdapterError when getAllRelationships is called before load', () => {
    const adapter = new LikeC4Adapter();

    expect(() => adapter.getAllRelationships()).toThrow(AdapterError);
    try {
      adapter.getAllRelationships();
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterError);
      const adapterError = error as AdapterError;
      expect(adapterError.code).toBe(ErrorCode.MODEL_NOT_INITIALIZED);
      expect(adapterError.adapterType).toBe('likec4');
    }
  });
});

describe('LikeC4Adapter - Component Exclusion', () => {
  let adapter: TestLikeC4Adapter;

  async function setupExclusion(paths: string[] = [], tags: string[] = []) {
    const configModule = await import('../../../utils/config.js');
    configModule.CONFIG.adapter.likec4.excludePaths = paths;
    configModule.CONFIG.adapter.likec4.excludeTags = tags;
    adapter = new TestLikeC4Adapter();
    adapter.setMockModel(createMockModel());
  }

  const findId = (components: ArchitecturalComponent[], id: string) =>
    components.find((c) => c.id === id);

  beforeEach(() => setupExclusion());
  afterEach(() => setupExclusion());

  describe('Exclusion by component ID prefix', () => {
    it('should exclude components by ID prefix', async () => {
      await setupExclusion(['azure_infrastructure']);
      const components = adapter.extractComponents();
      expect(components.filter((c) => c.id.startsWith('azure_infrastructure'))).toHaveLength(0);
      expect(findId(components, 'frontend')).toBeDefined();
      expect(findId(components, 'api_gateway')).toBeDefined();
    });

    it('should exclude multiple component ID prefixes', async () => {
      await setupExclusion(['azure_infrastructure', 'experimental', 'temp']);
      const components = adapter.extractComponents();
      expect(components.find((c) => c.id.startsWith('azure_infrastructure'))).toBeUndefined();
      expect(components.find((c) => c.id.startsWith('experimental'))).toBeUndefined();
      expect(components.find((c) => c.id.startsWith('temp'))).toBeUndefined();
      expect(findId(components, 'frontend')).toBeDefined();
    });

    it('should handle hierarchical component IDs', async () => {
      await setupExclusion(['azure_infrastructure']);
      const components = adapter.extractComponents();
      expect(findId(components, 'azure_infrastructure')).toBeUndefined();
      expect(findId(components, 'azure_infrastructure.vnet')).toBeUndefined();
    });
  });

  describe('Exclusion by tags', () => {
    it('should exclude components by tag', async () => {
      await setupExclusion([], ['infrastructure']);
      const components = adapter.extractComponents();
      expect(components.filter((c) => c.tags.includes('infrastructure'))).toHaveLength(0);
      expect(findId(components, 'frontend')).toBeDefined();
    });

    it('should exclude multiple tags', async () => {
      await setupExclusion([], ['infrastructure', 'experimental', 'temp']);
      const components = adapter.extractComponents();
      expect(findId(components, 'azure_infrastructure')).toBeUndefined();
      expect(findId(components, 'experimental.new_feature')).toBeUndefined();
      expect(findId(components, 'temp.test_service')).toBeUndefined();
      expect(findId(components, 'frontend')).toBeDefined();
    });
  });

  describe('Tag inheritance', () => {
    it('should exclude child components when parent has excluded tag', async () => {
      await setupExclusion([], ['infrastructure']);
      const components = adapter.extractComponents();
      expect(findId(components, 'azure_infrastructure')).toBeUndefined();
      expect(findId(components, 'azure_infrastructure.frontdoor')).toBeUndefined();
      expect(findId(components, 'azure_infrastructure.vnet')).toBeUndefined();
    });

    it('should exclude grandchildren when grandparent has excluded tag', async () => {
      await setupExclusion([], ['infrastructure']);
      const components = adapter.extractComponents();
      expect(findId(components, 'azure_infrastructure.vnet.private_dns')).toBeUndefined();
      expect(findId(components, 'azure_infrastructure.vnet.container_app_env')).toBeUndefined();
      expect(
        findId(components, 'azure_infrastructure.vnet.container_app_env.axeman_api')
      ).toBeUndefined();
    });

    it('should exclude descendants when mid-level component has excluded tag', async () => {
      await setupExclusion([], ['networking']);
      const components = adapter.extractComponents();
      expect(findId(components, 'azure_infrastructure')).toBeDefined();
      expect(findId(components, 'azure_infrastructure.vnet')).toBeUndefined();
      expect(findId(components, 'azure_infrastructure.vnet.private_dns')).toBeUndefined();
      expect(findId(components, 'azure_infrastructure.vnet.container_app_env')).toBeUndefined();
    });

    it('should not exclude unrelated siblings', async () => {
      await setupExclusion([], ['infrastructure']);
      const components = adapter.extractComponents();
      expect(findId(components, 'azure_infrastructure.frontdoor')).toBeUndefined();
      expect(findId(components, 'frontend')).toBeDefined();
      expect(findId(components, 'api_gateway')).toBeDefined();
    });
  });

  describe('Combined exclusion (paths and tags)', () => {
    it('should exclude by both paths and tags', async () => {
      await setupExclusion(['temp'], ['infrastructure']);
      const components = adapter.extractComponents();
      expect(components.find((c) => c.id.startsWith('temp'))).toBeUndefined();
      expect(findId(components, 'azure_infrastructure')).toBeUndefined();
      expect(findId(components, 'frontend')).toBeDefined();
      expect(findId(components, 'experimental.new_feature')).toBeDefined();
    });
  });

  describe('Relationship filtering', () => {
    it('should filter relationships involving excluded components', async () => {
      await setupExclusion(['azure_infrastructure']);
      const relationships = adapter.extractRelationships();
      const azureRels = relationships.filter(
        (r) =>
          r.source.startsWith('azure_infrastructure') || r.target.startsWith('azure_infrastructure')
      );
      expect(azureRels).toHaveLength(0);
      expect(
        relationships.find((r) => r.source === 'frontend' && r.target === 'api_gateway')
      ).toBeDefined();
    });

    it('should filter relationships by tag exclusion', async () => {
      await setupExclusion([], ['experimental']);
      const relationships = adapter.extractRelationships();
      expect(relationships.filter((r) => r.source.startsWith('experimental'))).toHaveLength(0);
    });
  });

  describe('No exclusions', () => {
    it('should include all components when no exclusions are configured', () => {
      expect(adapter.extractComponents()).toHaveLength(9);
    });
  });
});
