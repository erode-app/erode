import { mkdtemp, cp, writeFile, rm } from 'fs/promises';
import { basename, join, relative, resolve } from 'path';
import { tmpdir } from 'os';
import { LikeC4 } from 'likec4';
import type { DslValidationResult } from '../model-patcher.js';

export async function validateLikeC4Dsl(
  workspacePath: string,
  targetFile: string,
  patchedContent: string
): Promise<DslValidationResult> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'erode-likec4-validate-'));

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

    const likec4 = await LikeC4.fromWorkspace(tmpDir, { printErrors: false });
    if (likec4.hasErrors()) {
      const errors = likec4.getErrors();
      return {
        valid: false,
        errors: errors.map((e: { message?: string }) => e.message ?? JSON.stringify(e)),
      };
    }

    return { valid: true };
  } catch {
    // SDK unavailable or workspace copy failed
    return { valid: false, skipped: true };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
