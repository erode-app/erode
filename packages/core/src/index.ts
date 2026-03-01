// Adapters
export { createAdapter } from './adapters/adapter-factory.js';
export type {
  ArchitectureModelAdapter,
  VersionCheckResult,
} from './adapters/architecture-adapter.js';
export type {
  ArchitecturalComponent,
  SimpleComponent,
  ArchitectureModel,
  ModelRelationship,
  ComponentIndex,
} from './adapters/architecture-types.js';
export type { AdapterMetadata } from './adapters/adapter-metadata.js';

// Providers
export { createAIProvider } from './providers/provider-factory.js';
export type { AIProvider } from './providers/ai-provider.js';

// Platforms
export { createPlatformReader, createPlatformWriter } from './platforms/platform-factory.js';
export type {
  SourcePlatformReader,
  SourcePlatformWriter,
  ChangeRequestRef,
  ChangeRequestData,
  ChangeRequestCommit,
} from './platforms/source-platform.js';

// Analysis
export type {
  DriftAnalysisResult,
  DriftAnalysisPromptData,
  DependencyExtractionPromptData,
  ComponentSelectionPromptData,
  StructuredRelationship,
} from './analysis/analysis-types.js';

// Schemas
export type { DependencyExtractionResult } from './schemas/dependency-extraction.schema.js';

// Output (pure — no chalk dependency for structured/comment output)
export {
  buildStructuredOutput,
  formatAnalysisAsComment,
  formatErrorAsComment,
  formatPatchPrBody,
  analysisHasFindings,
  COMMENT_MARKER,
  writeOutputToFile,
} from './output.js';
export type { StructuredAnalysisOutput } from './output/structured-output.js';
export type { CommentExtras } from './output.js';

// CI output
export {
  writeGitHubActionsOutputs,
  writeGitHubStepSummary,
  buildStepSummary,
} from './output/ci-output.js';

// Config
export { CONFIG } from './utils/config.js';

// Errors
export { ErodeError, ConfigurationError, ApiError, AdapterError, ErrorCode } from './errors.js';

// Validation (core utilities only)
export { validate, validatePath } from './utils/validation.js';

// Retry utility
export { withRetry } from './utils/retry.js';
export type { RetryPolicy } from './utils/retry.js';

// Skip patterns
export { loadSkipPatterns, applySkipPatterns } from './utils/skip-patterns.js';

// Schemas (re-export for consumers that need them)
export { PackageJsonSchema } from './schemas/package.schema.js';

// Pipelines (headless orchestration functions)
export { runAnalyze } from './pipelines/analyze.js';
export type { AnalyzeOptions, AnalyzeResult } from './pipelines/analyze.js';
export { runComponents } from './pipelines/components.js';
export type { ComponentsOptions } from './pipelines/components.js';
export { runValidate } from './pipelines/validate.js';
export type { ValidateOptions, ValidateResult } from './pipelines/validate.js';
export { runConnections } from './pipelines/connections.js';
export type { ConnectionsOptions, ComponentConnections } from './pipelines/connections.js';
export type { ProgressReporter } from './pipelines/progress.js';
export { SilentProgress } from './pipelines/progress.js';
export { createModelPr, closeModelPr, modelPrBranchName } from './pipelines/pr-creation.js';
export type { CreateModelPrOptions, CreateModelPrResult } from './pipelines/pr-creation.js';

// Patching
export { createModelPatcher, quickValidatePatch } from './adapters/model-patcher.js';
export type { ModelPatcher, PatchResult, DslValidationResult } from './adapters/model-patcher.js';
