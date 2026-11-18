import { describe, it, expect } from 'vitest';
import { StructurizrPatcher } from '../patcher.js';
import { quickValidatePatch } from '../../base-patcher.js';

class TestPatcher extends StructurizrPatcher {
  public insert(content: string, lines: string[]): string {
    return this.deterministicInsert(content, lines);
  }
}

const content = [
  "# Bob's workspace",
  'workspace {',
  '    model {',
  '        a = softwareSystem "A"',
  '    }',
  "    // Ops team's views",
  '    views {',
  '    }',
  '}',
].join('\n');
const lines = content.split('\n');

describe('StructurizrPatcher deterministic insert', () => {
  it('ignores apostrophes in # and // comments', () => {
    expect(new TestPatcher().insert(content, ['        a -> a "uses"'])).toBe(
      [...lines.slice(0, 4), '', '        a -> a "uses"', ...lines.slice(4)].join('\n')
    );
  });

  it('quick-validates with Structurizr scan options', () => {
    const patched = content.replace('    }\n    //', '        a -> a "uses"\n    }\n    //');
    const options = { quotes: ['"'], hashComments: true };
    expect(quickValidatePatch(content, patched, ['a -> a "uses"'], options)).toBe(true);
  });
});
