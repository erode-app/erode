import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import semver from 'semver';
import { z } from 'zod';
import type { VersionCheckResult } from '../architecture-adapter.js';

const MIN_LIKEC4_VERSION = '1.45.0';

const SourcePackageJsonSchema = z.object({
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
});

const InstalledPackageJsonSchema = z.object({ version: z.string() });

let bundledVersionCache: string | null | undefined;

/** Version of the likec4 package installed alongside erode, or null if it cannot be read. */
export function getBundledLikeC4Version(): string | null {
  if (bundledVersionCache !== undefined) return bundledVersionCache;
  try {
    const require = createRequire(import.meta.url);
    const pkg = InstalledPackageJsonSchema.parse(require('likec4/package.json'));
    bundledVersionCache = semver.valid(pkg.version);
  } catch {
    bundledVersionCache = null;
  }
  return bundledVersionCache;
}

function findPackageJson(startPath: string): string | null {
  let current = startPath;
  let parent = dirname(current);
  do {
    const candidate = join(current, 'package.json');
    try {
      readFileSync(candidate, 'utf-8');
      return candidate;
    } catch {
      // not found, walk up
    }
    current = parent;
    parent = dirname(current);
  } while (current !== parent);
  return null;
}

export function checkLikeC4Version(
  likec4Path: string,
  bundled: string | null = getBundledLikeC4Version()
): VersionCheckResult {
  const minimum = MIN_LIKEC4_VERSION;

  const packageJsonPath = findPackageJson(likec4Path);
  if (!packageJsonPath) {
    return { found: false, minimum };
  }

  let parsed: z.infer<typeof SourcePackageJsonSchema>;
  try {
    const content = readFileSync(packageJsonPath, 'utf-8');
    parsed = SourcePackageJsonSchema.parse(JSON.parse(content));
  } catch {
    return { found: false, minimum };
  }

  const versionRange = parsed.dependencies?.['likec4'] ?? parsed.devDependencies?.['likec4'];
  if (!versionRange) {
    return { found: false, minimum };
  }

  const range = semver.validRange(versionRange);
  if (!range) {
    return { found: false, minimum };
  }

  // Ranges with only an upper bound (`<1.70.0`) start at 0.0.0: show them as written, and
  // accept them when they allow the minimum. Otherwise the range's floor must meet the minimum.
  const lowest = semver.minVersion(range);
  const hasLowerBound = !!lowest && lowest.version !== '0.0.0';
  const version = hasLowerBound ? lowest.version : versionRange.trim();
  const compatible = hasLowerBound
    ? semver.gte(lowest, MIN_LIKEC4_VERSION)
    : semver.intersects(range, `>=${MIN_LIKEC4_VERSION}`);
  const result: VersionCheckResult = {
    found: true,
    version,
    compatible,
    minimum,
    bundled: bundled ?? undefined,
  };
  // Warn only when every version the range allows is newer than the bundled one
  if (bundled && semver.ltr(bundled, range)) {
    result.warning = `Your model targets likec4 ${version}, erode bundles ${bundled}; newer syntax may fail to parse.`;
  }
  return result;
}
