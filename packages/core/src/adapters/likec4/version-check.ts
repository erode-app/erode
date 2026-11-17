import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { z } from 'zod';
import type { VersionCheckResult } from '../architecture-adapter.js';

const MIN_LIKEC4_VERSION = { major: 1, minor: 45, patch: 0 } as const;

interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

const SourcePackageJsonSchema = z.object({
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
});

const InstalledPackageJsonSchema = z.object({ version: z.string() });

let bundledVersionCache: SemVer | null | undefined;

/** Version of the likec4 package installed alongside erode, or null if it cannot be read. */
export function getBundledLikeC4Version(): SemVer | null {
  if (bundledVersionCache !== undefined) return bundledVersionCache;
  try {
    const require = createRequire(import.meta.url);
    const pkg = InstalledPackageJsonSchema.parse(require('likec4/package.json'));
    bundledVersionCache = extractMinVersion(pkg.version);
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

/** Lowest version a range allows; upper bounds (`<`, `<=`) are ignored. */
export function extractMinVersion(range: string): SemVer | null {
  let lowest: SemVer | null = null;
  for (const match of range.matchAll(/(<=?)?\s*v?(\d+)\.(\d+)\.(\d+)/g)) {
    if (match[1]) continue;
    const version = {
      major: parseInt(match[2] ?? '', 10),
      minor: parseInt(match[3] ?? '', 10),
      patch: parseInt(match[4] ?? '', 10),
    };
    if (!lowest || isVersionBelow(version, lowest)) lowest = version;
  }
  return lowest;
}

export function isVersionBelow(version: SemVer, minimum: SemVer): boolean {
  if (version.major !== minimum.major) return version.major < minimum.major;
  if (version.minor !== minimum.minor) return version.minor < minimum.minor;
  return version.patch < minimum.patch;
}

function formatVersion(v: SemVer): string {
  return `${String(v.major)}.${String(v.minor)}.${String(v.patch)}`;
}

export function checkLikeC4Version(
  likec4Path: string,
  bundledVersion: SemVer | null = getBundledLikeC4Version()
): VersionCheckResult {
  const minimum = formatVersion(MIN_LIKEC4_VERSION);
  const bundled = bundledVersion ? formatVersion(bundledVersion) : undefined;

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

  const version = extractMinVersion(versionRange);
  if (!version) {
    return { found: false, minimum };
  }

  const formatted = formatVersion(version);
  const result: VersionCheckResult = {
    found: true,
    version: formatted,
    compatible: !isVersionBelow(version, MIN_LIKEC4_VERSION),
    minimum,
    bundled,
  };
  if (bundledVersion && bundled && isVersionBelow(bundledVersion, version)) {
    result.warning = `Your model targets likec4 ${formatted}, erode bundles ${bundled}; newer syntax may fail to parse.`;
  }
  return result;
}
