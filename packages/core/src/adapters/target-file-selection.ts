import { existsSync } from 'fs';
import { isAbsolute, relative, resolve, sep } from 'path';
import type { StructuredRelationship, NewComponent } from '../analysis/analysis-types.js';

export interface TargetFileContext {
  relationships: StructuredRelationship[];
  newComponents: NewComponent[];
  /** Element ID to absolute path of the file that declares it */
  elementSourceFiles?: ReadonlyMap<string, string>;
}

// DSL validation copies the model folder, so a target outside it cannot be validated
function isInside(root: string, file: string): boolean {
  const rel = relative(root, file);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function locateParent(id: string, files: ReadonlyMap<string, string>): string | undefined {
  const parts = id.split('.');
  for (let i = parts.length - 1; i > 0; i--) {
    const file = files.get(parts.slice(0, i).join('.'));
    if (file) return file;
  }
  return undefined;
}

/**
 * Picks the file declaring the elements the patch touches. The patch flow writes
 * a single file, so when votes span several files the majority wins, with ties
 * going to the file that received its first vote earliest. When nothing touched is
 * located, the file declaring the most known elements wins.
 */
export function selectTargetFileByLocation(
  modelPath: string,
  ctx: TargetFileContext
): string | null {
  const files = ctx.elementSourceFiles;
  if (!files || files.size === 0) return null;

  const root = resolve(modelPath);
  const candidates = [
    ...ctx.relationships.map((r) => files.get(r.source) ?? files.get(r.target)),
    ...ctx.newComponents.map((c) => locateParent(c.id, files)),
  ];
  const votes = new Map<string, number>();
  for (const file of candidates) {
    if (file && isInside(root, file) && existsSync(file)) {
      votes.set(file, (votes.get(file) ?? 0) + 1);
    }
  }

  // Nothing touched is located (e.g. only new top-level components): use the file declaring
  // the most loaded elements, which keeps the patch inside the loaded project
  if (votes.size === 0) {
    for (const file of files.values()) {
      if (isInside(root, file) && existsSync(file)) votes.set(file, (votes.get(file) ?? 0) + 1);
    }
  }

  let best: [string, number] | undefined;
  for (const entry of votes) {
    if (!best || entry[1] > best[1]) best = entry;
  }
  return best?.[0] ?? null;
}
