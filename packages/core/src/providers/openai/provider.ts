import OpenAI from 'openai';
import { BaseProvider, type ProviderConfig } from '../base-provider.js';
import { ErodeError, ErrorCode, ApiError } from '../../errors.js';
import { ENV_VAR_NAMES, RC_FILENAME } from '../../utils/config.js';
import type { AnalysisPhase } from '../analysis-phase.js';
import type { GenerationProfile, OutputSize, ReasoningEffort } from '../generation-profile.js';
import { OPENAI_MODELS } from './models.js';

type OpenAIReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

const MAX_OUTPUT_TOKENS_BY_OUTPUT_SIZE = {
  small: 1500,
  medium: 6000,
  large: 10000,
} satisfies Record<OutputSize, number>;

export class OpenAIProvider extends BaseProvider {
  private readonly client: OpenAI;

  constructor(config: ProviderConfig) {
    if (!config.apiKey) {
      throw new ErodeError(
        'An OpenAI API key is needed',
        ErrorCode.AUTH_KEY_MISSING,
        `No OpenAI API key found. Set ${ENV_VAR_NAMES.openaiApiKey} in your environment or ${RC_FILENAME}.`
      );
    }
    super({
      fastModel: config.fastModel ?? OPENAI_MODELS.FAST,
      advancedModel: config.advancedModel ?? OPENAI_MODELS.ADVANCED,
    });
    this.client = new OpenAI({ apiKey: config.apiKey });
  }

  protected async callModel(
    model: string,
    prompt: string,
    phase: AnalysisPhase,
    generationProfile: GenerationProfile
  ): Promise<string> {
    const maxOutputTokens = getMaxOutputTokens(generationProfile);
    const reasoningEffort = getOpenAIReasoningEffort(generationProfile.reasoningEffort);

    try {
      const response = await this.client.responses.create({
        model,
        input: prompt,
        max_output_tokens: maxOutputTokens,
        ...(supportsReasoningEffort(model) ? { reasoning: { effort: reasoningEffort } } : {}),
      });

      if (response.status === 'incomplete') {
        handleIncompleteResponse(
          response,
          model,
          phase,
          maxOutputTokens,
          generationProfile,
          reasoningEffort
        );
      }

      const text = extractText(response);

      if (!text) {
        throw new ErodeError(
          'OpenAI returned an empty response',
          ErrorCode.PROVIDER_INVALID_RESPONSE,
          'The OpenAI API returned no content',
          { model, phase }
        );
      }

      return text;
    } catch (error) {
      if (error instanceof ErodeError) {
        throw error;
      }
      throw ApiError.fromOpenAIError(error);
    }

    function handleIncompleteResponse(
      response: OpenAI.Responses.Response,
      incompleteModel: string,
      incompletePhase: AnalysisPhase,
      incompleteMaxOutputTokens: number,
      incompleteGenerationProfile: GenerationProfile,
      incompleteReasoningEffort: OpenAIReasoningEffort
    ): void {
      if (response.incomplete_details?.reason === 'max_output_tokens') {
        throw new ErodeError(
          'Model ran out of output budget before producing a complete response',
          ErrorCode.PROVIDER_INVALID_RESPONSE,
          'The AI response used the available output budget before completion. Try a smaller change or tune the provider output budget or reasoning effort.',
          {
            model: incompleteModel,
            phase: incompletePhase,
            maxOutputTokens: incompleteMaxOutputTokens,
            outputSize: incompleteGenerationProfile.outputSize,
            reasoningEffort: incompleteGenerationProfile.reasoningEffort,
            providerReasoningEffort: incompleteReasoningEffort,
          }
        );
      }

      if (response.incomplete_details?.reason === 'content_filter') {
        throw new ErodeError(
          'OpenAI safety filters blocked the response',
          ErrorCode.PROVIDER_SAFETY_BLOCK,
          'Content was blocked by the AI provider safety filters. Try simplifying the input.',
          { model: incompleteModel, phase: incompletePhase }
        );
      }

      throw new ErodeError(
        'OpenAI returned an incomplete response',
        ErrorCode.PROVIDER_INVALID_RESPONSE,
        'The OpenAI response was incomplete for an unknown provider reason. Try again or tune the provider output budget.',
        {
          model: incompleteModel,
          phase: incompletePhase,
          reason: response.incomplete_details?.reason,
          maxOutputTokens: incompleteMaxOutputTokens,
          outputSize: incompleteGenerationProfile.outputSize,
        }
      );
    }

    function extractText(response: OpenAI.Responses.Response): string {
      if (response.output_text.length > 0) {
        return response.output_text;
      }

      return response.output
        .filter((item) => item.type === 'message')
        .flatMap((item) => item.content)
        .filter((content) => content.type === 'output_text')
        .map((content) => content.text)
        .join('');
    }

    function supportsReasoningEffort(reasoningModel: string): boolean {
      if (reasoningModel.includes('chat')) {
        return false;
      }

      if (reasoningModel.startsWith('gpt-5')) {
        return true;
      }

      return ['o1', 'o3', 'o4'].some((prefix) => {
        return reasoningModel === prefix || reasoningModel.startsWith(`${prefix}-`);
      });
    }

    function getOpenAIReasoningEffort(
      reasoningIntent: ReasoningEffort | undefined
    ): OpenAIReasoningEffort {
      switch (reasoningIntent) {
        case 'high':
          return 'high';
        case 'medium':
          return 'medium';
        case 'low':
        case undefined:
          return 'minimal';
        default:
          return 'minimal';
      }
    }

    function getMaxOutputTokens(profile: GenerationProfile): number {
      const profileLimit = MAX_OUTPUT_TOKENS_BY_OUTPUT_SIZE[profile.outputSize];
      const hintedLimit = profile.outputContentHint
        ? Math.ceil(profile.outputContentHint.characters / 4)
        : 0;

      return Math.max(profileLimit, hintedLimit);
    }
  }
}
