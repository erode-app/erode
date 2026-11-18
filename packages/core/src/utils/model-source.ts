import { execFile } from 'child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { ConfigurationError, ErodeError, ErrorCode } from '../errors.js';
import { CONFIG } from './config.js';
import { redactUrlCredentials } from './url-credentials.js';
import {
  isTokenInstance,
  parseRepoLocator,
  type RepoLocator,
  type RepoPlatform,
  type TokenPlatform,
} from './repo-locator.js';

const execFileAsync = promisify(execFile);

export interface ResolvedModelSource {
  /** Absolute path to the local directory containing model files. */
  localPath: string;
  /** `owner/repo` slug when cloned from a remote repository. */
  repoSlug?: string;
  /** Removes the temporary clone directory (no-op for local paths). */
  cleanup(): Promise<void>;
}

interface ResolveOptions {
  ref?: string;
}

/**
 * Resolve a model source to a local path. When `modelRepo` is provided, clones
 * the repository to a temp directory and returns the joined subpath. When
 * `modelRepo` is absent, returns `modelPath` as-is with a no-op cleanup.
 */
export async function resolveModelSource(
  modelPath: string,
  modelRepo?: string,
  options: ResolveOptions = {}
): Promise<ResolvedModelSource> {
  if (!modelRepo) {
    return {
      localPath: modelPath,
      cleanup: () => Promise.resolve(),
    };
  }

  const { cloneUrl, slug, platform, asGiven, locator } = locateModelRepo(modelRepo);
  const ref = options.ref ?? 'main';
  validateRef(ref);
  let token = asGiven ? undefined : resolveToken(locator);
  if (token && !cloneUrl.startsWith('https://')) {
    console.warn(
      `[erode] Cloning ${cloneUrl} without credentials: the access token is never sent over plain http.`
    );
    token = undefined;
  }
  const effectiveUrl = token ? injectAuthUsername(cloneUrl, platform) : cloneUrl;

  const tmpDir = await mkdtemp(join(tmpdir(), 'erode-model-'));

  try {
    await cloneRepo(effectiveUrl, cloneUrl, tmpDir, ref, token);
  } catch (error) {
    await rm(tmpDir, { recursive: true, force: true });
    throw error;
  }

  const localPath = join(tmpDir, modelPath);
  assertPathContainment(localPath, tmpDir);

  return {
    localPath,
    repoSlug: slug,
    async cleanup() {
      await rm(tmpDir, { recursive: true, force: true });
    },
  };
}

/**
 * Parse a model repo argument into a clone URL and `owner/repo` slug.
 *
 * Accepts anything `parseRepoLocator` does, plus `owner/repo` (GitHub):
 * - HTTPS URLs, including web links such as `.../-/tree/main` or `.../tree/main`
 * - SSH remotes (`git@host:owner/repo.git`, `ssh://git@host:2222/owner/repo.git`).
 *   These are cloned over SSH as given, so the user's keys and host aliases
 *   apply; no token is used. `git://` URLs are also cloned as given.
 * - `http://` URLs are cloned without a token.
 */
export function parseModelRepo(modelRepo: string): { cloneUrl: string; slug: string } {
  const { cloneUrl, slug } = locateModelRepo(modelRepo);
  return { cloneUrl, slug };
}

function locateModelRepo(modelRepo: string): {
  cloneUrl: string;
  slug: string;
  platform: RepoPlatform;
  /** Clone the input unchanged and without a token (SSH and `git://`). */
  asGiven: boolean;
  locator: RepoLocator;
} {
  const locator = parseRepoLocator(modelRepo, { allowShorthand: true });
  if (!locator) {
    throw new ConfigurationError(
      `Invalid model repository: ${modelRepo}. Use owner/repo, an HTTPS URL, or an SSH remote.`
    );
  }
  const { slug, platform } = locator;
  if (locator.protocol === 'ssh' || locator.protocol === 'git') {
    return { cloneUrl: modelRepo.trim(), slug, platform, asGiven: true, locator };
  }
  let cloneUrl = `${locator.canonicalUrl}.git`;
  if (platform === 'azure-devops') cloneUrl = locator.canonicalUrl;
  if (platform === 'bitbucket-server') {
    cloneUrl = locator.canonicalUrl.replace(/\/projects\/([^/]+)\/repos\//, '/scm/$1/') + '.git';
  }
  if (locator.protocol === 'http') cloneUrl = cloneUrl.replace(/^https:/, 'http:');
  return { cloneUrl, slug, platform, asGiven: false, locator };
}

const TOKEN_PLATFORMS: Partial<Record<RepoPlatform, TokenPlatform>> = {
  github: 'github',
  gitlab: 'gitlab',
  bitbucket: 'bitbucket',
  'bitbucket-server': 'bitbucket',
};

/** The platform token, only when the repository is on the instance that token belongs to. */
function resolveToken(locator: RepoLocator): string | undefined {
  const tokenPlatform = TOKEN_PLATFORMS[locator.platform];
  if (!tokenPlatform || !isTokenInstance(locator, tokenPlatform)) return undefined;
  switch (tokenPlatform) {
    case 'github':
      return CONFIG.github.modelRepoPrToken ?? CONFIG.github.token;
    case 'gitlab':
      return CONFIG.gitlab.token;
    case 'bitbucket':
      return CONFIG.bitbucket.token;
  }
}

const AUTH_USERNAMES: Partial<Record<RepoPlatform, string>> = {
  github: 'x-access-token',
  gitlab: 'oauth2',
  bitbucket: 'x-token-auth',
};

function injectAuthUsername(cloneUrl: string, platform: RepoPlatform): string {
  const user = AUTH_USERNAMES[platform] ?? 'token';
  return cloneUrl.replace(/^https:\/\//, `https://${user}@`);
}

async function cloneRepo(
  effectiveUrl: string,
  cloneUrl: string,
  targetDir: string,
  ref: string,
  token?: string
): Promise<void> {
  const args = ['clone', '--depth', '1', '--branch', ref, '--', effectiveUrl, targetDir];
  const env: Record<string, string> = { ...process.env } as Record<string, string>;

  let askpassDir: string | undefined;
  if (token) {
    askpassDir = await mkdtemp(join(tmpdir(), 'erode-askpass-'));
    const askpassPath = join(askpassDir, 'askpass');
    const escaped = token.replace(/'/g, "'\\''");
    await writeFile(askpassPath, `#!/bin/sh\necho '${escaped}'`, { mode: 0o700 });
    await chmod(askpassPath, 0o700);
    env['GIT_ASKPASS'] = askpassPath;
  }

  try {
    await execFileAsync('git', args, { env });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = redactUrlCredentials(rawMessage);
    const safeUrl = redactUrlCredentials(cloneUrl);
    throw new ErodeError(
      `Failed to clone model repository: ${message}`,
      ErrorCode.IO_CLONE_FAILED,
      `Could not clone ${safeUrl}. Check the URL, branch "${ref}", and your access token.`,
      { cloneUrl: safeUrl, ref }
    );
  } finally {
    if (askpassDir) {
      await rm(askpassDir, { recursive: true, force: true });
    }
  }
}

const GIT_REF_PATTERN = /^[a-zA-Z0-9._/-]+$/;

function validateRef(ref: string): void {
  if (!GIT_REF_PATTERN.test(ref)) {
    throw new ConfigurationError(
      'Invalid model ref: must contain only alphanumeric, dots, slashes, underscores, and hyphens'
    );
  }
}

function assertPathContainment(localPath: string, baseDir: string): void {
  const resolved = resolve(localPath);
  const resolvedBase = resolve(baseDir);
  if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + sep)) {
    throw new ConfigurationError('Model path must be within the cloned repository');
  }
}
