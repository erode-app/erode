import { CONFIG, runAnalyze } from '@erode-app/core';
import type { AnalyzeOptions } from '@erode-app/core';
import type { AgentReviewRequest } from './github-webhook.js';

export type AgentReviewStatus = 'skipped' | 'completed' | 'failed';

export interface AgentReviewResult {
  status: AgentReviewStatus;
  hasViolations?: boolean;
  generatedChangeRequestUrl?: string;
  reason?: string;
}

export interface AgentReviewRunnerOptions {
  modelPath?: string;
  modelFormat?: AnalyzeOptions['modelFormat'];
  modelRepo?: string;
  modelRef?: string;
}

export async function runAgentReview(
  request: AgentReviewRequest,
  options: AgentReviewRunnerOptions = {}
): Promise<AgentReviewResult> {
  if (!CONFIG.agent.enabled) {
    return skipped('agent is disabled');
  }

  if (CONFIG.agent.skipDrafts && request.draft) {
    return skipped('pull request is draft');
  }

  const modelPath = options.modelPath ?? CONFIG.adapter.modelPath;
  if (!modelPath) {
    return failed('agent model path is not configured');
  }

  try {
    const result = await runAnalyze({
      modelPath,
      url: request.pullRequestUrl,
      modelFormat: options.modelFormat ?? CONFIG.adapter.format,
      format: 'json',
      comment: CONFIG.agent.comment,
      openPr: CONFIG.agent.openModelPr,
      draft: true,
      failOnViolations: CONFIG.agent.failOnViolations,
      modelRepo: options.modelRepo ?? CONFIG.adapter.modelRepo,
      modelRef: options.modelRef ?? CONFIG.adapter.modelRef,
    });

    return {
      status: 'completed',
      hasViolations: result.hasViolations,
      generatedChangeRequestUrl: result.generatedChangeRequest?.url,
    };
  } catch (error) {
    return failed(error instanceof Error ? error.message : String(error));
  }
}

function skipped(reason: string): AgentReviewResult {
  return {
    status: 'skipped',
    reason,
  };
}

function failed(reason: string): AgentReviewResult {
  return {
    status: 'failed',
    reason,
  };
}
