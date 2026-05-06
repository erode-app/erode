import { AnalysisPhase } from './analysis-phase.js';

export type OutputSize = 'small' | 'medium' | 'large';
export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface GenerationProfile {
  outputSize: OutputSize;
  reasoningEffort?: ReasoningEffort;
  outputContentHint?: {
    characters: number;
  };
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

export function getGenerationProfileForModelPatch(
  fileContent: string,
  linesToInsert: string[]
): GenerationProfile {
  const insertedLineCharacters = linesToInsert.length * 200;
  const estimatedCharacters = Math.ceil((fileContent.length + insertedLineCharacters) * 1.2);
  const minimumCharacters = 4096 * 4;

  return {
    outputSize: 'medium',
    reasoningEffort: 'medium',
    outputContentHint: {
      characters: Math.max(minimumCharacters, estimatedCharacters),
    },
  };
}

export function resolveOutputTokenLimit(
  profile: GenerationProfile,
  sizeTable: Record<OutputSize, number>
): number {
  const profileLimit = sizeTable[profile.outputSize];
  const hintedLimit = profile.outputContentHint
    ? Math.ceil(profile.outputContentHint.characters / 4)
    : 0;

  return Math.max(profileLimit, hintedLimit);
}
