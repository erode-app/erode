import type { StructurizrWorkspace } from '../../structurizr-types.js';

export function createMockWorkspace(): StructurizrWorkspace {
  return {
    name: 'Test Architecture',
    model: {
      softwareSystems: [
        {
          id: 'frontend',
          name: 'Web Frontend',
          technology: 'React',
          tags: 'ui',
          url: 'https://github.com/example/frontend',
        },
        {
          id: 'api_gateway',
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
          id: 'user_service',
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
          id: 'product_service',
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
          id: 'database',
          name: 'PostgreSQL Database',
          technology: 'PostgreSQL',
          tags: 'storage',
        },
        {
          id: 'azure_infrastructure',
          name: 'Azure Infrastructure',
          description: 'Shared Azure infrastructure',
          tags: 'infrastructure',
          containers: [
            {
              id: 'vnet',
              name: 'Virtual Network',
              tags: 'infrastructure,networking',
            },
          ],
        },
        {
          id: 'experimental',
          name: 'Experimental',
          tags: 'experimental',
          containers: [
            {
              id: 'new_feature',
              name: 'Experimental Feature',
              tags: 'experimental',
            },
          ],
        },
        {
          id: 'temp',
          name: 'Temporary',
          tags: 'temp',
          containers: [
            {
              id: 'test_service',
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
