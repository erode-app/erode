import type { ProgressReporter } from './progress.js';
import type { ChangeRequestRef } from '../platforms/source-platform.js';
import type { AdapterMetadata } from '../adapters/adapter-metadata.js';
import type { DriftAnalysisResult } from '../analysis/analysis-types.js';
import type { PatchResult } from '../adapters/model-patcher.js';
import type { StructuredAnalysisOutput } from '../output/structured-output.js';
import { createModelPr, closeModelPr } from './pr-creation.js';
import { createPlatformWriter } from '../platforms/platform-factory.js';
import {
  formatAnalysisAsComment,
  formatPatchPrBody,
  analysisHasFindings,
  COMMENT_MARKER,
} from '../output.js';
import { writeGitHubActionsOutputs, writeGitHubStepSummary } from '../output/ci-output.js';
import { CONFIG } from '../utils/config.js';

export interface PublishOptions {
  ref: ChangeRequestRef;
  analysisResult: DriftAnalysisResult;
  patchResult: PatchResult | null;
  structured: StructuredAnalysisOutput | undefined;
  adapterMetadata: AdapterMetadata;
  options: {
    openPr?: boolean;
    dryRun?: boolean;
    draft?: boolean;
    modelRepo?: string;
    comment?: boolean;
    githubActions?: boolean;
  };
  context: {
    selectedComponentId?: string;
    candidateComponents?: { id: string; name: string; type: string }[];
  };
}

export interface PublishResult {
  generatedChangeRequest?: {
    url: string;
    number: number;
    action: 'created' | 'updated';
    branch: string;
  };
}

export async function publishResults(
  publish: PublishOptions,
  p: ProgressReporter
): Promise<PublishResult> {
  const { ref, analysisResult, patchResult, structured, adapterMetadata, options, context } =
    publish;

  // ── Resolve model repo target ────────────────────────────────────────
  const modelTarget = options.modelRepo
    ? (() => {
        const i = options.modelRepo.lastIndexOf('/');
        return {
          owner: options.modelRepo.substring(0, i),
          repo: options.modelRepo.substring(i + 1),
        };
      })()
    : ref.platformId;

  // ── PR creation ──────────────────────────────────────────────────────
  let generatedChangeRequest:
    | { url: string; number: number; action: 'created' | 'updated'; branch: string }
    | undefined;

  if (options.openPr && !options.dryRun) {
    if (patchResult) {
      p.start('Opening PR with patched model');
      const prNumber = analysisResult.metadata.number;
      const prTitle = analysisResult.metadata.title;
      const body = formatPatchPrBody({
        prNumber,
        prTitle,
        prUrl: ref.url,
        summary: analysisResult.summary,
        insertedLines: patchResult.insertedLines,
        skipped: patchResult.skipped,
        removals: analysisResult.modelUpdates?.remove,
      });
      const result = await createModelPr({
        repositoryUrl: ref.repositoryUrl,
        owner: modelTarget.owner,
        repo: modelTarget.repo,
        prNumber,
        prTitle,
        adapterMetadata,
        fileChanges: [{ path: patchResult.filePath, content: patchResult.content }],
        body,
        draft: options.draft,
      });
      generatedChangeRequest = result;
      if (structured) structured.generatedChangeRequest = generatedChangeRequest;
      p.succeed(`PR ${result.action} successfully: ${result.url}`);
    } else {
      p.warn('--open-pr requires structured relationships from analysis. Skipping PR creation.');
    }

    // Auto-close stale model PR when re-analysis finds no violations
    if (!analysisResult.hasViolations && !generatedChangeRequest) {
      try {
        await closeModelPr({
          repositoryUrl: ref.repositoryUrl,
          owner: modelTarget.owner,
          repo: modelTarget.repo,
          prNumber: analysisResult.metadata.number,
        });
      } catch (error) {
        p.warn(
          `Could not close stale model PR: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  } else if (options.openPr && options.dryRun) {
    p.info('Dry run: skipped PR creation');
  }

  // ── PR commenting ────────────────────────────────────────────────────
  if (options.comment) {
    try {
      p.section('Publishing PR Comment');
      const commentWriter = createPlatformWriter(
        ref.repositoryUrl,
        ref.platformId.owner,
        ref.platformId.repo
      );
      if (analysisHasFindings(analysisResult)) {
        p.start('Publishing analysis comment on PR');
        const providerName = CONFIG.ai.provider;
        const providerConfig = CONFIG[providerName];
        const commentBody = formatAnalysisAsComment(analysisResult, {
          selectedComponentId: context.selectedComponentId,
          candidateComponents: context.candidateComponents,
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
        p.succeed('Analysis comment published on PR');
      } else {
        p.start('Removing stale comment (no findings)');
        await commentWriter.deleteComment(ref, COMMENT_MARKER);
        p.succeed('No findings — old comment cleared (if any)');
      }
    } catch (error) {
      p.warn(
        `Could not publish PR comment: ${error instanceof Error ? error.message : String(error)}`
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
        `Could not write GitHub Actions outputs: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return { generatedChangeRequest };
}
