import { writeFile } from 'node:fs/promises';
import type { ProgressReporter } from './progress.js';
import { SilentProgress } from './progress.js';
import { publishResults } from './publish.js';
import { createAdapter } from '../adapters/adapter-factory.js';
import { createPlatformReader } from '../platforms/platform-factory.js';
import type { ChangeRequestFile } from '../platforms/source-platform.js';
import { createAIProvider } from '../providers/provider-factory.js';
import { buildStructuredOutput, writeOutputToFile } from '../output.js';
import { validatePath } from '../utils/validation.js';
import { ErodeError, ErrorCode } from '../errors.js';
import { CONFIG } from '../utils/config.js';
import { loadSkipPatterns, applySkipPatterns } from '../utils/skip-patterns.js';
import { createModelPatcher } from '../adapters/model-patcher.js';
import type { PatchResult } from '../adapters/model-patcher.js';
import type { ArchitecturalComponent } from '../adapters/architecture-types.js';
import type { DriftAnalysisPromptData, DriftAnalysisResult } from '../analysis/analysis-types.js';
import type { DependencyExtractionResult } from '../schemas/dependency-extraction.schema.js';
import type { StructuredAnalysisOutput } from '../output/structured-output.js';

function buildDiffFromFiles(files: ChangeRequestFile[]): string {
  return files
    .map((f) => (f.patch ? `diff --git a/${f.filename} b/${f.filename}\n${f.patch}` : ''))
    .filter(Boolean)
    .join('\n\n');
}

interface PipelineContext {
  selectedComponent?: ArchitecturalComponent;
  selectedComponentId?: string;
  candidateComponents?: { id: string; name: string; type: string }[];
  extractedDeps?: DependencyExtractionResult;
  analysisResult?: DriftAnalysisResult;
  patchResult?: PatchResult | null;
}

export interface AnalyzeOptions {
  modelPath: string;
  url: string;
  modelFormat?: string;
  outputFile?: string;
  openPr?: boolean;
  dryRun?: boolean;
  draft?: boolean;
  skipFileFiltering?: boolean;
  comment?: boolean;
  githubActions?: boolean;
  failOnViolations?: boolean;
  format?: 'console' | 'json';
  /** Model repository in `owner/repo` format (or `group/subgroup/project` for GitLab). */
  modelRepo?: string;
  patchLocal?: boolean;
}

export interface AnalyzeResult {
  analysisResult: DriftAnalysisResult;
  structured?: StructuredAnalysisOutput;
  hasViolations: boolean;
}

export async function runAnalyze(
  options: AnalyzeOptions,
  progress?: ProgressReporter
): Promise<AnalyzeResult> {
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

  // ── Fetch change request data ────────────────────────────────────────
  p.section('Retrieving Change Request Data');
  const reader = createPlatformReader(options.url);
  const ref = reader.parseChangeRequestUrl(options.url);
  p.start(`Downloading PR #${String(ref.number)}`);
  const prData = await reader.fetchChangeRequest(ref);
  const commits = await reader.fetchChangeRequestCommits(ref);
  p.succeed(
    `Retrieved PR #${String(prData.number)}: ${prData.title} (${String(commits.length)} commits)`
  );

  // ── File filtering ───────────────────────────────────────────────────
  if (!options.skipFileFiltering) {
    const patterns = loadSkipPatterns();
    const { included, excluded } = applySkipPatterns(prData.files, patterns);
    if (excluded > 0) {
      prData.files = included;
      prData.diff = buildDiffFromFiles(included);
      prData.changed_files = included.length;
      prData.additions = included.reduce((sum, f) => sum + f.additions, 0);
      prData.deletions = included.reduce((sum, f) => sum + f.deletions, 0);
      p.info(`Excluded ${String(excluded)} file(s) matching skip patterns`);
    }
  }

  // ── Find components for this repository ──────────────────────────────
  const repoUrl = ref.repositoryUrl;
  p.start('Locating components for repository');
  const components = adapter.findAllComponentsByRepository(repoUrl);

  if (components.length === 0) {
    p.warn(`No components matched repository: ${repoUrl}`);
    for (const line of adapter.metadata.noComponentHelpLines) {
      p.info(line.replace('{{repoUrl}}', repoUrl));
    }
    // Return an empty-ish result so callers don't have to handle undefined
    const emptyResult: DriftAnalysisResult = {
      hasViolations: false,
      violations: [],
      summary: `No components found matching repository: ${repoUrl}`,
      metadata: {
        number: prData.number,
        title: prData.title,
        description: prData.body,
        repository: ref.repositoryUrl.replace(/^https?:\/\/[^/]+\//, ''),
        author: prData.author,
        base: prData.base,
        head: prData.head,
        stats: {
          commits: prData.commits,
          additions: prData.additions,
          deletions: prData.deletions,
          files_changed: prData.changed_files,
        },
        commits: [],
      },
      component: { id: '', name: '', tags: [], type: '' },
      dependencyChanges: { dependencies: [], summary: '' },
    };
    return {
      analysisResult: emptyResult,
      hasViolations: false,
    };
  }
  p.succeed(`Located ${String(components.length)} component(s) for repository`);

  // Guaranteed non-empty since we checked components.length === 0 above
  const defaultComponent = components[0];
  if (!defaultComponent) {
    // This should never happen, but satisfies strict TS
    throw new Error('Unexpected: components array was non-empty but first element was undefined');
  }

  // ── Pipeline context accumulator ───────────────────────────────────
  const ctx: PipelineContext = {
    selectedComponent: defaultComponent,
    candidateComponents:
      components.length > 1
        ? components.map((c) => ({ id: c.id, name: c.name, type: c.type }))
        : undefined,
  };

  // ── Stage 1: Component selection ─────────────────────────────────────
  if (components.length === 1) {
    ctx.selectedComponentId = defaultComponent.id;
  } else {
    p.section('Stage 1: Component Selection');
    p.start('Asking the model to pick the best-matching component');
    if (!provider.selectComponent) {
      p.warn(`Provider lacks component selection, defaulting to: ${defaultComponent.name}`);
    } else {
      const componentId = await provider.selectComponent({
        components,
        files: prData.files.map((f) => ({ filename: f.filename })),
      });
      if (componentId) {
        ctx.selectedComponent = components.find((c) => c.id === componentId) ?? defaultComponent;
        ctx.selectedComponentId = componentId;
        p.succeed(`Chosen component: ${ctx.selectedComponent.name} (${componentId})`);
      } else {
        p.warn(`AI was unable to pick a component, defaulting to: ${defaultComponent.name}`);
      }
    }
  }

  // ── Stage 2: Dependency extraction ───────────────────────────────────
  p.section('Stage 2: Extract Dependencies');
  const fullDiff = buildDiffFromFiles(prData.files);

  const selectedComponent = ctx.selectedComponent;
  if (!selectedComponent) {
    throw new ErodeError(
      'Pipeline context missing selectedComponent after resolution',
      ErrorCode.INTERNAL_UNKNOWN,
      'Internal pipeline error'
    );
  }

  p.start('Scanning PR diff for dependencies');
  ctx.extractedDeps = await provider.extractDependencies({
    diff: fullDiff,
    commit: {
      sha: prData.head.sha,
      message: commits.map((c) => c.message).join('; '),
      author: prData.author.login,
    },
    repository: {
      owner: ref.platformId.owner,
      repo: ref.platformId.repo,
      url: repoUrl,
    },
    components: [selectedComponent],
  });
  p.succeed(`Found ${String(ctx.extractedDeps.dependencies.length)} dependency change(s)`);

  if (CONFIG.debug.verbose) {
    console.error('[Stage 2] Extracted dependencies:', JSON.stringify(ctx.extractedDeps));
  }

  // ── Build prompt data for drift analysis ─────────────────────────────
  const dependencies = adapter.getComponentDependencies(selectedComponent.id);
  const dependents = adapter.getComponentDependents(selectedComponent.id);
  const relationships = adapter.getComponentRelationships(selectedComponent.id);

  const promptData: DriftAnalysisPromptData = {
    changeRequest: {
      number: prData.number,
      title: prData.title,
      description: prData.body,
      repository: ref.repositoryUrl.replace(/^https?:\/\/[^/]+\//, ''),
      author: prData.author,
      base: prData.base,
      head: prData.head,
      stats: {
        commits: prData.commits,
        additions: prData.additions,
        deletions: prData.deletions,
        files_changed: prData.changed_files,
      },
      commits: commits.map((c) => ({
        sha: c.sha,
        message: c.message,
        author: c.author.name,
      })),
    },
    component: selectedComponent,
    dependencies: ctx.extractedDeps,
    architectural: {
      dependencies: dependencies.map((d) => ({ ...d, repository: d.repository })),
      dependents: dependents.map((d) => ({ ...d, repository: d.repository })),
      relationships: relationships.map((r) => ({
        target: { id: r.target.id, name: r.target.name },
        kind: r.kind,
        title: r.title,
      })),
    },
  };

  // ── Stage 3: Drift analysis ──────────────────────────────────────────
  p.section('Stage 3: Drift Analysis');
  p.start('Evaluating the change request for architectural drift');
  ctx.analysisResult = await provider.analyzeDrift(promptData);
  p.succeed('Drift analysis finished');

  if (CONFIG.debug.verbose) {
    console.error(
      '[Stage 3] Drift analysis:',
      JSON.stringify({
        violations: ctx.analysisResult.violations.length,
        hasModelUpdates: !!ctx.analysisResult.modelUpdates?.relationships?.length,
      })
    );
  }

  // ── Build structured output ──────────────────────────────────────────
  p.section('Output');
  const needsStructured =
    options.format === 'json' || !!options.outputFile || !!options.githubActions;
  const structured = needsStructured
    ? buildStructuredOutput(ctx.analysisResult, adapter.metadata.displayName, {
        selectedComponentId: ctx.selectedComponentId,
        candidateComponents: ctx.candidateComponents,
      })
    : undefined;

  // ── Write output file ────────────────────────────────────────────────
  if (options.outputFile && structured) {
    writeOutputToFile(structured, options.outputFile);
    p.succeed(`Structured output saved to ${options.outputFile}`);
  }

  // ── Stage 4: Model Update ────────────────────────────────────────────
  const shouldPatch = options.patchLocal === true || options.openPr === true;
  if (shouldPatch && ctx.analysisResult.modelUpdates?.relationships?.length) {
    p.section('Stage 4: Model Update');
    if (CONFIG.debug.verbose) {
      console.error(
        '[Stage 4] Relationships from AI:',
        JSON.stringify(ctx.analysisResult.modelUpdates.relationships, null, 2)
      );
    }
    p.start('Generating model patch');
    const patcher = createModelPatcher(adapter.metadata.id);
    ctx.patchResult = await patcher.patch({
      modelPath: options.modelPath,
      relationships: ctx.analysisResult.modelUpdates.relationships,
      existingRelationships: adapter.getAllRelationships(),
      componentIndex: architectureModel.componentIndex,
      provider,
    });
    if (ctx.patchResult) {
      p.succeed(`Patch: ${String(ctx.patchResult.insertedLines.length)} relationship(s)`);
      // Write in-place when --patch without --open-pr
      if (options.patchLocal && !options.openPr && !options.dryRun) {
        await writeFile(ctx.patchResult.filePath, ctx.patchResult.content, 'utf8');
        p.succeed(`Model patched: ${ctx.patchResult.filePath}`);
      } else if (options.dryRun) {
        p.info('Dry run: skipped writing patched model');
      }
    } else {
      const rels = ctx.analysisResult.modelUpdates.relationships;
      p.info(`All ${String(rels.length)} relationship(s) already exist or were invalid`);
    }
  } else if (shouldPatch) {
    p.info('No model update relationships from analysis');
  }

  // ── Publish results ────────────────────────────────────────────────
  await publishResults(
    {
      ref,
      analysisResult: ctx.analysisResult,
      patchResult: ctx.patchResult ?? null,
      structured,
      adapterMetadata: adapter.metadata,
      options: {
        openPr: options.openPr,
        dryRun: options.dryRun,
        draft: options.draft,
        modelRepo: options.modelRepo,
        comment: options.comment,
        githubActions: options.githubActions,
      },
      context: {
        selectedComponentId: ctx.selectedComponentId,
        candidateComponents: ctx.candidateComponents,
      },
    },
    p
  );

  return {
    analysisResult: ctx.analysisResult,
    structured,
    hasViolations: ctx.analysisResult.hasViolations,
  };
}
