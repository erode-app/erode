import { z } from 'zod';

const DependencyChangeEntrySchema = z.object({
  type: z.enum(['added', 'modified', 'removed']),
  file: z.string(),
  dependency: z.string(),
  description: z.string(),
  code: z.string(),
});

export const DependencyExtractionResultSchema = z.object({
  dependencies: z.array(DependencyChangeEntrySchema),
  summary: z.string(),
});

export type DependencyExtractionResult = z.infer<typeof DependencyExtractionResultSchema>;
