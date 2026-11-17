import Anthropic from '@anthropic-ai/sdk';
import { BaseProvider, type ProviderConfig } from '../base-provider.js';
import { ApiError, ErodeError, ErrorCode } from '../../errors.js';
import { ENV_VAR_NAMES, RC_FILENAME } from '../../utils/config.js';
import type { AnalysisPhase } from '../analysis-phase.js';
import {
  resolveOutputTokenLimit,
  type GenerationProfile,
  type OutputSize,
} from '../generation-profile.js';
import type { StructuredOutputSpec } from '../structured-output.js';
import { ANTHROPIC_MODELS } from './models.js';

const MAX_TOKENS_BY_OUTPUT_SIZE = {
  small: 600,
  medium: 1500,
  large: 8192,
} satisfies Record<OutputSize, number>;

export class AnthropicProvider extends BaseProvider {
  private readonly client: Anthropic;

  constructor(config: ProviderConfig) {
    if (!config.apiKey) {
      throw new ErodeError(
        'An Anthropic API key is needed',
        ErrorCode.AUTH_KEY_MISSING,
        `No Anthropic API key found. Set ${ENV_VAR_NAMES.anthropicApiKey} in your environment or ${RC_FILENAME}.`
      );
    }
    super({
      fastModel: config.fastModel ?? ANTHROPIC_MODELS.FAST,
      advancedModel: config.advancedModel ?? ANTHROPIC_MODELS.ADVANCED,
    });
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  protected async callModel(
    model: string,
    prompt: string,
    phase: AnalysisPhase,
    generationProfile: GenerationProfile,
    output?: StructuredOutputSpec
  ): Promise<string> {
    const outputTokenLimit = resolveOutputTokenLimit(generationProfile, MAX_TOKENS_BY_OUTPUT_SIZE);

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model,
        max_tokens: outputTokenLimit,
        messages: [{ role: 'user', content: prompt }],
        ...(output
          ? { output_config: { format: { type: 'json_schema', schema: output.jsonSchema } } }
          : {}),
      });
    } catch (error) {
      throw ApiError.fromAnthropicError(error);
    }

    if (response.stop_reason === 'refusal') {
      throw new ErodeError(
        'Anthropic safety filters blocked the response',
        ErrorCode.PROVIDER_SAFETY_BLOCK,
        'Content was blocked by the AI provider safety filters. Try simplifying the input.',
        { model, phase }
      );
    }

    if (response.stop_reason === 'max_tokens') {
      throw new ErodeError(
        'Anthropic response was cut short (max_tokens reached)',
        ErrorCode.PROVIDER_INVALID_RESPONSE,
        'The Anthropic response used the available output budget before completion. Try a smaller change or tune the provider output budget.',
        { model, phase, outputTokenLimit }
      );
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    const text = textBlock && 'text' in textBlock ? textBlock.text : undefined;
    if (!text) {
      throw new ErodeError(
        'Anthropic returned an empty response',
        ErrorCode.PROVIDER_INVALID_RESPONSE,
        'The Anthropic API returned no content',
        { model, phase }
      );
    }
    return text;
  }
}
