import type { StructurizrWorkspace } from '../../structurizr-types.js';

export function createMockWorkspace(): StructurizrWorkspace {
  return {
    name: 'Test Architecture',
    model: {
      softwareSystems: [
        {
          ...dslElement('frontend'),
          name: 'Web Frontend',
          technology: 'React',
          tags: 'ui',
          url: 'https://github.com/example/frontend',
        },
        {
          ...dslElement('api_gateway'),
          name: 'API Gateway',
          technology: 'Node.js',
          tags: 'backend',
          url: 'https://github.com/example/api-gateway',
          relationships: [
            {
              sourceId: 'api_gateway',
              destinationId: 'user_service',
              description: 'routes user requests',
              technology: 'https',
            },
            {
              sourceId: 'api_gateway',
              destinationId: 'product_service',
              description: 'routes product requests',
              technology: 'https',
            },
          ],
        },
        {
          ...dslElement('user_service'),
          name: 'User Service',
          technology: 'Java',
          tags: 'backend,microservice',
          url: 'https://github.com/example/user-service',
          relationships: [
            {
              sourceId: 'user_service',
              destinationId: 'database',
              description: 'stores user data',
              technology: 'database',
            },
          ],
        },
        {
          ...dslElement('product_service'),
          name: 'Product Service',
          technology: 'Python',
          tags: 'backend,microservice',
          url: 'https://github.com/example/product-service',
          relationships: [
            {
              sourceId: 'product_service',
              destinationId: 'database',
              description: 'stores product data',
              technology: 'database',
            },
          ],
        },
        {
          ...dslElement('database'),
          name: 'PostgreSQL Database',
          technology: 'PostgreSQL',
          tags: 'storage',
        },
        {
          ...dslElement('azure_infrastructure'),
          name: 'Azure Infrastructure',
          description: 'Shared Azure infrastructure',
          tags: 'infrastructure',
          containers: [
            {
              ...dslElement('azure_infrastructure.vnet'),
              name: 'Virtual Network',
              tags: 'infrastructure,networking',
            },
          ],
        },
        {
          ...dslElement('experimental'),
          name: 'Experimental',
          tags: 'experimental',
          containers: [
            {
              ...dslElement('experimental.new_feature'),
              name: 'Experimental Feature',
              tags: 'experimental',
            },
          ],
        },
        {
          ...dslElement('temp'),
          name: 'Temporary',
          tags: 'temp',
          containers: [
            {
              ...dslElement('temp.test_service'),
              name: 'Temporary Test Service',
              tags: 'temp',
            },
          ],
        },
      ],
      relationships: [
        {
          sourceId: 'frontend',
          destinationId: 'api_gateway',
          description: 'makes requests',
          technology: 'https',
        },
        {
          sourceId: 'api_gateway',
          destinationId: 'azure_infrastructure.vnet',
          description: 'deployed in',
          technology: 'deployment',
        },
        {
          sourceId: 'experimental.new_feature',
          destinationId: 'database',
          description: 'test connection',
          technology: 'database',
        },
      ],
    },
  };
}

/** JSON id and DSL identifier property, as a Structurizr DSL export carries them. */
export function dslElement(
  identifier: string,
  jsonId = identifier
): { id: string; properties: Record<string, string> } {
  return { id: jsonId, properties: { 'structurizr.dsl.identifier': identifier } };
}
