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
import { CONFIG } from '../utils/config.js';
import {
  getGenerationProfileForModelPatch,
  getGenerationProfileForPhase,
  type GenerationProfile,
} from './generation-profile.js';

function debugLog(msg: string, data?: unknown): void {
  if (CONFIG.debug.verbose) {
    console.error(`[AI] ${msg}`, data !== undefined ? JSON.stringify(data) : '');
  }
}

function formatDuration(startedAt: bigint): string {
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  if (elapsedMs < 1000) {
    return `${String(Math.round(elapsedMs))}ms`;
  }
  return `${(elapsedMs / 1000).toFixed(2)}s`;
}

export interface ProviderConfig {
  apiKey: string;
  fastModel?: string;
  advancedModel?: string;
}

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
   * @param generationProfile - Provider-agnostic output intent
   * @returns The text content of the model response
   */
  protected abstract callModel(
    model: string,
    prompt: string,
    phase: AnalysisPhase,
    generationProfile: GenerationProfile
  ): Promise<string>;

  async selectComponent(data: ComponentSelectionPromptData): Promise<string | null> {
    const prompt = PromptBuilder.buildComponentSelectionPrompt(data);

    debugLog('selectComponent using model', this.fastModel);
    const startedAt = process.hrtime.bigint();
    const responseText = await withRetry(
      () =>
        this.callModel(
          this.fastModel,
          prompt,
          AnalysisPhase.COMPONENT_RESOLUTION,
          getGenerationProfileForPhase(AnalysisPhase.COMPONENT_RESOLUTION)
        ),
      {
        retries: 2,
        shouldRetry: (error) => this.isRetryableError(error),
      }
    );
    debugLog('selectComponent completed in', formatDuration(startedAt));

    if (!responseText) {
      return null;
    }

    debugLog('selectComponent raw response', responseText);
    const matchedId =
      data.components.map((c) => c.id).find((id) => responseText.includes(id)) ?? null;
    debugLog('selectComponent matched', matchedId);
    return matchedId;
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
    });
  }

  async analyzeDrift(data: DriftAnalysisPromptData): Promise<DriftAnalysisResult> {
    const analysisResponse = await this.executeStage({
      phase: AnalysisPhase.CHANGE_ANALYSIS,
      model: this.advancedModel,
      prompt: PromptBuilder.buildDriftAnalysisPrompt(data),
      schema: DriftAnalysisResponseSchema,
      schemaName: 'DriftAnalysisResponse',
    });

    return {
      ...analysisResponse,
      metadata: data.changeRequest,
      component: data.component,
      dependencyChanges: data.dependencies,
    };
  }

  async patchModel(
    fileContent: string,
    linesToInsert: string[],
    modelFormat: string
  ): Promise<string> {
    const prompt = PromptBuilder.buildModelPatchPrompt({
      fileContent,
      linesToInsert,
      modelFormat,
    });
    debugLog('patchModel using model', this.fastModel);
    const startedAt = process.hrtime.bigint();
    return withRetry(
      () =>
        this.callModel(
          this.fastModel,
          prompt,
          AnalysisPhase.MODEL_UPDATE,
          getGenerationProfileForModelPatch(fileContent, linesToInsert)
        ),
      {
        retries: 2,
        shouldRetry: (error) => this.isRetryableError(error),
      }
    )
      .then((response) => unwrapModelPatchResponse(response))
      .finally(() => {
        debugLog('patchModel completed in', formatDuration(startedAt));
      });
  }

  private async executeStage<T>(config: {
    phase: AnalysisPhase;
    model: string;
    prompt: string;
    schema: z.ZodType<T>;
    schemaName: string;
    generationProfile?: GenerationProfile;
  }): Promise<T> {
    debugLog(`executeStage ${config.phase} using model`, config.model);
    const generationProfile =
      config.generationProfile ?? getGenerationProfileForPhase(config.phase);
    const startedAt = process.hrtime.bigint();
    const responseText = await withRetry(
      () => this.callModel(config.model, config.prompt, config.phase, generationProfile),
      {
        retries: 2,
        shouldRetry: (error) => this.isRetryableError(error),
      }
    );
    debugLog(`executeStage ${config.phase} completed in`, formatDuration(startedAt));

    const jsonStr = PromptBuilder.extractJson(responseText);
    if (!jsonStr) {
      debugLog(
        `extractJson returned null for ${config.phase}, raw response (first 500 chars)`,
        responseText.slice(0, 500)
      );
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

function unwrapModelPatchResponse(response: string): string {
  const trimmed = response.trim();
  const lines = trimmed.split(/\r?\n/);
  const firstLine = lines[0];
  const lastLine = lines.at(-1);

  if (firstLine?.startsWith('```') && lastLine === '```') {
    return lines.slice(1, -1).join('\n');
  }

  return response;
}
