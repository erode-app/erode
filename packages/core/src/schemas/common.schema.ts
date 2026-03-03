import { z } from 'zod';

export const ViolationSchema = z
  .object({
    severity: z.enum(['high', 'medium', 'low']),
    description: z.string(),
    file: z.string().nullable().optional(),
    line: z.number().nullable().optional(),
    suggestion: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.line != null && data.file == null) {
      ctx.addIssue({
        code: 'custom',
        message: 'line requires file to be specified',
        path: ['line'],
      });
    }
  });

/** Only alphanumeric, dots, underscores, and hyphens (valid component IDs). */
const componentIdPattern = /^[a-zA-Z0-9._-]+$/;
/** Valid DSL identifier: starts with a letter, then alphanumeric, underscores, or hyphens. */
const dslIdentifierPattern = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
/** Single-line printable characters, no DSL delimiters (quotes, braces, brackets, angle brackets, pipes). */
const safeDslTextPattern = /^[^\n\r'"{}[\]`\\<>|]+$/;

export const StructuredRelationshipSchema = z.object({
  source: z.string().regex(componentIdPattern, 'Invalid component ID format'),
  target: z.string().regex(componentIdPattern, 'Invalid component ID format'),
  kind: z
    .string()
    .regex(dslIdentifierPattern, 'Kind must be a valid DSL identifier')
    .max(100)
    .optional(),
  description: z
    .string()
    .regex(safeDslTextPattern, 'Description contains invalid characters')
    .max(500),
});

export const NewComponentSchema = z.object({
  id: z.string().regex(componentIdPattern, 'Invalid component ID format'),
  kind: z.string().regex(dslIdentifierPattern, 'Kind must be a valid DSL identifier').max(50),
  name: z.string().regex(safeDslTextPattern, 'Name contains invalid characters').max(200),
  description: z
    .string()
    .regex(safeDslTextPattern, 'Description contains invalid characters')
    .max(500)
    .optional(),
  tags: z
    .array(
      z
        .string()
        .regex(/^[a-zA-Z0-9_-]+$/)
        .max(50)
    )
    .max(10)
    .optional(),
  technology: z
    .string()
    .regex(safeDslTextPattern, 'Technology contains invalid characters')
    .max(100)
    .optional(),
});

export const ModelChangeSchema = z.object({
  add: z.array(z.string()).optional(),
  remove: z.array(z.string()).optional(),
  notes: z.string().optional(),
  relationships: z.array(StructuredRelationshipSchema).max(50).optional(),
  newComponents: z.array(NewComponentSchema).max(10).optional(),
});
