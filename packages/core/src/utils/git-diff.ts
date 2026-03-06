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

export interface GitDiffFile {
  filename: string;
  status: string;
}

export interface GitDiffResult {
  diff: string;
  stats: { additions: number; deletions: number; filesChanged: number };
  files: GitDiffFile[];
}

const STATUS_MAP: Record<string, string> = {
  A: 'added',
  M: 'modified',
  D: 'removed',
  R: 'renamed',
  C: 'copied',
};

function classifyGitError(message: string): ErrorCode {
  if (/not a git repository/i.test(message)) return ErrorCode.IO_DIR_NOT_FOUND;
  if (/permission denied/i.test(message)) return ErrorCode.IO_PERMISSION_DENIED;
  return ErrorCode.IO_EXEC_FAILED;
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
      classifyGitError(message),
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
      acc.push({ filename: match[2], status: STATUS_MAP[match[1]] ?? 'modified' });
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
  if (options.branch?.startsWith('-')) {
    throw new ErodeError(
      'Branch name cannot start with a dash',
      ErrorCode.INPUT_INVALID,
      'Branch names starting with a dash could be interpreted as git flags. Use a valid branch name.'
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

/**
 * Filter a unified diff to include only segments for the given filenames.
 * Splits on `diff --git` headers and reassembles matching segments.
 */
export function filterDiffByFiles(diff: string, files: { filename: string }[]): string {
  if (!diff || files.length === 0) return '';
  const allowed = new Set(files.map((f) => f.filename));
  const segments: string[] = [];
  const marker = 'diff --git ';

  let current = '';
  for (const line of diff.split('\n')) {
    if (line.startsWith(marker)) {
      if (current) segments.push(current);
      current = line + '\n';
    } else {
      current += line + '\n';
    }
  }
  if (current) segments.push(current);

  return segments
    .filter((seg) => {
      const header = seg.split('\n')[0] ?? '';
      const bIdx = header.lastIndexOf(' b/');
      if (bIdx === -1) return false;
      const filename = header.slice(bIdx + 3);
      return allowed.has(filename);
    })
    .join('')
    .trimEnd();
}

/**
 * Parse file paths from a unified diff.
 * Looks for `diff --git a/<path> b/<path>` headers.
 */
export function parseFilesFromDiff(diff: string): { filename: string; status: string }[] {
  const files: { filename: string; status: string }[] = [];
  const seen = new Set<string>();
  const prefix = 'diff --git a/';
  for (const line of diff.split('\n')) {
    if (!line.startsWith(prefix)) continue;
    const rest = line.slice(prefix.length);
    const bIdx = rest.lastIndexOf(' b/');
    if (bIdx === -1) continue;
    const filename = rest.slice(bIdx + 3);
    if (filename && !seen.has(filename)) {
      seen.add(filename);
      files.push({ filename, status: 'modified' });
    }
  }
  return files;
}

/** Convert SSH-style git remote URLs to HTTPS, stripping any embedded credentials. */
export function normalizeToHttps(remote: string): string {
  // git@github.com:owner/repo.git → https://github.com/owner/repo
  const sshMatch = /^git@([^:]+):(.+?)(?:\.git)?$/.exec(remote);
  if (sshMatch?.[1] && sshMatch[2]) {
    return `https://${sshMatch[1]}/${sshMatch[2]}`;
  }
  // HTTPS — strip credentials and trailing .git
  try {
    const url = new URL(remote);
    url.username = '';
    url.password = '';
    url.pathname = url.pathname.replace(/\.git$/, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return remote.replace(/\.git$/, '');
  }
}

/** Read the URL of a named git remote (defaults to `origin`). */
export function getRemoteUrl(remote = 'origin', cwd?: string): string {
  if (remote.startsWith('-')) {
    throw new ErodeError(
      'Remote name cannot start with a dash',
      ErrorCode.INPUT_INVALID,
      'Remote names starting with a dash could be interpreted as git flags. Use a valid remote name.'
    );
  }
  return run(['remote', 'get-url', remote], cwd ?? process.cwd());
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
