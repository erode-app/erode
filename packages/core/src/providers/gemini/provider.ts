import { FinishReason, GoogleGenAI } from '@google/genai';
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
import { GEMINI_MODELS } from './models.js';

export class GeminiProvider implements AIProvider {
  private readonly client: GoogleGenAI;
  private readonly fastModel: string;
  private readonly advancedModel: string;

  constructor(config: { apiKey: string; fastModel?: string; advancedModel?: string }) {
    if (!config.apiKey) {
      throw new ErodeError(
        'A Gemini API key is needed',
        ErrorCode.MISSING_API_KEY,
        'No Gemini API key found. Set GEMINI_API_KEY in your environment.'
      );
    }
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    this.fastModel = config.fastModel ?? GEMINI_MODELS.FAST;
    this.advancedModel = config.advancedModel ?? GEMINI_MODELS.ADVANCED;
  }

  async selectComponent(data: ComponentSelectionPromptData): Promise<string | null> {
    const prompt = PromptBuilder.buildComponentSelectionPrompt(data);
    const model = this.fastModel;

    const responseText = await withRetry(
      () => this.callGemini(model, prompt, AnalysisPhase.COMPONENT_RESOLUTION),
      {
        maxAttempts: 3,
        shouldRetry: (error) => this.shouldRetry(error),
      }
    );

    if (!responseText) {
      return null;
    }

    // Match response against known component IDs
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
      () => this.callGemini(model, prompt, AnalysisPhase.DEPENDENCY_SCAN),
      {
        maxAttempts: 3,
        shouldRetry: (error) => this.shouldRetry(error),
      }
    );

    const jsonStr = PromptBuilder.extractJson(responseText);
    if (!jsonStr) {
      throw new ErodeError(
        'Gemini response for dependency extraction contained no JSON',
        ErrorCode.INVALID_RESPONSE,
        'Could not extract JSON from Gemini response',
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
      () => this.callGemini(model, prompt, AnalysisPhase.CHANGE_ANALYSIS),
      {
        maxAttempts: 3,
        shouldRetry: (error) => this.shouldRetry(error),
      }
    );

    const jsonStr = PromptBuilder.extractJson(responseText);
    if (!jsonStr) {
      throw new ErodeError(
        'Gemini response for PR analysis contained no JSON',
        ErrorCode.INVALID_RESPONSE,
        'Could not extract JSON from Gemini response',
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

    return withRetry(() => this.callGemini(model, prompt, AnalysisPhase.MODEL_GENERATION), {
      maxAttempts: 3,
      shouldRetry: (error) => this.shouldRetry(error),
    });
  }

  private async callGemini(model: string, prompt: string, phase: AnalysisPhase): Promise<string> {
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

  private shouldRetry(error: unknown): boolean {
    if (error instanceof ApiError) {
      return error.isRateLimited || error.isTimeout;
    }
    return false;
  }
}
