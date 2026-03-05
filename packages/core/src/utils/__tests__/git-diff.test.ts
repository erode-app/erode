import { describe, it, expect } from 'vitest';
import { parseRepoFromRemote } from '../git-diff.js';
import { ErodeError } from '../../errors.js';

describe('parseRepoFromRemote', () => {
  it('parses HTTPS URL', () => {
    const result = parseRepoFromRemote('https://github.com/erode-app/erode');
    expect(result).toEqual({ owner: 'erode-app', repo: 'erode' });
  });

  it('parses HTTPS URL with .git suffix', () => {
    const result = parseRepoFromRemote('https://github.com/erode-app/erode.git');
    expect(result).toEqual({ owner: 'erode-app', repo: 'erode' });
  });

  it('parses HTTPS URL with trailing slash', () => {
    const result = parseRepoFromRemote('https://github.com/erode-app/erode/');
    expect(result).toEqual({ owner: 'erode-app', repo: 'erode' });
  });

  it('parses SSH URL', () => {
    const result = parseRepoFromRemote('git@github.com:erode-app/erode.git');
    expect(result).toEqual({ owner: 'erode-app', repo: 'erode' });
  });

  it('parses SSH URL without .git suffix', () => {
    const result = parseRepoFromRemote('git@github.com:erode-app/erode');
    expect(result).toEqual({ owner: 'erode-app', repo: 'erode' });
  });

  it('parses GitLab HTTPS URL', () => {
    const result = parseRepoFromRemote('https://gitlab.com/group/project');
    expect(result).toEqual({ owner: 'group', repo: 'project' });
  });

  it('throws on invalid URL', () => {
    expect(() => parseRepoFromRemote('not-a-url')).toThrow(ErodeError);
  });

  it('throws on empty string', () => {
    expect(() => parseRepoFromRemote('')).toThrow(ErodeError);
  });
});
