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
import type { ChangeRequestFile } from '../platforms/source-platform.js';
import { ErodeError, ErrorCode } from '../errors.js';
import { resolveModelSource, type ResolvedModelSource } from '../utils/model-source.js';

/** Emit the adapter's non-fatal version warning, if any. Runs before loading so it shows even when parsing fails. */
export function warnOnModelVersionSkew(
  adapter: ArchitectureModelAdapter,
  modelPath: string,
  progress: ProgressReporter
): void {
  const warning = adapter.checkVersion?.(modelPath).warning;
  if (warning) progress.warn(warning);
}

/** Load and validate an architecture model, emitting progress. */
export async function loadArchitectureModel(
  adapter: ArchitectureModelAdapter,
  modelPath: string,
  progress: ProgressReporter
): Promise<ArchitectureModel> {
  progress.section(`Preparing ${adapter.metadata.displayName} Architecture Model`);
  validatePath(modelPath, 'directory');
  warnOnModelVersionSkew(adapter, modelPath, progress);
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
      technology: r.technology,
      description: r.description,
      tags: r.tags,
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

export interface LineBudgetResult {
  files: ChangeRequestFile[];
  truncationReason?: string;
}

/**
 * Keep files in order until the line budget is used up. Runs after skip patterns so excluded
 * files (lockfiles) never consume budget. A file that does not fit is skipped, not a stop
 * signal, so smaller later files still fit. The first file is always kept, with its patch
 * cut to the budget when it alone exceeds it.
 */
export function applyLineBudget(
  files: ChangeRequestFile[],
  maxLines: number = CONFIG.constraints.maxLinesPerDiff
): LineBudgetResult {
  const totalLines = files.reduce((sum, f) => sum + f.changes, 0);
  if (totalLines <= maxLines) return { files };

  const kept: ChangeRequestFile[] = [];
  let used = 0;
  let patchTrimmed = false;
  for (const file of files) {
    if (kept.length === 0) {
      if (file.changes > maxLines && file.patch !== undefined) {
        kept.push({ ...file, patch: file.patch.split('\n').slice(0, maxLines).join('\n') });
        patchTrimmed = true;
      } else {
        kept.push(file);
      }
      used += file.changes;
      continue;
    }
    if (used + file.changes > maxLines) continue;
    kept.push(file);
    used += file.changes;
  }

  const dropped = files.length - kept.length;
  const header = `Diff surpassed the ${String(maxLines)}-line limit (${String(totalLines)} lines found).`;
  const detail =
    dropped > 0 || patchTrimmed
      ? `${String(dropped)} ${dropped === 1 ? 'file was' : 'files were'} dropped${patchTrimmed ? ' and the first file was cut to fit' : ''}.`
      : 'Analysis may be partial.';
  return { files: kept, truncationReason: `${header} ${detail}` };
}

/**
 * Count added and removed lines in one per-file diff segment. Only the file header (before the
 * first hunk) is excluded; inside a hunk every +/- line is content, including `----` (a removed
 * Markdown rule) and `+++x`.
 */
function countChangedLines(segment: string): number {
  let n = 0;
  let inHunk = false;
  for (const line of segment.split('\n')) {
    if (line.startsWith('diff --git ')) inHunk = false;
    else if (line.startsWith('@@')) inHunk = true;
    else if (inHunk && (line.startsWith('+') || line.startsWith('-'))) n++;
  }
  return n;
}

/** Line budget for a local unified diff; same rules as {@link applyLineBudget}. */
export function applyLineBudgetToDiff(
  diff: string,
  maxLines: number = CONFIG.constraints.maxLinesPerDiff
): { diff: string; truncationReason?: string } {
  const marker = 'diff --git ';
  const segments: string[] = [];
  let current = '';
  for (const line of diff.split('\n')) {
    if (line.startsWith(marker) && current) {
      segments.push(current);
      current = '';
    }
    current += `${line}\n`;
  }
  if (current) segments.push(current);

  const asFiles: ChangeRequestFile[] = segments.map((seg, i) => {
    const changes = countChangedLines(seg);
    return {
      filename: String(i),
      status: 'modified',
      additions: changes,
      deletions: 0,
      changes,
      patch: seg.replace(/\n$/, ''),
    };
  });
  const result = applyLineBudget(asFiles, maxLines);
  if (result.truncationReason === undefined) return { diff };
  return {
    diff: result.files.map((f) => f.patch ?? '').join('\n'),
    truncationReason: result.truncationReason,
  };
}
