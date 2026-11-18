import { describe, it, expect } from 'vitest';
import { CheckOptionsSchema, ConnectionsOptionsSchema } from '../command-schemas.js';

describe('repo option credentials', () => {
  it('strips userinfo from connections --repo', () => {
    const parsed = ConnectionsOptionsSchema.parse({
      repo: 'https://oauth2:SECRET@github.com/org/repo',
    });
    expect(parsed.repo).toBe('https://github.com/org/repo');
  });

  it('strips userinfo from check --repo', () => {
    const parsed = CheckOptionsSchema.parse({ repo: 'https://user:SECRET@gitlab.com/g/p' });
    expect(parsed.repo).toBe('https://gitlab.com/g/p');
  });
});
