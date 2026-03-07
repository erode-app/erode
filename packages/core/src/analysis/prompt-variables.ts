import type { CommitInfo } from './analysis-types.js';
import type { RepoIdentifier } from '../utils/git-diff.js';

export interface DependencyExtractionPromptVars {
  diff: string;
  commit: CommitInfo;
  repository: RepoIdentifier & { url: string };
  componentsContext: string;
}

export interface ComponentSelectionPromptVars {
  components: string;
  files: string;
}

export interface ChangeContextVars {
  /** "a pull request" or "local changes" */
  label: string;
  /** "PULL REQUEST" or "LOCAL CHANGES" */
  headerPrefix: string;
  /** "PR #42:" or "Changes:" */
  refLabel: string;
  /** " IN THIS PR" or "" */
  inSuffix: string;
  /** Considerations paragraph for the template */
  considerations: string;
}

export interface DriftAnalysisPromptVars {
  changeContext: ChangeContextVars;
  changeRequest: {
    number: number;
    title: string;
    author: string;
    base: { ref: string };
    head: { ref: string };
    stats: {
      commits: number;
      additions: number;
      deletions: number;
      files_changed: number;
    };
    descriptionSection: string;
  };
  component: {
    name: string;
    id: string;
    type: string;
    repository: string;
    tags: string;
  };
  commitsSection: string;
  commitsNote: string;
  allowedDeps: string;
  dependents: string;
  allComponentIds: string;
  allRelationships: string;
  filesSection: string;
  dependencyChangesSection: string;
}

export interface ModelPatchPromptVars {
  fileContent: string;
  linesToInsert: string;
  modelFormat: string;
}
