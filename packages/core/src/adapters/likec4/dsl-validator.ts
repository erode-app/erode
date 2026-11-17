import { realpathSync } from 'fs';
import type { DslValidationResult } from '../model-patcher.js';
import { withTempWorkspaceCopy } from '../dsl-validation.js';
import type { LikeC4 as LikeC4Sdk } from 'likec4';
import type { ValidationDiagnostic } from '../architecture-adapter.js';
import { excludeBaseline, formatDiagnostic, readLikeC4Warnings } from './validation-warnings.js';

const UNKNOWN_ERROR = 'LikeC4 reported an error without a message';

type LikeC4Instance = Awaited<ReturnType<typeof LikeC4Sdk.fromWorkspace>>;

function realPath(file: string): string {
  try {
    return realpathSync(file);
  } catch {
    return file;
  }
}

/** Errors in the patched file's project; other projects in the workspace may already be broken. */
function errorsAffecting(
  likec4: LikeC4Instance,
  target: string
): ReturnType<LikeC4Instance['getErrors']> {
  const errors = likec4.getErrors();
  const projects = likec4.projects();
  if (projects.length <= 1) return errors;
  const targetPath = realPath(target);
  for (const id of projects) {
    const documents = new Set(
      likec4.languageServices.project(id).documents.map((uri) => realPath(uri.fsPath))
    );
    if (documents.has(targetPath)) {
      return errors.filter((e) => documents.has(realPath(e.sourceFsPath)));
    }
  }
  return errors;
}

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
      async (tmpTarget, tmpDir) => {
        const likec4 = await LikeC4.fromWorkspace(tmpDir, { printErrors: false });
        try {
          const errors = likec4.hasErrors() ? errorsAffecting(likec4, tmpTarget) : [];
          if (errors.length > 0) {
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
