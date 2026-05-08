import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { normalizeGitHubWebhookEvent, verifyGitHubWebhookSignature } from '../github-webhook.js';

const secret = 'webhook-secret';
const payload = '{"action":"opened"}';

describe('verifyGitHubWebhookSignature', () => {
  it('should accept a valid sha256 signature', () => {
    const signature = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;

    expect(verifyGitHubWebhookSignature(payload, signature, secret)).toBe(true);
  });

  it('should reject an invalid sha256 signature', () => {
    const signature = `sha256=${'0'.repeat(64)}`;

    expect(verifyGitHubWebhookSignature(payload, signature, secret)).toBe(false);
  });
});

describe('normalizeGitHubWebhookEvent', () => {
  it('should normalize a supported pull_request event', () => {
    const result = normalizeGitHubWebhookEvent('pull_request', pullRequestPayload());

    expect(result).toEqual({
      status: 'accepted',
      request: {
        event: 'pull_request',
        action: 'opened',
        draft: false,
        installationId: 12345,
        repositoryUrl: 'https://github.com/owner/repo',
        pullRequestUrl: 'https://github.com/owner/repo/pull/7',
        owner: 'owner',
        repo: 'repo',
        number: 7,
        headSha: 'abc123',
      },
    });
  });

  it('should skip an unsupported pull_request action', () => {
    const result = normalizeGitHubWebhookEvent(
      'pull_request',
      pullRequestPayload({ action: 'closed' })
    );

    expect(result).toEqual({
      status: 'skipped',
      reason: 'unsupported pull_request action: closed',
    });
  });

  it('should skip when the pull request URL is missing', () => {
    const result = normalizeGitHubWebhookEvent(
      'pull_request',
      pullRequestPayload({ pull_request: { html_url: undefined } })
    );

    expect(result).toEqual({
      status: 'skipped',
      reason: 'missing pull request URL',
    });
  });
});

function pullRequestPayload(
  overrides: {
    action?: string;
    pull_request?: {
      html_url?: string;
    };
  } = {}
) {
  return {
    action: overrides.action ?? 'opened',
    installation: {
      id: 12345,
    },
    repository: {
      html_url: 'https://github.com/owner/repo',
      name: 'repo',
      owner: {
        login: 'owner',
      },
    },
    pull_request: {
      draft: false,
      html_url: 'https://github.com/owner/repo/pull/7',
      number: 7,
      head: {
        sha: 'abc123',
      },
      ...overrides.pull_request,
    },
  };
}
