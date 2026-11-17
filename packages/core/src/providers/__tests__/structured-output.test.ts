import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  createStructuredOutputSpec,
  stripNullProperties,
  toStrictJsonSchema,
} from '../structured-output.js';
import { DriftAnalysisResponseSchema } from '../../schemas/drift-analysis.schema.js';
import { DependencyExtractionResultSchema } from '../../schemas/dependency-extraction.schema.js';

type Schema = Record<string, unknown>;

function collectKeys(node: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    node.forEach((item) => collectKeys(item, keys));
  } else if (typeof node === 'object' && node !== null) {
    for (const [key, value] of Object.entries(node)) {
      keys.add(key);
      collectKeys(value, keys);
    }
  }
  return keys;
}

function unwrapNullable(schema: Schema): Schema {
  const variants = schema['anyOf'] as Schema[] | undefined;
  return variants?.find((variant) => variant['type'] !== 'null') ?? schema;
}

function prop(schema: Schema, ...path: string[]): Schema {
  return path.reduce<Schema>((node, key) => {
    const next = key === '[]' ? node['items'] : (node['properties'] as Schema)[key];
    return unwrapNullable(next as Schema);
  }, schema);
}

describe('createStructuredOutputSpec', () => {
  const drift = createStructuredOutputSpec('drift_analysis', 'd', DriftAnalysisResponseSchema);

  it('drops keywords that Zod enforces after the call', () => {
    const keys = collectKeys(drift.jsonSchema);
    const dropped = ['$schema', 'pattern', 'maxLength', 'maxItems', 'allOf', '$ref'];
    for (const keyword of [...dropped, 'minimum', 'maximum', 'multipleOf']) {
      expect(keys.has(keyword)).toBe(false);
    }
  });

  it('closes every object and keeps enums and required fields', () => {
    expect(drift.jsonSchema['additionalProperties']).toBe(false);
    expect(prop(drift.jsonSchema, 'violations', '[]')['additionalProperties']).toBe(false);
    expect(prop(drift.jsonSchema, 'violations', '[]', 'severity')['enum']).toEqual([
      'high',
      'medium',
      'low',
    ]);
    expect(drift.jsonSchema['required']).toEqual(expect.arrayContaining(['violations', 'summary']));
  });

  it('drops numeric constraints', () => {
    const spec = createStructuredOutputSpec(
      'n',
      'n',
      z.object({ count: z.int().min(1).max(9), ratio: z.number().multipleOf(0.5) })
    );
    expect(spec.jsonSchema['properties']).toEqual({
      count: { type: 'integer' },
      ratio: { type: 'number' },
    });
  });

  it('describes the input side of schemas with transforms', () => {
    const schema = z
      .object({ items: z.array(z.string()), flag: z.boolean().optional() })
      .transform((v) => ({ ...v, flag: v.flag ?? v.items.length > 0 }));
    const spec = createStructuredOutputSpec('t', 't', schema);
    expect(spec.jsonSchema['required']).toEqual(['items']);
  });
});

describe('createStructuredOutputSpec with unsupported Zod types', () => {
  it('throws at creation instead of emitting an untyped schema', () => {
    expect(() => createStructuredOutputSpec('d', 'd', z.object({ when: z.date() }))).toThrow();
  });

  it('still converts the stage schemas without untyped subschemas', () => {
    const specs = [
      createStructuredOutputSpec('s', 's', DriftAnalysisResponseSchema),
      createStructuredOutputSpec('s', 's', DependencyExtractionResultSchema),
    ];
    for (const spec of specs) {
      expect(JSON.stringify(spec.jsonSchema)).not.toContain('{}');
    }
  });
});

describe('generic subschema recursion', () => {
  const nested = {
    type: 'object',
    properties: {
      a: {
        oneOf: [{ type: 'object', properties: { x: { type: 'string', pattern: '^a' } } }],
      },
      b: {
        type: 'array',
        prefixItems: [{ type: 'object', properties: { y: { type: 'string' } } }],
      },
    },
    $defs: { d: { type: 'object', properties: { z: { type: 'number', minimum: 1 } } } },
    not: { type: 'object', properties: { n: { type: 'string', maxLength: 3 } } },
  };

  it('sanitises tuple and exclusive-union subschemas in the portable schema', () => {
    const spec = createStructuredOutputSpec(
      'n',
      'n',
      z.object({
        tuple: z.tuple([z.object({ x: z.string().max(3).regex(/a/) })]),
        either: z.xor([z.object({ y: z.string().min(1) }), z.object({ n: z.number().max(4) })]),
      })
    );
    const keys = collectKeys(spec.jsonSchema);
    expect(keys.has('prefixItems')).toBe(true);
    expect(keys.has('oneOf')).toBe(true);
    for (const dropped of ['maxLength', 'pattern', 'minLength', 'maximum']) {
      expect(keys.has(dropped)).toBe(false);
    }
    const tuple = prop(spec.jsonSchema, 'tuple');
    expect(JSON.stringify(tuple['prefixItems'])).toContain('"additionalProperties":false');
  });

  it('applies strict rules inside oneOf, prefixItems, $defs and not', () => {
    const strict = toStrictJsonSchema(nested);
    const at = (node: unknown, key: string, index?: number | string): Schema => {
      const child = (node as Schema)[key];
      const value = index === undefined ? child : (child as Record<string, unknown>)[index];
      return value as Schema;
    };
    const variant = at(unwrapNullable(prop(strict, 'a')), 'oneOf', 0);
    expect(variant['required']).toEqual(['x']);
    expect(variant['additionalProperties']).toBe(false);
    const tuple = at(unwrapNullable(prop(strict, 'b')), 'prefixItems', 0);
    expect(tuple['required']).toEqual(['y']);
    expect(at(strict, '$defs', 'd')['additionalProperties']).toBe(false);
    expect(at(strict, 'not')['required']).toEqual(['n']);
  });
});

describe('toStrictJsonSchema', () => {
  const strict = toStrictJsonSchema(
    createStructuredOutputSpec('drift_analysis', 'd', DriftAnalysisResponseSchema).jsonSchema
  );

  it('requires every property on every object', () => {
    const violation = prop(strict, 'violations', '[]');
    expect(violation['required']).toEqual(Object.keys(violation['properties'] as Schema));
    const relationship = prop(strict, 'modelUpdates', 'relationships', '[]');
    expect(relationship['required']).toEqual(Object.keys(relationship['properties'] as Schema));
    expect(relationship['additionalProperties']).toBe(false);
  });

  it('makes optional properties nullable and leaves required ones alone', () => {
    expect(prop(strict, 'violations', '[]', 'suggestion')['type']).toEqual(['string', 'null']);
    expect(prop(strict, 'violations', '[]', 'file')['type']).toEqual(['string', 'null']);
    expect(prop(strict, 'violations', '[]', 'description')['type']).toBe('string');
  });

  it('uses anyOf with null for optional objects and arrays', () => {
    const properties = strict['properties'] as Record<string, Schema>;
    expect(properties['modelUpdates']?.['anyOf']).toEqual([
      expect.objectContaining({ type: 'object' }),
      { type: 'null' },
    ]);
    expect(properties['improvements']?.['anyOf']).toEqual([
      { type: 'array', items: { type: 'string' } },
      { type: 'null' },
    ]);
  });

  it('adds null to the enum of an optional primitive enum', () => {
    const result = toStrictJsonSchema({
      type: 'object',
      properties: { level: { type: 'string', enum: ['a', 'b'] } },
    });
    expect(prop(result, 'level')).toEqual({ type: ['string', 'null'], enum: ['a', 'b', null] });
  });

  it('wraps schemas without a type in anyOf with null', () => {
    const result = toStrictJsonSchema({
      type: 'object',
      properties: { value: { enum: ['a', 'b'] } },
    });
    expect((result['properties'] as Schema)['value']).toEqual({
      anyOf: [{ enum: ['a', 'b'] }, { type: 'null' }],
    });
  });
});

describe('stripNullProperties', () => {
  it('removes null object properties at any depth and keeps array elements', () => {
    expect(
      stripNullProperties({ a: null, b: [{ c: null, d: 1 }], e: { f: null, g: 'x' }, h: [null] })
    ).toEqual({ b: [{ d: 1 }], e: { g: 'x' }, h: [null] });
  });

  it('lets a strict-mode response with null optionals pass the Zod schemas', () => {
    const response = {
      hasViolations: false,
      violations: [
        {
          severity: 'low',
          description: 'x',
          file: null,
          line: null,
          suggestion: null,
          commit: null,
        },
      ],
      improvements: null,
      warnings: null,
      modelUpdates: null,
      summary: 'ok',
    };
    expect(DriftAnalysisResponseSchema.safeParse(response).success).toBe(false);
    expect(DriftAnalysisResponseSchema.safeParse(stripNullProperties(response)).success).toBe(true);
    expect(
      DependencyExtractionResultSchema.safeParse(
        stripNullProperties({ dependencies: [], summary: 'none' })
      ).success
    ).toBe(true);
  });
});
