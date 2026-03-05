const REPO_HOSTNAMES: Record<string, string> = {
  'github.com': 'https://github.com',
  'www.github.com': 'https://github.com',
  'gitlab.com': 'https://gitlab.com',
  'www.gitlab.com': 'https://gitlab.com',
  'bitbucket.org': 'https://bitbucket.org',
  'www.bitbucket.org': 'https://bitbucket.org',
};

export function isRepositoryHostUrl(url: string): boolean {
  try {
    return Object.hasOwn(REPO_HOSTNAMES, new URL(url).hostname);
  } catch {
    return false;
  }
}

export function normalizeRepositoryUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const base = REPO_HOSTNAMES[parsed.hostname];
    if (!base) return url;

    // GitLab supports nested groups (e.g. gitlab.com/group/subgroup/project),
    // so preserve all path segments instead of just two.
    if (base === 'https://gitlab.com') {
      const gitlabPath = parsed.pathname.split('/-/')[0] ?? parsed.pathname;
      const parts = gitlabPath.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const last = parts.at(-1);
        if (!last) return url;
        const repo = last.replace(/\.git$/, '').toLowerCase();
        const namespace = parts
          .slice(0, -1)
          .map((p) => p.toLowerCase())
          .join('/');
        return `${base}/${namespace}/${repo}`;
      }
      return url;
    }

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
