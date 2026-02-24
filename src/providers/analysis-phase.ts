/**
 * Analysis phase definitions (provider-agnostic)
 */

/**
 * Analysis phases where AI models are used
 */
export enum AnalysisPhase {
  COMPONENT_RESOLUTION = 'component-resolution',
  DEPENDENCY_SCAN = 'dependency-scan',
  ERODE_ANALYSIS = 'erode-analysis',
  CHANGE_ANALYSIS = 'change-analysis',
  MODEL_GENERATION = 'model-generation',
}