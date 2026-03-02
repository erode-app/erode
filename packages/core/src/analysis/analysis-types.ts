import type { ArchitecturalComponent } from '../adapters/architecture-types.js';
import type { DependencyExtractionResult } from '../schemas/dependency-extraction.schema.js';
import type { StructuredRelationshipSchema } from '../schemas/common.schema.js';
import type { z } from 'zod';

export type StructuredRelationship = z.infer<typeof StructuredRelationshipSchema>;

/**
 * Stage 1: Component selection from monorepo
 * Input for selecting which component in a monorepo is being modified
 */
export interface ComponentSelectionPromptData {
  components: ArchitecturalComponent[];
  files: { filename: string }[];
}

export interface DependencyExtractionPromptData {
  diff: string;
  commit: {
    sha: string;
    message: string;
    author: string;
  };
  repository: {
    owner: string;
    repo: string;
    url: string;
  };
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
  /** Severity of the violation */
  severity: 'high' | 'medium' | 'low';
  /** Description of the violation */
  description: string;
  /** File where the violation occurred */
  file?: string | null;
  /** Line number if applicable */
  line?: number | null;
  /** Commit SHA where this violation was introduced */
  commit?: string | null;
  /** Suggested fix */
  suggestion?: string;
}
/**
 * Metadata about a change request for analysis context
 */
export interface ChangeRequestMetadata {
  number: number;
  title: string;
  description: string | null;
  repository: string; // owner/repo format
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
  stats: {
    commits: number;
    additions: number;
    deletions: number;
    files_changed: number;
  };
  commits: {
    sha: string;
    message: string;
    author: string;
  }[];
}
/**
 * Result of analyzing a change request
 */
export interface DriftAnalysisResult {
  /** Whether any violations were found */
  hasViolations: boolean;
  /** List of violations across all commits */
  violations: DriftViolation[];
  /** Architectural improvements or positive findings */
  improvements?: string[];
  /** Warnings that are not critical violations */
  warnings?: string[];
  /** Summary of the analysis */
  summary: string;
  /** Recommended model updates */
  modelUpdates?: {
    add?: string[];
    remove?: string[];
    notes?: string;
    relationships?: StructuredRelationship[];
  };
  /** Change request metadata */
  metadata: ChangeRequestMetadata;
  /** Component that was analyzed */
  component: ArchitecturalComponent;
  /** Aggregated dependency changes across all commits */
  dependencyChanges: DependencyExtractionResult;
}
/**
 * Input data for change request analysis prompt
 */
export interface DriftAnalysisPromptData {
  /** Change request metadata */
  changeRequest: ChangeRequestMetadata;
  /** Component being analyzed */
  component: ArchitecturalComponent;
  /** Aggregated dependency changes */
  dependencies: DependencyExtractionResult;
  /** Architectural context */
  architectural: {
    dependencies: (ArchitecturalComponent & { repository?: string })[];
    dependents: (ArchitecturalComponent & { repository?: string })[];
    relationships: {
      target: {
        id: string;
        name: string;
      };
      kind?: string;
      title?: string;
    }[];
  };
}
