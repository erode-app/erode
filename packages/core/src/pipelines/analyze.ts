import { writeFile } from 'node:fs/promises';
import type { ProgressReporter } from './progress.js';
import { SilentProgress } from './progress.js';
import { publishResults } from './publish.js';
import { createAdapter } from '../adapters/adapter-factory.js';
import { createPlatformReader } from '../platforms/platform-factory.js';
import type { ChangeRequestFile } from '../platforms/source-platform.js';
import { createAIProvider } from '../providers/provider-factory.js';
import { buildStructuredOutput, writeOutputToFile } from '../output.js';
import { ErodeError, ErrorCode } from '../errors.js';
import {
  loadArchitectureModel,
  buildArchitecturalContext,
  runDriftStage,
  selectComponentWithAI,
  resolveAndCloneModel,
  findComponentsForRepo,
} from './pipeline-shared.js';
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
  /** Model repository URL or `owner/repo` slug (or `group/subgroup/project` for GitLab). */
  modelRepo?: string;
  /** Branch or tag to clone from the model repository. Defaults to `main`. */
  modelRef?: string;
  patchLocal?: boolean;
}

export interface AnalyzeResult {
  analysisResult: DriftAnalysisResult;
  structured?: StructuredAnalysisOutput;
  hasViolations: boolean;
  generatedChangeRequest?: {
    url: string;
    number: number;
    action: 'created' | 'updated';
    branch: string;
  };
}

export async function runAnalyze(
  options: AnalyzeOptions,
  progress?: ProgressReporter
): Promise<AnalyzeResult> {
  const p = progress ?? new SilentProgress();
  const adapter = createAdapter(options.modelFormat);

  // ── Resolve model source (clone if remote) ───────────────────────────
  const resolvedSource = await resolveAndCloneModel(
    options.modelPath,
    options.modelRepo,
    { ref: options.modelRef },
    p
  );
  const effectiveModelPath = resolvedSource.localPath;
  const effectiveModelRepo = resolvedSource.repoSlug ?? options.modelRepo;

  try {
    // ── Load architecture model ──────────────────────────────────────────
    const architectureModel = await loadArchitectureModel(adapter, effectiveModelPath, p);

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
    const prMetadata = {
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
    };
    const lookup = findComponentsForRepo(adapter, repoUrl, prMetadata, p);
    if (!('found' in lookup)) return lookup;
    const { components, defaultComponent } = lookup;

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
      ctx.selectedComponent = await selectComponentWithAI(
        provider,
        components,
        prData.files.map((f) => ({ filename: f.filename })),
        defaultComponent,
        p
      );
      ctx.selectedComponentId = ctx.selectedComponent.id;
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
    const architectural = buildArchitecturalContext(adapter, selectedComponent.id);

    const promptData: DriftAnalysisPromptData = {
      changeRequest: {
        ...prMetadata,
        commits: commits.map((c) => ({
          sha: c.sha,
          message: c.message,
          author: c.author.name,
        })),
      },
      component: selectedComponent,
      dependencies: ctx.extractedDeps,
      files: prData.files.map((f) => ({ filename: f.filename, status: f.status })),
      architectural,
      allComponentIds: Array.from(architectureModel.componentIndex.byId.keys()),
      allRelationships: adapter.getAllRelationships(),
    };

    // ── Stage 3: Drift analysis ──────────────────────────────────────────
    ctx.analysisResult = await runDriftStage(provider, promptData, p);

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
    const hasRelationships = !!ctx.analysisResult.modelUpdates?.relationships?.length;
    const hasNewComponents = !!ctx.analysisResult.modelUpdates?.newComponents?.length;
    if (shouldPatch && (hasRelationships || hasNewComponents)) {
      p.section('Stage 4: Model Update');
      if (CONFIG.debug.verbose) {
        console.error(
          '[Stage 4] Relationships from AI:',
          JSON.stringify(ctx.analysisResult.modelUpdates?.relationships ?? [], null, 2)
        );
        if (hasNewComponents) {
          console.error(
            '[Stage 4] New components from AI:',
            JSON.stringify(ctx.analysisResult.modelUpdates?.newComponents ?? [], null, 2)
          );
        }
      }
      p.start('Generating model patch');
      const patcher = createModelPatcher(adapter.metadata.id);
      ctx.patchResult = await patcher.patch({
        modelPath: effectiveModelPath,
        relationships: ctx.analysisResult.modelUpdates?.relationships ?? [],
        existingRelationships: adapter.getAllRelationships(),
        componentIndex: architectureModel.componentIndex,
        provider,
        newComponents: ctx.analysisResult.modelUpdates?.newComponents,
      });
      if (ctx.patchResult) {
        const relCount = ctx.patchResult.insertedLines.length;
        const compCount = ctx.patchResult.newComponents?.length ?? 0;
        const parts: string[] = [];
        if (compCount > 0) parts.push(`${String(compCount)} component(s)`);
        if (relCount > 0) parts.push(`${String(relCount)} line(s)`);
        p.succeed(`Patch: ${parts.join(', ')}`);
        if (ctx.patchResult.validationSkipped) {
          p.warn('DSL validation skipped: validation tooling unavailable');
        }
        // Write in-place when --patch without --open-pr
        if (options.patchLocal && !options.openPr && !options.dryRun) {
          await writeFile(ctx.patchResult.absolutePath, ctx.patchResult.content, 'utf8');
          p.succeed(`Model patched: ${ctx.patchResult.filePath}`);
        } else if (options.dryRun) {
          p.info('Dry run: skipped writing patched model');
        }
      } else {
        p.info('All relationships already exist or were invalid, no new components to add');
      }
    } else if (shouldPatch) {
      p.info('No model update relationships or new components from analysis');
    }

    // ── Publish results ────────────────────────────────────────────────
    const publishResult = await publishResults(
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
          modelRepo: effectiveModelRepo,
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
      generatedChangeRequest: publishResult.generatedChangeRequest,
    };
  } finally {
    await resolvedSource.cleanup();
  }
}
