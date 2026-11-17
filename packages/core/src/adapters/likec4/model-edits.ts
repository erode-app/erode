import { realpathSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { NewComponent } from '../../analysis/analysis-types.js';
import { withTempWorkspaceCopy } from '../dsl-validation.js';

const PreviewSchema = z.union([
  z.object({ error: z.string() }),
  z.object({
    documents: z.array(z.object({ uri: z.string(), before: z.string(), after: z.string() })),
    overlaps: z.array(z.string()),
  }),
]);

const DiffListSchema = z.array(z.object({ id: z.string() }));

export interface ModelEditsPatch {
  /** Absolute path of the changed model file in the original workspace */
  targetFile: string;
  content: string;
}

export type ModelEditsOutcome =
  { ok: true; patch: ModelEditsPatch } | { ok: false; reason: string };

function componentBlock(comp: NewComponent, localId: string, indent: string): string[] {
  const name = comp.name.replace(/'/g, '');
  const lines = [`${indent}${localId} = ${comp.kind} '${name}' {`];
  if (comp.tags && comp.tags.length > 0) {
    lines.push(`${indent}  ${comp.tags.map((t) => `#${t}`).join(' ')}`);
  }
  if (comp.description) {
    lines.push(`${indent}  description '${comp.description.replace(/'/g, '')}'`);
  }
  if (comp.technology) {
    lines.push(`${indent}  technology '${comp.technology.replace(/'/g, '')}'`);
  }
  lines.push(`${indent}}`);
  return lines;
}

/**
 * Builds a LikeC4 `diff` block. Dotted component IDs become `extend <parent> { ... }`,
 * because a dotted name is not a valid element definition.
 */
export function buildDiffBlock(
  diffId: string,
  components: NewComponent[],
  relationshipLines: string[]
): string {
  const body: string[] = [];
  for (const comp of components) {
    const dot = comp.id.lastIndexOf('.');
    if (dot === -1) {
      body.push(...componentBlock(comp, comp.id, '    '));
      continue;
    }
    body.push(`    extend ${comp.id.slice(0, dot)} {`);
    body.push(...componentBlock(comp, comp.id.slice(dot + 1), '      '));
    body.push('    }');
  }
  for (const line of relationshipLines) {
    body.push(`    ${line.trim()}`);
  }
  return [`diff ${diffId} {`, '  add {', ...body, '  }', '}', ''].join('\n');
}

function canonical(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/**
 * Writes the changes as a `diff` block into a temp copy of the workspace and asks LikeC4
 * to preview applying it. Nothing in the original workspace is written.
 */
export async function previewModelEdits(
  modelPath: string,
  components: NewComponent[],
  relationshipLines: string[]
): Promise<ModelEditsOutcome> {
  const resolvedModel = resolve(modelPath);
  const diffId = `erode_${randomBytes(4).toString('hex')}`;
  const block = buildDiffBlock(diffId, components, relationshipLines);
  const proposalPath = join(resolvedModel, `${diffId}.c4`);

  try {
    return await withTempWorkspaceCopy(
      resolvedModel,
      proposalPath,
      block,
      'erode-likec4-edits',
      async (tmpProposal, tmpDir): Promise<ModelEditsOutcome> => {
        const { LikeC4 } = await import('likec4');
        const likec4 = await LikeC4.fromWorkspace(tmpDir, { printErrors: false });
        const edits = (likec4 as { modelEdits?: { preview?: unknown } }).modelEdits;
        if (!edits || typeof edits.preview !== 'function') {
          return { ok: false, reason: 'likec4 SDK has no modelEdits API' };
        }

        const diffs = DiffListSchema.safeParse(await likec4.modelDiffs.list());
        if (!diffs.success || !diffs.data.some((d) => d.id === diffId)) {
          return { ok: false, reason: `diff ${diffId} not found in workspace` };
        }

        const raw: unknown = await likec4.modelEdits.preview({
          type: 'apply-diff',
          diffId: diffId as never,
          action: 'apply',
        });
        const preview = PreviewSchema.safeParse(raw);
        if (!preview.success) {
          return { ok: false, reason: 'unexpected modelEdits.preview result' };
        }
        if ('error' in preview.data) {
          return { ok: false, reason: preview.data.error };
        }
        if (preview.data.overlaps.length > 0) {
          return { ok: false, reason: `overlaps: ${preview.data.overlaps.join('; ')}` };
        }

        const tmpRoot = canonical(tmpDir);
        const proposal = canonical(tmpProposal);
        const changed = preview.data.documents.filter(
          (d) => canonical(fileURLToPath(d.uri)) !== proposal && d.before !== d.after
        );
        if (changed.length !== 1 || !changed[0]) {
          return {
            ok: false,
            reason: `expected one changed model file, got ${String(changed.length)}`,
          };
        }
        const doc = changed[0];
        if (doc.after.trim() === '') {
          return { ok: false, reason: 'preview deletes a model file' };
        }
        const rel = relative(tmpRoot, canonical(fileURLToPath(doc.uri)));
        if (rel.startsWith('..')) {
          return { ok: false, reason: 'changed file is outside the workspace' };
        }
        return { ok: true, patch: { targetFile: join(resolvedModel, rel), content: doc.after } };
      }
    );
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
