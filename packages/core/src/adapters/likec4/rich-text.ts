import { LikeC4RichTextSchema } from '../../schemas/likec4.schema.js';

/**
 * Normalise a LikeC4 description (plain string or RichText object) to single-line text.
 * Whitespace is collapsed so multi-line descriptions do not break list formatting in prompts.
 */
export function richTextToString(value: unknown): string | undefined {
  const parsed = LikeC4RichTextSchema.safeParse(value);
  const text = parsed.success ? parsed.data?.replace(/\s+/g, ' ').trim() : undefined;
  return text === '' ? undefined : text;
}
