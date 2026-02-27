import { describe, it, expect } from 'vitest';
import { normalizeGitHubUrl, isGitHubUrl } from '../url-utils.js';

describe('normalizeGitHubUrl', () => {
  it('should normalize a standard GitHub URL', () => {
    expect(normalizeGitHubUrl('https://github.com/example/repo')).toBe(
      'https://github.com/example/repo'
    );
  });

  it('should remove trailing slash', () => {
    expect(normalizeGitHubUrl('https://github.com/example/repo/')).toBe(
      'https://github.com/example/repo'
    );
  });

  it('should remove .git suffix', () => {
    expect(normalizeGitHubUrl('https://github.com/example/repo.git')).toBe(
      'https://github.com/example/repo'
    );
  });

  it('should lowercase owner and repo', () => {
    expect(normalizeGitHubUrl('https://github.com/Example/Repo')).toBe(
      'https://github.com/example/repo'
    );
  });

  it('should handle combined normalization', () => {
    expect(normalizeGitHubUrl('https://github.com/Example/Repo.git/')).toBe(
      'https://github.com/example/repo'
    );
  });

  it('should return original URL for invalid URL', () => {
    expect(normalizeGitHubUrl('not-a-url')).toBe('not-a-url');
  });

  it('should return original URL for URL with insufficient path parts', () => {
    expect(normalizeGitHubUrl('https://github.com/')).toBe('https://github.com/');
  });

  it('should handle www.github.com URLs', () => {
    expect(normalizeGitHubUrl('https://www.github.com/example/repo')).toBe(
      'https://github.com/example/repo'
    );
  });

  it('should handle multiple path segments in repo', () => {
    expect(normalizeGitHubUrl('https://github.com/example/repo/extra/path')).toBe(
      'https://github.com/example/repo'
    );
  });
});

describe('isGitHubUrl', () => {
  it('should return true for github.com URLs', () => {
    expect(isGitHubUrl('https://github.com/example/repo')).toBe(true);
  });

  it('should return true for www.github.com URLs', () => {
    expect(isGitHubUrl('https://www.github.com/example/repo')).toBe(true);
  });

  it('should return false for non-GitHub URLs', () => {
    expect(isGitHubUrl('https://gitlab.com/example/repo')).toBe(false);
  });

  it('should return false for invalid URLs', () => {
    expect(isGitHubUrl('not-a-url')).toBe(false);
  });

  it('should return false for GitHub API URLs', () => {
    expect(isGitHubUrl('https://api.github.com/repos/example/repo')).toBe(false);
  });

  it('should handle HTTP URLs', () => {
    expect(isGitHubUrl('http://github.com/example/repo')).toBe(true);
  });
});
