import { z } from 'zod';

export const LikeC4ElementSchema = z
  .object({
    id: z.string(),
    title: z.string().nullish(),
    description: z.unknown().optional(),
    kind: z.string(),
    tags: z.array(z.string()).nullish(),
    links: z
      .array(z.union([z.string(), z.object({ url: z.string(), title: z.string().optional() })]))
      .nullish(),
    technology: z.string().nullish(),
  })
  .loose();

export type LikeC4Element = z.infer<typeof LikeC4ElementSchema>;

export const LikeC4RelationshipSchema = z
  .object({
    source: z.union([z.string(), z.object({ id: z.string() })]),
    target: z.union([z.string(), z.object({ id: z.string() })]),
    title: z.string().nullish(),
    kind: z.string().nullish(),
  })
  .loose();

export type LikeC4Relationship = z.infer<typeof LikeC4RelationshipSchema>;
