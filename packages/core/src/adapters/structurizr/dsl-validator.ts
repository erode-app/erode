import type { DslValidationResult } from '../model-patcher.js';
import { withTempWorkspaceCopy } from '../dsl-validation.js';
import { exportDslToJson } from './structurizr-cli.js';

export async function validateStructurizrDsl(
  workspacePath: string,
  targetFile: string,
  patchedContent: string
): Promise<DslValidationResult> {
  try {
    return await withTempWorkspaceCopy(
      workspacePath,
      targetFile,
      patchedContent,
      'erode-structurizr',
      async (tmpTarget, _tmpDir) => {
        await exportDslToJson(tmpTarget);
        return { valid: true };
      }
    );
  } catch (error) {
    if (isEnoent(error)) {
      return { valid: false, skipped: true };
    }
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
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
