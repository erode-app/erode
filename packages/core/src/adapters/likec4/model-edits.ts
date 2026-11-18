import { realpathSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { LikeC4 } from 'likec4';
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

// Backslashes first, so an input `\` cannot escape the closing quote.
export function escapeLikeC4String(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function componentBlock(comp: NewComponent, localId: string, indent: string): string[] {
  const name = escapeLikeC4String(comp.name);
  const lines = [`${indent}${localId} = ${comp.kind} '${name}' {`];
  if (comp.tags && comp.tags.length > 0) {
    lines.push(`${indent}  ${comp.tags.map((t) => `#${t}`).join(' ')}`);
  }
  if (comp.description) {
    lines.push(`${indent}  description '${escapeLikeC4String(comp.description)}'`);
  }
  if (comp.technology) {
    lines.push(`${indent}  technology '${escapeLikeC4String(comp.technology)}'`);
  }
  lines.push(`${indent}}`);
  return lines;
}

/**
 * Element definition for a new component. A dotted ID becomes `extend <parent> { <local> = ... }`,
 * because a dotted name is not a valid element definition.
 */
export function componentDefinition(comp: NewComponent, indent: string): string[] {
  const dot = comp.id.lastIndexOf('.');
  if (dot === -1) return componentBlock(comp, comp.id, indent);
  return [
    `${indent}extend ${comp.id.slice(0, dot)} {`,
    ...componentBlock(comp, comp.id.slice(dot + 1), `${indent}  `),
    `${indent}}`,
  ];
}

/** Builds a LikeC4 `diff` block with the new components and relationship lines. */
export function buildDiffBlock(
  diffId: string,
  components: NewComponent[],
  relationshipLines: string[]
): string {
  const body: string[] = [];
  for (const comp of components) {
    body.push(...componentDefinition(comp, '    '));
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

type LikeC4Instance = Awaited<ReturnType<typeof LikeC4.fromWorkspace>>;
type ProjectData = ReturnType<LikeC4Instance['languageServices']['projects']>[number];

type Placement =
  { ok: true; project?: ProjectData; moveTo?: string } | { ok: false; reason: string };

/**
 * The project the diff file must belong to. LikeC4 assigns a file to the project whose folder
 * holds it, so a diff at the workspace root misses a project kept in a subfolder.
 */
function placeProposal(
  likec4: LikeC4Instance,
  projectName: string | undefined,
  tmpProposal: string
): Placement {
  const proposal = canonical(tmpProposal);
  const all = likec4.languageServices.projects();
  // The proposal alone can create a root `default` project; that one does not count
  const real = all.filter((p) => p.documents.some((d) => canonical(d.fsPath) !== proposal));
  const project = projectName ? all.find((p) => p.id === projectName) : real[0];
  if (projectName && !project) {
    return { ok: false, reason: `LikeC4 project "${projectName}" not found` };
  }
  if (!projectName && real.length > 1) {
    return { ok: false, reason: 'several LikeC4 projects and adapter.likec4.project is not set' };
  }
  if (!project) return { ok: true };
  const folder = canonical(project.folder.fsPath);
  const inProject = project.documents.some((d) => canonical(d.fsPath) === proposal);
  return inProject ? { ok: true, project } : { ok: true, project, moveTo: folder };
}

async function previewInWorkspace(
  likec4: LikeC4Instance,
  diffId: string,
  tmpProposal: string,
  tmpDir: string,
  resolvedModel: string,
  projectId: ProjectData['id'] | undefined
): Promise<ModelEditsOutcome> {
  const edits = (likec4 as { modelEdits?: { preview?: unknown } }).modelEdits;
  if (!edits || typeof edits.preview !== 'function') {
    return { ok: false, reason: 'likec4 SDK has no modelEdits API' };
  }

  const diffs = DiffListSchema.safeParse(await likec4.modelDiffs.list(projectId));
  if (!diffs.success || !diffs.data.some((d) => d.id === diffId)) {
    return { ok: false, reason: `diff ${diffId} not found in workspace` };
  }

  const raw: unknown = await likec4.modelEdits.preview(
    {
      type: 'apply-diff',
      diffId: diffId as never,
      action: 'apply',
    },
    projectId
  );
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

  const proposal = canonical(tmpProposal);
  const changed = preview.data.documents.filter(
    (d) => canonical(fileURLToPath(d.uri)) !== proposal && d.before !== d.after
  );
  const doc = changed[0];
  if (changed.length !== 1 || !doc) {
    return { ok: false, reason: `expected one changed model file, got ${String(changed.length)}` };
  }
  if (doc.after.trim() === '') {
    return { ok: false, reason: 'preview deletes a model file' };
  }
  const rel = relative(canonical(tmpDir), canonical(fileURLToPath(doc.uri)));
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return { ok: false, reason: 'changed file is outside the workspace' };
  }
  return { ok: true, patch: { targetFile: join(resolvedModel, rel), content: doc.after } };
}

/**
 * Writes the changes as a `diff` block into a temp copy of the workspace and asks LikeC4
 * to preview applying it. Nothing in the original workspace is written.
 */
export async function previewModelEdits(
  modelPath: string,
  components: NewComponent[],
  relationshipLines: string[],
  projectName?: string
): Promise<ModelEditsOutcome> {
  const resolvedModel = resolve(modelPath);
  const diffId = `erode_${randomBytes(4).toString('hex')}`;
  const block = buildDiffBlock(diffId, components, relationshipLines);

  try {
    return await withTempWorkspaceCopy(
      resolvedModel,
      join(resolvedModel, `${diffId}.c4`),
      block,
      'erode-likec4-edits',
      async (tmpProposal, tmpDir) => {
        const { LikeC4 } = await import('likec4');
        const load = () => LikeC4.fromWorkspace(tmpDir, { printErrors: false });
        let likec4: LikeC4Instance | undefined = await load();
        try {
          const placement = placeProposal(likec4, projectName, tmpProposal);
          if (!placement.ok) return placement;
          let proposal = tmpProposal;
          if (placement.moveTo) {
            proposal = join(placement.moveTo, basename(tmpProposal));
            await rename(tmpProposal, proposal);
            const stale = likec4;
            likec4 = undefined;
            await stale.dispose();
            likec4 = await load();
          }
          const projectId = placement.project?.id;
          return await previewInWorkspace(
            likec4,
            diffId,
            proposal,
            tmpDir,
            resolvedModel,
            projectId
          );
        } finally {
          await likec4?.dispose();
        }
      }
    );
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
