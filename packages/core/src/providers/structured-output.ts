import { z } from 'zod';

type JsonSchema = Record<string, unknown>;

/** A JSON-returning stage: the Zod schema that validates it and the JSON Schema sent to the provider. */
export interface StructuredOutputSpec<T = unknown> {
  /** Provider-safe identifier (letters, digits, underscores, hyphens). */
  name: string;
  description: string;
  zodSchema: z.ZodType<T>;
  /** Portable subset of JSON Schema accepted by every provider. */
  jsonSchema: JsonSchema;
}

/**
 * Keywords Zod enforces after the call. Providers either reject them or support them
 * inconsistently (for example regex dialects), so they stay out of the request schema.
 */
const DROPPED_KEYWORDS = new Set([
  '$schema',
  'pattern',
  'format',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
]);

export function createStructuredOutputSpec<T>(
  name: string,
  description: string,
  zodSchema: z.ZodType<T>
): StructuredOutputSpec<T> {
  // Input side so a schema with defaults or transforms describes what the model must send.
  // 'throw' fails at spec creation on a Zod type with no JSON Schema form; 'any' would emit an
  // untyped `{}` that OpenAI strict mode rejects only on the first live call.
  const generated = z.toJSONSchema(zodSchema, { io: 'input', unrepresentable: 'throw' });
  return { name, description, zodSchema, jsonSchema: toPortableJsonSchema(generated) };
}

/** Keywords whose value is a map of name to subschema. */
const SCHEMA_MAP_KEYWORDS = ['properties', '$defs', 'definitions', 'patternProperties'] as const;
/** Keywords whose value is an array of subschemas. */
const SCHEMA_ARRAY_KEYWORDS = ['anyOf', 'oneOf', 'allOf', 'prefixItems'] as const;
/** Keywords whose value is a single subschema (`items` may also be a tuple array). */
const SCHEMA_KEYWORDS = ['items', 'not', 'additionalProperties'] as const;

/**
 * Apply `transform` to every direct subschema of `node`. Recursing generically, rather than
 * for a hand-picked few keywords, keeps a nested `oneOf`, `$defs` or `prefixItems` from
 * skipping sanitising.
 */
function mapSubschemas(
  node: JsonSchema,
  transform: (schema: JsonSchema) => JsonSchema
): JsonSchema {
  const result: JsonSchema = { ...node };
  for (const key of SCHEMA_MAP_KEYWORDS) {
    const value = result[key];
    if (isRecord(value)) {
      result[key] = Object.fromEntries(
        Object.entries(value).map(([name, schema]) => [
          name,
          isRecord(schema) ? transform(schema) : schema,
        ])
      );
    }
  }
  for (const key of SCHEMA_ARRAY_KEYWORDS) {
    const value = result[key];
    if (Array.isArray(value)) {
      result[key] = (value as unknown[]).map((schema) =>
        isRecord(schema) ? transform(schema) : schema
      );
    }
  }
  for (const key of SCHEMA_KEYWORDS) {
    const value = result[key];
    if (isRecord(value)) {
      result[key] = transform(value);
    } else if (key === 'items' && Array.isArray(value)) {
      result[key] = (value as unknown[]).map((schema) =>
        isRecord(schema) ? transform(schema) : schema
      );
    }
  }
  return result;
}

function toPortableJsonSchema(node: unknown): JsonSchema {
  if (!isRecord(node)) {
    return {};
  }
  const kept = Object.fromEntries(
    Object.entries(node).filter(([key]) => !DROPPED_KEYWORDS.has(key))
  );
  const result = mapSubschemas(kept, toPortableJsonSchema);
  if (result['type'] === 'object') {
    result['additionalProperties'] = false;
  }
  return result;
}

/**
 * OpenAI strict mode requires every property in `required` and `additionalProperties: false`.
 * Optional properties become nullable instead; `stripNullProperties` undoes that before validation.
 */
export function toStrictJsonSchema(node: JsonSchema): JsonSchema {
  const result = mapSubschemas(node, toStrictJsonSchema);
  const properties = result['properties'];
  if (isRecord(properties)) {
    const required = new Set(
      Array.isArray(result['required']) ? (result['required'] as string[]) : []
    );
    result['properties'] = Object.fromEntries(
      Object.entries(properties).map(([prop, schema]) => {
        const strictSchema = isRecord(schema) ? schema : {};
        return [prop, required.has(prop) ? strictSchema : makeNullable(strictSchema)];
      })
    );
    result['required'] = Object.keys(properties);
    result['additionalProperties'] = false;
  }
  return result;
}

const PRIMITIVE_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'null']);

// OpenAI documents type arrays with null for primitives only; objects and arrays use anyOf.
function makeNullable(schema: JsonSchema): JsonSchema {
  const type = schema['type'];
  const types: unknown[] = Array.isArray(type) ? type : [type];
  if (types.includes('null')) {
    return schema;
  }
  if (types.every((t) => typeof t === 'string' && PRIMITIVE_TYPES.has(t))) {
    const nullable: JsonSchema = { ...schema, type: [...types, 'null'] };
    const values = schema['enum'];
    if (Array.isArray(values)) {
      nullable['enum'] = [...(values as unknown[]), null];
    }
    return nullable;
  }
  return { anyOf: [schema, { type: 'null' }] };
}

/**
 * Remove object properties whose value is null. Every nullable field in the response
 * schemas is also optional, so a null and an absent value mean the same thing, and
 * optional-but-not-nullable fields stop failing when a provider fills them with null.
 */
export function stripNullProperties(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripNullProperties(item));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => [k, stripNullProperties(v)])
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
