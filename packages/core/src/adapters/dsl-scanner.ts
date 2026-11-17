export interface ScanOptions {
  /** Characters that open a string; default `'` and `"` */
  quotes?: readonly string[];
  /** Treat a line whose first non-blank character is `#` as a comment (Structurizr) */
  hashComments?: boolean;
}

/**
 * Copy of `text` with the contents of strings and comments replaced by spaces.
 * Newlines and offsets are kept, so positions found in the result apply to `text`.
 * Handles quoted strings (backslash escapes, may span lines), triple-quoted strings,
 * `//` line comments and `/* *\/` block comments.
 */
export function maskStringsAndComments(text: string, options: ScanOptions = {}): string {
  const quotes = options.quotes ?? ["'", '"'];
  const out = text.split('');
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to && k < out.length; k++) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };
  const atHashComment = (at: number): boolean =>
    !!options.hashComments && text.slice(text.lastIndexOf('\n', at - 1) + 1, at).trim() === '';
  const lineEnd = (from: number): number => {
    const newline = text.indexOf('\n', from);
    return newline === -1 ? text.length : newline;
  };

  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    let end: number;
    if (quotes.includes(ch)) {
      const triple = ch.repeat(3);
      if (text.startsWith(triple, i)) {
        const close = text.indexOf(triple, i + 3);
        end = close === -1 ? text.length : close + 3;
      } else {
        end = i + 1;
        while (end < text.length && text[end] !== ch) {
          end += text[end] === '\\' ? 2 : 1;
        }
        end = Math.min(end + 1, text.length);
      }
    } else if ((ch === '/' && text[i + 1] === '/') || (ch === '#' && atHashComment(i))) {
      end = lineEnd(i);
    } else if (ch === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      end = close === -1 ? text.length : close + 2;
    } else {
      i++;
      continue;
    }
    blank(i, end);
    i = end;
  }
  return out.join('');
}

/** Offset of the `}` matching the `{` at `open` in masked text, or -1 if unbalanced. */
function matchingBrace(masked: string, open: number): number {
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === '{') depth++;
    else if (masked[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

export interface BlockSpan {
  /** Offset of the opening `{` */
  open: number;
  /** Offset of the matching `}` */
  close: number;
}

/**
 * Balanced `model { ... }` blocks, in file order. The keyword must start a line and the
 * `{` may follow on a later line, so `extend shop.datamodel {` is not a model block.
 */
export function findModelBlocks(text: string, options?: ScanOptions): BlockSpan[] {
  const masked = maskStringsAndComments(text, options);
  const blocks: BlockSpan[] = [];
  for (const match of masked.matchAll(/^[ \t]*model\s*\{/gm)) {
    const open = match.index + match[0].length - 1;
    const close = matchingBrace(masked, open);
    if (close !== -1) blocks.push({ open, close });
  }
  return blocks;
}

/** Counts `{` and `}` outside strings and comments. */
export function countBraces(text: string, options?: ScanOptions): { open: number; close: number } {
  const masked = maskStringsAndComments(text, options);
  let open = 0;
  let close = 0;
  for (const ch of masked) {
    if (ch === '{') open++;
    else if (ch === '}') close++;
  }
  return { open, close };
}
