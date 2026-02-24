export interface DependencyExtractionPromptVars {
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
  componentsContext: string;
}

export interface ComponentSelectionPromptVars {
  components: string;
  files: string;
}

export interface DriftAnalysisPromptVars {
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
  dependencyChangesSection: string;
}

export interface ModelGenerationPromptVars {
  metadata: {
    number: number;
    title: string;
  };
  component: {
    id: string;
    name: string;
    type: string;
    repository: string;
  };
  existingComponentsSection: string;
  violationsSection: string;
  dependencyChangesSection: string;
  modelUpdatesSection: string;
  date: string;
}
