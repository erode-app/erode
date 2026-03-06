import type { ProgressReporter } from './progress.js';
import { SilentProgress } from './progress.js';
import { createAdapter } from '../adapters/adapter-factory.js';
import { createAIProvider } from '../providers/provider-factory.js';
import { loadSkipPatterns, applySkipPatterns } from '../utils/skip-patterns.js';
import { ErodeError, ErrorCode } from '../errors.js';
import { CONFIG } from '../utils/config.js';
import { buildStructuredOutput } from '../output.js';
import type { StructuredAnalysisOutput } from '../output/structured-output.js';
import type { ArchitecturalComponent } from '../adapters/architecture-types.js';
import type {
  DriftAnalysisPromptData,
  DriftAnalysisResult,
  ChangeRequestMetadata,
} from '../analysis/analysis-types.js';
import type { DependencyExtractionResult } from '../schemas/dependency-extraction.schema.js';
import type { ChangeRequestFile } from '../platforms/source-platform.js';
import { selectComponentWithAI } from './resolve-component.js';
import { parseFilesFromDiff } from '../utils/git-diff.js';
import {
  loadArchitectureModel,
  buildArchitecturalContext,
  buildEmptyResult,
  runDriftStage,
} from './pipeline-shared.js';

export interface CheckOptions {
  /** Path to the architecture model directory. */
  modelPath: string;
  /** Pre-generated unified diff string. */
  diff: string;
  /** Repository URL (e.g. https://github.com/org/repo). */
  repo: string;
  /** Parsed owner from the repo URL. */
  repoOwner: string;
  /** Parsed repo name from the repo URL. */
  repoName: string;
  /** Architecture model format. */
  modelFormat?: string;
  /** Explicit component ID to analyse (skips Stage 1). */
  componentId?: string;
  /** Output format. */
  format?: 'console' | 'json';
  /** Files extracted from the diff (filename + status). */
  files?: { filename: string; status: string }[];
  /** Diff stats. */
  stats?: { additions: number; deletions: number; filesChanged: number };
  /** Whether to skip .erodeignore filtering. */
  skipFileFiltering?: boolean;
}

export interface CheckResult {
  analysisResult: DriftAnalysisResult;
  structured?: StructuredAnalysisOutput;
  hasViolations: boolean;
}

/**
 * Run a local architecture drift check against a git diff.
 *
 * This is the local counterpart of `runAnalyze` — it reuses Stage 2
 * (dependency extraction) and Stage 3 (drift analysis) but operates on
 * a raw diff string instead of fetching PR data from a platform API.
 */
export async function runCheck(
  options: CheckOptions,
  progress?: ProgressReporter
): Promise<CheckResult> {
  const p = progress ?? new SilentProgress();
  const adapter = createAdapter(options.modelFormat);

  // ── Load architecture model ──────────────────────────────────────────
  const architectureModel = await loadArchitectureModel(adapter, options.modelPath, p);

  // ── Initialise AI provider ───────────────────────────────────────────
  p.start('Setting up AI provider');
  const provider = createAIProvider();
  p.succeed('AI provider initialized');

  // ── Find components for this repository ──────────────────────────────
  p.start('Locating components for repository');
  const components = adapter.findAllComponentsByRepository(options.repo);

  if (components.length === 0) {
    p.warn(`No components matched repository: ${options.repo}`);
    for (const line of adapter.metadata.noComponentHelpLines) {
      p.info(line.replace('{{repoUrl}}', options.repo));
    }
    return buildEmptyResult({
      metadata: buildLocalMetadata(options),
      repoUrl: options.repo,
      adapterDisplayName: adapter.metadata.displayName,
      includeStructured: options.format === 'json',
    });
  }
  p.succeed(`Located ${String(components.length)} component(s) for repository`);

  const defaultComponent = components[0];
  if (!defaultComponent) {
    throw new ErodeError(
      'Unexpected: components array was non-empty but first element was undefined',
      ErrorCode.INTERNAL_UNKNOWN,
      'Internal pipeline error'
    );
  }

  // ── Resolve files from diff ──────────────────────────────────────────
  let files = options.files ?? parseFilesFromDiff(options.diff);

  // ── File filtering ───────────────────────────────────────────────────
  if (!options.skipFileFiltering) {
    const patterns = loadSkipPatterns();
    const asChangeRequestFiles: ChangeRequestFile[] = files.map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: 0,
      deletions: 0,
      changes: 0,
    }));
    const { included, excluded } = applySkipPatterns(asChangeRequestFiles, patterns);
    if (excluded > 0) {
      files = included.map((f) => ({ filename: f.filename, status: f.status }));
      p.info(`Excluded ${String(excluded)} file(s) matching skip patterns`);
    }
  }

  // ── Stage 1: Component selection ─────────────────────────────────────
  let selectedComponent: ArchitecturalComponent = defaultComponent;
  let candidateComponents: { id: string; name: string; type: string }[] | undefined;

  if (options.componentId) {
    const found = adapter.findComponentById(options.componentId);
    if (!found) {
      throw new ErodeError(
        `Component not found: ${options.componentId}`,
        ErrorCode.MODEL_COMPONENT_MISSING,
        `No component with ID "${options.componentId}" exists in the architecture model.`
      );
    }
    selectedComponent = found;
  } else if (components.length > 1) {
    candidateComponents = components.map((c) => ({ id: c.id, name: c.name, type: c.type }));
    p.section('Stage 1: Component Selection');
    selectedComponent = await selectComponentWithAI(
      provider,
      components,
      files.map((f) => ({ filename: f.filename })),
      defaultComponent,
      p
    );
  }

  const selectedComponentId = selectedComponent.id;

  // ── Stage 2: Dependency extraction ───────────────────────────────────
  p.section('Stage 2: Extract Dependencies');
  p.start('Scanning diff for dependencies');
  const extractedDeps: DependencyExtractionResult = await provider.extractDependencies({
    diff: options.diff,
    commit: {
      sha: 'local',
      message: 'Local changes',
      author: 'local',
    },
    repository: {
      owner: options.repoOwner,
      repo: options.repoName,
      url: options.repo,
    },
    components: [selectedComponent],
  });
  p.succeed(`Found ${String(extractedDeps.dependencies.length)} dependency change(s)`);

  if (CONFIG.debug.verbose) {
    console.error('[Stage 2] Extracted dependencies:', JSON.stringify(extractedDeps));
  }

  // ── Build prompt data for drift analysis ─────────────────────────────
  const architectural = buildArchitecturalContext(adapter, selectedComponent.id);

  const promptData: DriftAnalysisPromptData = {
    changeRequest: buildLocalMetadata(options),
    component: selectedComponent,
    dependencies: extractedDeps,
    files,
    architectural,
    allComponentIds: Array.from(architectureModel.componentIndex.byId.keys()),
    allRelationships: adapter.getAllRelationships(),
  };

  // ── Stage 3: Drift Analysis ──────────────────────────────────────────
  const analysisResult = await runDriftStage(provider, promptData, p);

  // ── Build structured output ──────────────────────────────────────────
  const needsStructured = options.format === 'json';
  const structured = needsStructured
    ? buildStructuredOutput(analysisResult, adapter.metadata.displayName, {
        selectedComponentId,
        candidateComponents,
      })
    : undefined;

  // Stage 4 (model patching) and publishing are intentionally omitted: check is a read-only local operation.

  return {
    analysisResult,
    structured,
    hasViolations: analysisResult.hasViolations,
  };
}

function buildLocalMetadata(options: CheckOptions): ChangeRequestMetadata {
  return {
    number: 0,
    title: 'Local changes',
    description: null,
    repository: `${options.repoOwner}/${options.repoName}`,
    author: { login: 'local' },
    base: { ref: 'HEAD', sha: '' },
    head: { ref: 'working-tree', sha: '' },
    stats: {
      commits: 0,
      additions: options.stats?.additions ?? 0,
      deletions: options.stats?.deletions ?? 0,
      files_changed: options.stats?.filesChanged ?? 0,
    },
    commits: [],
  };
}
