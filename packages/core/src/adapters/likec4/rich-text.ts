import { LikeC4RichTextSchema } from '../../schemas/likec4.schema.js';

/**
 * Normalise a LikeC4 description (plain string or RichText object) to single-line text.
 * Whitespace is collapsed so multi-line descriptions do not break list formatting in prompts.
 */
export function richTextToString(value: unknown): string | undefined {
  let text: string | undefined;
  if (typeof value === 'string') {
    text = value;
  } else {
    const parsed = LikeC4RichTextSchema.safeParse(value);
    const source = parsed.success ? parsed.data.$source : undefined;
    text = source?.txt ?? source?.md;
  }
  const normalised = text?.replace(/\s+/g, ' ').trim();
  return normalised === '' ? undefined : normalised;
}
