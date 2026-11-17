import { describe, it, expect } from 'vitest';
import { countBraces, findModelBlocks, maskStringsAndComments } from '../dsl-scanner.js';

describe('maskStringsAndComments', () => {
  it('blanks strings and comments but keeps offsets and newlines', () => {
    const text = "a 'x } y' // }\nb /* {\n} */ c";
    const masked = maskStringsAndComments(text);
    expect(masked).toHaveLength(text.length);
    expect(masked).toBe(`a${' '.repeat(13)}\nb${' '.repeat(5)}\n     c`);
  });

  it('honours backslash escapes in quoted strings', () => {
    expect(maskStringsAndComments("'it\\'s }' }")).toBe('          }');
  });

  it('treats triple-quoted strings as one string across lines', () => {
    expect(maskStringsAndComments("'''a } '\n}''' }")).toBe(`${' '.repeat(8)}\n     }`);
    expect(maskStringsAndComments('"""}""" {')).toBe('        {');
  });
});

describe('findModelBlocks', () => {
  it('ignores extend blocks whose name ends in model', () => {
    const text = "model {\n  extend shop.datamodel {\n    x = service 'X'\n  }\n}";
    expect(findModelBlocks(text)).toEqual([{ open: 6, close: text.length - 1 }]);
  });

  it('accepts tabs, extra spaces and a brace on the next line', () => {
    expect(findModelBlocks('model\t{ }')).toHaveLength(1);
    expect(findModelBlocks('model   { }')).toHaveLength(1);
    expect(findModelBlocks('model\n{\n}')).toEqual([{ open: 6, close: 8 }]);
  });

  it('skips model keywords inside strings and comments, and element names', () => {
    expect(findModelBlocks("// model {\nx = '''\nmodel {\n'''")).toEqual([]);
    expect(findModelBlocks("model = service 'M' {\n}")).toEqual([]);
  });
});

describe('countBraces', () => {
  it('counts only structural braces', () => {
    expect(countBraces("a { description '}' /* } */ // {\n}")).toEqual({ open: 1, close: 1 });
  });
});
