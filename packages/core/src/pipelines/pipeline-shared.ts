import type { ArchitectureModelAdapter } from '../adapters/architecture-adapter.js';
import type { ArchitecturalComponent, ArchitectureModel } from '../adapters/architecture-types.js';
import type { AIProvider } from '../providers/ai-provider.js';
import type {
  DriftAnalysisPromptData,
  DriftAnalysisResult,
  ChangeRequestMetadata,
} from '../analysis/analysis-types.js';
import type { StructuredAnalysisOutput } from '../output/structured-output.js';
import type { ProgressReporter } from './progress.js';
import { validatePath } from '../utils/validation.js';
import { buildStructuredOutput } from '../output.js';
import { CONFIG } from '../utils/config.js';

/** Load and validate an architecture model, emitting progress. */
export async function loadArchitectureModel(
  adapter: ArchitectureModelAdapter,
  modelPath: string,
  progress: ProgressReporter
): Promise<ArchitectureModel> {
  progress.section(`Preparing ${adapter.metadata.displayName} Architecture Model`);
  validatePath(modelPath, 'directory');
  progress.start('Reading architecture model');
  const model = await adapter.loadFromPath(modelPath);
  progress.succeed('Architecture model ready');
  return model;
}

export interface ArchitecturalContext {
  dependencies: (ArchitecturalComponent & { repository?: string })[];
  dependents: (ArchitecturalComponent & { repository?: string })[];
  relationships: {
    target: { id: string; name: string };
    kind?: string;
    title?: string;
  }[];
}

/** Build architectural context (dependencies, dependents, relationships) for a component. */
export function buildArchitecturalContext(
  adapter: ArchitectureModelAdapter,
  componentId: string
): ArchitecturalContext {
  const dependencies = adapter.getComponentDependencies(componentId);
  const dependents = adapter.getComponentDependents(componentId);
  const relationships = adapter.getComponentRelationships(componentId);

  return {
    dependencies: dependencies.map((d) => ({ ...d, repository: d.repository })),
    dependents: dependents.map((d) => ({ ...d, repository: d.repository })),
    relationships: relationships.map((r) => ({
      target: { id: r.target.id, name: r.target.name },
      kind: r.kind,
      title: r.title,
    })),
  };
}

export interface EmptyResultOptions {
  metadata: ChangeRequestMetadata;
  repoUrl: string;
  adapterDisplayName: string;
  includeStructured?: boolean;
}

export interface EmptyCheckResult {
  analysisResult: DriftAnalysisResult;
  structured?: StructuredAnalysisOutput;
  hasViolations: false;
}

/** Build an empty "no components matched" result. */
export function buildEmptyResult(options: EmptyResultOptions): EmptyCheckResult {
  const emptyResult: DriftAnalysisResult = {
    hasViolations: false,
    violations: [],
    summary: `No components found matching repository: ${options.repoUrl}`,
    metadata: options.metadata,
    component: { id: '', name: '', tags: [], type: '' },
    dependencyChanges: { dependencies: [], summary: '' },
  };
  const structured = options.includeStructured
    ? buildStructuredOutput(emptyResult, options.adapterDisplayName)
    : undefined;
  return { analysisResult: emptyResult, structured, hasViolations: false };
}

/** Run Stage 3: Drift analysis with progress and verbose logging. */
export async function runDriftStage(
  provider: AIProvider,
  promptData: DriftAnalysisPromptData,
  progress: ProgressReporter
): Promise<DriftAnalysisResult> {
  progress.section('Stage 3: Drift Analysis');
  progress.start('Evaluating changes for architectural drift');
  const analysisResult = await provider.analyzeDrift(promptData);
  progress.succeed('Drift analysis finished');

  if (CONFIG.debug.verbose) {
    console.error(
      '[Stage 3] Drift analysis:',
      JSON.stringify({
        violations: analysisResult.violations.length,
        hasModelUpdates: !!analysisResult.modelUpdates?.relationships?.length,
      })
    );
  }

  return analysisResult;
}
