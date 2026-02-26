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
    const model = this.fastModel;

    const responseText = await withRetry(
      () => this.callModel(model, prompt, AnalysisPhase.COMPONENT_RESOLUTION, 256),
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
      () => this.callModel(model, prompt, AnalysisPhase.DEPENDENCY_SCAN, 4096),
      {
        maxAttempts: 3,
        shouldRetry: (error) => this.shouldRetry(error),
      }
    );

    const jsonStr = PromptBuilder.extractJson(responseText);
    if (!jsonStr) {
      throw new ErodeError(
        'AI response for dependency extraction contained no JSON',
        ErrorCode.INVALID_RESPONSE,
        'Could not extract JSON from AI response',
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
      () => this.callModel(model, prompt, AnalysisPhase.CHANGE_ANALYSIS, 8192),
      {
        maxAttempts: 3,
        shouldRetry: (error) => this.shouldRetry(error),
      }
    );

    const jsonStr = PromptBuilder.extractJson(responseText);
    if (!jsonStr) {
      throw new ErodeError(
        'AI response for PR analysis contained no JSON',
        ErrorCode.INVALID_RESPONSE,
        'Could not extract JSON from AI response',
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

    return withRetry(() => this.callModel(model, prompt, AnalysisPhase.MODEL_GENERATION, 8192), {
      maxAttempts: 3,
      shouldRetry: (error) => this.shouldRetry(error),
    });
  }

  private shouldRetry(error: unknown): boolean {
    if (error instanceof ApiError) {
      return error.isRateLimited || error.isTimeout;
    }
    return false;
  }
}
