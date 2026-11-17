import { z } from 'zod';
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
import { formatZodIssues } from '../utils/validation.js';
import { ApiError, StructuredOutputError } from '../errors.js';
import {
  createStructuredOutputSpec,
  stripNullProperties,
  type StructuredOutputSpec,
} from './structured-output.js';
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

const DEPENDENCY_EXTRACTION_OUTPUT = createStructuredOutputSpec(
  'dependency_extraction',
  'External architectural dependencies added, modified or removed by the diff',
  DependencyExtractionResultSchema
);

const DRIFT_ANALYSIS_OUTPUT = createStructuredOutputSpec(
  'drift_analysis',
  'Architectural drift assessment of the change against the declared model',
  DriftAnalysisResponseSchema
);

type ParsedResponse<T> = { success: true; data: T } | { success: false; issues: string };

function parseStructuredResponse<T>(
  responseText: string,
  output: StructuredOutputSpec<T>
): ParsedResponse<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch (error) {
    debugLog('structured response is not valid JSON (first 500 chars)', responseText.slice(0, 500));
    const reason = error instanceof Error ? error.message : String(error);
    return { success: false, issues: `  1. [(root)] Response is not valid JSON: ${reason}` };
  }
  const result = output.zodSchema.safeParse(stripNullProperties(parsed));
  return result.success
    ? { success: true, data: result.data }
    : { success: false, issues: formatZodIssues(result.error.issues) };
}

/** Cap on the echoed invalid response so a huge output cannot blow up the repair prompt. */
const MAX_REPAIR_RESPONSE_CHARS = 4000;

function buildRepairPrompt(prompt: string, previousResponse: string, issues: string): string {
  const truncated =
    previousResponse.length > MAX_REPAIR_RESPONSE_CHARS
      ? `${previousResponse.slice(0, MAX_REPAIR_RESPONSE_CHARS)}\n... (truncated)`
      : previousResponse;
  return `${prompt}

## CORRECTION

Your previous response:
${truncated}

It failed validation:
${issues}

Return the complete response again, corrected so it satisfies the schema.`;
}

/** Above this many components the selection schema uses a plain string and code checks membership. */
const MAX_COMPONENT_ENUM_SIZE = 100;

/** 4xx other than auth (401, 403), rate limiting (429) and timeouts (408): the request itself was rejected. */
function isInvalidRequestError(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.statusCode === undefined) {
    return false;
  }
  const status = error.statusCode;
  return (
    status >= 400 &&
    status < 500 &&
    ![401, 403, 408, 429].includes(status) &&
    !error.isRateLimited &&
    !error.isTimeout
  );
}

export interface ProviderConfig {
  apiKey: string;
  fastModel?: string;
  advancedModel?: string;
}

/**
 * Abstract base class for AI providers.
 *
 * Subclasses implement `callModel` (free text, or native structured output when given a spec)
 * with the provider-specific SDK call. All shared pipeline logic (prompt building,
 * retry, JSON parsing, validation, repair) lives here.
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
   * @param output - When set, the provider must return a JSON document matching
   *   `output.jsonSchema` via its native structured output; `BaseProvider` parses and validates it
   * @returns The text content of the model response
   */
  protected abstract callModel(
    model: string,
    prompt: string,
    phase: AnalysisPhase,
    generationProfile: GenerationProfile,
    output?: StructuredOutputSpec
  ): Promise<string>;

  async selectComponent(data: ComponentSelectionPromptData): Promise<string | null> {
    const ids = data.components.map((c) => c.id);
    const [firstId, ...otherIds] = ids;
    if (firstId === undefined) {
      return null;
    }
    // Very large enums can exceed provider schema limits, so fall back to a string checked here.
    const useEnum = ids.length <= MAX_COMPONENT_ENUM_SIZE;
    const output = createStructuredOutputSpec(
      'component_selection',
      'The component most affected by the changed files',
      z.object({ componentId: useEnum ? z.enum([firstId, ...otherIds]) : z.string() })
    );

    try {
      const { componentId } = await this.executeStage({
        phase: AnalysisPhase.COMPONENT_RESOLUTION,
        model: this.fastModel,
        prompt: PromptBuilder.buildComponentSelectionPrompt(data),
        output,
      });
      if (!ids.includes(componentId)) {
        debugLog('selectComponent returned an unknown component', componentId);
        return null;
      }
      debugLog('selectComponent matched', componentId);
      return componentId;
    } catch (error) {
      // Selection is best-effort: an unusable answer, or a request the provider rejects as
      // invalid (schema or model unsupported), falls back to the default component.
      if (error instanceof StructuredOutputError || isInvalidRequestError(error)) {
        debugLog('selectComponent gave no component', error instanceof Error ? error.message : '');
        return null;
      }
      throw error;
    }
  }

  async extractDependencies(
    data: DependencyExtractionPromptData
  ): Promise<DependencyExtractionResult> {
    return this.executeStage({
      phase: AnalysisPhase.DEPENDENCY_SCAN,
      model: this.fastModel,
      prompt: PromptBuilder.buildDependencyExtractionPrompt(data),
      output: DEPENDENCY_EXTRACTION_OUTPUT,
    });
  }

  async analyzeDrift(data: DriftAnalysisPromptData): Promise<DriftAnalysisResult> {
    const analysisResponse = await this.executeStage({
      phase: AnalysisPhase.CHANGE_ANALYSIS,
      model: this.advancedModel,
      prompt: PromptBuilder.buildDriftAnalysisPrompt(data),
      output: DRIFT_ANALYSIS_OUTPUT,
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
    output: StructuredOutputSpec<T>;
  }): Promise<T> {
    const { phase, model, prompt, output } = config;
    debugLog(`executeStage ${phase} using model`, model);
    const generationProfile = getGenerationProfileForPhase(phase);
    const request = (requestPrompt: string): Promise<string> =>
      withRetry(() => this.callModel(model, requestPrompt, phase, generationProfile, output), {
        retries: 2,
        shouldRetry: (error) => this.isRetryableError(error),
      });

    const startedAt = process.hrtime.bigint();
    const firstText = await request(prompt);
    const first = parseStructuredResponse(firstText, output);
    if (first.success) {
      debugLog(`executeStage ${phase} completed in`, formatDuration(startedAt));
      return first.data;
    }

    debugLog(`executeStage ${phase} invalid response, requesting one repair`, first.issues);
    const second = parseStructuredResponse(
      await request(buildRepairPrompt(prompt, firstText, first.issues)),
      output
    );
    debugLog(`executeStage ${phase} completed in`, formatDuration(startedAt));
    if (second.success) {
      return second.data;
    }

    throw new StructuredOutputError(
      `${output.name} response failed validation after one repair attempt:\n${second.issues}`,
      { phase, schema: output.name }
    );
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
