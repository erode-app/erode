export interface CommitStats {
  total: number;
  additions: number;
  deletions: number;
}

/** Platform-specific identifiers for the repository. */
export interface PlatformId {
  owner: string;
  repo: string;
}

/** Platform-agnostic reference to a change request (PR/MR). */
export interface ChangeRequestRef {
  /** The change request number (universal across platforms). */
  number: number;
  /** The full URL of the change request. */
  url: string;
  /** The repository URL derived from the change request URL. */
  repositoryUrl: string;
  /**
   * Platform-specific identifiers. Only the platform's own implementation
   * should access these fields.
   * - GitHub: { owner: string, repo: string }
   * - GitLab: { owner: string (namespace/group path), repo: string (project name) }
   */
  platformId: PlatformId;
}

/** A file changed in a change request. */
export interface ChangeRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

/** Data returned when fetching a change request. */
export interface ChangeRequestData {
  number: number;
  title: string;
  body: string | null;
  state: string;
  author: {
    login: string;
    name?: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  head: {
    ref: string;
    sha: string;
  };
  commits: number;
  additions: number;
  deletions: number;
  changed_files: number;
  files: ChangeRequestFile[];
  diff: string;
  stats: CommitStats;
  wasTruncated?: boolean;
  truncationReason?: string;
}

/** A commit within a change request. */
export interface ChangeRequestCommit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
  };
}

/** A file to create or update in a change request. */
export interface ChangeRequestFileWrite {
  path: string;
  content: string;
}

/** Options for creating or updating a change request. */
export interface CreateOrUpdateChangeRequestOptions {
  branchName: string;
  title: string;
  body: string;
  fileChanges: ChangeRequestFileWrite[];
  baseBranch?: string;
  draft?: boolean;
}

/** Result of a change request write operation. */
export interface ChangeRequestResult {
  url: string;
  number: number;
  action: 'created' | 'updated';
  branch: string;
}

/** Reads change request data from a source platform. */
export interface SourcePlatformReader {
  /** Parse a change request URL into a platform-agnostic reference. */
  parseChangeRequestUrl(url: string): ChangeRequestRef;

  /** Fetch full change request data. */
  fetchChangeRequest(ref: ChangeRequestRef): Promise<ChangeRequestData>;

  /** Fetch commits for a change request. */
  fetchChangeRequestCommits(ref: ChangeRequestRef): Promise<ChangeRequestCommit[]>;
}

/** Writes change requests and comments on a source platform. */
export interface SourcePlatformWriter {
  /** Create or update a change request with file changes. */
  createOrUpdateChangeRequest(
    options: CreateOrUpdateChangeRequestOptions
  ): Promise<ChangeRequestResult>;

  /** Comment on an existing change request. When upsertMarker is provided, updates an existing comment containing the marker instead of creating a new one. */
  commentOnChangeRequest(
    ref: ChangeRequestRef,
    body: string,
    options?: { upsertMarker?: string }
  ): Promise<void>;

  /** Delete a comment containing the given marker string. No-op if no matching comment exists. */
  deleteComment(ref: ChangeRequestRef, marker: string): Promise<void>;
}
