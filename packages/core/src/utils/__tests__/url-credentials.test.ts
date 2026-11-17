import { describe, it, expect } from 'vitest';
import { redactUrlCredentials, stripUrlUserinfo } from '../url-credentials.js';

describe('stripUrlUserinfo', () => {
  it('removes username and password', () => {
    expect(stripUrlUserinfo('https://oauth2:glpat-XXXX@gitlab.com/g/p')).toBe(
      'https://gitlab.com/g/p'
    );
  });

  it('removes a token used as username only', () => {
    expect(stripUrlUserinfo('http://ghp_abc@github.com/o/r')).toBe('http://github.com/o/r');
  });

  it.each(['owner/repo', 'git@github.com:o/r.git', 'https://github.com/o/r'])(
    'leaves %s unchanged',
    (input) => {
      expect(stripUrlUserinfo(input)).toBe(input);
    }
  );
});

describe('redactUrlCredentials', () => {
  it('redacts https and http credentials', () => {
    expect(redactUrlCredentials('fatal: https://u:t@host/r.git and http://t@host/r')).toBe(
      'fatal: https://host/r.git and http://host/r'
    );
  });

  it('does not cross an unrelated @ in later text', () => {
    const msg = 'clone https://github.com/o/r failed, contact admin@example.com';
    expect(redactUrlCredentials(msg)).toBe(msg);
  });

  it('does not cross whitespace', () => {
    const msg = 'see https://host.example then mail me@x';
    expect(redactUrlCredentials(msg)).toBe(msg);
  });
});
