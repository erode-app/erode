import { z } from 'zod';

/**
 * Base violation schema used across different analysis types
 */
export const DriftViolationBaseSchema = z.object({
  severity: z.enum(['high', 'medium', 'low']),
  description: z.string(),
  file: z.string().nullable(),
  line: z.number().nullable(),
  suggestion: z.string().optional(),
});

/**
 * Model updates schema for recommended changes to LikeC4 models
 */
export const ModelPatchSchema = z.object({
  add: z.array(z.string()).optional(),
  remove: z.array(z.string()).optional(),
  notes: z.string().optional(),
});
