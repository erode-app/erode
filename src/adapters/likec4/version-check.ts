import { readFileSync } from 'fs';
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

export function extractMinVersion(range: string): SemVer | null {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(range);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

export function isVersionBelow(version: SemVer, minimum: SemVer): boolean {
  if (version.major !== minimum.major) return version.major < minimum.major;
  if (version.minor !== minimum.minor) return version.minor < minimum.minor;
  return version.patch < minimum.patch;
}

function formatVersion(v: SemVer): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

export function checkLikeC4Version(likec4Path: string): VersionCheckResult {
  const minimum = formatVersion(MIN_LIKEC4_VERSION);

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

  const versionRange =
    parsed.dependencies?.['likec4'] ?? parsed.devDependencies?.['likec4'];
  if (!versionRange) {
    return { found: false, minimum };
  }

  const version = extractMinVersion(versionRange);
  if (!version) {
    return { found: false, minimum };
  }

  return {
    found: true,
    version: formatVersion(version),
    compatible: !isVersionBelow(version, MIN_LIKEC4_VERSION),
    minimum,
  };
}
