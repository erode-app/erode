import { normalizeGitHubWebhookEvent, verifyGitHubWebhookSignature } from './github-webhook.js';
import type { AgentReviewRequest } from './github-webhook.js';
import type { AgentReviewResult } from './agent-runner.js';

export interface GitHubWebhookHandlerInput {
  eventName: string | undefined;
  signature: string | undefined;
  body: string;
  secret: string;
}

export interface GitHubWebhookHandlerResponse {
  statusCode: number;
  body: {
    status: 'accepted' | 'skipped' | 'failed';
    reason?: string;
    result?: AgentReviewResult;
  };
}

export type AgentReviewExecutor = (request: AgentReviewRequest) => Promise<AgentReviewResult>;

export async function handleGitHubWebhook(
  input: GitHubWebhookHandlerInput,
  runReview: AgentReviewExecutor
): Promise<GitHubWebhookHandlerResponse> {
  if (!input.eventName) {
    return response(400, 'failed', 'missing GitHub event header');
  }

  if (!verifyGitHubWebhookSignature(input.body, input.signature, input.secret)) {
    return response(401, 'failed', 'invalid GitHub webhook signature');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(input.body) as unknown;
  } catch {
    return response(400, 'failed', 'invalid JSON payload');
  }

  const normalized = normalizeGitHubWebhookEvent(input.eventName, payload);
  if (normalized.status === 'skipped') {
    return response(202, 'skipped', normalized.reason);
  }

  const result = await runReview(normalized.request);
  return {
    statusCode: result.status === 'failed' ? 500 : 202,
    body: {
      status: result.status === 'completed' ? 'accepted' : result.status,
      result,
    },
  };
}

function response(
  statusCode: number,
  status: GitHubWebhookHandlerResponse['body']['status'],
  reason: string
): GitHubWebhookHandlerResponse {
  return {
    statusCode,
    body: {
      status,
      reason,
    },
  };
}
