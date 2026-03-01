import type { DslValidationResult } from '../model-patcher.js';
import { withTempWorkspaceCopy } from '../dsl-validation.js';

export async function validateLikeC4Dsl(
  workspacePath: string,
  targetFile: string,
  patchedContent: string
): Promise<DslValidationResult> {
  try {
    return await withTempWorkspaceCopy(
      workspacePath,
      targetFile,
      patchedContent,
      'erode-likec4',
      async (_tmpTarget, tmpDir) => {
        const { LikeC4 } = await import('likec4');
        const likec4 = await LikeC4.fromWorkspace(tmpDir, { printErrors: false });
        if (likec4.hasErrors()) {
          const errors = likec4.getErrors();
          return {
            valid: false,
            errors: errors.map((e: { message?: string }) => e.message ?? JSON.stringify(e)),
          };
        }
        return { valid: true };
      }
    );
  } catch {
    // SDK unavailable or workspace copy failed
    return { valid: false, skipped: true };
  }
}
