import type { ArchitecturalComponent, ModelRelationship } from '../adapters/architecture-types.js';
import type { DependencyExtractionResult } from '../schemas/dependency-extraction.schema.js';
import type { StructuredRelationshipSchema, NewComponentSchema } from '../schemas/common.schema.js';
import type { z } from 'zod';
import type { GitDiffFile } from '../utils/git-diff.js';
import type { BranchRef, ChangeAuthor } from '../platforms/source-platform.js';
import type { RepoIdentifier } from '../utils/git-diff.js';

export type StructuredRelationship = z.infer<typeof StructuredRelationshipSchema>;
export type NewComponent = z.infer<typeof NewComponentSchema>;

/**
 * Stage 1: Component selection from monorepo
 * Input for selecting which component in a monorepo is being modified
 */
export interface ComponentSelectionPromptData {
  components: ArchitecturalComponent[];
  files: { filename: string }[];
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
}

/** Narrowed relationship reference used in prompt data and pipeline context. */
export interface ComponentRelationshipRef {
  target: { id: string; name: string };
  kind?: string;
  title?: string;
}

export interface DependencyExtractionPromptData {
  diff: string;
  commit: CommitInfo;
  repository: RepoIdentifier & { url: string };
  components?: {
    id: string;
    name: string;
    type: string;
    technology?: string;
    description?: string;
  }[];
}

/**
 * Violation found in a PR with commit context
 */
export interface DriftViolation {
  severity: 'high' | 'medium' | 'low';
  description: string;
  file?: string | null;
  line?: number | null;
  /** Commit SHA where this violation was introduced */
  commit?: string | null;
  suggestion?: string;
}
/**
 * Metadata about a change request for analysis context
 */
export interface ChangeRequestMetadata {
  number: number;
  /** Discriminant: 'local' for erode check, 'pr' for erode analyze. */
  source?: 'local' | 'pr';
  title: string;
  description: string | null;
  repository: string; // owner/repo format
  author: ChangeAuthor;
  base: BranchRef;
  head: BranchRef;
  stats: {
    commits: number;
    additions: number;
    deletions: number;
    files_changed: number;
  };
  commits: CommitInfo[];
}
/**
 * Result of analyzing a change request
 */
export interface DriftAnalysisResult {
  hasViolations: boolean;
  /** Violations across all commits */
  violations: DriftViolation[];
  /** Positive architectural findings */
  improvements?: string[];
  /** Not critical violations */
  warnings?: string[];
  summary: string;
  /** Recommended model updates */
  modelUpdates?: {
    add?: string[];
    remove?: string[];
    notes?: string;
    relationships?: StructuredRelationship[];
    newComponents?: NewComponent[];
  };
  metadata: ChangeRequestMetadata;
  component: ArchitecturalComponent;
  /** Aggregated dependency changes across all commits */
  dependencyChanges: DependencyExtractionResult;
}
/**
 * Input data for change request analysis prompt
 */
export interface DriftAnalysisPromptData {
  changeRequest: ChangeRequestMetadata;
  component: ArchitecturalComponent;
  /** Aggregated dependency changes across all commits */
  dependencies: DependencyExtractionResult;
  /** Architectural context */
  architectural: {
    dependencies: (ArchitecturalComponent & { repository?: string })[];
    dependents: (ArchitecturalComponent & { repository?: string })[];
    relationships: ComponentRelationshipRef[];
  };
  /** Changed files with their status */
  files?: GitDiffFile[];
  /** All component IDs in the architecture model */
  allComponentIds?: string[];
  /** All relationships in the architecture model */
  allRelationships?: ModelRelationship[];
}
