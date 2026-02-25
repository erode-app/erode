import type { LikeC4Element, LikeC4Relationship } from '../../schemas/likec4.schema.js';

export type { LikeC4Element, LikeC4Relationship };

export interface LikeC4Model {
  elements(): Iterable<LikeC4Element>;
  relationships(): Iterable<LikeC4Relationship>;
}
