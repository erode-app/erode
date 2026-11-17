import { describe, it, expect } from 'vitest';
import { LikeC4Patcher } from '../patcher.js';

class TestPatcher extends LikeC4Patcher {
  public insert(content: string, lines: string[]): string {
    return this.deterministicInsert(content, lines);
  }
}

describe('LikeC4Patcher deterministic insert', () => {
  const patcher = new TestPatcher();

  it('splits a one-line model block', () => {
    expect(patcher.insert("model { a = service 'A' }", ['  a -> b'])).toBe(
      "model { a = service 'A'\n\n  a -> b\n}"
    );
  });

  it('indents entries one level inside an empty model block', () => {
    expect(patcher.insert('  model {\n  }', ['a -> b'])).toBe('  model {\n\n    a -> b\n  }');
  });

  it('ignores braces inside quoted titles', () => {
    const content = "model { a = service 'Team } services'\n  b = service 'B'\n}";
    expect(patcher.insert(content, ['  a -> b'])).toBe(
      "model { a = service 'Team } services'\n  b = service 'B'\n\n  a -> b\n}"
    );
  });

  it('ignores braces in line comments', () => {
    const content = "model { // closes with }\n  a = service 'A'\n}";
    expect(patcher.insert(content, ['  a -> a'])).toBe(
      "model { // closes with }\n  a = service 'A'\n\n  a -> a\n}"
    );
  });
});
