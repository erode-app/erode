import { describe, it, expect } from 'vitest';
import { StructurizrPatcher } from '../patcher.js';
import type { PatchResult } from '../../model-patcher.js';

class TestPatcher extends StructurizrPatcher {
  public dedupe(
    valid: { source: string; target: string; kind?: string; description: string }[],
    existing: { source: string; target: string; kind?: string }[]
  ) {
    const skipped: PatchResult['skipped'] = [];
    return { kept: this.deduplicateRelationships(valid, existing, skipped), skipped };
  }
}

describe('StructurizrPatcher deduplicateRelationships', () => {
  it('matches on endpoints only, ignoring free-text technology in kind', () => {
    const { kept } = new TestPatcher().dedupe(
      [{ source: 'api', target: 'db', kind: 'async', description: 'x' }],
      [{ source: 'api', target: 'db', kind: 'HTTPS' }]
    );
    expect(kept).toHaveLength(0);
  });
});
