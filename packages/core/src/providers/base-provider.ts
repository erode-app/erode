import type { z } from 'zod';
import type { AIProvider } from './ai-provider.js';
import type {
  DependencyExtractionPromptData,
  ComponentSelectionPromptData,
  DriftAnalysisPromptData,
  DriftAnalysisResult,
} from '../analysis/analysis-types.js';
import type { DependencyExtractionResult } from '../schemas/dependency-extraction.schema.js';
import { DependencyExtractionResultSchema } from '../schemas/dependency-extraction.schema.js';
import { DriftAnalysisResponseSchema } from '../schemas/drift-analysis.schema.js';
import { PromptBuilder } from '../analysis/prompt-builder.js';
import { validate } from '../utils/validation.js';
import { ErodeError, ErrorCode, ApiError } from '../errors.js';
import { withRetry } from '../utils/retry.js';
import { AnalysisPhase } from './analysis-phase.js';

/**
 * Abstract base class for AI providers.
 *
 * Subclasses only need to implement `callModel` with the provider-specific SDK call.
 * All shared pipeline logic (prompt building, retry, JSON extraction, validation) lives here.
 */
export abstract class BaseProvider implements AIProvider {
  protected readonly fastModel: string;
  protected readonly advancedModel: string;

  constructor(config: { fastModel: string; advancedModel: string }) {
    this.fastModel = config.fastModel;
    this.advancedModel = config.advancedModel;
  }

  /**
   * Make a single AI model call using the provider-specific SDK.
   * @param model - The model identifier to use
   * @param prompt - The prompt text to send
   * @param phase - The analysis phase (for error context)
   * @param maxTokens - Maximum tokens for the response (some providers may ignore this)
   * @returns The text content of the model response
   */
  protected abstract callModel(
    model: string,
    prompt: string,
    phase: AnalysisPhase,
    maxTokens: number
  ): Promise<string>;

  async selectComponent(data: ComponentSelectionPromptData): Promise<string | null> {
    const prompt = PromptBuilder.buildComponentSelectionPrompt(data);

    const responseText = await withRetry(
      () => this.callModel(this.fastModel, prompt, AnalysisPhase.COMPONENT_RESOLUTION, 256),
      {
        retries: 2,
        shouldRetry: (error) => this.isRetryableError(error),
      }
    );

    if (!responseText) {
      return null;
    }

    return data.components.map((c) => c.id).find((id) => responseText.includes(id)) ?? null;
  }

  async extractDependencies(
    data: DependencyExtractionPromptData
  ): Promise<DependencyExtractionResult> {
    return this.executeStage({
      phase: AnalysisPhase.DEPENDENCY_SCAN,
      model: this.fastModel,
      prompt: PromptBuilder.buildDependencyExtractionPrompt(data),
      schema: DependencyExtractionResultSchema,
      schemaName: 'DependencyExtractionResult',
      maxTokens: 4096,
    });
  }

  async analyzeDrift(data: DriftAnalysisPromptData): Promise<DriftAnalysisResult> {
    const analysisResponse = await this.executeStage({
      phase: AnalysisPhase.CHANGE_ANALYSIS,
      model: this.advancedModel,
      prompt: PromptBuilder.buildDriftAnalysisPrompt(data),
      schema: DriftAnalysisResponseSchema,
      schemaName: 'DriftAnalysisResponse',
      maxTokens: 8192,
    });

    return {
      ...analysisResponse,
      metadata: data.changeRequest,
      component: data.component,
      dependencyChanges: data.dependencies,
    };
  }

  async generateArchitectureCode(analysisResult: DriftAnalysisResult): Promise<string> {
    const prompt = PromptBuilder.buildModelGenerationPrompt(analysisResult);
    return withRetry(
      () => this.callModel(this.advancedModel, prompt, AnalysisPhase.MODEL_GENERATION, 8192),
      {
        retries: 2,
        shouldRetry: (error) => this.isRetryableError(error),
      }
    );
  }

  private async executeStage<T>(config: {
    phase: AnalysisPhase;
    model: string;
    prompt: string;
    schema: z.ZodType<T>;
    schemaName: string;
    maxTokens: number;
  }): Promise<T> {
    const responseText = await withRetry(
      () => this.callModel(config.model, config.prompt, config.phase, config.maxTokens),
      {
        retries: 2,
        shouldRetry: (error) => this.isRetryableError(error),
      }
    );

    const jsonStr = PromptBuilder.extractJson(responseText);
    if (!jsonStr) {
      throw new ErodeError(
        'Response contained no parseable JSON',
        ErrorCode.PROVIDER_INVALID_RESPONSE,
        'AI response failed to produce valid JSON',
        { phase: config.phase }
      );
    }

    const parsed: unknown = JSON.parse(jsonStr);
    return validate(config.schema, parsed, config.schemaName);
  }

  private isRetryableError(error: unknown): boolean {
    return error instanceof ApiError && (error.isRateLimited || error.isTimeout);
  }
}
