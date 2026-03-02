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
/** Single-line printable characters, no DSL delimiters (quotes, braces, brackets). */
const safeDslTextPattern = /^[^\n\r'"{}[\]`\\]+$/;

export const StructuredRelationshipSchema = z.object({
  source: z.string().regex(componentIdPattern, 'Invalid component ID format'),
  target: z.string().regex(componentIdPattern, 'Invalid component ID format'),
  kind: z
    .string()
    .regex(safeDslTextPattern, 'Kind contains invalid characters')
    .max(100)
    .optional(),
  description: z
    .string()
    .regex(safeDslTextPattern, 'Description contains invalid characters')
    .max(500),
});

export const ModelChangeSchema = z.object({
  add: z.array(z.string()).optional(),
  remove: z.array(z.string()).optional(),
  notes: z.string().optional(),
  relationships: z.array(StructuredRelationshipSchema).max(50).optional(),
});
