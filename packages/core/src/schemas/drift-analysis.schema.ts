import { z } from 'zod';
import { ViolationSchema, ModelChangeSchema } from './common.schema.js';

const CommitTrackingSchema = z.object({
  commit: z.string().nullable().optional(),
});

const DriftViolationSchema = z.intersection(ViolationSchema, CommitTrackingSchema);

export const DriftAnalysisResponseSchema = z
  .object({
    violations: z.array(DriftViolationSchema),
    improvements: z.array(z.string()).optional(),
    warnings: z.array(z.string()).optional(),
    summary: z.string(),
    modelUpdates: ModelChangeSchema.optional(),
  })
  .transform((response) => ({ ...response, hasViolations: response.violations.length > 0 }));
