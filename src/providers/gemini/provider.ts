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
import { ErrorHandler } from '../../utils/error-handler.js';
import { AnalysisPhase } from '../analysis-phase.js';
import type { GeminiModelId } from './models.js';
import { GEMINI_MODELS } from './models.js';

export class GeminiProvider implements AIProvider {
  private readonly client: GoogleGenAI;

  constructor(config: { apiKey: string }) {
    if (!config.apiKey) {
      throw new ErodeError(
        'Gemini API key is required',
        ErrorCode.MISSING_API_KEY,
        'Missing Gemini API key. Set GEMINI_API_KEY in your environment.'
      );
    }
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
  }

  async selectComponent(data: ComponentSelectionPromptData): Promise<string | null> {
    const prompt = PromptBuilder.buildComponentSelectionPrompt(data);
    const model = GEMINI_MODELS.FLASH;

    const responseText = await ErrorHandler.withRetry(
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

  async extractDependencies(data: DependencyExtractionPromptData): Promise<DependencyExtractionResult> {
    const prompt = PromptBuilder.buildDependencyExtractionPrompt(data);
    const model = GEMINI_MODELS.FLASH;

    const responseText = await ErrorHandler.withRetry(
      () => this.callGemini(model, prompt, AnalysisPhase.DEPENDENCY_SCAN),
      {
        maxAttempts: 3,
        shouldRetry: (error) => this.shouldRetry(error),
      }
    );

    const jsonStr = PromptBuilder.extractJson(responseText);
    if (!jsonStr) {
      throw new ErodeError(
        'No JSON found in Gemini response for dependency extraction',
        ErrorCode.INVALID_RESPONSE,
        'Failed to extract JSON from Gemini response',
        { responseText }
      );
    }

    const parsed: unknown = JSON.parse(jsonStr);
    return validate(DependencyExtractionResultSchema, parsed, 'DependencyExtractionResult');
  }

  async analyzeDrift(
    data: DriftAnalysisPromptData
  ): Promise<DriftAnalysisResult> {
    const prompt = PromptBuilder.buildDriftAnalysisPrompt(data);
    const model = GEMINI_MODELS.PRO;

    const responseText = await ErrorHandler.withRetry(
      () => this.callGemini(model, prompt, AnalysisPhase.CHANGE_ANALYSIS),
      {
        maxAttempts: 3,
        shouldRetry: (error) => this.shouldRetry(error),
      }
    );

    const jsonStr = PromptBuilder.extractJson(responseText);
    if (!jsonStr) {
      throw new ErodeError(
        'No JSON found in Gemini response for PR analysis',
        ErrorCode.INVALID_RESPONSE,
        'Failed to extract JSON from Gemini response',
        { responseText }
      );
    }

    const parsed: unknown = JSON.parse(jsonStr);
    const analysisResponse = validate(
      DriftAnalysisResponseSchema,
      parsed,
      'DriftAnalysisResponse'
    );

    return {
      ...analysisResponse,
      metadata: data.changeRequest,
      component: data.component,
      dependencyChanges: data.dependencies,
    };
  }

  async generateArchitectureCode(analysisResult: DriftAnalysisResult): Promise<string> {
    const prompt = PromptBuilder.buildModelGenerationPrompt(analysisResult);
    const model = GEMINI_MODELS.PRO;

    return ErrorHandler.withRetry(
      () => this.callGemini(model, prompt, AnalysisPhase.MODEL_GENERATION),
      {
        maxAttempts: 3,
        shouldRetry: (error) => this.shouldRetry(error),
      }
    );
  }

  private async callGemini(model: GeminiModelId, prompt: string, phase: AnalysisPhase): Promise<string> {
    try {
      const response = await this.client.models.generateContent({
        model,
        contents: prompt,
      });

      const candidate = response.candidates?.[0];
      if (candidate?.finishReason === FinishReason.SAFETY) {
        throw new ErodeError(
          'Response was blocked by Gemini safety filters',
          ErrorCode.SAFETY_FILTERED,
          "The AI provider's safety filters blocked this content. Try simplifying the input.",
          { model, phase }
        );
      }

      const text = response.text;
      if (!text) {
        throw new ErodeError(
          'Empty response from Gemini',
          ErrorCode.INVALID_RESPONSE,
          'Received empty response from Gemini API',
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
