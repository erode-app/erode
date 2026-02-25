import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider } from '../ai-provider.js';
import type {
  DependencyExtractionPromptData,
  ComponentSelectionPromptData,
  DriftAnalysisPromptData,
  DriftAnalysisResult,
} from '../../analysis/analysis-types.js';
import type { DependencyExtractionResult } from '../../schemas/dependency-extraction.schema.js';
import { DependencyExtractionResultSchema } from '../../schemas/dependency-extraction.schema.js';
import { DriftAnalysisResponseSchema } from '../../schemas/drift-analysis.schema.js';
import { PromptBuilder } from '../../analysis/prompt-builder.js';
import { validate } from '../../utils/validation.js';
import { ApiError, ErodeError, ErrorCode } from '../../errors.js';
import { withRetry } from '../../utils/retry.js';
import { AnalysisPhase } from '../analysis-phase.js';
import { ANTHROPIC_MODELS } from './models.js';

export class AnthropicProvider implements AIProvider {
  private readonly client: Anthropic;
  private readonly fastModel: string;
  private readonly advancedModel: string;

  constructor(config: { apiKey: string; fastModel?: string; advancedModel?: string }) {
    if (!config.apiKey) {
      throw new ErodeError(
        'Anthropic API key is required',
        ErrorCode.MISSING_API_KEY,
        'Missing Anthropic API key. Set ANTHROPIC_API_KEY in your environment.'
      );
    }
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.fastModel = config.fastModel ?? ANTHROPIC_MODELS.FAST;
    this.advancedModel = config.advancedModel ?? ANTHROPIC_MODELS.ADVANCED;
  }

  async selectComponent(data: ComponentSelectionPromptData): Promise<string | null> {
    const prompt = PromptBuilder.buildComponentSelectionPrompt(data);
    const model = this.fastModel;

    const responseText = await withRetry(
      () => this.callAnthropic(model, prompt, AnalysisPhase.COMPONENT_RESOLUTION, 256),
      {
        maxAttempts: 3,
        shouldRetry: (error) => this.shouldRetry(error),
      }
    );

    if (!responseText) {
      return null;
    }

    const componentIds = data.components.map((c) => c.id);
    for (const id of componentIds) {
      if (responseText.includes(id)) {
        return id;
      }
    }

    return null;
  }

  async extractDependencies(
    data: DependencyExtractionPromptData
  ): Promise<DependencyExtractionResult> {
    const prompt = PromptBuilder.buildDependencyExtractionPrompt(data);
    const model = this.fastModel;

    const responseText = await withRetry(
      () => this.callAnthropic(model, prompt, AnalysisPhase.DEPENDENCY_SCAN, 4096),
      {
        maxAttempts: 3,
        shouldRetry: (error) => this.shouldRetry(error),
      }
    );

    const jsonStr = PromptBuilder.extractJson(responseText);
    if (!jsonStr) {
      throw new ErodeError(
        'No JSON found in Anthropic response for dependency extraction',
        ErrorCode.INVALID_RESPONSE,
        'Failed to extract JSON from Anthropic response',
        { responseText }
      );
    }

    const parsed: unknown = JSON.parse(jsonStr);
    return validate(DependencyExtractionResultSchema, parsed, 'DependencyExtractionResult');
  }

  async analyzeDrift(data: DriftAnalysisPromptData): Promise<DriftAnalysisResult> {
    const prompt = PromptBuilder.buildDriftAnalysisPrompt(data);
    const model = this.advancedModel;

    const responseText = await withRetry(
      () => this.callAnthropic(model, prompt, AnalysisPhase.CHANGE_ANALYSIS, 8192),
      {
        maxAttempts: 3,
        shouldRetry: (error) => this.shouldRetry(error),
      }
    );

    const jsonStr = PromptBuilder.extractJson(responseText);
    if (!jsonStr) {
      throw new ErodeError(
        'No JSON found in Anthropic response for PR analysis',
        ErrorCode.INVALID_RESPONSE,
        'Failed to extract JSON from Anthropic response',
        { responseText }
      );
    }

    const parsed: unknown = JSON.parse(jsonStr);
    const analysisResponse = validate(DriftAnalysisResponseSchema, parsed, 'DriftAnalysisResponse');

    return {
      ...analysisResponse,
      metadata: data.changeRequest,
      component: data.component,
      dependencyChanges: data.dependencies,
    };
  }

  async generateArchitectureCode(analysisResult: DriftAnalysisResult): Promise<string> {
    const prompt = PromptBuilder.buildModelGenerationPrompt(analysisResult);
    const model = this.advancedModel;

    return withRetry(
      () => this.callAnthropic(model, prompt, AnalysisPhase.MODEL_GENERATION, 8192),
      {
        maxAttempts: 3,
        shouldRetry: (error) => this.shouldRetry(error),
      }
    );
  }

  private async callAnthropic(
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
          'Response was blocked by Anthropic safety filters',
          ErrorCode.SAFETY_FILTERED,
          "The AI provider's safety filters blocked this content. Try simplifying the input.",
          { model, phase }
        );
      }

      const textBlock = response.content.find((b) => b.type === 'text');
      const text = textBlock && 'text' in textBlock ? textBlock.text : undefined;

      if (!text) {
        throw new ErodeError(
          'Empty response from Anthropic',
          ErrorCode.INVALID_RESPONSE,
          'Received empty response from Anthropic API',
          { model, phase }
        );
      }

      // Check for truncation
      if (response.stop_reason === 'max_tokens') {
        throw new ErodeError(
          'Anthropic response was truncated (max_tokens reached)',
          ErrorCode.INVALID_RESPONSE,
          'The AI response was cut short. The output may be incomplete.',
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

  private shouldRetry(error: unknown): boolean {
    if (error instanceof ApiError) {
      return error.isRateLimited || error.isTimeout;
    }
    return false;
  }
}
