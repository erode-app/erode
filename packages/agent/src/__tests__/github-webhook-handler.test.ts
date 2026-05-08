import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { handleGitHubWebhook } from '../github-webhook-handler.js';

const secret = 'webhook-secret';

describe('handleGitHubWebhook', () => {
  it('rejects invalid signatures', async () => {
    const runReview = vi.fn();

    await expect(
      handleGitHubWebhook(
        {
          eventName: 'pull_request',
          signature: `sha256=${'0'.repeat(64)}`,
          body: JSON.stringify(payload()),
          secret,
        },
        runReview
      )
    ).resolves.toEqual({
      statusCode: 401,
      body: {
        status: 'failed',
        reason: 'invalid GitHub webhook signature',
      },
    });
    expect(runReview).not.toHaveBeenCalled();
  });

  it('runs review for accepted pull request events', async () => {
    const body = JSON.stringify(payload());
    const runReview = vi.fn().mockResolvedValue({
      status: 'completed',
      hasViolations: false,
    });

    await expect(
      handleGitHubWebhook(
        {
          eventName: 'pull_request',
          signature: sign(body),
          body,
          secret,
        },
        runReview
      )
    ).resolves.toEqual({
      statusCode: 202,
      body: {
        status: 'accepted',
        result: {
          status: 'completed',
          hasViolations: false,
        },
      },
    });
    expect(runReview).toHaveBeenCalledWith(
      expect.objectContaining({
        pullRequestUrl: 'https://github.com/owner/repo/pull/7',
        headSha: 'abc123',
      })
    );
  });

  it('skips unsupported events without running review', async () => {
    const body = JSON.stringify(payload());
    const runReview = vi.fn();

    await expect(
      handleGitHubWebhook(
        {
          eventName: 'issues',
          signature: sign(body),
          body,
          secret,
        },
        runReview
      )
    ).resolves.toEqual({
      statusCode: 202,
      body: {
        status: 'skipped',
        reason: 'unsupported event: issues',
      },
    });
    expect(runReview).not.toHaveBeenCalled();
  });
});

function sign(body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

function payload() {
  return {
    action: 'opened',
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
    },
  };
}
