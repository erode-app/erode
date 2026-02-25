/**
 * Structured output format for CI/CD pipelines
 */
export interface StructuredAnalysisOutput {
  version: string; // Schema version
  timestamp: string; // ISO 8601
  status: 'success' | 'violations' | 'error' | 'skipped';
  exitCode: number; // 0 = success/skipped, 1 = violations found, 2 = error
  metadata: {
    commit?: {
      sha: string;
      message: string;
      author: string;
      filesChanged: number;
      additions: number;
      deletions: number;
    };
    changeRequest?: {
      number: number;
      title: string;
      author: string;
      base: string;
      head: string;
      commits: number;
      filesChanged: number;
      wasTruncated?: boolean;
      truncationReason?: string;
    };
    component?: {
      id: string;
      name: string;
      type: string;
      repository?: string;
      tags: string[];
    };
    architectural?: {
      dependenciesCount?: number;
      dependentsCount?: number;
    };
  };
  analysis: {
    hasViolations: boolean;
    violations: {
      severity: 'high' | 'medium' | 'low';
      description: string;
      file?: string | null;
      line?: number | null;
      commit?: string | null;
      suggestion?: string;
    }[];
    summary: string;
    improvements?: string[];
    warnings?: string[];
    modelUpdates?: {
      add?: string[];
      remove?: string[];
      notes?: string;
    };
  };
  dependencyChanges?: {
    type: 'added' | 'removed' | 'modified';
    dependency: string;
    file: string;
    description: string;
  }[];
  /** Component ID selected by AI when multiple candidates were found in the repository */
  selectedComponentId?: string;
  /** All candidate components that were provided for selection */
  candidateComponents?: {
    id: string;
    name: string;
    type: string;
  }[];
  generatedChangeRequest?: {
    url: string;
    number: number;
    action: 'created' | 'updated';
    branch: string;
  };
}
