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
        'An Anthropic API key is needed',
        ErrorCode.MISSING_API_KEY,
        'No Anthropic API key found. Set ANTHROPIC_API_KEY in your environment.'
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
        'Anthropic response for dependency extraction contained no JSON',
        ErrorCode.INVALID_RESPONSE,
        'Could not extract JSON from Anthropic response',
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
        'Anthropic response for PR analysis contained no JSON',
        ErrorCode.INVALID_RESPONSE,
        'Could not extract JSON from Anthropic response',
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

  private shouldRetry(error: unknown): boolean {
    if (error instanceof ApiError) {
      return error.isRateLimited || error.isTimeout;
    }
    return false;
  }
}
