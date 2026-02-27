interface MockLikeC4Element {
  id: string;
  title?: string;
  description?: string;
  kind: string;
  tags?: string[];
  links?: (string | { url: string; title?: string })[];
  technology?: string;
}

interface MockLikeC4Relationship {
  source: string | { id: string };
  target: string | { id: string };
  title?: string;
  kind?: string;
}

export interface MockLikeC4Model {
  elements(): Iterable<MockLikeC4Element>;
  relationships(): Iterable<MockLikeC4Relationship>;
}

const mockElements: MockLikeC4Element[] = [
  {
    id: 'frontend',
    title: 'Web Frontend',
    kind: 'webApp',
    tags: ['ui'],
    links: ['https://github.com/example/frontend'],
    technology: 'React',
  },
  {
    id: 'api_gateway',
    title: 'API Gateway',
    kind: 'service',
    tags: ['backend'],
    links: ['https://github.com/example/api-gateway'],
    technology: 'Node.js',
  },
  {
    id: 'user_service',
    title: 'User Service',
    kind: 'service',
    tags: ['backend', 'microservice'],
    links: ['https://github.com/example/user-service'],
    technology: 'Java',
  },
  {
    id: 'product_service',
    title: 'Product Service',
    kind: 'service',
    tags: ['backend', 'microservice'],
    links: ['https://github.com/example/product-service'],
    technology: 'Python',
  },
  {
    id: 'database',
    title: 'PostgreSQL Database',
    kind: 'database',
    tags: ['storage'],
    technology: 'PostgreSQL',
  },
  {
    id: 'azure_infrastructure',
    title: 'Azure Infrastructure',
    kind: 'system',
    tags: ['infrastructure'],
    description: 'Shared Azure infrastructure',
  },
  {
    id: 'azure_infrastructure.vnet',
    title: 'Virtual Network',
    kind: 'service',
    tags: ['infrastructure', 'networking'],
  },
  {
    id: 'experimental.new_feature',
    title: 'Experimental Feature',
    kind: 'service',
    tags: ['experimental'],
  },
  {
    id: 'temp.test_service',
    title: 'Temporary Test Service',
    kind: 'service',
    tags: ['temp'],
  },
];

const mockRelationships: MockLikeC4Relationship[] = [
  {
    source: { id: 'frontend' },
    target: { id: 'api_gateway' },
    title: 'makes requests',
    kind: 'https',
  },
  {
    source: { id: 'api_gateway' },
    target: { id: 'user_service' },
    title: 'routes user requests',
    kind: 'https',
  },
  {
    source: { id: 'api_gateway' },
    target: { id: 'product_service' },
    title: 'routes product requests',
    kind: 'https',
  },
  {
    source: { id: 'user_service' },
    target: { id: 'database' },
    title: 'stores user data',
    kind: 'database',
  },
  {
    source: { id: 'product_service' },
    target: { id: 'database' },
    title: 'stores product data',
    kind: 'database',
  },
  {
    source: { id: 'api_gateway' },
    target: { id: 'azure_infrastructure.vnet' },
    title: 'deployed in',
    kind: 'deployment',
  },
  {
    source: { id: 'experimental.new_feature' },
    target: { id: 'database' },
    title: 'test connection',
    kind: 'database',
  },
];

export const createMockModel = (): MockLikeC4Model => ({
  elements: () => mockElements,
  relationships: () => mockRelationships,
});
