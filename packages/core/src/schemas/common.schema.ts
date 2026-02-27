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

export const ModelChangeSchema = z.object({
  add: z.array(z.string()).optional(),
  remove: z.array(z.string()).optional(),
  notes: z.string().optional(),
});
