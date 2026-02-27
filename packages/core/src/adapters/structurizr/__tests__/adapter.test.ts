import { describe, it, expect, beforeEach } from 'vitest';
import { StructurizrAdapter } from '../adapter.js';
import { AdapterError, ErrorCode } from '../../../errors.js';
import type { ArchitecturalComponent } from '../../architecture-types.js';
import type { StructurizrWorkspace } from '../structurizr-types.js';
import { createMockWorkspace } from './fixtures/mock-workspace.js';

export class TestStructurizrAdapter extends StructurizrAdapter {
  public setMockWorkspace(workspace: StructurizrWorkspace): void {
    this.workspace = workspace;

    const adapter = this as unknown as {
      identifierMap: Map<string, string>;
      buildIdentifierMap(): Map<string, string>;
      componentIndex: unknown;
      relationships: unknown;
    };
    adapter.identifierMap = adapter.buildIdentifierMap();

    const components = this.extractComponents();
    const relationships = this.extractRelationships();
    adapter.relationships = relationships;
    adapter.componentIndex = this.buildComponentIndex(components);
  }

  public override extractComponents(): ArchitecturalComponent[] {
    return super.extractComponents();
  }

  public override extractRelationships() {
    return super.extractRelationships();
  }

  public override buildComponentIndex(components: ArchitecturalComponent[]) {
    return super.buildComponentIndex(components);
  }
}

describe('StructurizrAdapter', () => {
  let adapter: TestStructurizrAdapter;

  beforeEach(() => {
    adapter = new TestStructurizrAdapter();
    adapter.setMockWorkspace(createMockWorkspace());
  });

  describe('Component extraction', () => {
    it('should extract all components correctly', () => {
      const components = adapter.extractComponents();

      // 8 softwareSystems + 3 containers = 11 total
      expect(components).toHaveLength(11);

      const frontend = components.find((c) => c.id === 'frontend');
      expect(frontend).toBeDefined();
      expect(frontend?.name).toBe('Web Frontend');
      expect(frontend?.repository).toBe('https://github.com/example/frontend');
      expect(frontend?.tags).toEqual(['ui']);
    });

    it('should extract technology information from components', () => {
      const components = adapter.extractComponents();

      expect(components.find((c) => c.id === 'frontend')?.technology).toBe('React');
      expect(components.find((c) => c.id === 'api_gateway')?.technology).toBe('Node.js');
      expect(components.find((c) => c.id === 'user_service')?.technology).toBe('Java');
      expect(components.find((c) => c.id === 'product_service')?.technology).toBe('Python');
      expect(components.find((c) => c.id === 'database')?.technology).toBe('PostgreSQL');
    });

    it('should handle components without technology', () => {
      const components = adapter.extractComponents();
      const azureInfra = components.find((c) => c.id === 'azure_infrastructure');

      expect(azureInfra).toBeDefined();
      expect(azureInfra?.technology).toBeUndefined();
    });

    it('should extract descriptions from components', () => {
      const components = adapter.extractComponents();
      const azureInfra = components.find((c) => c.id === 'azure_infrastructure');

      expect(azureInfra?.description).toBe('Shared Azure infrastructure');
    });

    it('should handle components without repository links', () => {
      const components = adapter.extractComponents();
      const database = components.find((c) => c.id === 'database');

      expect(database).toBeDefined();
      expect(database?.repository).toBeUndefined();
    });

    it('should extract nested components with dotted IDs', () => {
      const components = adapter.extractComponents();

      expect(components.find((c) => c.id === 'azure_infrastructure.vnet')?.name).toBe(
        'Virtual Network'
      );
      expect(components.find((c) => c.id === 'experimental.new_feature')?.name).toBe(
        'Experimental Feature'
      );
      expect(components.find((c) => c.id === 'temp.test_service')?.name).toBe(
        'Temporary Test Service'
      );
    });
  });

  describe('Tag parsing', () => {
    it('should parse comma-separated tags into an array', () => {
      const components = adapter.extractComponents();
      const userService = components.find((c) => c.id === 'user_service');

      expect(userService?.tags).toEqual(['backend', 'microservice']);
    });

    it('should parse single tags correctly', () => {
      const components = adapter.extractComponents();
      const frontend = components.find((c) => c.id === 'frontend');

      expect(frontend?.tags).toEqual(['ui']);
    });

    it('should parse multi-tag nested components', () => {
      const components = adapter.extractComponents();
      const vnet = components.find((c) => c.id === 'azure_infrastructure.vnet');

      expect(vnet?.tags).toEqual(['infrastructure', 'networking']);
    });
  });

  describe('Repository URL extraction', () => {
    it('should extract GitHub URLs from element url property', () => {
      const components = adapter.extractComponents();
      const frontend = components.find((c) => c.id === 'frontend');

      expect(frontend?.repository).toBe('https://github.com/example/frontend');
    });

    it('should normalize GitHub repository URLs with .git suffix', () => {
      const workspace: StructurizrWorkspace = {
        name: 'Test',
        model: {
          softwareSystems: [{ id: 'svc', name: 'Service', url: 'https://github.com/org/repo.git' }],
        },
      };
      adapter.setMockWorkspace(workspace);
      expect(adapter.findComponentById('svc')?.repository).toBe('https://github.com/org/repo');
    });

    it('should not extract non-GitHub URLs as repository', () => {
      const workspace: StructurizrWorkspace = {
        name: 'Test',
        model: {
          softwareSystems: [{ id: 'svc', name: 'Service', url: 'https://example.com/not-github' }],
        },
      };
      adapter.setMockWorkspace(workspace);
      expect(adapter.findComponentById('svc')?.repository).toBeUndefined();
    });
  });

  describe('Relationship extraction', () => {
    it('should extract all relationships', () => {
      const relationships = adapter.extractRelationships();

      expect(relationships).toHaveLength(7);
      relationships.forEach((rel) => {
        expect(typeof rel.source).toBe('string');
        expect(typeof rel.target).toBe('string');
      });
    });

    it('should extract model-level relationships', () => {
      const relationships = adapter.extractRelationships();
      const frontendToGateway = relationships.find(
        (r) => r.source === 'frontend' && r.target === 'api_gateway'
      );

      expect(frontendToGateway).toBeDefined();
      expect(frontendToGateway?.title).toBe('makes requests');
      expect(frontendToGateway?.kind).toBe('https');
    });

    it('should extract element-level relationships', () => {
      const relationships = adapter.extractRelationships();
      const gatewayToUser = relationships.find(
        (r) => r.source === 'api_gateway' && r.target === 'user_service'
      );

      expect(gatewayToUser).toBeDefined();
      expect(gatewayToUser?.title).toBe('routes user requests');
      expect(gatewayToUser?.kind).toBe('https');
    });

    it('should map description to title and technology to kind', () => {
      const relationships = adapter.extractRelationships();
      const userToDb = relationships.find(
        (r) => r.source === 'user_service' && r.target === 'database'
      );

      expect(userToDb?.title).toBe('stores user data');
      expect(userToDb?.kind).toBe('database');
    });

    it('should extract relationships involving nested elements', () => {
      const relationships = adapter.extractRelationships();

      const gatewayToVnet = relationships.find(
        (r) => r.source === 'api_gateway' && r.target === 'azure_infrastructure.vnet'
      );
      expect(gatewayToVnet?.title).toBe('deployed in');

      const featureToDb = relationships.find(
        (r) => r.source === 'experimental.new_feature' && r.target === 'database'
      );
      expect(featureToDb).toBeDefined();
    });
  });

  describe('Relationship deduplication', () => {
    it('should deduplicate identical relationships', () => {
      const workspace: StructurizrWorkspace = {
        name: 'Test',
        model: {
          softwareSystems: [
            {
              id: 'a',
              name: 'Service A',
              relationships: [
                { sourceId: 'a', destinationId: 'b', description: 'calls', technology: 'https' },
              ],
            },
            { id: 'b', name: 'Service B' },
          ],
          relationships: [
            { sourceId: 'a', destinationId: 'b', description: 'calls', technology: 'https' },
          ],
        },
      };
      adapter.setMockWorkspace(workspace);
      const aToB = adapter
        .extractRelationships()
        .filter((r) => r.source === 'a' && r.target === 'b');

      expect(aToB).toHaveLength(1);
    });

    it('should keep relationships with different kinds as distinct', () => {
      const workspace: StructurizrWorkspace = {
        name: 'Test',
        model: {
          softwareSystems: [
            {
              id: 'a',
              name: 'Service A',
              relationships: [
                { sourceId: 'a', destinationId: 'b', description: 'calls', technology: 'https' },
                { sourceId: 'a', destinationId: 'b', description: 'calls', technology: 'grpc' },
              ],
            },
            { id: 'b', name: 'Service B' },
          ],
        },
      };
      adapter.setMockWorkspace(workspace);
      const aToB = adapter
        .extractRelationships()
        .filter((r) => r.source === 'a' && r.target === 'b');

      expect(aToB).toHaveLength(2);
    });
  });

  describe('Component dependencies', () => {
    it('should find component dependencies correctly', () => {
      const deps = adapter.getComponentDependencies('api_gateway');

      expect(deps).toHaveLength(3);
      const ids = deps.map((d) => d.id);
      expect(ids).toContain('user_service');
      expect(ids).toContain('product_service');
      expect(ids).toContain('azure_infrastructure.vnet');
    });

    it('should find component dependents correctly', () => {
      const dependents = adapter.getComponentDependents('database');

      expect(dependents).toHaveLength(3);
      const ids = dependents.map((d) => d.id);
      expect(ids).toContain('user_service');
      expect(ids).toContain('product_service');
      expect(ids).toContain('experimental.new_feature');
    });

    it('should handle components with no dependents', () => {
      expect(adapter.getComponentDependents('frontend')).toHaveLength(0);
    });

    it('should handle components with one dependency', () => {
      const deps = adapter.getComponentDependencies('frontend');
      expect(deps).toHaveLength(1);
      expect(deps[0]?.id).toBe('api_gateway');
    });
  });

  describe('Repository-based lookup', () => {
    it('should find components by repository URL', () => {
      const component = adapter.findComponentByRepository(
        'https://github.com/example/user-service'
      );

      expect(component?.id).toBe('user_service');
      expect(component?.name).toBe('User Service');
    });

    it('should return undefined for non-existent repository', () => {
      expect(
        adapter.findComponentByRepository('https://github.com/example/nonexistent')
      ).toBeUndefined();
    });

    it('should handle URL normalization (trailing slash)', () => {
      expect(
        adapter.findComponentByRepository('https://github.com/example/user-service/')?.id
      ).toBe('user_service');
    });

    it('should handle URL normalization (.git suffix)', () => {
      expect(
        adapter.findComponentByRepository('https://github.com/example/user-service.git')?.id
      ).toBe('user_service');
    });

    it('should find all components sharing a repository', () => {
      const workspace: StructurizrWorkspace = {
        name: 'Test',
        model: {
          softwareSystems: [
            { id: 'svc_a', name: 'Service A', url: 'https://github.com/example/monorepo' },
            { id: 'svc_b', name: 'Service B', url: 'https://github.com/example/monorepo' },
            { id: 'svc_c', name: 'Service C', url: 'https://github.com/example/other' },
          ],
        },
      };
      adapter.setMockWorkspace(workspace);
      const components = adapter.findAllComponentsByRepository(
        'https://github.com/example/monorepo'
      );

      expect(components).toHaveLength(2);
      const ids = components.map((c) => c.id);
      expect(ids).toContain('svc_a');
      expect(ids).toContain('svc_b');
    });
  });

  describe('Allowed dependencies', () => {
    it('should correctly identify allowed dependencies', () => {
      expect(adapter.isAllowedDependency('frontend', 'api_gateway')).toBe(true);
      expect(adapter.isAllowedDependency('user_service', 'database')).toBe(true);
    });

    it('should correctly identify disallowed dependencies', () => {
      expect(adapter.isAllowedDependency('frontend', 'database')).toBe(false);
    });
  });
});

describe('StructurizrAdapter - Model not loaded guard', () => {
  it('should throw AdapterError with MODEL_NOT_INITIALIZED before load', () => {
    const unloadedAdapter = new StructurizrAdapter();

    expect(() => unloadedAdapter.getAllComponents()).toThrow(AdapterError);
    try {
      unloadedAdapter.getAllComponents();
    } catch (error) {
      const adapterError = error as AdapterError;
      expect(adapterError.code).toBe(ErrorCode.MODEL_NOT_INITIALIZED);
      expect(adapterError.adapterType).toBe('structurizr');
    }
  });

  it('should throw AdapterError for findComponentByRepository before load', () => {
    const unloadedAdapter = new StructurizrAdapter();
    expect(() =>
      unloadedAdapter.findComponentByRepository('https://github.com/example/repo')
    ).toThrow(AdapterError);
  });

  it('should throw AdapterError for getComponentDependencies before load', () => {
    expect(() => new StructurizrAdapter().getComponentDependencies('frontend')).toThrow(
      AdapterError
    );
  });

  it('should throw AdapterError for isAllowedDependency before load', () => {
    expect(() => new StructurizrAdapter().isAllowedDependency('frontend', 'database')).toThrow(
      AdapterError
    );
  });
});
