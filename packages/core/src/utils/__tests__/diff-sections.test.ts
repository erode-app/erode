import { describe, it, expect } from 'vitest';
import { splitDiffSections, unquoteGitPath } from '../diff-sections.js';
import { filterDiffByFiles, parseFilesFromDiff } from '../git-diff.js';

function paths(diff: string): (string | undefined)[] {
  return splitDiffSections(diff).map((s) => s.path);
}

describe('unquoteGitPath', () => {
  it.each([
    ['plain/path.ts', 'plain/path.ts'],
    ['"src/caf\\303\\251.ts"', 'src/café.ts'],
    ['"a\\tb\\"c\\\\d.ts"', 'a\tb"c\\d.ts'],
  ])('decodes %s', (input, expected) => {
    expect(unquoteGitPath(input)).toBe(expected);
  });
});

describe('splitDiffSections', () => {
  it.each([
    ['default prefixes', 'diff --git a/src/x.ts b/src/x.ts', 'src/x.ts'],
    ['no prefix', 'diff --git src/x.ts src/x.ts', 'src/x.ts'],
    ['mnemonic prefixes', 'diff --git i/src/x.ts w/src/x.ts', 'src/x.ts'],
    ['path containing " b/"', 'diff --git a/docs/a b/c.md b/docs/a b/c.md', 'docs/a b/c.md'],
    ['no prefix with " b/"', 'diff --git docs/a b/c.md docs/a b/c.md', 'docs/a b/c.md'],
    ['quoted paths', 'diff --git "a/caf\\303\\251.ts" "b/caf\\303\\251.ts"', 'café.ts'],
    ['combined diff', 'diff --cc src/conflict.ts', 'src/conflict.ts'],
    ['unmerged marker', '* Unmerged path src/conflict.ts', 'src/conflict.ts'],
  ])('resolves the path for %s', (_name, header, expected) => {
    expect(paths(`${header}\n@@ -1 +1 @@\n-a\n+b`)).toEqual([expected]);
  });

  it('uses the rename target, even without prefixes', () => {
    const diff =
      'diff --git old dir/x.ts new dir/x.ts\nsimilarity index 100%\nrename from old dir/x.ts\nrename to new dir/x.ts';
    expect(paths(diff)).toEqual(['new dir/x.ts']);
  });

  it('falls back to the +++ line for an asymmetric header', () => {
    const diff = 'diff --git a/old.ts b/new.ts\n--- a/old.ts\n+++ b/new.ts\n@@ -1 +1 @@';
    expect(paths(diff)).toEqual(['new.ts']);
  });

  it('ignores "rename to" text inside hunks', () => {
    const diff = 'diff --git a/x.md b/x.md\n@@ -1 +1 @@\nrename to y.md';
    expect(paths(diff)).toEqual(['x.md']);
  });
});

describe('parseFilesFromDiff and filterDiffByFiles with git config variants', () => {
  const diff = [
    'diff --git docs/a b/c.md docs/a b/c.md',
    '--- docs/a b/c.md\t',
    '+++ docs/a b/c.md\t',
    '@@ -1 +1,2 @@',
    '+keep',
    'diff --git c/src/drop.ts w/src/drop.ts',
    '@@ -1 +1,2 @@',
    '+drop',
  ].join('\n');

  it('finds files in no-prefix and mnemonic-prefix diffs', () => {
    expect(parseFilesFromDiff(diff).map((f) => f.filename)).toEqual([
      'docs/a b/c.md',
      'src/drop.ts',
    ]);
  });

  it('keeps only the requested sections', () => {
    const result = filterDiffByFiles(diff, [{ filename: 'docs/a b/c.md' }]);
    expect(result).toContain('+keep');
    expect(result).not.toContain('+drop');
  });

  it('keeps both sections of a type change', () => {
    const typeChange = [
      'diff --git a/link b/link',
      'deleted file mode 100644',
      'diff --git a/link b/link',
      'new file mode 120000',
    ].join('\n');
    expect(filterDiffByFiles(typeChange, [{ filename: 'link' }])).toBe(typeChange);
  });
});
