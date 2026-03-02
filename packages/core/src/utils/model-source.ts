import { execFile } from 'child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { ConfigurationError, ErodeError, ErrorCode } from '../errors.js';
import { CONFIG } from './config.js';
import { detectPlatform } from '../platforms/platform-factory.js';

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

  const { cloneUrl, slug } = parseModelRepo(modelRepo);
  const ref = options.ref ?? 'main';
  validateRef(ref);
  const token = resolveToken(cloneUrl);

  const tmpDir = await mkdtemp(join(tmpdir(), 'erode-model-'));

  try {
    await cloneRepo(cloneUrl, tmpDir, ref, token);
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
 * Accepts:
 * - Full URLs: `https://github.com/owner/repo`, `https://gitlab.com/group/project`
 * - Slugs: `owner/repo` (infers GitHub)
 */
export function parseModelRepo(modelRepo: string): { cloneUrl: string; slug: string } {
  // Full URL
  if (/^https?:\/\//.test(modelRepo)) {
    const slug = extractSlugFromUrl(modelRepo);
    const cleanUrl = modelRepo.replace(/\.git\/?$/, '').replace(/\/+$/, '');
    return { cloneUrl: `${cleanUrl}.git`, slug };
  }

  // Bare slug — assume GitHub
  const slug = modelRepo.replace(/\/+$/, '');
  return { cloneUrl: `https://github.com/${slug}.git`, slug };
}

function extractSlugFromUrl(url: string): string {
  const parsed = new URL(url);
  // Remove leading slash and trailing .git / slashes
  const path = parsed.pathname
    .replace(/^\//, '')
    .replace(/\.git\/?$/, '')
    .replace(/\/+$/, '');
  return path;
}

function resolveToken(cloneUrl: string): string | undefined {
  try {
    const platform = detectPlatform(cloneUrl);
    switch (platform) {
      case 'github':
        return CONFIG.github.modelRepoPrToken ?? CONFIG.github.token;
      case 'gitlab':
        return CONFIG.gitlab.token;
      case 'bitbucket':
        return CONFIG.bitbucket.token;
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

function authUsername(cloneUrl: string): string {
  try {
    const platform = detectPlatform(cloneUrl);
    switch (platform) {
      case 'github':
        return 'x-access-token';
      case 'gitlab':
        return 'oauth2';
      case 'bitbucket':
        return 'x-token-auth';
      default:
        return 'token';
    }
  } catch {
    return 'token';
  }
}

function injectAuthUsername(cloneUrl: string): string {
  const user = authUsername(cloneUrl);
  return cloneUrl.replace('https://', `https://${user}@`);
}

async function cloneRepo(
  cloneUrl: string,
  targetDir: string,
  ref: string,
  token?: string
): Promise<void> {
  const effectiveUrl = token ? injectAuthUsername(cloneUrl) : cloneUrl;
  const args = ['clone', '--depth', '1', '--branch', ref, effectiveUrl, targetDir];
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
    const message = stripUrlCredentials(rawMessage);
    throw new ErodeError(
      `Failed to clone model repository: ${message}`,
      ErrorCode.IO_CLONE_FAILED,
      `Could not clone ${cloneUrl}. Check the URL, branch "${ref}", and your access token.`,
      { cloneUrl, ref }
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

function stripUrlCredentials(message: string): string {
  return message.replace(/https:\/\/[^@]+@/g, 'https://');
}
