import { withTempWorkspaceCopy } from '../dsl-validation.js';

interface FormatResult {
  formatted: boolean;
  content?: string;
  skipped?: boolean;
  error?: string;
}

export async function formatLikeC4Dsl(
  workspacePath: string,
  targetFile: string,
  patchedContent: string
): Promise<FormatResult> {
  try {
    return await withTempWorkspaceCopy(
      workspacePath,
      targetFile,
      patchedContent,
      'erode-likec4-fmt',
      async (tmpTarget, tmpDir) => {
        const { LikeC4 } = await import('likec4');
        const likec4 = await LikeC4.fromWorkspace(tmpDir, { printErrors: false });
        try {
          if (typeof likec4.format !== 'function') {
            return { formatted: false, skipped: true };
          }
          const targetUri = `file://${tmpTarget}`;
          const result = await likec4.format({ documentUris: [targetUri] });
          const formatted = result.get(targetUri);
          if (formatted !== undefined) {
            return { formatted: true, content: formatted };
          }
          return { formatted: false, error: 'Target file not found in format result' };
        } finally {
          await likec4.dispose();
        }
      }
    );
  } catch {
    return { formatted: false, skipped: true };
  }
}
