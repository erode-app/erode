---
title: Getting Started
description: Add erode to your GitHub repository in under five minutes.
---

erode detects architecture drift by comparing pull requests against your architecture model. When a PR introduces an undeclared dependency, erode flags it as a violation and comments directly on the pull request.

## Prerequisites

- A **GitHub repository** with pull requests
- A **LikeC4 architecture model** describing your system (see [Model Formats](/docs/models/likec4/))
- An **API key** for [Gemini or Anthropic](/docs/reference/ai-providers/)

## Setup

### 1. Add your AI provider API key as a repository secret

Go to your repository's **Settings > Secrets and variables > Actions** and add one of:

- `GEMINI_API_KEY` — for Gemini (default provider)
- `ANTHROPIC_API_KEY` — for Anthropic

### 2. Create the workflow file

Add `.github/workflows/erode.yml` to your repository:

```yaml
name: Architecture Drift Check
on: [pull_request]

jobs:
  erode:
    runs-on: ubuntu-latest
    steps:
      - uses: erode-app/core@main
        with:
          model-repo: your-org/architecture
          github-token: ${{ secrets.GITHUB_TOKEN }}
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
```

Replace `your-org/architecture` with the repository that contains your LikeC4 model. The action clones the model repo automatically — no `actions/checkout` step is needed.

### 3. Open a pull request

erode runs on every PR and posts a comment listing any undeclared dependencies, their severity, and how to fix them. If no violations are found, it confirms the PR aligns with the declared architecture.

## What's next

- [GitHub Actions reference](/docs/ci/github-actions/) — all action inputs, outputs, and advanced examples
- [CLI usage](/docs/guides/cli-usage/) — run erode locally against any PR
- [Configuration](/docs/guides/configuration/) — environment variables for tuning the analysis engine
