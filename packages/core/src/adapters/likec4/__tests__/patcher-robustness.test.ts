import { describe, it, expect } from 'vitest';
import { LikeC4Patcher } from '../patcher.js';
import { quickValidatePatch } from '../../base-patcher.js';
import type { NewComponent } from '../../../analysis/analysis-types.js';

class TestPatcher extends LikeC4Patcher {
  public insert(content: string, lines: string[]): string {
    return this.deterministicInsert(content, lines);
  }

  public componentLines(components: NewComponent[]): string[] {
    return this.generateComponentDslLines(components);
  }
}

const patcher = new TestPatcher();

describe('LikeC4Patcher dotted new components', () => {
  it('wraps a dotted ID in an extend block of its parent', () => {
    const [block] = patcher.componentLines([
      { id: 'cloud.backend.billing', kind: 'service', name: 'Billing', technology: 'Go' },
    ]);
    expect(block).toBe(
      [
        '  extend cloud.backend {',
        "    billing = service 'Billing' {",
        "      technology 'Go'",
        '    }',
        '  }',
      ].join('\n')
    );
  });

  it('keeps top-level IDs as plain definitions', () => {
    expect(patcher.componentLines([{ id: 'billing', kind: 'service', name: 'Billing' }])).toEqual([
      "  billing = service 'Billing' {\n  }",
    ]);
  });

  it('re-indents multi-line blocks as a unit when inserting', () => {
    const [block = ''] = patcher.componentLines([
      { id: 'shop.cache', kind: 'service', name: 'Cache' },
    ]);
    const result = patcher.insert("model {\n    shop = system 'Shop'\n}", [block]);
    expect(result).toBe(
      [
        'model {',
        "    shop = system 'Shop'",
        '',
        '    extend shop {',
        "      cache = service 'Cache' {",
        '      }',
        '    }',
        '}',
      ].join('\n')
    );
  });

  it('quick-validates a re-indented multi-line block', () => {
    const original = "model {\n  shop = system 'Shop'\n}";
    const inserted = ["  extend shop {\n    cache = service 'Cache' {\n    }\n  }"];
    const patched =
      "model {\n  shop = system 'Shop'\n\n  extend shop {\n      cache = service 'Cache' {\n      }\n  }\n}";
    expect(quickValidatePatch(original, patched, inserted)).toBe(true);
  });
});

describe('LikeC4Patcher deterministic insert placement', () => {
  it('does not treat extend x.datamodel as the model block', () => {
    const content = [
      'model {',
      "  shop = system 'Shop'",
      '  extend shop.datamodel {',
      "    orders = component 'Orders'",
      '  }',
      '}',
    ].join('\n');
    expect(patcher.insert(content, ['  a -> b'])).toBe(
      [...content.split('\n').slice(0, 5), '', '  a -> b', '}'].join('\n')
    );
  });

  it('finds a model keyword with the brace on the next line', () => {
    const content = "specification {\n  element service\n}\nmodel\n{\n  a = service 'A'\n}";
    expect(patcher.insert(content, ['  a -> a'])).toBe(
      "specification {\n  element service\n}\nmodel\n{\n  a = service 'A'\n\n  a -> a\n}"
    );
  });

  it('ignores a closing brace inside a description string', () => {
    const content = [
      'model {',
      "  a = service 'A' {",
      "    description 'closing } here'",
      '  }',
      '}',
    ].join('\n');
    expect(patcher.insert(content, ['  a -> a'])).toBe(
      [...content.split('\n').slice(0, 4), '', '  a -> a', '}'].join('\n')
    );
  });

  it('ignores braces in block comments and triple-quoted strings', () => {
    const content = [
      'model {',
      "  a = service 'A' {",
      '    /* } */',
      "    description '''",
      '      }',
      "    '''",
      '  }',
      '}',
    ].join('\n');
    expect(patcher.insert(content, ['  a -> a'])).toBe(
      [...content.split('\n').slice(0, 7), '', '  a -> a', '}'].join('\n')
    );
  });

  it('accepts a patch whose original has a brace in a string', () => {
    const original = "model {\n  a = service 'A } B'\n}";
    const patched = "model {\n  a = service 'A } B'\n  a -> a\n}";
    expect(quickValidatePatch(original, patched, ['  a -> a'])).toBe(true);
  });
});
