const REPO_HOSTNAMES: Record<string, string> = {
  'github.com': 'https://github.com',
  'www.github.com': 'https://github.com',
  'gitlab.com': 'https://gitlab.com',
  'www.gitlab.com': 'https://gitlab.com',
  'bitbucket.org': 'https://bitbucket.org',
  'www.bitbucket.org': 'https://bitbucket.org',
  'dev.azure.com': 'https://dev.azure.com',
  'ssh.dev.azure.com': 'https://dev.azure.com',
};

const AZURE_BASE = 'https://dev.azure.com';

/**
 * Canonical `{org}/…/_git/{repo}` path for an Azure DevOps repository URL, or
 * undefined when the URL is not a repository (e.g. a bare project page).
 * Handles the web layout `/{org}/{project}/_git/{repo}` and the SSH-derived
 * layout `/v3/{org}/{project}/{repo}`.
 */
function azureRepoPath(pathname: string): string | undefined {
  const parts = pathname.split('/').filter(Boolean);
  const gitIdx = parts.indexOf('_git');
  const webRepo = gitIdx > 0 ? parts[gitIdx + 1] : undefined;
  let segments: string[] | undefined;
  if (webRepo) {
    // web: [org, project, _git, repo] -> [org, project, repo]
    segments = [...parts.slice(0, gitIdx), webRepo];
  } else if (parts[0] === 'v3' && parts.length >= 4) {
    // ssh: [v3, org, project, repo] -> [org, project, repo]
    segments = parts.slice(1);
  }
  const repoSegment = segments?.at(-1);
  if (!segments || segments.length < 2 || !repoSegment) return undefined;
  const repo = repoSegment.replace(/\.git$/, '').toLowerCase();
  const namespace = segments
    .slice(0, -1)
    .map((p) => p.toLowerCase())
    .join('/');
  return `${namespace}/_git/${repo}`;
}

export function isRepositoryHostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!Object.hasOwn(REPO_HOSTNAMES, parsed.hostname)) return false;
    // Azure URLs are repositories only when they carry a repo path; a bare
    // project page (dev.azure.com/{org}/{project}) is not a repository, and
    // would pass validation while being unmatchable by check.
    if (REPO_HOSTNAMES[parsed.hostname] === AZURE_BASE) {
      return azureRepoPath(parsed.pathname) !== undefined;
    }
    return true;
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

    // Azure DevOps: canonicalize both the web layout
    // (dev.azure.com/{org}/{project}/_git/{repo}) and the SSH-derived layout
    // (ssh.dev.azure.com/v3/{org}/{project}/{repo}) to the same URL, so an SSH
    // remote matches a web link. Non-repository URLs are left unchanged.
    if (base === AZURE_BASE) {
      const path = azureRepoPath(parsed.pathname);
      return path ? `${base}/${path}` : url;
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
