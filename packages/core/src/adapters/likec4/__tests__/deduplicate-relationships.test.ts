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

  it('keeps a relationship when both have a kind and the kinds differ', () => {
    const { kept } = patcher.dedupe(
      [rel('async')],
      [
        { source: 'api', target: 'db', kind: 'sync' },
        { source: 'web', target: 'api', kind: 'async' },
      ]
    );
    expect(kept).toHaveLength(1);
  });

  it('treats a kind the model does not define as no kind, so it is a duplicate', () => {
    const { kept, skipped } = patcher.dedupe(
      [rel('grpc')],
      [{ source: 'api', target: 'db', kind: 'sync' }]
    );
    expect(kept).toHaveLength(0);
    expect(skipped).toHaveLength(1);
  });

  it('drops a relationship when the existing one has no kind', () => {
    const { kept } = patcher.dedupe([rel('async')], [{ source: 'api', target: 'db' }]);
    expect(kept).toHaveLength(0);
  });

  it('applies the kind rule to bidirectional relationships too', () => {
    const reverse = { source: 'db', target: 'api', kind: 'async', description: 'x' };
    const existing = { source: 'api', target: 'db', bidirectional: true };
    const asyncElsewhere = { source: 'web', target: 'api', kind: 'async' };
    expect(
      patcher.dedupe([reverse], [{ ...existing, kind: 'sync' }, asyncElsewhere]).kept
    ).toHaveLength(1);
    expect(patcher.dedupe([reverse], [existing]).kept).toHaveLength(0);
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
