import { execFileSync } from 'child_process';
import { ErodeError, ErrorCode } from '../errors.js';

export interface GitDiffOptions {
  /** Only include staged changes. */
  staged?: boolean;
  /** Compare against this branch (e.g. `main`). Uses three-dot diff: `branch...HEAD`. */
  branch?: string;
  /** Working directory for git commands. Defaults to `process.cwd()`. */
  cwd?: string;
}

interface GitDiffFile {
  filename: string;
  status: string;
}

export interface GitDiffResult {
  diff: string;
  stats: { additions: number; deletions: number; filesChanged: number };
  files: GitDiffFile[];
}

function run(args: string[], cwd: string): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    }).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ErodeError(
      `Git command failed: git ${args.join(' ')}`,
      ErrorCode.IO_FILE_NOT_FOUND,
      `Could not run git command. Make sure you are inside a git repository.\n${message}`
    );
  }
}

/**
 * Parse file list from `git diff --name-status` output.
 * Each line is `<status>\t<filename>` (e.g. `M\tsrc/index.ts`).
 */
function parseNameStatus(output: string): GitDiffFile[] {
  if (!output) return [];
  return output.split('\n').reduce<GitDiffFile[]>((acc, line) => {
    const match = /^([AMDRC])\d*\t(?:.+\t)?(.+)$/.exec(line);
    if (match?.[1] && match[2]) {
      const statusMap: Record<string, string> = {
        A: 'added',
        M: 'modified',
        D: 'removed',
        R: 'renamed',
        C: 'copied',
      };
      acc.push({ filename: match[2], status: statusMap[match[1]] ?? 'modified' });
    }
    return acc;
  }, []);
}

/**
 * Parse `git diff --shortstat` output to extract additions, deletions, and file count.
 * Example: " 3 files changed, 12 insertions(+), 5 deletions(-)"
 */
function parseShortstat(output: string): {
  additions: number;
  deletions: number;
  filesChanged: number;
} {
  const filesMatch = /(\d+) files? changed/.exec(output);
  const addMatch = /(\d+) insertions?/.exec(output);
  const delMatch = /(\d+) deletions?/.exec(output);
  return {
    filesChanged: filesMatch?.[1] ? Number(filesMatch[1]) : 0,
    additions: addMatch?.[1] ? Number(addMatch[1]) : 0,
    deletions: delMatch?.[1] ? Number(delMatch[1]) : 0,
  };
}

function buildDiffArgs(options: GitDiffOptions): string[] {
  if (options.branch && options.staged) {
    throw new ErodeError(
      'Cannot use --branch and --staged together',
      ErrorCode.INPUT_INVALID,
      'The --branch and --staged options are mutually exclusive. Use --branch to compare against a branch, or --staged to check only staged changes.'
    );
  }
  if (options.branch) return [`${options.branch}...HEAD`];
  if (options.staged) return ['--staged'];
  return [];
}

/** Generate a git diff from the local working tree. */
export function generateGitDiff(options: GitDiffOptions = {}): GitDiffResult {
  const cwd = options.cwd ?? process.cwd();
  const args = buildDiffArgs(options);

  const diff = run(['diff', ...args], cwd);
  const nameStatus = run(['diff', ...args, '--name-status'], cwd);
  const shortstat = run(['diff', ...args, '--shortstat'], cwd);

  return {
    diff,
    files: parseNameStatus(nameStatus),
    stats: parseShortstat(shortstat),
  };
}

/** Convert SSH-style git remote URLs to HTTPS. */
export function normaliseToHttps(remote: string): string {
  // git@github.com:owner/repo.git → https://github.com/owner/repo
  const sshMatch = /^git@([^:]+):(.+?)(?:\.git)?$/.exec(remote);
  if (sshMatch?.[1] && sshMatch[2]) {
    return `https://${sshMatch[1]}/${sshMatch[2]}`;
  }
  // Already HTTPS — strip trailing .git
  return remote.replace(/\.git$/, '');
}

/**
 * Parse the repository owner and name from a git remote URL.
 * Supports HTTPS and SSH formats.
 */
export function parseRepoFromRemote(remoteUrl: string): { owner: string; repo: string } {
  // HTTPS: https://github.com/owner/repo.git or https://github.com/owner/repo
  try {
    const url = new URL(remoteUrl);
    const path = url.pathname
      .replace(/^\//, '')
      .replace(/\.git$/, '')
      .replace(/\/$/, '');
    const parts = path.split('/');
    const repo = parts.at(-1);
    const owner = parts.slice(0, -1).join('/');
    if (owner && repo) {
      return { owner, repo };
    }
  } catch {
    // Not a valid URL, try SSH format below
  }
  // SSH: git@github.com:owner/repo.git
  const sshMatch = /^[^@]+@[^:]+:(.+)\/([^/]+?)(?:\.git)?$/.exec(remoteUrl);
  if (sshMatch?.[1] && sshMatch[2]) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }
  throw new ErodeError(
    `Cannot parse repository from remote URL: ${remoteUrl}`,
    ErrorCode.INPUT_INVALID,
    'Could not determine owner/repo from the git remote URL. Use --repo to specify the repository URL explicitly.'
  );
}
