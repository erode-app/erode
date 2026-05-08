import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_PREFIX = 'sha256=';

const SUPPORTED_PULL_REQUEST_ACTIONS = [
  'opened',
  'reopened',
  'synchronize',
  'ready_for_review',
] as const;

type SupportedPullRequestAction = (typeof SUPPORTED_PULL_REQUEST_ACTIONS)[number];

export interface AgentReviewRequest {
  event: 'pull_request';
  action: 'opened' | 'reopened' | 'synchronize' | 'ready_for_review';
  draft: boolean;
  installationId: number | null;
  repositoryUrl: string;
  pullRequestUrl: string;
  owner: string;
  repo: string;
  number: number;
  headSha: string;
}

export type GitHubWebhookNormalizationResult =
  | {
      status: 'accepted';
      request: AgentReviewRequest;
    }
  | {
      status: 'skipped';
      reason: string;
    };

interface PullRequestPayload {
  action?: unknown;
  installation?: {
    id?: unknown;
  };
  repository?: {
    html_url?: unknown;
    name?: unknown;
    owner?: {
      login?: unknown;
    };
  };
  pull_request?: {
    draft?: unknown;
    html_url?: unknown;
    number?: unknown;
    head?: {
      sha?: unknown;
    };
  };
}

export function verifyGitHubWebhookSignature(
  payload: string | Buffer,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader?.startsWith(SIGNATURE_PREFIX) || secret.length === 0) {
    return false;
  }

  const receivedSignature = signatureHeader.slice(SIGNATURE_PREFIX.length);
  if (!/^[a-f0-9]{64}$/i.test(receivedSignature)) {
    return false;
  }

  const expectedSignature = createHmac('sha256', secret).update(payload).digest('hex');
  const received = Buffer.from(receivedSignature, 'hex');
  const expected = Buffer.from(expectedSignature, 'hex');

  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function normalizeGitHubWebhookEvent(
  eventName: string,
  payload: unknown
): GitHubWebhookNormalizationResult {
  if (eventName !== 'pull_request') {
    return skipped(`unsupported event: ${eventName}`);
  }

  if (!isObject(payload)) {
    return skipped('payload is not an object');
  }

  const pullRequestPayload = payload as PullRequestPayload;
  const action = pullRequestPayload.action;
  if (!isSupportedPullRequestAction(action)) {
    return skipped(
      typeof action === 'string' ? `unsupported pull_request action: ${action}` : 'missing action'
    );
  }

  const pullRequest = pullRequestPayload.pull_request;
  if (!isObject(pullRequest)) {
    return skipped('missing pull_request payload');
  }

  const pullRequestUrl = pullRequest.html_url;
  if (typeof pullRequestUrl !== 'string' || pullRequestUrl.length === 0) {
    return skipped('missing pull request URL');
  }

  const repository = pullRequestPayload.repository;
  if (!isObject(repository)) {
    return skipped('missing repository payload');
  }

  const owner = repository.owner?.login;
  const repo = repository.name;
  const repositoryUrl = repository.html_url;
  const number = pullRequest.number;
  const headSha = pullRequest.head?.sha;

  if (typeof owner !== 'string' || owner.length === 0) {
    return skipped('missing repository owner');
  }

  if (typeof repo !== 'string' || repo.length === 0) {
    return skipped('missing repository name');
  }

  if (typeof repositoryUrl !== 'string' || repositoryUrl.length === 0) {
    return skipped('missing repository URL');
  }

  if (typeof number !== 'number') {
    return skipped('missing pull request number');
  }

  if (typeof headSha !== 'string' || headSha.length === 0) {
    return skipped('missing pull request head SHA');
  }

  return {
    status: 'accepted',
    request: {
      event: 'pull_request',
      action,
      draft: pullRequest.draft === true,
      installationId: readInstallationId(pullRequestPayload.installation),
      repositoryUrl,
      pullRequestUrl,
      owner,
      repo,
      number,
      headSha,
    },
  };
}

function readInstallationId(installation: PullRequestPayload['installation']): number | null {
  return typeof installation?.id === 'number' ? installation.id : null;
}

function isSupportedPullRequestAction(action: unknown): action is SupportedPullRequestAction {
  return (
    typeof action === 'string' &&
    SUPPORTED_PULL_REQUEST_ACTIONS.includes(action as SupportedPullRequestAction)
  );
}

function skipped(reason: string): GitHubWebhookNormalizationResult {
  return {
    status: 'skipped',
    reason,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
