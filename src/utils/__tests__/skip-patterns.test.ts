import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { loadSkipPatterns, applySkipPatterns } from '../skip-patterns.js';
import type { ChangeRequestFile } from '../../platforms/source-platform.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKIP_PATTERNS_PATH = join(__dirname, '..', '..', 'skip-patterns');

function makeFile(filename: string): ChangeRequestFile {
  return { filename, status: 'modified', additions: 1, deletions: 0, changes: 1 };
}

describe('loadSkipPatterns', () => {
  it('loads patterns from the skip-patterns file', () => {
    const patterns = loadSkipPatterns(SKIP_PATTERNS_PATH);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.every((p) => !p.startsWith('#'))).toBe(true);
    expect(patterns.every((p) => p.trim() !== '')).toBe(true);
  });

  it('strips comments and blank lines', () => {
    const patterns = loadSkipPatterns(SKIP_PATTERNS_PATH);
    for (const pattern of patterns) {
      expect(pattern).not.toMatch(/^#/);
      expect(pattern.trim()).not.toBe('');
    }
  });
});

describe('applySkipPatterns', () => {
  const patterns = loadSkipPatterns(SKIP_PATTERNS_PATH);

  it('excludes test files', () => {
    const files = [makeFile('src/index.ts'), makeFile('src/utils/helper.test.ts')];
    const result = applySkipPatterns(files, patterns);
    expect(result.included).toHaveLength(1);
    expect(result.included[0]?.filename).toBe('src/index.ts');
    expect(result.excluded).toBe(1);
  });

  it('excludes documentation files', () => {
    const files = [makeFile('src/index.ts'), makeFile('README.md'), makeFile('docs/guide.md')];
    const result = applySkipPatterns(files, patterns);
    expect(result.included).toHaveLength(1);
    expect(result.included[0]?.filename).toBe('src/index.ts');
    expect(result.excluded).toBe(2);
  });

  it('excludes lock files', () => {
    const files = [makeFile('src/index.ts'), makeFile('package-lock.json')];
    const result = applySkipPatterns(files, patterns);
    expect(result.included).toHaveLength(1);
    expect(result.included[0]?.filename).toBe('src/index.ts');
    expect(result.excluded).toBe(1);
  });

  it('keeps all files when no patterns match', () => {
    const files = [makeFile('src/index.ts'), makeFile('src/utils/config.ts')];
    const result = applySkipPatterns(files, patterns);
    expect(result.included).toHaveLength(2);
    expect(result.excluded).toBe(0);
  });

  it('returns all files when patterns array is empty', () => {
    const files = [makeFile('src/index.ts'), makeFile('README.md')];
    const result = applySkipPatterns(files, []);
    expect(result.included).toHaveLength(2);
    expect(result.excluded).toBe(0);
  });

  it('excludes __tests__ directory files', () => {
    const files = [makeFile('src/index.ts'), makeFile('src/utils/__tests__/config.test.ts')];
    const result = applySkipPatterns(files, patterns);
    expect(result.included).toHaveLength(1);
    expect(result.included[0]?.filename).toBe('src/index.ts');
    expect(result.excluded).toBe(1);
  });

  it('excludes CI/CD configuration files', () => {
    const files = [
      makeFile('src/index.ts'),
      makeFile('.github/workflows/ci.yml'),
      makeFile('.gitlab-ci.yml'),
    ];
    const result = applySkipPatterns(files, patterns);
    expect(result.included).toHaveLength(1);
    expect(result.excluded).toBe(2);
  });
});
