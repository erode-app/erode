import OpenAI from 'openai';
import { BaseProvider, type ProviderConfig } from '../base-provider.js';
import { ErodeError, ErrorCode, ApiError } from '../../errors.js';
import { ENV_VAR_NAMES, RC_FILENAME } from '../../utils/config.js';
import { AnalysisPhase } from '../analysis-phase.js';
import { OPENAI_MODELS } from './models.js';

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
    maxTokens: number
  ): Promise<string> {
    try {
      const response = await this.client.responses.create({
        model,
        input: prompt,
        max_output_tokens: maxTokens,

        reasoning: {
          effort: getReasoningEffort(phase),
        },
      });

      if (
        response.status === 'incomplete' &&
        response.incomplete_details?.reason === 'max_output_tokens'
      ) {
        // Optional: retry once with higher budget
        if (maxTokens < 1000) {
          return await this.callModel(model, prompt, phase, maxTokens * 2);
        }

        throw new ErodeError(
          'Model ran out of tokens before producing output',
          ErrorCode.PROVIDER_INVALID_RESPONSE,
          'The AI used all tokens for reasoning. Increase max_output_tokens or reduce reasoning effort.',
          { model, phase, maxTokens }
        );
      }

      const text = extractText(response);

      if (!text) {
        console.error('response');
        console.error(response);

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

    function extractText(response: OpenAI.Responses.Response): string {
      if (response.output_text.length > 0) {
        return response.output_text;
      }

      let result = '';

      for (const item of response.output) {
        // ✅ Narrow to message items only
        if (item.type !== 'message') continue;

        for (const content of item.content) {
          if (content.type === 'output_text') {
            result += content.text;
          }
        }
      }
      return result;
    }

    function getReasoningEffort(phase: AnalysisPhase) {
      switch (phase) {
        case AnalysisPhase.COMPONENT_RESOLUTION:
          return 'low';
        case AnalysisPhase.CHANGE_ANALYSIS:
          return 'low';
        case AnalysisPhase.DEPENDENCY_SCAN:
          return 'low';
        case AnalysisPhase.MODEL_UPDATE:
          return 'medium';
        default:
          return 'low';
      }
    }
  }
}
