import { describe, expect, it } from 'vitest';
import { AnalysisPhase } from '../analysis-phase.js';
import {
  getGenerationProfileForModelPatch,
  getGenerationProfileForPhase,
  resolveOutputTokenLimit,
} from '../generation-profile.js';

describe('getGenerationProfileForPhase', () => {
  it('uses small low-effort generation for simple phases', () => {
    expect(getGenerationProfileForPhase(AnalysisPhase.COMPONENT_RESOLUTION)).toEqual({
      outputSize: 'small',
      reasoningEffort: 'low',
    });
    expect(getGenerationProfileForPhase(AnalysisPhase.DEPENDENCY_SCAN)).toEqual({
      outputSize: 'small',
      reasoningEffort: 'low',
    });
  });

  it('uses large low-effort generation for drift analysis', () => {
    expect(getGenerationProfileForPhase(AnalysisPhase.CHANGE_ANALYSIS)).toEqual({
      outputSize: 'large',
      reasoningEffort: 'low',
    });
  });

  it('uses medium medium-effort generation for model updates', () => {
    expect(getGenerationProfileForPhase(AnalysisPhase.MODEL_UPDATE)).toEqual({
      outputSize: 'medium',
      reasoningEffort: 'medium',
    });
  });

  it('adds a dynamic output content hint for model patches', () => {
    const profile = getGenerationProfileForModelPatch('x'.repeat(40_000), ['  comp.a -> comp.b']);

    expect(profile).toMatchObject({
      outputSize: 'medium',
      reasoningEffort: 'medium',
    });
    expect(profile.outputContentHint?.characters).toBeGreaterThan(16_384);
  });

  it('resolves output token limits from profile size and content hints', () => {
    expect(
      resolveOutputTokenLimit(
        { outputSize: 'medium', outputContentHint: { characters: 40_000 } },
        { small: 600, medium: 1500, large: 3000 }
      )
    ).toBe(10_000);

    expect(
      resolveOutputTokenLimit({ outputSize: 'medium' }, { small: 600, medium: 1500, large: 3000 })
    ).toBe(1500);
  });
});
