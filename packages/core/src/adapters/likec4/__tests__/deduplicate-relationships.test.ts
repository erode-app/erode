import { describe, it, expect } from 'vitest';
import { LikeC4Patcher } from '../patcher.js';
import type { PatchResult } from '../../model-patcher.js';
import type { ModelRelationship } from '../../architecture-types.js';

class TestPatcher extends LikeC4Patcher {
  public dedupe(
    valid: { source: string; target: string; kind?: string; description: string }[],
    existing: ModelRelationship[]
  ) {
    const skipped: PatchResult['skipped'] = [];
    return { kept: this.deduplicateRelationships(valid, existing, skipped), skipped };
  }
}

describe('deduplicateRelationships', () => {
  const patcher = new TestPatcher();
  const rel = (kind?: string) => ({ source: 'api', target: 'db', kind, description: 'x' });

  it('keeps a relationship whose kind differs from the existing one', () => {
    const { kept } = patcher.dedupe([rel('async')], [{ source: 'api', target: 'db' }]);
    expect(kept).toHaveLength(1);
  });

  it('drops a relationship with the same kind', () => {
    const { kept, skipped } = patcher.dedupe(
      [rel('async')],
      [{ source: 'api', target: 'db', kind: 'async' }]
    );
    expect(kept).toHaveLength(0);
    expect(skipped).toHaveLength(1);
  });

  it('drops a kindless relationship when any relationship exists between the pair', () => {
    const { kept } = patcher.dedupe([rel()], [{ source: 'api', target: 'db', kind: 'async' }]);
    expect(kept).toHaveLength(0);
  });

  it('still honours bidirectional existing relationships', () => {
    const { kept } = patcher.dedupe(
      [{ source: 'db', target: 'api', description: 'x' }],
      [{ source: 'api', target: 'db', bidirectional: true }]
    );
    expect(kept).toHaveLength(0);
  });
});
