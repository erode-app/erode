import { describe, it, expect } from 'vitest';
import {
  normalizeGitHubUrl,
  isGitHubUrl,
  isRepositoryHostUrl,
  normalizeRepositoryUrl,
} from '../url-utils.js';

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

describe('isRepositoryHostUrl', () => {
  it('should accept GitHub URLs', () => {
    expect(isRepositoryHostUrl('https://github.com/example/repo')).toBe(true);
    expect(isRepositoryHostUrl('https://www.github.com/example/repo')).toBe(true);
  });

  it('should accept GitLab URLs', () => {
    expect(isRepositoryHostUrl('https://gitlab.com/example/repo')).toBe(true);
    expect(isRepositoryHostUrl('https://www.gitlab.com/example/repo')).toBe(true);
  });

  it('should accept Bitbucket URLs', () => {
    expect(isRepositoryHostUrl('https://bitbucket.org/example/repo')).toBe(true);
    expect(isRepositoryHostUrl('https://www.bitbucket.org/example/repo')).toBe(true);
  });

  it('should reject spoofed domains', () => {
    expect(isRepositoryHostUrl('https://evil-github.com/owner/repo')).toBe(false);
    expect(isRepositoryHostUrl('https://api.github.com/repos/owner/repo')).toBe(false);
    expect(isRepositoryHostUrl('https://evil.com?redirect=github.com/owner/repo')).toBe(false);
    expect(isRepositoryHostUrl('https://notgitlab.com/example/repo')).toBe(false);
    expect(isRepositoryHostUrl('https://bitbucket.com/example/repo')).toBe(false);
  });

  it('should return false for invalid URLs', () => {
    expect(isRepositoryHostUrl('not-a-url')).toBe(false);
    expect(isRepositoryHostUrl('')).toBe(false);
  });
});

describe('normalizeRepositoryUrl', () => {
  it('should normalize GitHub URLs', () => {
    expect(normalizeRepositoryUrl('https://github.com/Example/Repo.git')).toBe(
      'https://github.com/example/repo'
    );
    expect(normalizeRepositoryUrl('https://www.github.com/Example/Repo')).toBe(
      'https://github.com/example/repo'
    );
  });

  it('should normalize GitLab URLs', () => {
    expect(normalizeRepositoryUrl('https://gitlab.com/Example/Repo')).toBe(
      'https://gitlab.com/example/repo'
    );
    expect(normalizeRepositoryUrl('https://gitlab.com/Example/Repo.git')).toBe(
      'https://gitlab.com/example/repo'
    );
    expect(normalizeRepositoryUrl('https://www.gitlab.com/Example/Repo')).toBe(
      'https://gitlab.com/example/repo'
    );
  });

  it('should normalize Bitbucket URLs', () => {
    expect(normalizeRepositoryUrl('https://bitbucket.org/Example/Repo')).toBe(
      'https://bitbucket.org/example/repo'
    );
    expect(normalizeRepositoryUrl('https://bitbucket.org/Example/Repo.git')).toBe(
      'https://bitbucket.org/example/repo'
    );
    expect(normalizeRepositoryUrl('https://www.bitbucket.org/Example/Repo')).toBe(
      'https://bitbucket.org/example/repo'
    );
  });

  it('should strip trailing path segments', () => {
    expect(normalizeRepositoryUrl('https://github.com/example/repo/extra/path')).toBe(
      'https://github.com/example/repo'
    );
    expect(normalizeRepositoryUrl('https://gitlab.com/example/repo/extra/path')).toBe(
      'https://gitlab.com/example/repo'
    );
  });

  it('should return original URL for unknown hosts', () => {
    expect(normalizeRepositoryUrl('https://example.com/owner/repo')).toBe(
      'https://example.com/owner/repo'
    );
  });

  it('should return original string for invalid URLs', () => {
    expect(normalizeRepositoryUrl('not-a-url')).toBe('not-a-url');
  });
});
