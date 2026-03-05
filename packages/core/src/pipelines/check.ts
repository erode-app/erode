import type { ProgressReporter } from './progress.js';
import { SilentProgress } from './progress.js';
import { createAdapter } from '../adapters/adapter-factory.js';
import { createAIProvider } from '../providers/provider-factory.js';
import { validatePath } from '../utils/validation.js';
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
 * Parse file paths from a unified diff.
 * Looks for `diff --git a/<path> b/<path>` headers.
 */
function parseFilesFromDiff(diff: string): { filename: string; status: string }[] {
  const files: { filename: string; status: string }[] = [];
  const seen = new Set<string>();
  for (const line of diff.split('\n')) {
    const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (match?.[2] && !seen.has(match[2])) {
      seen.add(match[2]);
      files.push({ filename: match[2], status: 'modified' });
    }
  }
  return files;
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
  p.section(`Preparing ${adapter.metadata.displayName} Architecture Model`);
  validatePath(options.modelPath, 'directory');
  p.start('Reading architecture model');
  const architectureModel = await adapter.loadFromPath(options.modelPath);
  p.succeed('Architecture model ready');

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
    const emptyResult: DriftAnalysisResult = {
      hasViolations: false,
      violations: [],
      summary: `No components found matching repository: ${options.repo}`,
      metadata: buildLocalMetadata(options),
      component: { id: '', name: '', tags: [], type: '' },
      dependencyChanges: { dependencies: [], summary: '' },
    };
    return { analysisResult: emptyResult, hasViolations: false };
  }
  p.succeed(`Located ${String(components.length)} component(s) for repository`);

  const defaultComponent = components[0];
  if (!defaultComponent) {
    throw new Error('Unexpected: components array was non-empty but first element was undefined');
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
  let selectedComponentId: string | undefined;
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
    selectedComponentId = options.componentId;
  } else if (components.length === 1) {
    selectedComponentId = defaultComponent.id;
  } else {
    candidateComponents = components.map((c) => ({ id: c.id, name: c.name, type: c.type }));
    p.section('Stage 1: Component Selection');
    p.start('Asking the model to pick the best-matching component');
    if (!provider.selectComponent) {
      p.warn(`Provider lacks component selection, defaulting to: ${defaultComponent.name}`);
    } else {
      const componentId = await provider.selectComponent({
        components,
        files: files.map((f) => ({ filename: f.filename })),
      });
      if (componentId) {
        selectedComponent = components.find((c) => c.id === componentId) ?? defaultComponent;
        selectedComponentId = componentId;
        p.succeed(`Chosen component: ${selectedComponent.name} (${componentId})`);
      } else {
        p.warn(`AI was unable to pick a component, defaulting to: ${defaultComponent.name}`);
      }
    }
  }

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
  const dependencies = adapter.getComponentDependencies(selectedComponent.id);
  const dependents = adapter.getComponentDependents(selectedComponent.id);
  const relationships = adapter.getComponentRelationships(selectedComponent.id);

  const promptData: DriftAnalysisPromptData = {
    changeRequest: buildLocalMetadata(options),
    component: selectedComponent,
    dependencies: extractedDeps,
    files,
    architectural: {
      dependencies: dependencies.map((d) => ({ ...d, repository: d.repository })),
      dependents: dependents.map((d) => ({ ...d, repository: d.repository })),
      relationships: relationships.map((r) => ({
        target: { id: r.target.id, name: r.target.name },
        kind: r.kind,
        title: r.title,
      })),
    },
    allComponentIds: Array.from(architectureModel.componentIndex.byId.keys()),
    allRelationships: adapter.getAllRelationships(),
  };

  // ── Stage 3: Drift analysis ──────────────────────────────────────────
  p.section('Stage 3: Drift Analysis');
  p.start('Evaluating changes for architectural drift');
  const analysisResult = await provider.analyzeDrift(promptData);
  p.succeed('Drift analysis finished');

  if (CONFIG.debug.verbose) {
    console.error(
      '[Stage 3] Drift analysis:',
      JSON.stringify({
        violations: analysisResult.violations.length,
        hasModelUpdates: !!analysisResult.modelUpdates?.relationships?.length,
      })
    );
  }

  // ── Build structured output ──────────────────────────────────────────
  const needsStructured = options.format === 'json';
  const structured = needsStructured
    ? buildStructuredOutput(analysisResult, adapter.metadata.displayName, {
        selectedComponentId,
        candidateComponents,
      })
    : undefined;

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
