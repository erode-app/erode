import Anthropic from '@anthropic-ai/sdk';
import { BaseProvider } from '../base-provider.js';
import { ApiError, ErodeError, ErrorCode } from '../../errors.js';
import type { AnalysisPhase } from '../analysis-phase.js';
import { ANTHROPIC_MODELS } from './models.js';

export class AnthropicProvider extends BaseProvider {
  private readonly client: Anthropic;

  constructor(config: { apiKey: string; fastModel?: string; advancedModel?: string }) {
    if (!config.apiKey) {
      throw new ErodeError(
        'An Anthropic API key is needed',
        ErrorCode.MISSING_API_KEY,
        'No Anthropic API key found. Set ANTHROPIC_API_KEY in your environment.'
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
    maxTokens: number
  ): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });

      if (response.stop_reason === 'refusal') {
        throw new ErodeError(
          'Anthropic safety filters blocked the response',
          ErrorCode.SAFETY_FILTERED,
          'Content was blocked by the AI provider safety filters. Try simplifying the input.',
          { model, phase }
        );
      }

      const textBlock = response.content.find((b) => b.type === 'text');
      const text = textBlock && 'text' in textBlock ? textBlock.text : undefined;

      if (!text) {
        throw new ErodeError(
          'Anthropic returned an empty response',
          ErrorCode.INVALID_RESPONSE,
          'The Anthropic API returned no content',
          { model, phase }
        );
      }

      // Check for truncation
      if (response.stop_reason === 'max_tokens') {
        throw new ErodeError(
          'Anthropic response was cut short (max_tokens reached)',
          ErrorCode.INVALID_RESPONSE,
          'The AI response was truncated. The output may be partial.',
          { model, phase, maxTokens }
        );
      }

      return text;
    } catch (error) {
      if (error instanceof ErodeError) {
        throw error;
      }
      throw ApiError.fromAnthropicError(error);
    }
  }
}
