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
  analyzeDrift(
    data: DriftAnalysisPromptData
  ): Promise<DriftAnalysisResult>;

  /**
   * Generate architecture model code from analysis results.
   * @returns The generated architecture model code.
   */
  generateArchitectureCode?(analysisResult: DriftAnalysisResult): Promise<string>;
}
