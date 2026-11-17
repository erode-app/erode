import { ErodeError, ErrorCode } from '../errors.js';
import type { SourcePlatformReader, SourcePlatformWriter } from './source-platform.js';
import { GitHubReader, GitHubWriter } from './github/index.js';
import { GitLabReader, GitLabWriter } from './gitlab/index.js';
import { BitbucketReader, BitbucketWriter } from './bitbucket/index.js';
import { parseRepoLocator, platformForHost, type RepoPlatform } from '../utils/repo-locator.js';

type Platform = 'github' | 'gitlab' | 'bitbucket';

function hostPlatform(url: string): RepoPlatform | undefined {
  const locator = parseRepoLocator(url);
  if (locator) return locator.platform;
  try {
    return platformForHost(new URL(url).hostname);
  } catch {
    return undefined;
  }
}

export function detectPlatform(url: string): Platform {
  const platform = hostPlatform(url);
  if (platform === undefined) {
    throw new ErodeError(
      `Unrecognized URL: ${url}`,
      ErrorCode.PLATFORM_INVALID_URL,
      `Unrecognized URL: ${url}`
    );
  }
  if (platform === 'github' || platform === 'gitlab' || platform === 'bitbucket') {
    return platform;
  }
  if (platform === 'unknown') {
    const message =
      `Unrecognized repository host in URL: ${url}. For a self-hosted instance, set ` +
      'ERODE_GITHUB_BASE_URL, ERODE_GITLAB_BASE_URL or ERODE_BITBUCKET_BASE_URL.';
    throw new ErodeError(message, ErrorCode.PLATFORM_INVALID_URL, message);
  }

  throw new ErodeError(
    `Unsupported platform for URL: ${url}. Only GitHub, GitLab, and Bitbucket are supported.`,
    ErrorCode.PLATFORM_INVALID_URL,
    `Unsupported platform for URL: ${url}. Only GitHub, GitLab, and Bitbucket are supported.`
  );
}

export function createPlatformReader(url: string, token?: string): SourcePlatformReader {
  const platform = detectPlatform(url);
  switch (platform) {
    case 'github':
      return new GitHubReader(token);
    case 'gitlab':
      return new GitLabReader(token);
    case 'bitbucket':
      return new BitbucketReader(token);
    default: {
      const _exhaustive: never = platform;
      throw new ErodeError(
        `Unsupported platform: ${String(_exhaustive)}`,
        ErrorCode.PLATFORM_INVALID_URL,
        `Unsupported platform. Supported platforms: GitHub, GitLab, Bitbucket.`
      );
    }
  }
}

export function createPlatformWriter(
  repositoryUrl: string,
  targetOwner: string,
  targetRepo: string
): SourcePlatformWriter {
  const platform = detectPlatform(repositoryUrl);
  switch (platform) {
    case 'github':
      return new GitHubWriter(targetOwner, targetRepo);
    case 'gitlab':
      return new GitLabWriter(targetOwner, targetRepo);
    case 'bitbucket':
      return new BitbucketWriter(targetOwner, targetRepo);
    default: {
      const _exhaustive: never = platform;
      throw new ErodeError(
        `Unsupported platform: ${String(_exhaustive)}`,
        ErrorCode.PLATFORM_INVALID_URL,
        `Unsupported platform. Supported platforms: GitHub, GitLab, Bitbucket.`
      );
    }
  }
}
