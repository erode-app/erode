import { CONFIG } from '../utils/config.js';
import { ErodeError, ErrorCode } from '../errors.js';
import {
  isPublicInstance,
  isTokenInstance,
  parseRepoLocator,
  type TokenPlatform,
} from '../utils/repo-locator.js';

const PUBLIC_API_URLS: Record<TokenPlatform, string> = {
  github: 'https://api.github.com',
  gitlab: 'https://gitlab.com',
  bitbucket: 'https://api.bitbucket.org/2.0',
};

const BASE_URL_SETTINGS: Record<TokenPlatform, string> = {
  github: 'ERODE_GITHUB_BASE_URL',
  gitlab: 'ERODE_GITLAB_BASE_URL',
  bitbucket: 'ERODE_BITBUCKET_BASE_URL',
};

export interface PlatformEndpoint {
  /** API base URL for the repository's host. */
  baseUrl: string;
  /** True only when the configured token was issued for this host. */
  tokenApplies: boolean;
}

/**
 * Pick the API endpoint from the repository URL's host, with the same host,
 * port and base path rule that URL parsing and token scoping use. Without this,
 * a public URL would be sent to the configured self-hosted instance, which may
 * hold a different repository under the same name, along with its token.
 */
export function resolvePlatformEndpoint(
  repositoryUrl: string,
  platform: TokenPlatform
): PlatformEndpoint {
  const locator = parseRepoLocator(repositoryUrl);
  if (locator && isTokenInstance(locator, platform)) {
    return { baseUrl: CONFIG[platform].baseUrl, tokenApplies: true };
  }
  if (locator && isPublicInstance(locator, platform)) {
    return { baseUrl: PUBLIC_API_URLS[platform], tokenApplies: false };
  }
  const setting = BASE_URL_SETTINGS[platform];
  const host = locator
    ? locator.port
      ? `${locator.host}:${String(locator.port)}`
      : locator.host
    : repositoryUrl;
  const message =
    `Repository host ${host} is neither the public ${platform} host nor the instance ` +
    `configured in ${setting} (${CONFIG[platform].baseUrl}). Set ${setting} to that instance's API URL.`;
  throw new ErodeError(message, ErrorCode.PLATFORM_INVALID_URL, message);
}
