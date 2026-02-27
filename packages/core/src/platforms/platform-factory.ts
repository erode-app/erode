import { ErodeError, ErrorCode } from '../errors.js';
import type { SourcePlatformReader, SourcePlatformWriter } from './source-platform.js';
import { GitHubReader, GitHubWriter } from './github/index.js';
import { GitLabReader, GitLabWriter } from './gitlab/index.js';
import { BitbucketReader, BitbucketWriter } from './bitbucket/index.js';

type Platform = 'github' | 'gitlab' | 'bitbucket';

export function detectPlatform(url: string): Platform {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'github.com' || parsed.hostname === 'www.github.com') {
      return 'github';
    }
    if (parsed.hostname === 'gitlab.com' || parsed.hostname === 'www.gitlab.com') {
      return 'gitlab';
    }
    if (parsed.hostname === 'bitbucket.org' || parsed.hostname === 'www.bitbucket.org') {
      return 'bitbucket';
    }
  } catch {
    throw new ErodeError(
      `Unrecognized URL: ${url}`,
      ErrorCode.PLATFORM_INVALID_URL,
      `Unrecognized URL: ${url}`
    );
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
