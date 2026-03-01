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

export const StructuredRelationshipSchema = z.object({
  source: z.string(),
  target: z.string(),
  kind: z.string().optional(),
  description: z.string(),
});

export const ModelChangeSchema = z.object({
  add: z.array(z.string()).optional(),
  remove: z.array(z.string()).optional(),
  notes: z.string().optional(),
  relationships: z.array(StructuredRelationshipSchema).optional(),
});
