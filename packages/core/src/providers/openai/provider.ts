import OpenAI from 'openai';
import { BaseProvider } from '../base-provider.js';
import { ErodeError, ErrorCode, ApiError } from '../../errors.js';
import type { AnalysisPhase } from '../analysis-phase.js';
import { OPENAI_MODELS } from './models.js';

export class OpenAIProvider extends BaseProvider {
  private readonly client: OpenAI;

  constructor(config: { apiKey: string; fastModel?: string; advancedModel?: string }) {
    if (!config.apiKey) {
      throw new ErodeError(
        'An OpenAI API key is needed',
        ErrorCode.AUTH_KEY_MISSING,
        'No OpenAI API key found. Set OPENAI_API_KEY in your environment.'
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
    maxTokens: number
  ): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new ErodeError(
          'OpenAI returned an empty response',
          ErrorCode.PROVIDER_INVALID_RESPONSE,
          'The OpenAI API returned no content',
          { model, phase }
        );
      }

      if (choice.finish_reason === 'content_filter') {
        throw new ErodeError(
          'OpenAI safety filters blocked the response',
          ErrorCode.PROVIDER_SAFETY_BLOCK,
          'Content was blocked by the AI provider safety filters. Try simplifying the input.',
          { model, phase }
        );
      }

      const text = choice.message.content;
      if (!text) {
        throw new ErodeError(
          'OpenAI returned an empty response',
          ErrorCode.PROVIDER_INVALID_RESPONSE,
          'The OpenAI API returned no content',
          { model, phase }
        );
      }

      if (choice.finish_reason === 'length') {
        throw new ErodeError(
          'OpenAI response was cut short (max_tokens reached)',
          ErrorCode.PROVIDER_INVALID_RESPONSE,
          'The AI response was truncated. The output may be partial.',
          { model, phase, maxTokens }
        );
      }

      return text;
    } catch (error) {
      if (error instanceof ErodeError) {
        throw error;
      }
      throw ApiError.fromOpenAIError(error);
    }
  }
}
