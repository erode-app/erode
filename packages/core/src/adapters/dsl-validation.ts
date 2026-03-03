import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';

export async function withTempWorkspaceCopy<T>(
  workspacePath: string,
  targetFile: string,
  patchedContent: string,
  prefix: string,
  validate: (tmpTarget: string, tmpDir: string) => Promise<T>
): Promise<T> {
  const tmpDir = await mkdtemp(join(tmpdir(), `${prefix}-validate-`));
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
    return await validate(tmpTarget, tmpDir);
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
