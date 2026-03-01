import type {
  DependencyExtractionPromptData,
  ComponentSelectionPromptData,
  DriftAnalysisPromptData,
  DriftAnalysisResult,
} from '../analysis/analysis-types.js';
import type { DependencyExtractionResult } from '../schemas/dependency-extraction.schema.js';

/** Provider interface for AI-powered architectural analysis. */
export interface AIProvider {
  /**
   * Select the most relevant component from candidates based on changed files.
   * @returns The selected component ID, or null if no match is found.
   */
  selectComponent?(data: ComponentSelectionPromptData): Promise<string | null>;

  /** Extract architectural dependency changes from a git diff. */
  extractDependencies(data: DependencyExtractionPromptData): Promise<DependencyExtractionResult>;

  /** Analyze a change request for architectural drift violations. */
  analyzeDrift(data: DriftAnalysisPromptData): Promise<DriftAnalysisResult>;

  /**
   * Insert lines into an existing model file using a fast model.
   * @param fileContent - The current content of the model file
   * @param linesToInsert - DSL lines to insert into the file
   * @param modelFormat - The model format (e.g., "likec4", "structurizr")
   * @returns The complete modified file content
   */
  patchModel?(fileContent: string, linesToInsert: string[], modelFormat: string): Promise<string>;
}
