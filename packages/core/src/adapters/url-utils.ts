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
