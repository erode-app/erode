/**
 * One parser for repository identity, shared by git remotes, model links,
 * `--model-repo`, `--repo` and PR URLs, so they agree within a run.
 *
 * Case: hosts are lowercased. Path segments keep their original case in
 * `owner`, `repo`, `slug` and `canonicalUrl`, because API calls and display
 * use them. GitHub, GitLab, Bitbucket and Azure DevOps treat paths as
 * case-insensitive, so `repositoryMatchKey` lowercases the whole URL for
 * comparing a remote with model links.
 *
 * Credentials: userinfo (`user:token@`, `git@`) is never copied into the result.
 *
 * Self-hosted instances come from `ERODE_*_BASE_URL`. Those settings hold API
 * URLs, so the web base path is assumed to be the path before the API part:
 * - GitHub: `https://ghe.example.com/api/v3`; a leading `api.` is dropped from
 *   the host and `/api/...` from the path.
 * - GitLab: the instance URL, e.g. `https://example.com/gitlab`; a pasted
 *   `/api/v4` is dropped.
 * - Bitbucket Data Center/Server: `https://example.com/bitbucket/rest/api/1.0`;
 *   `/rest/...` is dropped.
 * Web URLs on such a host must start with the base path, which is stripped
 * before reading owner and repo and kept in `canonicalUrl`. SSH remotes do
 * not carry it, so they match on the host alone and keep their full path.
 *
 * SSH host aliases are only resolved in the `host-suffix` form
 * (`github.com-work`); `ssh -G` is not consulted.
 */
import { CONFIG } from './config.js';

export type RepoPlatform =
  'github' | 'gitlab' | 'bitbucket' | 'bitbucket-server' | 'azure-devops' | 'unknown';

export interface RepoLocator {
  platform: RepoPlatform;
  /** Lowercase host without `www.`; SSH host aliases such as `github.com-work` are resolved. */
  host: string;
  /** Port given in the input. For SSH and `git://` input it is not part of `canonicalUrl`. */
  port?: number;
  /** Transport of the input; `shorthand` for `owner/repo`, `git` for `git://`. */
  protocol: 'https' | 'http' | 'ssh' | 'git' | 'shorthand';
  /** Repository path segments, e.g. `['group', 'sub', 'project']` or `['org', 'project', 'repo']` for Azure. */
  segments: string[];
  /** Everything before the repository name: owner, workspace, nested group, Bitbucket project key or Azure `org/project`. */
  owner: string;
  repo: string;
  /** `https://host[:port]/<path>` without credentials, `.git`, platform suffixes or a trailing slash. */
  canonicalUrl: string;
  /** `owner/repo`. */
  slug: string;
}

export interface ParseRepoLocatorOptions {
  /** Accept `owner/repo` as a GitHub repository. Off by default so relative links are not taken for repos. */
  allowShorthand?: boolean;
}

const BUILT_IN_HOSTS: Record<string, RepoPlatform> = {
  'github.com': 'github',
  'gitlab.com': 'gitlab',
  'bitbucket.org': 'bitbucket',
  'dev.azure.com': 'azure-devops',
  'ssh.dev.azure.com': 'azure-devops',
};

function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean);
}

interface HostBase {
  host: string;
  /** Web base path segments, e.g. `['gitlab']` for `https://example.com/gitlab`. */
  basePath: string[];
  port?: number;
  platform: RepoPlatform;
}

interface HostRegistry {
  hosts: Map<string, RepoPlatform>;
  bases: HostBase[];
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

function configuredBase(
  url: string | undefined,
  platform: RepoPlatform,
  apiSegment: string
): HostBase | undefined {
  if (!url) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  let host = normalizeHost(parsed.hostname);
  if (platform === 'github') host = host.replace(/^api\./, '');
  if (host in BUILT_IN_HOSTS || host === 'api.bitbucket.org') return undefined;
  const path = splitPath(parsed.pathname);
  const api = path.findIndex((s) => s.toLowerCase() === apiSegment);
  return {
    host,
    basePath: api === -1 ? path : path.slice(0, api),
    ...(parsed.port ? { port: Number(parsed.port) } : {}),
    platform,
  };
}

let registryCache: { key: string; registry: HostRegistry } | undefined;

/** Hosts from built-ins plus the self-hosted instances configured via `ERODE_*_BASE_URL`. */
function repositoryHosts(): HostRegistry {
  const urls = [CONFIG.github.baseUrl, CONFIG.gitlab.baseUrl, CONFIG.bitbucket.baseUrl];
  const key = JSON.stringify(urls);
  if (registryCache?.key === key) return registryCache.registry;

  const [github, gitlab, bitbucket] = urls;
  const bases = [
    configuredBase(github, 'github', 'api'),
    configuredBase(gitlab, 'gitlab', 'api'),
    configuredBase(bitbucket, 'bitbucket-server', 'rest'),
  ].filter((b): b is HostBase => b !== undefined);
  const hosts = new Map(Object.entries(BUILT_IN_HOSTS));
  for (const base of bases) {
    if (!hosts.has(base.host)) hosts.set(base.host, base.platform);
  }
  const registry = { hosts, bases };
  registryCache = { key, registry };
  return registry;
}

function startsWithPath(path: string[], prefix: string[]): boolean {
  return prefix.every((p, i) => path[i]?.toLowerCase() === p.toLowerCase());
}

/**
 * The configured instance a location belongs to. Web URLs must carry the base
 * path; SSH and `git://` remotes never do, so they match on the host alone.
 */
function matchBase(
  bases: HostBase[],
  host: string,
  path: string[],
  web: boolean
): HostBase | null | undefined {
  const onHost = bases.filter((b) => b.host === host);
  if (onHost.length === 0) return undefined;
  if (!web) return onHost[0];
  const matching = onHost
    .filter((b) => startsWithPath(path, b.basePath))
    .sort((a, b) => b.basePath.length - a.basePath.length);
  return matching[0] ?? null;
}

function resolveHost(
  rawHost: string,
  hosts: Map<string, RepoPlatform>,
  isSsh: boolean
): [string, RepoPlatform] {
  const host = normalizeHost(rawHost);
  const known = hosts.get(host);
  if (known) return [host, known];
  // SSH config aliases like `github.com-work` point at the host before the suffix.
  const alias = isSsh ? /^(.+\.[a-z]+)-[\w-]+$/.exec(host)?.[1] : undefined;
  const aliased = alias ? hosts.get(alias) : undefined;
  if (alias && aliased) return [alias, aliased];
  return [host, 'unknown'];
}

interface RawLocation {
  host: string;
  port?: number;
  protocol: RepoLocator['protocol'];
  path: string[];
}

const SCHEME_PROTOCOLS: Record<string, RepoLocator['protocol']> = {
  'https:': 'https',
  'http:': 'http',
  'ssh:': 'ssh',
  'git+ssh:': 'ssh',
  'ssh+git:': 'ssh',
  'git:': 'git',
};

function readLocation(input: string, allowShorthand: boolean): RawLocation | undefined {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      return undefined;
    }
    const protocol = SCHEME_PROTOCOLS[url.protocol];
    if (!protocol || !url.hostname) return undefined;
    return {
      host: url.hostname,
      ...(url.port ? { port: Number(url.port) } : {}),
      protocol,
      path: splitPath(url.pathname),
    };
  }
  // scp-like `user@host:path`. A user or a dotted host is required so that
  // Windows drive letters and bare words are not read as hosts.
  const scp = /^(?:([^@/\s]+)@)?([^:/\s]+):(?!\/\/)(.+)$/.exec(input);
  if (scp?.[2] && scp[3] && (scp[1] || scp[2].includes('.'))) {
    // Without a user, `host:8443/group/repo` is a host and port, not scp.
    const port = scp[1] ? undefined : /^(\d+)\/(.+)$/.exec(scp[3]);
    if (port?.[1] && port[2]) {
      return { host: scp[2], port: Number(port[1]), protocol: 'https', path: splitPath(port[2]) };
    }
    return { host: scp[2], protocol: 'ssh', path: splitPath(scp[3]) };
  }
  if (allowShorthand && /^[\w.-]+\/[\w.-]+\/*$/.test(input)) {
    return { host: 'github.com', protocol: 'shorthand', path: splitPath(input) };
  }
  return undefined;
}

function stripGitSuffix(segment: string): string {
  return segment.replace(/\.git$/i, '');
}

interface RepoPath {
  /** Segments that identify the repository. */
  segments: string[];
  /** Path used in `canonicalUrl`. */
  canonicalPath: string;
}

function simplePath(segments: string[]): RepoPath | undefined {
  if (segments.length < 2) return undefined;
  return { segments, canonicalPath: segments.join('/') };
}

function azurePath(path: string[]): RepoPath | undefined {
  const gitIdx = path.indexOf('_git');
  const webRepo = gitIdx > 0 ? path[gitIdx + 1] : undefined;
  let segments: string[] | undefined;
  if (webRepo) {
    segments = [...path.slice(0, gitIdx), webRepo];
  } else if (path[0] === 'v3' && path.length >= 4) {
    segments = path.slice(1, 4);
  }
  if (!segments || segments.length < 2) return undefined;
  const repo = stripGitSuffix(segments.at(-1) ?? '');
  const namespace = segments.slice(0, -1);
  return { segments: [...namespace, repo], canonicalPath: `${namespace.join('/')}/_git/${repo}` };
}

function bitbucketServerPath(path: string[]): RepoPath | undefined {
  let key: string | undefined;
  let repo: string | undefined;
  if (path[0] === 'projects' && path[2] === 'repos') [, key, , repo] = path;
  else if (path[0] === 'scm') [, key, repo] = path;
  else if (path.length === 2) [key, repo] = path;
  if (!key || !repo) return undefined;
  repo = stripGitSuffix(repo);
  return { segments: [key, repo], canonicalPath: `projects/${key}/repos/${repo}` };
}

function repoPathFor(platform: RepoPlatform, rawPath: string[]): RepoPath | undefined {
  // GitLab and unknown hosts end the project path at the `/-/` separator.
  const dash = rawPath.indexOf('-');
  const path = dash === -1 ? rawPath : rawPath.slice(0, dash);
  const withoutGit = (segments: string[]): string[] =>
    segments.map((s, i) => (i === segments.length - 1 ? stripGitSuffix(s) : s));

  switch (platform) {
    case 'github':
    case 'bitbucket':
      return simplePath(withoutGit(path.slice(0, 2)));
    case 'gitlab':
      return simplePath(withoutGit(path));
    case 'azure-devops':
      return azurePath(path);
    case 'bitbucket-server':
      return bitbucketServerPath(path);
    case 'unknown':
      if ((path[0] === 'projects' && path[2] === 'repos') || path[0] === 'scm') {
        return bitbucketServerPath(path);
      }
      return simplePath(withoutGit(path));
  }
}

/** Parse a repository URL, git remote or (optionally) `owner/repo` shorthand. Returns null when it is not one. */
export function parseRepoLocator(
  input: string,
  options: ParseRepoLocatorOptions = {}
): RepoLocator | null {
  const location = readLocation(input.trim(), options.allowShorthand ?? false);
  if (!location) return null;

  const isSsh = location.protocol === 'ssh';
  const isWeb = location.protocol === 'https' || location.protocol === 'http';
  const registry = repositoryHosts();
  let [host, platform] = resolveHost(location.host, registry.hosts, isSsh);
  let basePath: string[] = [];
  let path = location.path;
  const base = matchBase(registry.bases, host, path, isWeb);
  if (base === null) {
    platform = 'unknown';
  } else if (base) {
    platform = base.platform;
    if (isWeb) {
      basePath = path.slice(0, base.basePath.length);
      path = path.slice(base.basePath.length);
    } else {
      basePath = base.basePath;
    }
  }
  const repoPath = repoPathFor(platform, path);
  if (!repoPath) return null;
  if (platform === 'unknown' && repoPath.canonicalPath.startsWith('projects/')) {
    platform = 'bitbucket-server';
  }
  if (platform === 'azure-devops') host = 'dev.azure.com';

  const { segments } = repoPath;
  const repo = segments.at(-1) ?? '';
  const owner = segments.slice(0, -1).join('/');
  const webPort = isWeb && location.port ? `:${String(location.port)}` : '';
  const webPath = [...basePath, repoPath.canonicalPath].join('/');
  return {
    platform,
    host,
    ...(location.port ? { port: location.port } : {}),
    protocol: location.protocol,
    segments,
    owner,
    repo,
    canonicalUrl: `https://${host}${webPort}/${webPath}`,
    slug: `${owner}/${repo}`,
  };
}

/** The platform for a hostname, including configured self-hosted hosts. */
export function platformForHost(hostname: string): RepoPlatform {
  return resolveHost(hostname, repositoryHosts().hosts, false)[1];
}

export type TokenPlatform = 'github' | 'gitlab' | 'bitbucket';

const TOKEN_DEFAULT_HOSTS: Record<TokenPlatform, string> = {
  github: 'github.com',
  gitlab: 'gitlab.com',
  bitbucket: 'bitbucket.org',
};

const TOKEN_BASE_PLATFORMS: Record<TokenPlatform, RepoPlatform> = {
  github: 'github',
  gitlab: 'gitlab',
  bitbucket: 'bitbucket-server',
};

/** True when the locator is on the platform's public host (github.com, gitlab.com, bitbucket.org). */
export function isPublicInstance(locator: RepoLocator, tokenPlatform: TokenPlatform): boolean {
  return locator.host === TOKEN_DEFAULT_HOSTS[tokenPlatform] && locator.port === undefined;
}

/**
 * True when the locator is on the instance a platform token is issued for: the
 * self-hosted instance from `ERODE_*_BASE_URL` (host, port and base path) when
 * one is set, otherwise the public host. The platform guessed from a path shape
 * such as `/scm/KEY/repo` never qualifies on its own.
 */
export function isTokenInstance(locator: RepoLocator, tokenPlatform: TokenPlatform): boolean {
  const platform = TOKEN_BASE_PLATFORMS[tokenPlatform];
  const base = repositoryHosts().bases.find((b) => b.platform === platform);
  if (!base) return isPublicInstance(locator, tokenPlatform);
  if (locator.host !== base.host || locator.port !== base.port) return false;
  return startsWithPath(splitPath(new URL(locator.canonicalUrl).pathname), base.basePath);
}

/** True when the input points at a repository on a known (built-in or configured) host. */
export function isRepositoryHostUrl(url: string): boolean {
  const locator = parseRepoLocator(url);
  return locator !== null && locator.platform !== 'unknown';
}

/**
 * Lowercased canonical URL without a port, used to match a repository against
 * model links; other input is returned unchanged. The port is dropped because
 * an SSH remote and a web link to one repository often use different ports.
 */
export function normalizeRepositoryUrl(url: string): string {
  const locator = parseRepoLocator(url);
  if (!locator || locator.platform === 'unknown') return url;
  return locator.canonicalUrl.replace(/^(https:\/\/[^/:]+):\d+/, '$1').toLowerCase();
}
