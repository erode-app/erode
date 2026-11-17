import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateGitDiff, filterDiffByFiles, parseFilesFromDiff } from '../git-diff.js';

// Exercises real git against a repo whose config breaks naive diff parsing.
let dir: string;

function git(...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
    { cwd: dir, encoding: 'utf-8' }
  );
}

function write(path: string, content: string | Buffer): void {
  writeFileSync(join(dir, path), content);
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'erode-git-diff-'));
  git('init', '-q', '-b', 'main', '.');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Test');
  mkdirSync(join(dir, 'docs/a b'), { recursive: true });
  mkdirSync(join(dir, 'src'));
  write('docs/a b/c.md', 'one\n');
  write('src/café.ts', 'export const a = 1;\n');
  write('src/say"hi".ts', 'export const q = 1;\n');
  write('link.txt', 'target\n');
  write('old.ts', 'export const moved = 1;\nexport const kept = 2;\n');
  write('image.bin', Buffer.from([0, 1, 2, 3]));
  write('unchanged.ts', 'same\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');

  write('docs/a b/c.md', 'one\ntwo\n');
  write('src/café.ts', 'export const a = 2;\n');
  write('src/say"hi".ts', 'export const q = 2;\n');
  rmSync(join(dir, 'link.txt'));
  symlinkSync('old.ts', join(dir, 'link.txt'));
  git('mv', 'old.ts', 'new.ts');
  write('image.bin', Buffer.from([0, 9, 9]));
  git('add', '-A');

  // Config that changes porcelain output; generateGitDiff must not depend on it.
  git('config', 'diff.noprefix', 'true');
  git('config', 'diff.mnemonicPrefix', 'true');
  git('config', 'color.diff', 'always');
  git('config', 'diff.external', 'false');
  git('config', 'diff.relative', 'true');
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const expectedFiles = [
  { filename: 'docs/a b/c.md', status: 'modified' },
  { filename: 'image.bin', status: 'modified' },
  { filename: 'link.txt', status: 'changed' },
  { filename: 'new.ts', status: 'renamed' },
  { filename: 'src/café.ts', status: 'modified' },
  { filename: 'src/say"hi".ts', status: 'modified' },
];

describe('generateGitDiff against a real repository', () => {
  const originalLang = process.env['LANG'];
  afterEach(() => {
    if (originalLang === undefined) delete process.env['LANG'];
    else process.env['LANG'] = originalLang;
  });

  it('returns every file with its status despite noprefix, mnemonic prefixes and non-ASCII paths', () => {
    const result = generateGitDiff({ cwd: dir, staged: true });
    expect(result.files).toEqual(expectedFiles);
  });

  it('computes stats from numstat, counting binary files without lines', () => {
    const result = generateGitDiff({ cwd: dir, staged: true });
    // c.md +1, café.ts +1 -1, say"hi".ts +1 -1, link.txt +1 -1, image.bin binary, rename 0/0.
    expect(result.stats).toEqual({ additions: 4, deletions: 3, filesChanged: 6 });
  });

  it('emits a parseable diff with a/ and b/ prefixes and no colour', () => {
    const { diff } = generateGitDiff({ cwd: dir, staged: true });
    expect(diff).not.toContain('\x1b[');
    expect(diff).toContain('diff --git a/docs/a b/c.md b/docs/a b/c.md');
    expect(diff).toContain('diff --git a/src/café.ts b/src/café.ts');
    // git still C-quotes a name containing `"` with core.quotePath=false.
    expect(diff).toContain('diff --git "a/src/say\\"hi\\".ts" "b/src/say\\"hi\\".ts"');
    expect(parseFilesFromDiff(diff).map((f) => f.filename)).toEqual(
      expectedFiles.map((f) => f.filename)
    );
  });

  it('filters the diff by file, keeping both sections of a type change', () => {
    const { diff } = generateGitDiff({ cwd: dir, staged: true });
    const filtered = filterDiffByFiles(diff, [
      { filename: 'docs/a b/c.md' },
      { filename: 'link.txt' },
    ]);
    expect(filtered).toContain('+two');
    expect(filtered.match(/^diff --git a\/link\.txt b\/link\.txt$/gm)).toHaveLength(2);
    expect(filtered).not.toContain('café');
    expect(filtered).not.toContain('say');
    expect(filterDiffByFiles(diff, [{ filename: 'src/say"hi".ts' }])).toContain(
      '+export const q = 2;'
    );
    expect(filtered).not.toContain('image.bin');
    expect(filtered).not.toContain('new.ts');
  });

  it('keeps the same result under a German locale', () => {
    const baseline = generateGitDiff({ cwd: dir, staged: true });
    process.env['LANG'] = 'de_DE.UTF-8';
    expect(generateGitDiff({ cwd: dir, staged: true })).toEqual(baseline);
  });

  it('runs from a subdirectory with diff.relative set and still reports repo-root paths', () => {
    const result = generateGitDiff({ cwd: join(dir, 'src'), staged: true });
    expect(result.files).toEqual(expectedFiles);
  });
});
