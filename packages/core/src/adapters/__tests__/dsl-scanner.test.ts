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

describe('maskStringsAndComments with Structurizr options', () => {
  const options = { quotes: ['"'], hashComments: true };

  it('treats # at line start as a comment and apostrophes as plain text', () => {
    expect(maskStringsAndComments("  # it's {\nx = \"}\" '{'", options)).toBe(
      `${' '.repeat(10)}\nx =     '{'`
    );
  });

  it('keeps # inside a line, such as a colour', () => {
    expect(maskStringsAndComments('background #ff0000 }', options)).toBe('background #ff0000 }');
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

describe('unquoted URIs', () => {
  it('keeps the brace after a LikeC4 link URI', () => {
    const text = "model {\n  api = service 'API' { link https://x.io }\n}";
    expect(countBraces(text)).toEqual({ open: 2, close: 2 });
    expect(findModelBlocks(text)).toEqual([{ open: 6, close: text.length - 1 }]);
  });

  it('keeps the brace after a Structurizr url', () => {
    const options = { quotes: ['"'], hashComments: true };
    const text = 'model {\n  a = softwareSystem "A" { url https://x.io }\n}';
    expect(countBraces(text, options)).toEqual({ open: 2, close: 2 });
    expect(findModelBlocks(text, options)).toEqual([{ open: 6, close: text.length - 1 }]);
  });

  it('still treats // after a space as a comment', () => {
    expect(countBraces('a { // }\n}')).toEqual({ open: 1, close: 1 });
  });
});

describe('findModelBlocks statement starts', () => {
  it('ignores a byte order mark on the first line', () => {
    expect(findModelBlocks('\uFEFFmodel {\n}')).toEqual([{ open: 7, close: 9 }]);
  });

  it('finds model after { or ; on the same line', () => {
    const options = { quotes: ['"'], hashComments: true };
    const text = 'workspace "x" { model {\n  a = person "A"\n} }';
    expect(findModelBlocks(text, options)).toEqual([{ open: 22, close: text.length - 3 }]);
    expect(findModelBlocks('views { }; model { }')).toEqual([{ open: 17, close: 19 }]);
  });

  it('still rejects extend blocks and elements named model on the same line', () => {
    expect(findModelBlocks('model { extend x.datamodel { } }')).toEqual([{ open: 6, close: 31 }]);
    expect(findModelBlocks("x { model = service 'X' { } }")).toEqual([]);
  });
});

describe('countBraces', () => {
  it('counts only structural braces', () => {
    expect(countBraces("a { description '}' /* } */ // {\n}")).toEqual({ open: 1, close: 1 });
  });
});
