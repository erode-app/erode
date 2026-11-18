import { execFileSync } from 'child_process';
import { ErodeError, ErrorCode } from '../errors.js';
import { splitDiffSections } from './diff-sections.js';
import { parseRepoLocator } from './repo-locator.js';

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

export interface DiffStats {
  additions: number;
  deletions: number;
  filesChanged: number;
}

export interface RepoIdentifier {
  owner: string;
  repo: string;
}

export interface GitDiffResult {
  diff: string;
  stats: DiffStats;
  files: GitDiffFile[];
}

const STATUS_MAP: Record<string, string> = {
  A: 'added',
  M: 'modified',
  D: 'removed',
  R: 'renamed',
  C: 'copied',
  T: 'changed',
  U: 'unmerged',
};

/**
 * Options that make porcelain `git diff` output independent of the user's git
 * config (`diff.noprefix`, `diff.mnemonicPrefix`, `color.diff`, `diff.external`,
 * `diff.relative`, `diff.submodule`), so it can be parsed reliably.
 */
const STABLE_DIFF_OPTIONS = [
  '--no-color',
  '--no-ext-diff',
  '--src-prefix=a/',
  '--dst-prefix=b/',
  '--submodule=short',
];

function classifyGitError(message: string): ErrorCode {
  if (/not a git repository/i.test(message)) return ErrorCode.IO_DIR_NOT_FOUND;
  if (/permission denied/i.test(message)) return ErrorCode.IO_PERMISSION_DENIED;
  return ErrorCode.IO_EXEC_FAILED;
}

function run(args: string[], cwd: string): string {
  try {
    // LC_ALL=C keeps git messages in English; quotePath=false keeps non-ASCII paths unescaped.
    return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
      cwd,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ErodeError(
      `Git command failed: git ${args.join(' ')}`,
      classifyGitError(message),
      `Could not run git command. Make sure you are inside a git repository.\n${message}`
    );
  }
}

function splitNul(output: string): string[] {
  const fields = output.split('\0');
  if (fields.at(-1) === '') fields.pop();
  return fields;
}

/**
 * Parse `git diff --name-status -z` output: `<status>\0<path>\0`, or
 * `<status>\0<old>\0<new>\0` for renames and copies.
 */
function parseNameStatus(output: string): GitDiffFile[] {
  const fields = splitNul(output);
  const files: GitDiffFile[] = [];
  for (let i = 0; i < fields.length;) {
    const code = (fields[i] ?? '').charAt(0);
    const pathCount = code === 'R' || code === 'C' ? 2 : 1;
    const filename = fields[i + pathCount];
    if (filename) files.push({ filename, status: STATUS_MAP[code] ?? 'modified' });
    i += pathCount + 1;
  }
  return files;
}

/**
 * Parse `git diff --numstat -z` output: `<add>\t<del>\t<path>\0`, or
 * `<add>\t<del>\t\0<old>\0<new>\0` for renames and copies. Binary files report `-`.
 */
function parseNumstat(output: string): DiffStats {
  const fields = splitNul(output);
  const stats: DiffStats = { additions: 0, deletions: 0, filesChanged: 0 };
  for (let i = 0; i < fields.length; i++) {
    const match = /^(-|\d+)\t(-|\d+)\t(.*)$/s.exec(fields[i] ?? '');
    if (!match) continue;
    stats.filesChanged++;
    stats.additions += match[1] === '-' ? 0 : Number(match[1]);
    stats.deletions += match[2] === '-' ? 0 : Number(match[2]);
    if (match[3] === '') i += 2;
  }
  return stats;
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
  // -c instead of --no-relative, which needs git 2.28 or later.
  const args = [
    '-c',
    'diff.relative=false',
    'diff',
    ...STABLE_DIFF_OPTIONS,
    ...buildDiffArgs(options),
  ];

  const diff = run(args, cwd).trim();
  const nameStatus = run([...args, '--name-status', '-z'], cwd);
  const numstat = run([...args, '--numstat', '-z'], cwd);

  return {
    diff,
    files: parseNameStatus(nameStatus),
    stats: parseNumstat(numstat),
  };
}

/**
 * Filter a unified diff to include only sections for the given filenames.
 * A type change produces two sections for one file; both are kept.
 */
export function filterDiffByFiles(diff: string, files: { filename: string }[]): string {
  if (!diff || files.length === 0) return '';
  const allowed = new Set(files.map((f) => f.filename));
  return splitDiffSections(diff)
    .filter((section) => section.path !== undefined && allowed.has(section.path))
    .map((section) => section.text)
    .join('')
    .trimEnd();
}

/**
 * Parse file paths from a unified diff. Accepts the default `a/` and `b/`
 * prefixes, mnemonic prefixes, and `--no-prefix` output.
 */
export function parseFilesFromDiff(diff: string): GitDiffFile[] {
  const files: GitDiffFile[] = [];
  const seen = new Set<string>();
  for (const { path } of splitDiffSections(diff)) {
    if (path && !seen.has(path)) {
      seen.add(path);
      files.push({ filename: path, status: 'modified' });
    }
  }
  return files;
}

/**
 * Convert a git remote (HTTPS, `ssh://` or scp-style) to the repository's
 * canonical HTTPS URL, without credentials. Input that is not a repository
 * location is returned without a trailing `.git`.
 */
export function normalizeToHttps(remote: string): string {
  return parseRepoLocator(remote)?.canonicalUrl ?? remote.trim().replace(/\.git$/, '');
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
  return run(['remote', 'get-url', remote], cwd ?? process.cwd()).trim();
}

/**
 * Parse the repository owner and name from a git remote URL.
 * Supports HTTPS, `ssh://` and scp-style remotes.
 */
export function parseRepoFromRemote(remoteUrl: string): RepoIdentifier {
  const locator = parseRepoLocator(remoteUrl);
  if (locator) return { owner: locator.owner, repo: locator.repo };
  throw new ErodeError(
    `Cannot parse repository from remote URL: ${remoteUrl}`,
    ErrorCode.INPUT_INVALID,
    'Could not determine owner/repo from the git remote URL. Use --repo to specify the repository URL explicitly.'
  );
}
