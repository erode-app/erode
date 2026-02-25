import type { ProgressReporter } from './progress.js';
import { SilentProgress } from './progress.js';
import { createAdapter } from '../adapters/adapter-factory.js';
import { createPlatformReader, createPlatformWriter } from '../platforms/platform-factory.js';
import { createAIProvider } from '../providers/provider-factory.js';
import {
  buildStructuredOutput,
  formatAnalysisAsComment,
  analysisHasFindings,
  COMMENT_MARKER,
  writeOutputToFile,
} from '../output.js';
import { writeGitHubActionsOutputs, writeGitHubStepSummary } from '../output/ci-output.js';
import { CONFIG } from '../utils/config.js';
import { validatePath } from '../utils/validation.js';
import { loadSkipPatterns, applySkipPatterns } from '../utils/skip-patterns.js';
import type { ArchitecturalComponent } from '../adapters/architecture-types.js';
import type { DriftAnalysisPromptData, DriftAnalysisResult } from '../analysis/analysis-types.js';
import type { StructuredAnalysisOutput } from '../output/structured-output.js';

export interface AnalyzeOptions {
  modelPath: string;
  url: string;
  modelFormat?: string;
  generateModel?: boolean;
  outputFile?: string;
  openPr?: boolean;
  dryRun?: boolean;
  draft?: boolean;
  skipFileFiltering?: boolean;
  comment?: boolean;
  githubActions?: boolean;
  failOnViolations?: boolean;
  format?: 'console' | 'json';
}

export interface AnalyzeResult {
  analysisResult: DriftAnalysisResult;
  structured?: StructuredAnalysisOutput;
  generatedCode?: string;
  hasViolations: boolean;
}

export async function runAnalyze(
  options: AnalyzeOptions,
  progress?: ProgressReporter
): Promise<AnalyzeResult> {
  const p = progress ?? new SilentProgress();
  const adapter = createAdapter(options.modelFormat);

  // ── Load architecture model ──────────────────────────────────────────
  p.section(`Loading ${adapter.metadata.displayName} Architecture Model`);
  validatePath(options.modelPath, 'directory');
  p.start('Loading architecture model');
  await adapter.loadFromPath(options.modelPath);
  p.succeed('Architecture model loaded');

  // ── Initialise AI provider ───────────────────────────────────────────
  p.start('Initializing AI provider');
  const provider = createAIProvider();
  p.succeed('AI provider ready');

  // ── Fetch change request data ────────────────────────────────────────
  p.section('Fetching Change Request Data');
  const reader = createPlatformReader(options.url);
  const ref = reader.parseChangeRequestUrl(options.url);
  p.start(`Fetching PR #${String(ref.number)}`);
  const prData = await reader.fetchChangeRequest(ref);
  const commits = await reader.fetchChangeRequestCommits(ref);
  p.succeed(
    `Fetched PR #${String(prData.number)}: ${prData.title} (${String(commits.length)} commits)`
  );

  // ── File filtering ───────────────────────────────────────────────────
  if (!options.skipFileFiltering) {
    const patterns = loadSkipPatterns();
    const { included, excluded } = applySkipPatterns(prData.files, patterns);
    if (excluded > 0) {
      prData.files = included;
      prData.diff = included
        .map((f) => (f.patch ? `diff --git a/${f.filename} b/${f.filename}\n${f.patch}` : ''))
        .filter(Boolean)
        .join('\n\n');
      prData.changed_files = included.length;
      prData.additions = included.reduce((sum, f) => sum + f.additions, 0);
      prData.deletions = included.reduce((sum, f) => sum + f.deletions, 0);
      p.info(`Filtered out ${String(excluded)} file(s) matching skip patterns`);
    }
  }

  // ── Find components for this repository ──────────────────────────────
  const repoUrl = ref.repositoryUrl;
  p.start('Finding components for repository');
  const components = adapter.findAllComponentsByRepository(repoUrl);

  if (components.length === 0) {
    p.warn(`No components found matching repository: ${repoUrl}`);
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
  p.succeed(`Found ${String(components.length)} component(s) for repository`);

  // Guaranteed non-empty since we checked components.length === 0 above
  const defaultComponent = components[0];
  if (!defaultComponent) {
    // This should never happen, but satisfies strict TS
    throw new Error('Unexpected: components array was non-empty but first element was undefined');
  }

  // ── Stage 0: Component selection ─────────────────────────────────────
  let selectedComponent: ArchitecturalComponent = defaultComponent;
  let selectedComponentId: string | undefined;
  const candidateComponents =
    components.length > 1
      ? components.map((c) => ({ id: c.id, name: c.name, type: c.type }))
      : undefined;

  if (components.length === 1) {
    selectedComponentId = selectedComponent.id;
  } else {
    p.section('Stage 0: Select component(s)');
    p.start('Using LLM to select the most relevant component');
    if (!provider.selectComponent) {
      p.warn(
        `Provider does not support component selection, using first: ${selectedComponent.name}`
      );
    } else {
      const componentId = await provider.selectComponent({
        components,
        files: prData.files.map((f) => ({ filename: f.filename })),
      });
      if (componentId) {
        selectedComponent = components.find((c) => c.id === componentId) ?? defaultComponent;
        selectedComponentId = componentId;
        p.succeed(`Selected component: ${selectedComponent.name} (${componentId})`);
      } else {
        p.warn(`AI could not determine component, using first: ${selectedComponent.name}`);
      }
    }
  }

  // ── Stage 1: Dependency extraction ───────────────────────────────────
  p.section('Stage 1: Dependency Extraction');
  const fullDiff = prData.files
    .map((f) => (f.patch ? `diff --git a/${f.filename} b/${f.filename}\n${f.patch}` : ''))
    .filter(Boolean)
    .join('\n\n');

  p.start('Extracting dependencies from PR diff');
  const aggregatedDeps = await provider.extractDependencies({
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
  p.succeed(`Extracted ${String(aggregatedDeps.dependencies.length)} dependency change(s)`);

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
    dependencies: aggregatedDeps,
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

  // ── Stage 2: Drift analysis ──────────────────────────────────────────
  p.section('Stage 2: Architecture Drift Analysis');
  p.start('Analyzing change request for architectural drift');
  const analysisResult = await provider.analyzeDrift(promptData);
  p.succeed('Analysis complete');

  // ── Stage 3 (optional): Model generation ─────────────────────────────
  let generatedCode: string | undefined;
  if (options.generateModel) {
    p.section(`Stage 3: ${adapter.metadata.displayName} Model Generation`);
    if (!provider.generateArchitectureCode) {
      p.warn(`Provider does not support ${adapter.metadata.displayName} model generation`);
    } else {
      p.start(`Generating ${adapter.metadata.displayName} model code`);
      // Pass all components for context
      analysisResult.allComponents = adapter.getAllComponents();
      analysisResult.modelFormat = adapter.metadata.id;
      generatedCode = await provider.generateArchitectureCode(analysisResult);
      p.succeed(`${adapter.metadata.displayName} model code generated`);
    }
  }

  // ── Build structured output ──────────────────────────────────────────
  p.section('Results');
  const needsStructured =
    options.format === 'json' || !!options.outputFile || !!options.githubActions;
  const structured = needsStructured
    ? buildStructuredOutput(analysisResult, {
        selectedComponentId,
        candidateComponents,
      })
    : undefined;

  // ── Write output file ────────────────────────────────────────────────
  if (options.outputFile && structured) {
    writeOutputToFile(structured, options.outputFile);
    p.succeed(`Structured output written to ${options.outputFile}`);
  }

  // ── PR creation ──────────────────────────────────────────────────────
  let generatedChangeRequest:
    | { url: string; number: number; action: 'created' | 'updated'; branch: string }
    | undefined;
  if (options.openPr && !options.dryRun) {
    if (!generatedCode) {
      p.warn('--open-pr requires --generate-model to produce model code. PR creation skipped.');
    } else {
      p.section('Creating Pull Request');
      p.start('Creating PR with model updates');
      const writer = createPlatformWriter(
        ref.repositoryUrl,
        ref.platformId.owner,
        ref.platformId.repo
      );
      const branchName = `erode/pr-${String(prData.number)}`;
      const prTitle = adapter.metadata.prTitleTemplate.replace(
        '{{prNumber}}',
        String(prData.number)
      );
      const prResult = await writer.createOrUpdateChangeRequest({
        branchName,
        title: prTitle,
        body: [
          `## Architecture Model Update`,
          '',
          `Automated update from erode analysis of PR #${String(prData.number)}: ${prData.title}`,
          '',
          `### Summary`,
          analysisResult.summary,
        ].join('\n'),
        fileChanges: [
          {
            path: `model-updates/pr-${String(prData.number)}${adapter.metadata.generatedFileExtension}`,
            content: generatedCode,
          },
        ],
        draft: options.draft,
      });
      generatedChangeRequest = { ...prResult, branch: branchName };
      if (structured) structured.generatedChangeRequest = generatedChangeRequest;
      p.succeed(`PR ${prResult.action}: ${prResult.url}`);
    }
  } else if (options.openPr && options.dryRun) {
    p.info('Dry run: PR creation skipped');
  }

  // ── PR commenting ────────────────────────────────────────────────────
  if (options.comment) {
    try {
      p.section('Posting PR Comment');
      const commentWriter = createPlatformWriter(
        ref.repositoryUrl,
        ref.platformId.owner,
        ref.platformId.repo
      );
      if (analysisHasFindings(analysisResult)) {
        p.start('Posting analysis comment on PR');
        const providerName = CONFIG.ai.provider;
        const providerConfig = CONFIG[providerName];
        const commentBody = formatAnalysisAsComment(analysisResult, {
          selectedComponentId,
          candidateComponents,
          generatedChangeRequest,
          modelInfo: {
            provider: providerName,
            fastModel: providerConfig.fastModel,
            advancedModel: providerConfig.advancedModel,
          },
        });
        await commentWriter.commentOnChangeRequest(ref, commentBody, {
          upsertMarker: COMMENT_MARKER,
        });
        p.succeed('Analysis comment posted on PR');
      } else {
        p.start('Cleaning up previous comment (no findings)');
        await commentWriter.deleteComment(ref, COMMENT_MARKER);
        p.succeed('No findings — previous comment removed (if any)');
      }
    } catch (error) {
      p.warn(
        `Failed to post PR comment: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // ── GitHub Actions outputs ───────────────────────────────────────────
  if (options.githubActions && structured) {
    try {
      writeGitHubActionsOutputs(structured);
      writeGitHubStepSummary(structured);
    } catch (error) {
      p.warn(
        `Failed to write GitHub Actions outputs: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return {
    analysisResult,
    structured,
    generatedCode,
    hasViolations: analysisResult.hasViolations,
  };
}
