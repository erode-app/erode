import { execSync } from 'child_process';
import { ErodeError, ErrorCode } from '../errors.js';

export interface GitDiffOptions {
  /** Only include staged changes. */
  staged?: boolean;
  /** Compare against this branch (e.g. `main`). Uses three-dot diff: `branch...HEAD`. */
  branch?: string;
  /** Working directory for git commands. Defaults to `process.cwd()`. */
  cwd?: string;
}

export interface GitDiffFile {
  filename: string;
  status: string;
}

export interface GitDiffResult {
  diff: string;
  stats: { additions: number; deletions: number; filesChanged: number };
  files: GitDiffFile[];
}

function run(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ErodeError(
      `Git command failed: ${cmd}`,
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
    const match = /^([AMDRC])\d*\t(.+)$/.exec(line);
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
function parseShortstat(output: string): { additions: number; deletions: number; filesChanged: number } {
  const filesMatch = /(\d+) files? changed/.exec(output);
  const addMatch = /(\d+) insertions?/.exec(output);
  const delMatch = /(\d+) deletions?/.exec(output);
  return {
    filesChanged: filesMatch?.[1] ? Number(filesMatch[1]) : 0,
    additions: addMatch?.[1] ? Number(addMatch[1]) : 0,
    deletions: delMatch?.[1] ? Number(delMatch[1]) : 0,
  };
}

function buildDiffArgs(options: GitDiffOptions): string {
  if (options.branch) return `${options.branch}...HEAD`;
  if (options.staged) return '--staged';
  return '';
}

/** Generate a git diff from the local working tree. */
export function generateGitDiff(options: GitDiffOptions = {}): GitDiffResult {
  const cwd = options.cwd ?? process.cwd();
  const args = buildDiffArgs(options);

  const diff = run(`git diff ${args}`, cwd);
  const nameStatus = run(`git diff ${args} --name-status`, cwd);
  const shortstat = run(`git diff ${args} --shortstat`, cwd);

  return {
    diff,
    files: parseNameStatus(nameStatus),
    stats: parseShortstat(shortstat),
  };
}

/**
 * Parse the repository owner and name from a git remote URL.
 * Supports HTTPS and SSH formats.
 */
export function parseRepoFromRemote(remoteUrl: string): { owner: string; repo: string } {
  // HTTPS: https://github.com/owner/repo.git or https://github.com/owner/repo
  const httpsMatch = /(?:https?:\/\/[^/]+\/)(.+?)(?:\.git)?$/.exec(remoteUrl);
  if (httpsMatch?.[1]) {
    const parts = httpsMatch[1].split('/');
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return { owner: parts[0], repo: parts[1] };
    }
  }
  // SSH: git@github.com:owner/repo.git
  const sshMatch = /[^@]+@[^:]+:(.+?)(?:\.git)?$/.exec(remoteUrl);
  if (sshMatch?.[1]) {
    const parts = sshMatch[1].split('/');
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return { owner: parts[0], repo: parts[1] };
    }
  }
  throw new ErodeError(
    `Cannot parse repository from remote URL: ${remoteUrl}`,
    ErrorCode.INPUT_INVALID,
    'Could not determine owner/repo from the git remote URL. Use --repo to specify the repository URL explicitly.'
  );
}
