import { FinishReason, GoogleGenAI, ThinkingLevel, type ThinkingConfig } from '@google/genai';
import { BaseProvider, type ProviderConfig } from '../base-provider.js';
import { ApiError, ErodeError, ErrorCode } from '../../errors.js';
import { ENV_VAR_NAMES, RC_FILENAME } from '../../utils/config.js';
import type { AnalysisPhase } from '../analysis-phase.js';
import type { GenerationProfile, OutputSize, ReasoningEffort } from '../generation-profile.js';
import { GEMINI_MODELS } from './models.js';

const MAX_OUTPUT_TOKENS_BY_OUTPUT_SIZE = {
  small: 1500,
  medium: 3000,
  large: 6000,
} satisfies Record<OutputSize, number>;

export class GeminiProvider extends BaseProvider {
  private readonly client: GoogleGenAI;

  constructor(config: ProviderConfig) {
    if (!config.apiKey) {
      throw new ErodeError(
        'A Gemini API key is needed',
        ErrorCode.AUTH_KEY_MISSING,
        `No Gemini API key found. Set ${ENV_VAR_NAMES.geminiApiKey} in your environment or ${RC_FILENAME}.`
      );
    }
    super({
      fastModel: config.fastModel ?? GEMINI_MODELS.FAST,
      advancedModel: config.advancedModel ?? GEMINI_MODELS.ADVANCED,
    });
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
  }

  protected async callModel(
    model: string,
    prompt: string,
    phase: AnalysisPhase,
    generationProfile: GenerationProfile
  ): Promise<string> {
    const maxOutputTokens = getMaxOutputTokens(generationProfile);
    const thinkingConfig = getThinkingConfig(model, generationProfile.reasoningEffort);

    try {
      const response = await this.client.models.generateContent({
        model,
        contents: prompt,
        config: { maxOutputTokens, thinkingConfig },
      });

      const candidate = response.candidates?.[0];
      if (candidate?.finishReason === FinishReason.SAFETY) {
        throw new ErodeError(
          'Gemini safety filters blocked the response',
          ErrorCode.PROVIDER_SAFETY_BLOCK,
          'Content was blocked by the AI provider safety filters. Try simplifying the input.',
          { model, phase }
        );
      }

      if (candidate?.finishReason === FinishReason.MAX_TOKENS) {
        throw new ErodeError(
          'Gemini response was cut short by the output token limit',
          ErrorCode.PROVIDER_INVALID_RESPONSE,
          'The Gemini response used the available output budget before completion. Try a smaller change or tune the provider output budget.',
          { model, phase, maxOutputTokens, outputSize: generationProfile.outputSize }
        );
      }

      const text = response.text;
      if (!text) {
        throw new ErodeError(
          'Gemini returned an empty response',
          ErrorCode.PROVIDER_INVALID_RESPONSE,
          'The Gemini API returned no content',
          { model, phase }
        );
      }

      return text;
    } catch (error) {
      if (error instanceof ErodeError) {
        throw error;
      }
      throw ApiError.fromGeminiError(error);
    }

    function getMaxOutputTokens(profile: GenerationProfile): number {
      const profileLimit = MAX_OUTPUT_TOKENS_BY_OUTPUT_SIZE[profile.outputSize];
      const hintedLimit = profile.outputContentHint
        ? Math.ceil(profile.outputContentHint.characters / 4)
        : 0;

      return Math.max(profileLimit, hintedLimit);
    }

    function getThinkingConfig(
      thinkingModel: string,
      reasoningIntent: ReasoningEffort | undefined
    ): ThinkingConfig {
      if (isGemini25Model(thinkingModel)) {
        return getGemini25ThinkingConfig(thinkingModel, reasoningIntent);
      }

      if (isGemini3Model(thinkingModel)) {
        return getGemini3ThinkingConfig(thinkingModel, reasoningIntent);
      }

      return {};
    }

    function getGemini25ThinkingConfig(
      thinkingModel: string,
      reasoningIntent: ReasoningEffort | undefined
    ): ThinkingConfig {
      if (isGemini25ProModel(thinkingModel)) {
        return { thinkingBudget: -1 };
      }

      switch (reasoningIntent) {
        case 'high':
        case 'medium':
          return { thinkingBudget: -1 };
        case 'low':
        case undefined:
          return { thinkingBudget: 0 };
        default:
          return { thinkingBudget: 0 };
      }
    }

    function getGemini3ThinkingConfig(
      thinkingModel: string,
      reasoningIntent: ReasoningEffort | undefined
    ): ThinkingConfig {
      switch (reasoningIntent) {
        case 'high':
          return { thinkingLevel: ThinkingLevel.HIGH };
        case 'medium':
          if (isGemini3ProModel(thinkingModel)) {
            return { thinkingLevel: ThinkingLevel.HIGH };
          }
          return { thinkingLevel: ThinkingLevel.MEDIUM };
        case 'low':
        case undefined:
          return { thinkingLevel: ThinkingLevel.LOW };
        default:
          return { thinkingLevel: ThinkingLevel.LOW };
      }
    }

    function isGemini25Model(thinkingModel: string): boolean {
      return thinkingModel.startsWith('gemini-2.5-');
    }

    function isGemini25ProModel(thinkingModel: string): boolean {
      return thinkingModel.startsWith('gemini-2.5-pro');
    }

    function isGemini3Model(thinkingModel: string): boolean {
      return thinkingModel.startsWith('gemini-3-') || thinkingModel.startsWith('gemini-3.');
    }

    function isGemini3ProModel(thinkingModel: string): boolean {
      return thinkingModel.startsWith('gemini-3-pro') || /^gemini-3\.[^-]+-pro/.test(thinkingModel);
    }
  }
}
