/**
 * Splits a unified git diff into per-file sections and resolves the path each
 * section belongs to. The header `diff --git <src> <dst>` is ambiguous when a
 * path contains ` b/`, and its prefixes depend on `diff.noprefix` and
 * `diff.mnemonicPrefix`, so the resolver prefers unambiguous lines and only
 * falls back to splitting the header.
 */

export interface DiffSection {
  /** Path of the file after the change, or undefined when it cannot be resolved. */
  path: string | undefined;
  text: string;
}

const COMBINED_STARTS = ['diff --cc ', 'diff --combined ', '* Unmerged path '];
const SECTION_STARTS = ['diff --git ', ...COMBINED_STARTS];

// Default, mnemonic (index/worktree/commit/object), --no-index, and no-prefix.
const PREFIX_PAIRS: readonly (readonly [string, string])[] = [
  ['a/', 'b/'],
  ['i/', 'w/'],
  ['c/', 'w/'],
  ['c/', 'i/'],
  ['o/', 'w/'],
  ['1/', '2/'],
  ['', ''],
];

const SRC_PREFIXES = PREFIX_PAIRS.map(([src]) => src);
const DST_PREFIXES = PREFIX_PAIRS.map(([, dst]) => dst);

const C_ESCAPES: Record<string, number> = {
  a: 7,
  b: 8,
  t: 9,
  n: 10,
  v: 11,
  f: 12,
  r: 13,
  '"': 34,
  '\\': 92,
};

const utf8 = new TextEncoder();

/**
 * Decode a path that git quoted C-style (`"caf\303\251.ts"`); other input is
 * returned as is. Octal escapes are raw bytes and literal characters (left
 * unescaped with `core.quotePath=false`) are UTF-8, so both go into one byte
 * buffer that is decoded once.
 */
export function unquoteGitPath(value: string): string {
  if (value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) return value;
  const body = value.slice(1, -1);
  const bytes: number[] = [];
  for (let i = 0; i < body.length; i++) {
    const ch = String.fromCodePoint(body.codePointAt(i) ?? 0);
    if (ch !== '\\') {
      bytes.push(...utf8.encode(ch));
      i += ch.length - 1;
      continue;
    }
    const next = body.charAt(i + 1);
    const octal = /^[0-7]{3}/.exec(body.slice(i + 1));
    if (octal) {
      bytes.push(parseInt(octal[0], 8));
      i += 3;
    } else {
      bytes.push(C_ESCAPES[next] ?? next.charCodeAt(0));
      i += 1;
    }
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}

function stripPrefix(path: string, prefixes: readonly string[]): string {
  const prefix = prefixes.find((p) => p && path.startsWith(p));
  return prefix ? path.slice(prefix.length) : path;
}

/** Resolve `<src><path> <dst><path>` by length, which is exact even when the path contains spaces. */
function symmetricHeaderPath(rest: string): string | undefined {
  for (const [src, dst] of PREFIX_PAIRS) {
    const doubled = rest.length - 1 - src.length - dst.length;
    if (doubled < 2 || doubled % 2 !== 0) continue;
    const path = rest.slice(src.length, src.length + doubled / 2);
    if (rest === `${src}${path} ${dst}${path}`) return path;
  }
  return undefined;
}

/**
 * Resolve a header whose first token is C-quoted, e.g. `"a/caf\303\251.ts" "b/caf\303\251.ts"`
 * or, without prefixes, `"caf\303\251.ts" "caf\303\251.ts"`. Both tokens are
 * decoded before the prefixes are matched.
 */
function quotedHeaderPath(rest: string): string | undefined {
  if (!rest.startsWith('"')) return undefined;
  let end = 1;
  while (end < rest.length && rest[end] !== '"') end += rest[end] === '\\' ? 2 : 1;
  const second = rest.slice(end + 2);
  if (!second) return undefined;
  const srcPath = unquoteGitPath(rest.slice(0, end + 1));
  const dstPath = unquoteGitPath(second);
  for (const [src, dst] of PREFIX_PAIRS) {
    if (!srcPath.startsWith(src) || !dstPath.startsWith(dst)) continue;
    const path = dstPath.slice(dst.length);
    if (path && srcPath.slice(src.length) === path) return path;
  }
  return stripPrefix(dstPath, DST_PREFIXES);
}

function fileLinePath(lines: string[], marker: '+++ ' | '--- '): string | undefined {
  const line = lines.find((l) => l.startsWith(marker));
  if (!line) return undefined;
  const raw = line.slice(marker.length).replace(/\t$/, '');
  if (raw === '/dev/null') return undefined;
  return stripPrefix(unquoteGitPath(raw), marker === '+++ ' ? DST_PREFIXES : SRC_PREFIXES);
}

function resolveSectionPath(lines: string[]): string | undefined {
  const header = lines[0] ?? '';
  for (const start of COMBINED_STARTS) {
    if (header.startsWith(start)) return unquoteGitPath(header.slice(start.length));
  }
  if (!header.startsWith('diff --git ')) return undefined;

  // Extended headers come before the first hunk; a content line cannot start with these.
  const firstHunk = lines.findIndex((l) => l.startsWith('@@'));
  const meta = firstHunk === -1 ? lines : lines.slice(0, firstHunk);
  const renamed = meta.find((l) => l.startsWith('rename to ') || l.startsWith('copy to '));
  if (renamed) return unquoteGitPath(renamed.slice(renamed.indexOf(' to ') + 4));

  const rest = header.slice('diff --git '.length);
  // A quoted header must be decoded before its prefixes are matched.
  const path =
    quotedHeaderPath(rest) ??
    symmetricHeaderPath(rest) ??
    fileLinePath(meta, '+++ ') ??
    fileLinePath(meta, '--- ');
  if (path) return path;

  const bIdx = rest.lastIndexOf(' b/');
  return bIdx === -1 ? undefined : rest.slice(bIdx + 3);
}

/** Split a unified diff into sections, one per `diff --git` (or combined/unmerged) header. */
export function splitDiffSections(diff: string): DiffSection[] {
  const sections: string[][] = [];
  let current: string[] | undefined;
  for (const line of diff.split('\n')) {
    if (SECTION_STARTS.some((s) => line.startsWith(s))) {
      current = [line];
      sections.push(current);
    } else if (current) {
      current.push(line);
    }
  }
  return sections.map((lines) => ({
    path: resolveSectionPath(lines),
    text: lines.join('\n') + '\n',
  }));
}
