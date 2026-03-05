const REPO_HOSTNAMES: Record<string, string> = {
  'github.com': 'https://github.com',
  'www.github.com': 'https://github.com',
  'gitlab.com': 'https://gitlab.com',
  'www.gitlab.com': 'https://gitlab.com',
  'bitbucket.org': 'https://bitbucket.org',
  'www.bitbucket.org': 'https://bitbucket.org',
};

export function normalizeGitHubUrl(url: string): string {
  try {
    const { pathname } = new URL(url);
    const match = /^\/([^/]+)\/([^/]+)/.exec(pathname);
    if (match?.[1] && match[2]) {
      const owner = match[1].toLowerCase();
      const repo = match[2].replace(/\.git$/, '').toLowerCase();
      return `https://github.com/${owner}/${repo}`;
    }
    return url;
  } catch {
    return url;
  }
}

export function isGitHubUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname === 'github.com' || urlObj.hostname === 'www.github.com';
  } catch {
    return false;
  }
}

export function isRepositoryHostUrl(url: string): boolean {
  try {
    return new URL(url).hostname in REPO_HOSTNAMES;
  } catch {
    return false;
  }
}

export function normalizeRepositoryUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const base = REPO_HOSTNAMES[parsed.hostname];
    if (!base) return url;
    const match = /^\/([^/]+)\/([^/]+)/.exec(parsed.pathname);
    if (match?.[1] && match[2]) {
      const owner = match[1].toLowerCase();
      const repo = match[2].replace(/\.git$/, '').toLowerCase();
      return `${base}/${owner}/${repo}`;
    }
    return url;
  } catch {
    return url;
  }
}
