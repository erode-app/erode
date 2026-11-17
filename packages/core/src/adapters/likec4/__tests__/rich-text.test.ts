import { describe, it, expect } from 'vitest';
import { richTextToString } from '../rich-text.js';

describe('richTextToString', () => {
  it('should return plain strings', () => {
    expect(richTextToString('Plain text')).toBe('Plain text');
  });

  it('should read txt sources', () => {
    expect(richTextToString({ $source: { txt: 'From txt' }, isEmpty: false })).toBe('From txt');
  });

  it('should read md sources', () => {
    expect(richTextToString({ $source: { md: '**Bold**' }, isMarkdown: true })).toBe('**Bold**');
  });

  it('should collapse whitespace across lines', () => {
    expect(richTextToString({ $source: { txt: '  line one\n  line two  ' } })).toBe(
      'line one line two'
    );
  });

  it('should return undefined for empty or unknown values', () => {
    expect(richTextToString({ $source: null, isEmpty: true })).toBeUndefined();
    expect(richTextToString('   ')).toBeUndefined();
    expect(richTextToString(undefined)).toBeUndefined();
    expect(richTextToString(42)).toBeUndefined();
  });
});
