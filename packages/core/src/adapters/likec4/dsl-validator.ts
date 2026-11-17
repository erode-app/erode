import type { DslValidationResult } from '../model-patcher.js';
import { withTempWorkspaceCopy } from '../dsl-validation.js';
import type { LikeC4 as LikeC4Sdk } from 'likec4';
import type { ValidationDiagnostic } from '../architecture-adapter.js';
import { excludeBaseline, formatDiagnostic, readLikeC4Warnings } from './validation-warnings.js';

const UNKNOWN_ERROR = 'LikeC4 reported an error without a message';

export async function validateLikeC4Dsl(
  workspacePath: string,
  targetFile: string,
  patchedContent: string,
  baseline?: readonly ValidationDiagnostic[]
): Promise<DslValidationResult> {
  let LikeC4: typeof LikeC4Sdk;
  try {
    ({ LikeC4 } = await import('likec4'));
  } catch {
    return { valid: false, skipped: true };
  }

  try {
    return await withTempWorkspaceCopy(
      workspacePath,
      targetFile,
      patchedContent,
      'erode-likec4',
      async (_tmpTarget, tmpDir) => {
        const likec4 = await LikeC4.fromWorkspace(tmpDir, { printErrors: false });
        try {
          if (likec4.hasErrors()) {
            const errors = likec4.getErrors();
            return {
              valid: false,
              errors: errors.map((e: { message?: string }) => e.message ?? UNKNOWN_ERROR),
            };
          }
          const current = readLikeC4Warnings(likec4, tmpDir) ?? [];
          const warnings = excludeBaseline(current, baseline).map(formatDiagnostic);
          return warnings.length > 0 ? { valid: true, warnings } : { valid: true };
        } finally {
          // A dispose failure must not change the validation verdict
          await likec4.dispose().catch(() => undefined);
        }
      }
    );
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}
