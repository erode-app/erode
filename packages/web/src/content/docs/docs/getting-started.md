---
title: Getting Started
description: Set up Erode in your CI pipeline in under five minutes.
---

Erode detects architecture drift by comparing pull requests against your architecture model. When a PR introduces an undeclared dependency, Erode surfaces it as a finding and comments directly on the pull request.

## Prerequisites

- A **repository** with pull requests (this guide uses GitHub Actions — see [CI Integration](/docs/ci/) for GitLab, Bitbucket, and other platforms)
- An **architecture model** describing your system (see [Model Formats](/docs/models/))
- An **API key** for [Gemini, OpenAI, or Anthropic](/docs/reference/ai-providers/)

## Setup

### 1. Add your AI provider API key as a repository secret

Go to your repository's **Settings > Secrets and variables > Actions** and add the API key for your chosen [AI provider](/docs/reference/ai-providers/) (e.g. `GEMINI_API_KEY` for the default Gemini provider). The GitHub Action maps these secret values to the `ERODE_`-prefixed environment variables that Erode expects.

### 2. Create the workflow file

Add `.github/workflows/erode.yml` to your repository:

```yaml
name: Architecture Drift Review
on: [pull_request]

jobs:
  erode:
    runs-on: ubuntu-latest
    steps:
      - uses: erode-app/erode@0
        with:
          model-repo: your-org/architecture
          github-token: ${{ secrets.GITHUB_TOKEN }}
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
```

> **Note:** The `GITHUB_TOKEN` requires specific permissions depending on your setup. See [Token permissions](/docs/guides/configuration/#token-permissions) for details.

Replace `your-org/architecture` with the repository that contains your architecture model. The action clones the model repo automatically — no `actions/checkout` step is needed.

### 3. Open a pull request

Erode runs on every PR and posts a comment listing any undeclared dependencies, their severity, and how to fix them. If Erode finds no drift, it confirms the PR aligns with the declared architecture.

## Try the example project

The [playground repository](https://github.com/erode-app/playground) is a ready-made example you can fork and use to try Erode. It contains a multi-service architecture (frontend, API gateway, microservices, database) with pre-configured GitHub Actions workflows for both LikeC4 and Structurizr models.

To try it yourself:

1. [Fork the repository](https://github.com/erode-app/playground/fork)
2. Add your `GEMINI_API_KEY` (or another [AI provider](/docs/reference/ai-providers/) key) as a repository secret
3. Open a PR that introduces an undeclared dependency

Or browse the existing example PRs to see Erode's output without any setup:

### Undeclared dependency (LikeC4)

[PR #1: feat: add admin users page](https://github.com/erode-app/playground/pull/1) adds a frontend page that calls `user_service` directly, bypassing the `api_gateway`. The architecture model declares that the frontend depends on the gateway, not the service behind it. Erode detects this undeclared dependency and reports the violation on the PR.

### Undeclared dependency (Structurizr)

[PR #2: feat: add admin users page](https://github.com/erode-app/playground/pull/2) introduces the same violation as PR #1, but the analysis runs against a Structurizr workspace instead of a LikeC4 model. The result is the same finding, showing that Erode works across model formats.

### New component and model update

[PR #3: feat: enrich products with creator info](https://github.com/erode-app/playground/pull/3) adds a `product_service → user_service` dependency and introduces a new `order_service`. Erode detects the undeclared dependency, auto-detects the new component, and after a reviewer replies `/erode update-model`, creates a [model update PR](https://github.com/erode-app/playground-models-only/pull/2) with the proposed changes.

## What's next

- [CI Integration overview](/docs/ci/) — supported platforms and setup options
- [GitHub Actions reference](/docs/ci/github-actions/) — all action inputs, outputs, and advanced examples
- [CLI usage](/docs/guides/cli-usage/) — run Erode locally against PRs or uncommitted changes
- [Claude Code integration](/docs/guides/claude-code/) — add architecture drift checks to Claude Code sessions
- [Configuration](/docs/guides/configuration/) — environment variables for tuning the analysis engine
