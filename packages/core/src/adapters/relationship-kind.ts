import type { ModelRelationship } from './architecture-types.js';

/** Relationship kinds declared by the model's existing relationships. */
export function knownRelationshipKinds(existing: readonly ModelRelationship[]): Set<string> {
  return new Set(existing.map((r) => r.kind).filter((k): k is string => Boolean(k)));
}

/**
 * The kind a proposed relationship is written with. A kind the model does not use is written
 * as a plain relationship, so it resolves to undefined. Dedup and the writer both go through
 * this so they agree on what ends up in the file.
 */
export function resolveRelationshipKind(
  kind: string | undefined,
  knownKinds: ReadonlySet<string>
): string | undefined {
  return kind && knownKinds.has(kind) ? kind : undefined;
}
