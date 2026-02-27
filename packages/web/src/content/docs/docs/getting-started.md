---
title: Getting Started
description: Set up Erode in your CI pipeline in under five minutes.
---

Erode detects architecture drift by comparing pull requests against your architecture model. When a PR introduces an undeclared dependency, Erode flags it as a violation and comments directly on the pull request.

## Prerequisites

- A **repository** with pull requests (this guide uses GitHub Actions — see [CI Integration](/docs/ci/) for GitLab, Bitbucket, and other platforms)
- An **architecture model** describing your system (see [Model Formats](/docs/models/))
- An **API key** for [Gemini, OpenAI, or Anthropic](/docs/reference/ai-providers/)

## Setup

### 1. Add your AI provider API key as a repository secret

Go to your repository's **Settings > Secrets and variables > Actions** and add the API key for your chosen [AI provider](/docs/reference/ai-providers/) (e.g. `GEMINI_API_KEY` for the default Gemini provider).

### 2. Create the workflow file

Add `.github/workflows/erode.yml` to your repository:

```yaml
name: Architecture Drift Check
on: [pull_request]

jobs:
  erode:
    runs-on: ubuntu-latest
    steps:
      - uses: erode-app/erode@main
        with:
          model-repo: your-org/architecture
          github-token: ${{ secrets.GITHUB_TOKEN }}
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
```

Replace `your-org/architecture` with the repository that contains your architecture model. The action clones the model repo automatically — no `actions/checkout` step is needed.

### 3. Open a pull request

Erode runs on every PR and posts a comment listing any undeclared dependencies, their severity, and how to fix them. If no violations are found, it confirms the PR aligns with the declared architecture.

## Try the example project

The [playground repository](https://github.com/erode-app/playground) is a ready-made example you can fork and use to try Erode. It contains a multi-service architecture (frontend, API gateway, microservices, database) with a LikeC4 model and a pre-configured GitHub Actions workflow.

1. [Fork the repository](https://github.com/erode-app/playground/fork)
2. Add your `GEMINI_API_KEY` (or another [AI provider](/docs/reference/ai-providers/) key) as a repository secret
3. Open a PR that introduces an undeclared dependency — for example, make the frontend call `user-service` directly instead of going through `api-gateway`
4. Erode will comment on the PR with the detected violation

## What's next

- [CI Integration overview](/docs/ci/) — supported platforms and setup options
- [GitHub Actions reference](/docs/ci/github-actions/) — all action inputs, outputs, and advanced examples
- [CLI usage](/docs/guides/cli-usage/) — run Erode locally against any PR
- [Configuration](/docs/guides/configuration/) — environment variables for tuning the analysis engine
