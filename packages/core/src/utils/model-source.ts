import { execFile } from 'child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { ErodeError, ErrorCode } from '../errors.js';
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
  const token = resolveToken(cloneUrl);

  const tmpDir = await mkdtemp(join(tmpdir(), 'erode-model-'));

  try {
    await cloneRepo(cloneUrl, tmpDir, ref, token);
  } catch (error) {
    await rm(tmpDir, { recursive: true, force: true });
    throw error;
  }

  const localPath = join(tmpDir, modelPath);

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

  let askpassPath: string | undefined;
  if (token) {
    askpassPath = join(tmpdir(), `erode-git-askpass-${String(process.pid)}`);
    await writeFile(askpassPath, `#!/bin/sh\necho "${token}"`, { mode: 0o700 });
    await chmod(askpassPath, 0o700);
    env['GIT_ASKPASS'] = askpassPath;
  }

  try {
    await execFileAsync('git', args, { env });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ErodeError(
      `Failed to clone model repository: ${message}`,
      ErrorCode.IO_CLONE_FAILED,
      `Could not clone ${cloneUrl}. Check the URL, branch "${ref}", and your access token.`,
      { cloneUrl, ref }
    );
  } finally {
    if (askpassPath) {
      await rm(askpassPath, { force: true });
    }
  }
}
