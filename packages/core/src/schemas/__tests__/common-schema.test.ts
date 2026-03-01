import { describe, it, expect } from 'vitest';
import { ModelChangeSchema, StructuredRelationshipSchema } from '../common.schema.js';

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
});
