import { describe, it, expect } from 'vitest';
import { BasePatcher } from '../base-patcher.js';
import { countBraces, maskStringsAndComments } from '../dsl-scanner.js';

class TestPatcher extends BasePatcher {
  protected readonly formatName = 'Test';
  protected readonly formatId = 'test';
  protected readonly defaultIndent = '  ';
  protected readonly kindSensitiveDedup = false;
  protected generateDslLines(): string[] {
    return [];
  }
  protected generateComponentDslLines(): string[] {
    return [];
  }
  protected findTargetFile(): string | null {
    return null;
  }
  protected validateDsl(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  insert(content: string, lines: string[]): string {
    return this.deterministicInsert(content, lines);
  }
}

describe('URL paths are not comments', () => {
  it.each([
    ['link', 'https://x.io/api/*'],
    ['url', 'https://x.io/a/*b'],
    ['link', 'https://x.io/a//b'],
  ])('inserts inside model after `%s %s`', (keyword, uri) => {
    const content = [
      'model {',
      `  api = service 'API' {`,
      `    ${keyword} ${uri}`,
      '  }',
      `  db = database 'DB'`,
      '}',
      '',
    ].join('\n');
    const result = new TestPatcher().insert(content, ['  api -> db']).split('\n');
    expect(result).toEqual([
      'model {',
      `  api = service 'API' {`,
      `    ${keyword} ${uri}`,
      '  }',
      `  db = database 'DB'`,
      '',
      '  api -> db',
      '}',
      '',
    ]);
    expect(countBraces(content)).toEqual({ open: 2, close: 2 });
  });

  it('still masks real block and line comments', () => {
    const text = 'a /* { */ b // }\n{ // }\n} /* x\n}';
    expect(maskStringsAndComments(text)).toBe('a         b     \n{     \n}     \n ');
  });

  it('masks comments right after braces and semicolons', () => {
    expect(maskStringsAndComments('a{// x')).toBe('a{    ');
    expect(maskStringsAndComments('a}// x')).toBe('a}    ');
    expect(maskStringsAndComments('a;/* x */')).toBe('a;       ');
  });
});
