import { mkdtemp, cp, writeFile, rm } from 'fs/promises';
import { basename, join, relative, resolve } from 'path';
import { tmpdir } from 'os';
import { exportDslToJson } from './structurizr-cli.js';
import type { DslValidationResult } from '../model-patcher.js';

export async function validateStructurizrDsl(
  workspacePath: string,
  targetFile: string,
  patchedContent: string
): Promise<DslValidationResult> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'erode-structurizr-validate-'));

  try {
    const resolvedWorkspace = resolve(workspacePath);
    await cp(resolvedWorkspace, tmpDir, {
      recursive: true,
      filter: (src) => {
        const name = basename(src);
        return name !== 'node_modules' && name !== '.git';
      },
    });

    const relativePath = relative(resolvedWorkspace, resolve(targetFile));
    const tmpTarget = join(tmpDir, relativePath);
    await writeFile(tmpTarget, patchedContent, 'utf-8');

    await exportDslToJson(tmpTarget);
    return { valid: true };
  } catch (error) {
    if (isEnoent(error)) {
      return { valid: false, skipped: true };
    }
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'ENOENT'
  );
}
