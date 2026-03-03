import { describe, it, expect } from 'vitest';
import {
  ModelChangeSchema,
  StructuredRelationshipSchema,
  NewComponentSchema,
} from '../common.schema.js';

describe('StructuredRelationshipSchema', () => {
  it('should validate a valid relationship', () => {
    const result = StructuredRelationshipSchema.safeParse({
      source: 'app.frontend',
      target: 'app.backend',
      description: 'Calls API',
    });
    expect(result.success).toBe(true);
  });

  it('should validate a relationship with kind', () => {
    const result = StructuredRelationshipSchema.safeParse({
      source: 'app.frontend',
      target: 'app.backend',
      kind: 'HTTP',
      description: 'REST calls',
    });
    expect(result.success).toBe(true);
  });

  it('should reject a relationship missing description', () => {
    const result = StructuredRelationshipSchema.safeParse({
      source: 'app.frontend',
      target: 'app.backend',
    });
    expect(result.success).toBe(false);
  });

  it('should reject a relationship missing source', () => {
    const result = StructuredRelationshipSchema.safeParse({
      target: 'app.backend',
      description: 'Calls API',
    });
    expect(result.success).toBe(false);
  });

  it('should reject a relationship missing target', () => {
    const result = StructuredRelationshipSchema.safeParse({
      source: 'app.frontend',
      description: 'Calls API',
    });
    expect(result.success).toBe(false);
  });

  it('should reject source with DSL injection characters', () => {
    const cases = [
      "app.frontend' -> evil 'pwned",
      'app{frontend}',
      'app[frontend]',
      'app\nfrontend',
    ];
    for (const source of cases) {
      const result = StructuredRelationshipSchema.safeParse({
        source,
        target: 'app.backend',
        description: 'test',
      });
      expect(result.success).toBe(false);
    }
  });

  it('should reject description with DSL delimiters', () => {
    const cases = ["Calls 'API'", 'Calls "API"', 'Uses {data}', 'Uses [index]'];
    for (const description of cases) {
      const result = StructuredRelationshipSchema.safeParse({
        source: 'app.frontend',
        target: 'app.backend',
        description,
      });
      expect(result.success).toBe(false);
    }
  });

  it('should reject description with newlines', () => {
    const result = StructuredRelationshipSchema.safeParse({
      source: 'app.frontend',
      target: 'app.backend',
      description: 'Line1\nLine2',
    });
    expect(result.success).toBe(false);
  });

  it('should reject kind with spaces', () => {
    const result = StructuredRelationshipSchema.safeParse({
      source: 'app.frontend',
      target: 'app.backend',
      kind: 'http request',
      description: 'REST calls',
    });
    expect(result.success).toBe(false);
  });

  it('should reject kind starting with a digit', () => {
    const result = StructuredRelationshipSchema.safeParse({
      source: 'app.frontend',
      target: 'app.backend',
      kind: '123http',
      description: 'REST calls',
    });
    expect(result.success).toBe(false);
  });

  it('should accept valid DSL identifier kinds on relationships', () => {
    const cases = ['HTTP', 'gRPC', 'async-event', 'message_queue'];
    for (const kind of cases) {
      const result = StructuredRelationshipSchema.safeParse({
        source: 'app.frontend',
        target: 'app.backend',
        kind,
        description: 'Calls',
      });
      expect(result.success).toBe(true);
    }
  });

  it('should reject description with angle brackets or pipes', () => {
    const cases = ['<script>alert(1)</script>', 'calls|breaks', 'uses <img>'];
    for (const description of cases) {
      const result = StructuredRelationshipSchema.safeParse({
        source: 'app.frontend',
        target: 'app.backend',
        description,
      });
      expect(result.success).toBe(false);
    }
  });

  it('should accept valid component IDs with dots, hyphens, underscores', () => {
    const result = StructuredRelationshipSchema.safeParse({
      source: 'app.front-end_v2',
      target: 'app.back-end_v3',
      description: 'Calls API via REST',
    });
    expect(result.success).toBe(true);
  });
});

describe('ModelChangeSchema with relationships', () => {
  it('should accept modelUpdates with relationships', () => {
    const result = ModelChangeSchema.safeParse({
      add: ['frontend -> backend'],
      relationships: [
        {
          source: 'app.frontend',
          target: 'app.backend',
          description: 'API calls',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('should accept modelUpdates without relationships (backward compat)', () => {
    const result = ModelChangeSchema.safeParse({
      add: ['frontend -> backend'],
      notes: 'Add dependency',
    });
    expect(result.success).toBe(true);
  });

  it('should accept empty relationships array', () => {
    const result = ModelChangeSchema.safeParse({
      relationships: [],
    });
    expect(result.success).toBe(true);
  });

  it('should reject relationships with invalid entries', () => {
    const result = ModelChangeSchema.safeParse({
      relationships: [{ source: 'a' }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject more than 50 relationships', () => {
    const relationships = Array.from({ length: 51 }, (_, i) => ({
      source: `comp.a${String(i)}`,
      target: `comp.b${String(i)}`,
      description: `Dep ${String(i)}`,
    }));
    const result = ModelChangeSchema.safeParse({ relationships });
    expect(result.success).toBe(false);
  });

  it('should accept modelUpdates with newComponents', () => {
    const result = ModelChangeSchema.safeParse({
      newComponents: [
        {
          id: 'order_service',
          kind: 'service',
          name: 'Order Service',
          description: 'Handles order processing',
          tags: ['backend', 'microservice'],
          technology: 'TypeScript',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('should accept newComponents with only required fields', () => {
    const result = ModelChangeSchema.safeParse({
      newComponents: [
        {
          id: 'order_service',
          kind: 'service',
          name: 'Order Service',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('should reject more than 10 newComponents', () => {
    const newComponents = Array.from({ length: 11 }, (_, i) => ({
      id: `comp_${String(i)}`,
      kind: 'service',
      name: `Component ${String(i)}`,
    }));
    const result = ModelChangeSchema.safeParse({ newComponents });
    expect(result.success).toBe(false);
  });
});

describe('NewComponentSchema', () => {
  it('should validate a component with all fields', () => {
    const result = NewComponentSchema.safeParse({
      id: 'order_service',
      kind: 'service',
      name: 'Order Service',
      description: 'Handles order processing',
      tags: ['backend', 'microservice'],
      technology: 'TypeScript',
    });
    expect(result.success).toBe(true);
  });

  it('should validate a component with only required fields', () => {
    const result = NewComponentSchema.safeParse({
      id: 'order_service',
      kind: 'service',
      name: 'Order Service',
    });
    expect(result.success).toBe(true);
  });

  it('should accept IDs with dots, hyphens, underscores', () => {
    const result = NewComponentSchema.safeParse({
      id: 'app.order-service_v2',
      kind: 'service',
      name: 'Order Service v2',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid ID format', () => {
    const cases = ['order service', "order'service", 'order{service}', 'order\nservice'];
    for (const id of cases) {
      const result = NewComponentSchema.safeParse({
        id,
        kind: 'service',
        name: 'Test',
      });
      expect(result.success).toBe(false);
    }
  });

  it('should reject DSL injection in name', () => {
    const cases = ["Order' { evil } '", 'Order {service}', 'Order [test]'];
    for (const name of cases) {
      const result = NewComponentSchema.safeParse({
        id: 'order_service',
        kind: 'service',
        name,
      });
      expect(result.success).toBe(false);
    }
  });

  it('should reject DSL injection in description', () => {
    const result = NewComponentSchema.safeParse({
      id: 'order_service',
      kind: 'service',
      name: 'Order Service',
      description: "Handles orders' { evil_code }",
    });
    expect(result.success).toBe(false);
  });

  it('should reject kind with spaces (DSL injection)', () => {
    const cases = ['service foo', 'service evil_token', 'micro service'];
    for (const kind of cases) {
      const result = NewComponentSchema.safeParse({
        id: 'order_service',
        kind,
        name: 'Order Service',
      });
      expect(result.success).toBe(false);
    }
  });

  it('should reject kind starting with a digit', () => {
    const result = NewComponentSchema.safeParse({
      id: 'order_service',
      kind: '123service',
      name: 'Order Service',
    });
    expect(result.success).toBe(false);
  });

  it('should reject kind with semicolons or special characters', () => {
    const cases = ['service;bar', 'kind{evil}', "kind'inject"];
    for (const kind of cases) {
      const result = NewComponentSchema.safeParse({
        id: 'order_service',
        kind,
        name: 'Order Service',
      });
      expect(result.success).toBe(false);
    }
  });

  it('should accept valid DSL identifier kinds', () => {
    const cases = ['service', 'microService', 'web-app', 'data_store', 'Service2'];
    for (const kind of cases) {
      const result = NewComponentSchema.safeParse({
        id: 'order_service',
        kind,
        name: 'Order Service',
      });
      expect(result.success).toBe(true);
    }
  });

  it('should reject name with angle brackets or pipes', () => {
    const cases = ['<script>alert(1)</script>', 'name|break', 'name<img>'];
    for (const name of cases) {
      const result = NewComponentSchema.safeParse({
        id: 'order_service',
        kind: 'service',
        name,
      });
      expect(result.success).toBe(false);
    }
  });

  it('should reject tags with special characters', () => {
    const result = NewComponentSchema.safeParse({
      id: 'order_service',
      kind: 'service',
      name: 'Order Service',
      tags: ['valid', 'has space'],
    });
    expect(result.success).toBe(false);
  });

  it('should reject more than 10 tags', () => {
    const tags = Array.from({ length: 11 }, (_, i) => `tag${String(i)}`);
    const result = NewComponentSchema.safeParse({
      id: 'order_service',
      kind: 'service',
      name: 'Order Service',
      tags,
    });
    expect(result.success).toBe(false);
  });
});
