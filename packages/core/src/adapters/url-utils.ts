/**
 * GitHub URL utility functions for normalizing and validating GitHub URLs.
 */

/**
 * Normalize a GitHub URL to a canonical form: https://github.com/{owner}/{repo}
 * Handles trailing slashes, .git suffix, and case normalization.
 *
 * @param url - The GitHub URL to normalize
 * @returns The normalized URL, or the original URL if normalization fails
 */
export function normalizeGitHubUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 2 && pathParts[0] && pathParts[1]) {
      const owner = pathParts[0].toLowerCase();
      const repo = pathParts[1].replace('.git', '').toLowerCase();
      return `https://github.com/${owner}/${repo}`;
    }
    return url;
  } catch {
    return url;
  }
}

/**
 * Check if a URL points to a GitHub repository.
 *
 * @param url - The URL to check
 * @returns true if the URL is a valid GitHub URL, false otherwise
 */
export function isGitHubUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname === 'github.com' || urlObj.hostname === 'www.github.com';
  } catch {
    return false;
  }
}
