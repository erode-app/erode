import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG, runAnalyze } from '@erode-app/core';
import type * as CoreModule from '@erode-app/core';
import { runAgentReview } from '../agent-runner.js';
import type { AgentReviewRequest } from '../github-webhook.js';

vi.mock('@erode-app/core', async (importOriginal) => {
  const actual = await importOriginal<typeof CoreModule>();
  return {
    ...actual,
    runAnalyze: vi.fn(),
  };
});

const mockedRunAnalyze = vi.mocked(runAnalyze);

describe('runAgentReview', () => {
  const originalAgent = { ...CONFIG.agent };
  const originalAdapter = { ...CONFIG.adapter };

  beforeEach(() => {
    mockedRunAnalyze.mockReset();
    CONFIG.agent.enabled = true;
    CONFIG.agent.skipDrafts = true;
    CONFIG.agent.comment = true;
    CONFIG.agent.openModelPr = false;
    CONFIG.agent.failOnViolations = false;
    CONFIG.adapter.modelPath = '/models';
    CONFIG.adapter.format = 'likec4';
    CONFIG.adapter.modelRepo = undefined;
    CONFIG.adapter.modelRef = 'main';
  });

  afterEach(() => {
    Object.assign(CONFIG.agent, originalAgent);
    Object.assign(CONFIG.adapter, originalAdapter);
  });

  it('skips when the agent is disabled', async () => {
    CONFIG.agent.enabled = false;

    await expect(runAgentReview(makeRequest())).resolves.toEqual({
      status: 'skipped',
      reason: 'agent is disabled',
    });
    expect(mockedRunAnalyze).not.toHaveBeenCalled();
  });

  it('skips draft pull requests when configured', async () => {
    await expect(runAgentReview(makeRequest({ draft: true }))).resolves.toEqual({
      status: 'skipped',
      reason: 'pull request is draft',
    });
    expect(mockedRunAnalyze).not.toHaveBeenCalled();
  });

  it('constructs analyze options from the request and config', async () => {
    mockedRunAnalyze.mockResolvedValue({
      hasViolations: true,
      analysisResult: {
        hasViolations: true,
        violations: [],
        summary: 'summary',
        metadata: {
          number: 7,
          source: 'pr',
          title: 'Test',
          description: null,
          repository: 'owner/repo',
          author: { login: 'author' },
          base: { ref: 'main', sha: 'base' },
          head: { ref: 'branch', sha: 'head' },
          stats: { commits: 1, additions: 1, deletions: 0, files_changed: 1 },
          commits: [],
        },
        component: { id: 'comp', name: 'Component', tags: [], type: 'service' },
        dependencyChanges: { dependencies: [], summary: '' },
      },
      generatedChangeRequest: {
        url: 'https://github.com/owner/model/pull/1',
        number: 1,
        action: 'created',
        branch: 'architecture/owner-repo/pr-7',
      },
    });

    await expect(runAgentReview(makeRequest())).resolves.toEqual({
      status: 'completed',
      hasViolations: true,
      generatedChangeRequestUrl: 'https://github.com/owner/model/pull/1',
    });
    expect(mockedRunAnalyze).toHaveBeenCalledWith({
      modelPath: '/models',
      url: 'https://github.com/owner/repo/pull/7',
      modelFormat: 'likec4',
      format: 'json',
      comment: true,
      openPr: false,
      draft: true,
      failOnViolations: false,
      modelRepo: undefined,
      modelRef: 'main',
    });
  });

  it('fails when no model path is configured', async () => {
    CONFIG.adapter.modelPath = undefined;

    await expect(runAgentReview(makeRequest())).resolves.toEqual({
      status: 'failed',
      reason: 'agent model path is not configured',
    });
    expect(mockedRunAnalyze).not.toHaveBeenCalled();
  });
});

function makeRequest(overrides: Partial<AgentReviewRequest> = {}): AgentReviewRequest {
  return {
    event: 'pull_request',
    action: 'opened',
    draft: false,
    installationId: 123,
    repositoryUrl: 'https://github.com/owner/repo',
    pullRequestUrl: 'https://github.com/owner/repo/pull/7',
    owner: 'owner',
    repo: 'repo',
    number: 7,
    headSha: 'abc123',
    ...overrides,
  };
}
