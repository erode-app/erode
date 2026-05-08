# Erode Agent

`@erode-app/agent` contains the event-driven review agent core for Erode.

This package is not a standalone hosted service yet. It provides the reusable pieces needed by a service, serverless function, or app host:

- verify GitHub webhook signatures
- normalize supported GitHub pull request events
- run the existing Erode `runAnalyze()` pipeline
- return a small structured result for the host to log or publish

## Current Status

The package currently exports library functions only. There is no `erode-agent` binary and no HTTP server entrypoint yet.

Use it by importing the package from a webhook host:

```ts
import { handleGitHubWebhook, runAgentReview } from '@erode-app/agent';

const response = await handleGitHubWebhook(
  {
    eventName: request.headers['x-github-event'],
    signature: request.headers['x-hub-signature-256'],
    body: rawRequestBody,
    secret: process.env['GITHUB_WEBHOOK_SECRET'] ?? '',
  },
  runAgentReview
);
```

The host is responsible for receiving HTTP requests and returning `response.statusCode` plus `response.body`.

## Supported Events

The agent accepts GitHub `pull_request` webhooks for these actions:

- `opened`
- `reopened`
- `synchronize`
- `ready_for_review`

Other events are skipped with a reason.

## Required Configuration

The agent uses the same configuration system as `@erode-app/core`.

Minimum `.eroderc.json` shape:

```json
{
  "agent": {
    "enabled": true,
    "skipDrafts": true,
    "comment": true,
    "openModelPr": false,
    "failOnViolations": false
  },
  "adapter": {
    "format": "likec4",
    "modelPath": ".",
    "modelRepo": "owner/architecture-model",
    "modelRef": "main"
  },
  "ai": {
    "provider": "anthropic"
  }
}
```

Required environment variables depend on the selected provider and platform:

```bash
ERODE_AGENT_ENABLED=true
ERODE_GITHUB_TOKEN=...
ERODE_ANTHROPIC_API_KEY=...
GITHUB_WEBHOOK_SECRET=...
```

Use `ERODE_GEMINI_API_KEY` or `ERODE_OPENAI_API_KEY` instead when using those providers.

## What Happens on a Valid PR Event

1. The webhook host passes the raw body, GitHub event name, signature, and secret to `handleGitHubWebhook()`.
2. The handler verifies the signature.
3. The handler normalizes the pull request event into an `AgentReviewRequest`.
4. `runAgentReview()` checks agent config and draft PR policy.
5. `runAgentReview()` calls `runAnalyze()` with:
   - `comment: true` when `agent.comment` is enabled
   - `openPr: true` when `agent.openModelPr` is enabled
   - `draft: true` for generated model PRs
6. Core fetches the PR, runs the analysis pipeline, and publishes the managed PR comment.

## Local Development

From the repository root:

```bash
npm run build --workspace=packages/core
npm run test --workspace=packages/agent
npm run typecheck --workspace=packages/agent
npm run lint --workspace=packages/agent
npm run build --workspace=packages/agent
```

Build `packages/core` first when changing core exports used by the agent.

## Not Implemented Yet

These are intentionally outside the first slice:

- GitHub App installation token minting
- hosted HTTP server binary
- GitHub Check Run publishing
- durable run history or database-backed idempotency
- GitLab and Bitbucket webhook adapters
