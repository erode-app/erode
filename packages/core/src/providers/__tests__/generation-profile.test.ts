import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AnalysisPhase } from '../analysis-phase.js';
import {
  getGenerationProfileForModelPatch,
  getGenerationProfileForPhase,
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

  it('uses medium low-effort generation for drift analysis', () => {
    expect(getGenerationProfileForPhase(AnalysisPhase.CHANGE_ANALYSIS)).toEqual({
      outputSize: 'medium',
      reasoningEffort: 'low',
    });
  });

  it('uses medium medium-effort generation for model updates', () => {
    expect(getGenerationProfileForPhase(AnalysisPhase.MODEL_UPDATE)).toEqual({
      outputSize: 'medium',
      reasoningEffort: 'medium',
    });
  });

  it('does not require raw maxTokens in shared stage orchestration', () => {
    const source = readFileSync(join(import.meta.dirname, '../base-provider.ts'), 'utf8');

    expect(source).not.toContain('maxTokens');
  });

  it('adds a dynamic output content hint for model patches', () => {
    const profile = getGenerationProfileForModelPatch('x'.repeat(40_000), ['  comp.a -> comp.b']);

    expect(profile).toMatchObject({
      outputSize: 'medium',
      reasoningEffort: 'medium',
    });
    expect(profile.outputContentHint?.characters).toBeGreaterThan(16_384);
  });
});
