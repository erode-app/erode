import { z } from 'zod';

const LikeC4RichTextSourceSchema = z.union([
  z.object({ txt: z.string() }),
  z.object({ md: z.string() }),
]);

type LikeC4RichTextInput =
  string | { $source?: { txt: string } | { md: string } | null } | null | undefined;

/**
 * Returns the plain text of a LikeC4 rich text value (`txt`, else `md`), or
 * undefined when empty. Accepts a plain string for older model shapes.
 */
export function normalizeLikeC4Text(value: LikeC4RichTextInput): string | undefined {
  if (value == null) return undefined;
  const text =
    typeof value === 'string'
      ? value
      : value.$source && 'txt' in value.$source
        ? value.$source.txt
        : value.$source?.md;
  const trimmed = text?.trim();
  return trimmed === '' ? undefined : trimmed;
}

// computedModel() exposes descriptions as RichText objects, not strings.
// Unknown shapes fall back to undefined so a LikeC4 change cannot block model loading.
const LikeC4RichTextSchema = z
  .union([z.string(), z.object({ $source: LikeC4RichTextSourceSchema.nullish() }).loose()])
  .nullish()
  .transform(normalizeLikeC4Text)
  .catch(undefined);

export const LikeC4ElementSchema = z
  .object({
    id: z.string(),
    title: z.string().nullish(),
    description: LikeC4RichTextSchema,
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

/** Loose shape of `LikeC4Diagnostic` from `LikeC4.getWarnings()` (SDK 1.61+) */
export const LikeC4DiagnosticSchema = z
  .object({
    message: z.string().optional(),
    sourceFsPath: z.string().optional(),
  })
  .loose();
