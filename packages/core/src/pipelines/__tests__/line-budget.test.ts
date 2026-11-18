import { describe, it, expect } from 'vitest';
import { applyLineBudget, applyLineBudgetToDiff } from '../pipeline-shared.js';
import type { ChangeRequestFile } from '../../platforms/source-platform.js';

function makeFile(filename: string, changes: number, patch?: string): ChangeRequestFile {
  return { filename, status: 'modified', additions: changes, deletions: 0, changes, patch };
}

describe('applyLineBudget', () => {
  it('returns files untouched when under budget', () => {
    const files = [makeFile('a.ts', 10), makeFile('b.ts', 20)];
    const result = applyLineBudget(files, 100);
    expect(result.files).toBe(files);
    expect(result.truncationReason).toBeUndefined();
  });

  it('skips a file that does not fit but keeps smaller later files', () => {
    const files = [makeFile('a.ts', 60), makeFile('huge.ts', 200), makeFile('c.ts', 30)];
    const result = applyLineBudget(files, 100);
    expect(result.files.map((f) => f.filename)).toEqual(['a.ts', 'c.ts']);
    expect(result.truncationReason).toContain('100-line limit');
    expect(result.truncationReason).toContain('290 lines found');
    expect(result.truncationReason).toContain('1 file was dropped');
  });

  it('keeps the first file and cuts its patch when it alone exceeds the budget', () => {
    const patch = Array.from({ length: 50 }, (_, i) => `+l${String(i)}`).join('\n');
    const result = applyLineBudget([makeFile('big.ts', 50, patch), makeFile('b.ts', 5)], 10);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.patch?.split('\n')).toHaveLength(10);
    expect(result.truncationReason).toContain('first file was cut to fit');
  });

  it('flags a lone oversized first file without a patch', () => {
    const result = applyLineBudget([makeFile('big.ts', 50)], 10);
    expect(result.files).toHaveLength(1);
    expect(result.truncationReason).toContain('50 lines found');
  });
});

describe('applyLineBudgetToDiff', () => {
  const seg = (name: string, adds: number): string =>
    `diff --git a/${name} b/${name}\n--- a/${name}\n+++ b/${name}\n@@ -0,0 +1 @@\n` +
    Array.from({ length: adds }, (_, i) => `+x${String(i)}`).join('\n');

  it('leaves a small diff untouched', () => {
    const diff = seg('a.ts', 3);
    expect(applyLineBudgetToDiff(diff, 100)).toEqual({ diff });
  });

  it('drops a segment that does not fit and keeps later small ones', () => {
    const diff = [seg('a.ts', 5), seg('big.ts', 50), seg('c.ts', 3)].join('\n');
    const result = applyLineBudgetToDiff(diff, 10);
    expect(result.diff).toContain('a/a.ts');
    expect(result.diff).toContain('a/c.ts');
    expect(result.diff).not.toContain('big.ts');
    expect(result.truncationReason).toContain('1 file was dropped');
  });

  it('counts removed ---- and added +++x lines as content inside a hunk', () => {
    const diff =
      'diff --git a/a.md b/a.md\n--- a/a.md\n+++ b/a.md\n@@ -1,2 +1,2 @@\n-----\n+++x\n context\n' +
      seg('b.ts', 5);
    // a.md has 2 changed lines, b.ts 5; a budget of 5 must drop b.ts
    const result = applyLineBudgetToDiff(diff, 5);
    expect(result.truncationReason).toContain('7 lines found');
    expect(result.diff).toContain('a/a.md');
    expect(result.diff).not.toContain('b.ts');
  });
});
