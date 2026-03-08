import type { ArchitectureModelAdapter } from '../adapters/architecture-adapter.js';
import type { ArchitecturalComponent, ArchitectureModel } from '../adapters/architecture-types.js';
import type { ComponentRelationshipRef } from '../analysis/analysis-types.js';
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
import { ErodeError, ErrorCode } from '../errors.js';
import { resolveModelSource, type ResolvedModelSource } from '../utils/model-source.js';

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
  relationships: ComponentRelationshipRef[];
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

/**
 * Use AI to select the best-matching component when multiple candidates exist.
 * Returns the selected component, falling back to `defaultComponent` if the
 * provider lacks the capability or the model returns no result.
 */
export async function selectComponentWithAI(
  provider: AIProvider,
  components: ArchitecturalComponent[],
  files: { filename: string }[],
  defaultComponent: ArchitecturalComponent,
  progress: ProgressReporter
): Promise<ArchitecturalComponent> {
  progress.start('Asking the model to pick the best-matching component');
  if (!provider.selectComponent) {
    progress.warn(`Provider lacks component selection, defaulting to: ${defaultComponent.name}`);
    return defaultComponent;
  }
  const componentId = await provider.selectComponent({ components, files });
  if (componentId) {
    const found = components.find((c) => c.id === componentId) ?? defaultComponent;
    progress.succeed(`Chosen component: ${found.name} (${componentId})`);
    return found;
  }
  progress.warn(`AI was unable to pick a component, defaulting to: ${defaultComponent.name}`);
  return defaultComponent;
}

/** Resolve model source, cloning if remote, with progress messages. */
export async function resolveAndCloneModel(
  modelPath: string,
  modelRepo: string | undefined,
  options: { ref?: string },
  progress: ProgressReporter
): Promise<ResolvedModelSource> {
  if (modelRepo) {
    progress.start('Cloning model repository');
  }
  const resolvedSource = await resolveModelSource(modelPath, modelRepo, options);
  if (modelRepo) {
    progress.succeed(`Model repository cloned (${resolvedSource.repoSlug ?? modelRepo})`);
  }
  return resolvedSource;
}

/** TS strict guard: extract the first element of a non-empty components array. */
function firstComponentOrThrow(components: ArchitecturalComponent[]): ArchitecturalComponent {
  const first = components[0];
  if (!first) {
    throw new ErodeError(
      'Unexpected: components array was non-empty but first element was undefined',
      ErrorCode.INTERNAL_UNKNOWN,
      'Internal pipeline error'
    );
  }
  return first;
}

/** Look up components for a repository, returning an empty result if none match. */
export function findComponentsForRepo(
  adapter: ArchitectureModelAdapter,
  repoUrl: string,
  metadata: ChangeRequestMetadata,
  progress: ProgressReporter
): ComponentLookupResult {
  progress.start('Locating components for repository');
  const components = adapter.findAllComponentsByRepository(repoUrl);

  if (components.length === 0) {
    progress.warn(`No components matched repository: ${repoUrl}`);
    for (const line of adapter.metadata.noComponentHelpLines) {
      progress.info(line.replace('{{repoUrl}}', repoUrl));
    }
    return buildEmptyResult({
      metadata,
      repoUrl,
      adapterDisplayName: adapter.metadata.displayName,
      includeStructured: true,
    });
  }
  progress.succeed(`Located ${String(components.length)} component(s) for repository`);
  return { found: true, components, defaultComponent: firstComponentOrThrow(components) };
}

type ComponentLookupResult =
  | { found: true; components: ArchitecturalComponent[]; defaultComponent: ArchitecturalComponent }
  | EmptyCheckResult;

/** Map components to `{ id, name }` refs for file-ownership context, or undefined if single-component. */
export function toAllComponentsParam(
  components: ArchitecturalComponent[]
): Pick<ArchitecturalComponent, 'id' | 'name'>[] | undefined {
  return components.length > 1 ? components.map((c) => ({ id: c.id, name: c.name })) : undefined;
}
