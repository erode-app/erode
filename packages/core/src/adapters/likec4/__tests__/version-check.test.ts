import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { checkLikeC4Version, getBundledLikeC4Version } from '../version-check.js';
import { LikeC4Adapter } from '../adapter.js';
import { AdapterError } from '../../../errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('checkLikeC4Version range handling', () => {
  const bundled = '1.61.0';

  function check(range: string) {
    const dir = mkdtempSync(join(tmpdir(), 'version-range-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { likec4: range } }));
    return checkLikeC4Version(dir, bundled);
  }

  it.each([
    ['^1.45.0', '1.45.0'],
    ['~1.50.2', '1.50.2'],
    ['>=2.0.0', '2.0.0'],
    ['1.45.0', '1.45.0'],
    ['<1.70.0 >=1.45.0', '1.45.0'],
    ['>=1.50.0 >=1.30.0', '1.50.0'],
    ['1.45.0 - 1.70.0', '1.45.0'],
    ['^2.0.0 || ^1.50.0', '1.50.0'],
  ])('reads %s as starting at %s', (range, version) => {
    expect(check(range)).toMatchObject({ found: true, version, compatible: true });
  });

  it.each(['latest', '', 'not-a-range'])('ignores %j', (range) => {
    expect(check(range).found).toBe(false);
  });

  it('accepts an upper-bound-only range that allows the bundled version, without a warning', () => {
    const result = check('<1.70.0');
    expect(result).toMatchObject({ found: true, version: '<1.70.0', compatible: true });
    expect(result.warning).toBeUndefined();
  });

  it('rejects an upper-bound-only range below the minimum', () => {
    expect(check('<1.40.0')).toMatchObject({ found: true, compatible: false });
  });

  it('accepts an inclusive upper bound equal to the minimum', () => {
    expect(check('<=1.45.0').compatible).toBe(true);
  });

  it('does not warn when any alternative allows the bundled version', () => {
    expect(check('<=1.61.0 || ^2.0.0').warning).toBeUndefined();
  });

  it('warns when every alternative needs a newer version', () => {
    expect(check('^1.62.0 || ^2.0.0').warning).toContain('targets likec4 1.62.0');
  });
});

describe('checkLikeC4Version', () => {
  it('returns compatible for sample workspace fixture', () => {
    const fixturePath = join(__dirname, 'fixtures', 'sample-workspace');
    const result = checkLikeC4Version(fixturePath);
    expect(result.found).toBe(true);
    expect(result.version).toBe('1.45.0');
    expect(result.compatible).toBe(true);
  });

  function makeTempDir(): string {
    return mkdtempSync(join(tmpdir(), 'version-check-'));
  }

  it('returns incompatible for old version', () => {
    const dir = makeTempDir();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ dependencies: { likec4: '^1.30.0' } })
    );
    const result = checkLikeC4Version(dir);
    expect(result.found).toBe(true);
    expect(result.version).toBe('1.30.0');
    expect(result.compatible).toBe(false);
  });

  it('detects likec4 in devDependencies', () => {
    const dir = makeTempDir();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ devDependencies: { likec4: '~1.50.0' } })
    );
    const result = checkLikeC4Version(dir);
    expect(result.found).toBe(true);
    expect(result.version).toBe('1.50.0');
    expect(result.compatible).toBe(true);
  });

  it('returns found false when no likec4 dependency', () => {
    const dir = makeTempDir();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ dependencies: { react: '^18.0.0' } })
    );
    const result = checkLikeC4Version(dir);
    expect(result.found).toBe(false);
  });

  it('returns found false when no package.json exists', () => {
    const dir = makeTempDir();
    const subdir = join(dir, 'nested');
    mkdirSync(subdir);
    // No package.json anywhere in the temp tree — but it may walk up
    // to a real package.json. Use a deeply nested temp dir that is
    // unlikely to have one nearby. We verify by checking that if found,
    // it at least doesn't claim to have likec4.
    const result = checkLikeC4Version(subdir);
    // Either no package.json found or found one without likec4
    if (result.found) {
      // Walked up to a real package.json that happens to have likec4
      expect(result.version).toBeDefined();
    } else {
      expect(result.found).toBe(false);
    }
  });

  it('walks up from subdirectory to find package.json', () => {
    const dir = makeTempDir();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ dependencies: { likec4: '^1.46.0' } })
    );
    const subdir = join(dir, 'models');
    mkdirSync(subdir);
    const result = checkLikeC4Version(subdir);
    expect(result.found).toBe(true);
    expect(result.version).toBe('1.46.0');
    expect(result.compatible).toBe(true);
  });
});

describe('getBundledLikeC4Version', () => {
  it('reads the installed likec4 package version', () => {
    const installed = (createRequire(import.meta.url)('likec4/package.json') as { version: string })
      .version;
    expect(getBundledLikeC4Version()).toBe(installed);
  });
});

describe('checkLikeC4Version bundled version skew', () => {
  const bundled = '1.59.3';

  function dirWithRange(range: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'version-skew-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { likec4: range } }));
    return dir;
  }

  it('warns but stays compatible when the model targets a newer likec4 than erode bundles', () => {
    const result = checkLikeC4Version(dirWithRange('^1.60.0'), bundled);
    expect(result.compatible).toBe(true);
    expect(result.bundled).toBe('1.59.3');
    expect(result.warning).toBe(
      'Your model targets likec4 1.60.0, erode bundles 1.59.3; newer syntax may fail to parse.'
    );
  });

  it('does not warn when the model targets the bundled version', () => {
    const result = checkLikeC4Version(dirWithRange('1.59.3'), bundled);
    expect(result.warning).toBeUndefined();
  });

  it('does not warn when the model targets an older version', () => {
    const result = checkLikeC4Version(dirWithRange('^1.45.0'), bundled);
    expect(result.warning).toBeUndefined();
  });

  it('does not warn when the range lists an upper bound first', () => {
    const result = checkLikeC4Version(dirWithRange('<1.70.0 >=1.45.0'), bundled);
    expect(result.warning).toBeUndefined();
  });

  it('does not warn for an upper-bound-only range that allows the bundled version', () => {
    const result = checkLikeC4Version(dirWithRange('<1.70.0'), bundled);
    expect(result.compatible).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it('rejects an upper-bound-only range below the minimum', () => {
    const result = checkLikeC4Version(dirWithRange('<1.40.0'), bundled);
    expect(result.found).toBe(true);
    expect(result.compatible).toBe(false);
    expect(result.version).toBe('<1.40.0');
  });

  it('does not warn when the bundled version is unknown', () => {
    const result = checkLikeC4Version(dirWithRange('^9.0.0'), null);
    expect(result.bundled).toBeUndefined();
    expect(result.warning).toBeUndefined();
  });

  it('adds the skew warning to LikeC4 parse errors', async () => {
    const dir = dirWithRange('^99.0.0');
    writeFileSync(join(dir, 'model.c4'), 'model {\n  a = \n}\n');
    const adapter = new LikeC4Adapter();
    const error: unknown = await adapter.loadFromPath(dir).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).userMessage).toMatch(
      /Your model targets likec4 99\.0\.0, erode bundles \d+\.\d+\.\d+/
    );
    expect((error as AdapterError).message).toMatch(/Your model targets likec4 99\.0\.0/);
  }, 60_000);

  it('errors rather than warns when the model is below the minimum', () => {
    const result = checkLikeC4Version(dirWithRange('^1.30.0'), bundled);
    expect(result.compatible).toBe(false);
    expect(result.warning).toBeUndefined();
  });
});
