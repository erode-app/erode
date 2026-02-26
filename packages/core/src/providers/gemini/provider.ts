import { FinishReason, GoogleGenAI } from '@google/genai';
import { BaseProvider } from '../base-provider.js';
import { ApiError, ErodeError, ErrorCode } from '../../errors.js';
import type { AnalysisPhase } from '../analysis-phase.js';
import { GEMINI_MODELS } from './models.js';

export class GeminiProvider extends BaseProvider {
  private readonly client: GoogleGenAI;

  constructor(config: { apiKey: string; fastModel?: string; advancedModel?: string }) {
    if (!config.apiKey) {
      throw new ErodeError(
        'A Gemini API key is needed',
        ErrorCode.MISSING_API_KEY,
        'No Gemini API key found. Set GEMINI_API_KEY in your environment.'
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
    _maxTokens: number
  ): Promise<string> {
    try {
      const response = await this.client.models.generateContent({
        model,
        contents: prompt,
      });

      const candidate = response.candidates?.[0];
      if (candidate?.finishReason === FinishReason.SAFETY) {
        throw new ErodeError(
          'Gemini safety filters blocked the response',
          ErrorCode.SAFETY_FILTERED,
          'Content was blocked by the AI provider safety filters. Try simplifying the input.',
          { model, phase }
        );
      }

      const text = response.text;
      if (!text) {
        throw new ErodeError(
          'Gemini returned an empty response',
          ErrorCode.INVALID_RESPONSE,
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
  }
}
