import { ErodeError, ErrorCode } from '../errors.js';
import { parseRepoLocator } from '../utils/repo-locator.js';
import type { ChangeRequestRef } from './source-platform.js';

/**
 * Path segments that introduce the change request number, directly after the
 * repository path (and any self-hosted base path). Bitbucket Data Center/Server
 * PR URLs are not accepted: they parse as `bitbucket-server`, which has no reader.
 */
const MARKERS: Record<'github' | 'gitlab' | 'bitbucket', readonly string[]> = {
  github: ['pull'],
  gitlab: ['-', 'merge_requests'],
  bitbucket: ['pull-requests'],
};

/**
 * Parse a PR or MR URL for `platform`. Anything after the number (`/files`,
 * `/diffs`, a trailing slash, query or fragment) is ignored.
 */
export function parseChangeRequestRef(
  url: string,
  platform: 'github' | 'gitlab' | 'bitbucket',
  errorMessage: string
): ChangeRequestRef {
  const invalid = new ErodeError(errorMessage, ErrorCode.PLATFORM_INVALID_URL, errorMessage);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw invalid;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw invalid;

  const locator = parseRepoLocator(url);
  if (locator?.platform !== platform) throw invalid;

  // The marker must follow the repository path, so `/o/r/tree/pull/1` is not PR 1.
  const segments = parsed.pathname.split('/').filter(Boolean);
  const repoDepth = new URL(locator.canonicalUrl).pathname.split('/').filter(Boolean).length;
  const marker = MARKERS[platform];
  if (!marker.every((m, i) => segments[repoDepth + i] === m)) throw invalid;
  const number = segments[repoDepth + marker.length];
  if (!number || !/^\d+$/.test(number)) throw invalid;

  return {
    number: parseInt(number, 10),
    url,
    repositoryUrl: locator.canonicalUrl,
    platformId: { owner: locator.owner, repo: locator.repo },
  };
}
