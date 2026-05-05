import { AnalysisPhase } from './analysis-phase.js';

export type OutputSize = 'small' | 'medium' | 'large';
export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface GenerationProfile {
  outputSize: OutputSize;
  reasoningEffort?: ReasoningEffort;
}

export function getGenerationProfileForPhase(phase: AnalysisPhase): GenerationProfile {
  switch (phase) {
    case AnalysisPhase.COMPONENT_RESOLUTION:
    case AnalysisPhase.DEPENDENCY_SCAN:
      return { outputSize: 'small', reasoningEffort: 'low' };
    case AnalysisPhase.MODEL_UPDATE:
      return { outputSize: 'medium', reasoningEffort: 'medium' };
    case AnalysisPhase.CHANGE_ANALYSIS:
      return { outputSize: 'medium', reasoningEffort: 'low' };
    default:
      return { outputSize: 'small', reasoningEffort: 'low' };
  }
}
