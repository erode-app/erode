import { z } from 'zod';
import { DriftViolationBaseSchema, ModelPatchSchema } from './common.schema.js';

/**
 * PR violation extends base violation with commit tracking
 * Includes file/line invariant enforcement
 */
const DriftViolationSchema = DriftViolationBaseSchema.extend({
  commit: z.string().nullable(),
}).refine((data) => data.line === null || data.file !== null, {
  message: 'line cannot be set without file',
  path: ['line'],
});

/**
 * Partial response from Claude (without metadata, component, dependencyChanges)
 */
export const DriftAnalysisResponseSchema = z.object({
  hasViolations: z.boolean(),
  violations: z.array(DriftViolationSchema),
  improvements: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  summary: z.string(),
  modelUpdates: ModelPatchSchema.optional(),
});
