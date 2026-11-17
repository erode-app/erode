import { realpathSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';
import { LikeC4DiagnosticSchema } from '../../schemas/likec4.schema.js';
import type { ValidationDiagnostic } from '../architecture-adapter.js';

interface WarningSource {
  getWarnings?: () => unknown;
}

const UNKNOWN_WARNING = 'LikeC4 reported a warning without a message';

/**
 * Read workspace warnings from a LikeC4 instance, with file paths made relative to `rootDir`.
 * Returns undefined when the SDK has no getWarnings() (added in LikeC4 1.61) or it fails.
 */
export function readLikeC4Warnings(
  likec4: object,
  rootDir: string
): ValidationDiagnostic[] | undefined {
  const source = likec4 as WarningSource;
  if (typeof source.getWarnings !== 'function') {
    return undefined;
  }
  // Warnings are informational; a failure reading them must never fail the caller
  try {
    const raw = source.getWarnings();
    if (!Array.isArray(raw)) {
      return undefined;
    }
    const roots = rootCandidates(rootDir);
    return raw.map((item: unknown) => toDiagnostic(item, roots));
  } catch {
    return undefined;
  }
}

/** Drop warnings matched by the baseline, by (file, message) and counting duplicates. */
export function excludeBaseline(
  current: readonly ValidationDiagnostic[],
  baseline: readonly ValidationDiagnostic[] | undefined
): ValidationDiagnostic[] {
  if (!baseline) {
    return [...current];
  }
  const remaining = new Map<string, number>();
  for (const d of baseline) {
    const key = diagnosticKey(d);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  return current.filter((d) => {
    const key = diagnosticKey(d);
    const count = remaining.get(key) ?? 0;
    if (count > 0) {
      remaining.set(key, count - 1);
      return false;
    }
    return true;
  });
}

export function formatDiagnostic(d: ValidationDiagnostic): string {
  return d.file ? `${d.file}: ${d.message}` : d.message;
}

function diagnosticKey(d: ValidationDiagnostic): string {
  return JSON.stringify([d.file ?? '', d.message]);
}

function toDiagnostic(item: unknown, roots: string[]): ValidationDiagnostic {
  const parsed = LikeC4DiagnosticSchema.safeParse(item);
  if (!parsed.success) {
    return { message: UNKNOWN_WARNING };
  }
  const { message, sourceFsPath } = parsed.data;
  const file = sourceFsPath ? relativeToRoot(sourceFsPath, roots) : undefined;
  return { ...(file ? { file } : {}), message: message ?? UNKNOWN_WARNING };
}

// The SDK may report realpaths (e.g. /private/var on macOS), so match either form of the root
function rootCandidates(rootDir: string): string[] {
  const roots = [rootDir];
  try {
    const real = realpathSync(rootDir);
    if (real !== rootDir) roots.push(real);
  } catch {
    // Root may not exist on disk (tests) or be unreadable; the given path is enough
  }
  return roots;
}

function relativeToRoot(filePath: string, roots: string[]): string | undefined {
  for (const root of roots) {
    const rel = relative(root, filePath);
    if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
      return rel.split(sep).join('/');
    }
  }
  // Outside the workspace: omit the path rather than leak an absolute (possibly temp) path
  return undefined;
}
