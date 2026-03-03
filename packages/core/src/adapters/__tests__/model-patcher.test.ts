import { describe, it, expect } from 'vitest';
import { quickValidatePatch } from '../model-patcher.js';

describe('quickValidatePatch', () => {
  it('should return true when all original lines preserved', () => {
    const original = 'model {\n  comp.a -> comp.b\n}\n';
    const patched = 'model {\n  comp.a -> comp.b\n  comp.a -> comp.c\n}\n';
    const inserted = ['  comp.a -> comp.c'];

    expect(quickValidatePatch(original, patched, inserted)).toBe(true);
  });

  it('should return false when an original line is missing from patched output', () => {
    const original = 'model {\n  comp.a -> comp.b\n  comp.x -> comp.y\n}\n';
    const patched = 'model {\n  comp.a -> comp.b\n  comp.a -> comp.c\n}\n';
    const inserted = ['  comp.a -> comp.c'];

    expect(quickValidatePatch(original, patched, inserted)).toBe(false);
  });

  it('should return false when an inserted line is not found in patched content', () => {
    const original = 'model {\n  comp.a -> comp.b\n}\n';
    const patched = 'model {\n  comp.a -> comp.b\n}\n';
    const inserted = ['  comp.a -> comp.c'];

    expect(quickValidatePatch(original, patched, inserted)).toBe(false);
  });

  it('should return false when open and close braces do not match', () => {
    const original = 'model {\n  comp.a -> comp.b\n}\n';
    const patched = 'model {\n  comp.a -> comp.b\n  comp.a -> comp.c\n';
    const inserted = ['  comp.a -> comp.c'];

    expect(quickValidatePatch(original, patched, inserted)).toBe(false);
  });

  it('should return true even if whitespace-only lines from original are not in patched', () => {
    const original = 'model {\n  comp.a -> comp.b\n\n}\n';
    const patched = 'model {\n  comp.a -> comp.b\n  comp.a -> comp.c\n}\n';
    const inserted = ['  comp.a -> comp.c'];

    expect(quickValidatePatch(original, patched, inserted)).toBe(true);
  });
});
