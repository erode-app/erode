---
title: GitHub Actions
description: Set up erode as a GitHub Actions workflow.
head:
  - tag: script
    attrs:
      src: /architecture/likec4-views.js
---

The recommended way to run erode is as a GitHub Actions workflow that checks every pull request automatically.

<div class="likec4-embed">
<likec4-view view-id="platforms" browser="true"></likec4-view>
</div>

> [Open full interactive viewer →](/architecture/#/view/platforms/)

## Basic workflow

Create `.github/workflows/erode.yml` in your repository:

```yaml
name: Architecture Drift Check
on: [pull_request]

jobs:
  erode:
    if: github.actor != 'dependabot[bot]' && !github.event.pull_request.draft
    runs-on: ubuntu-latest
    steps:
      - uses: erode-app/core@main
        with:
          model-repo: your-org/architecture
          github-token: ${{ secrets.GITHUB_TOKEN }}
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
```

The `if` guard skips dependabot PRs and draft PRs. Since erode uses AI tokens on every run, this avoids spending them on automated dependency bumps and work-in-progress PRs that rarely introduce architectural drift. Remove the guard if you want erode to run on all PRs.

The action runs in a Docker container that clones the model repository directly — you do not need an `actions/checkout` step.

## Remote model repository

erode expects the architecture model to live in its own repository (or a subdirectory of one). The `model-repo` input tells the action where to find it.

```yaml
- uses: erode-app/core@main
  with:
    model-repo: your-org/architecture # required
    model-path: models/backend # subdirectory within the repo
    model-ref: v2 # branch or tag (default: main)
    github-token: ${{ secrets.GITHUB_TOKEN }}
    gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
```

### Private model repositories

If the model repo requires different credentials than the repository running the workflow, pass a separate token:

```yaml
- uses: erode-app/core@main
  with:
    model-repo: your-org/architecture
    model-repo-token: ${{ secrets.MODEL_REPO_TOKEN }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
    gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
```

`model-repo-token` is used only for cloning the model repository. All other GitHub API calls (reading the PR diff, posting comments) use `github-token`.

## Action inputs

| Input                 | Description                                                 | Required             | Default             |
| --------------------- | ----------------------------------------------------------- | -------------------- | ------------------- |
| `model-repo`          | Repository containing the architecture model (`owner/repo`) | Yes                  | —                   |
| `model-path`          | Path to the model within the model repository               | No                   | `.`                 |
| `model-ref`           | Git ref (branch/tag) of the model repository                | No                   | `main`              |
| `model-format`        | Architecture model format                                   | No                   | `likec4`            |
| `ai-provider`         | AI provider (`gemini`, `openai`, or `anthropic`)            | No                   | `anthropic`         |
| `gemini-api-key`      | Gemini API key                                              | When using Gemini    | —                   |
| `openai-api-key`      | OpenAI API key                                              | When using OpenAI    | —                   |
| `anthropic-api-key`   | Anthropic API key (experimental)                            | When using Anthropic | —                   |
| `github-token`        | GitHub token for reading PRs and posting comments           | Yes                  | —                   |
| `model-repo-token`    | Separate GitHub token for cloning the model repository      | No                   | Uses `github-token` |
| `open-pr`             | Open a PR with suggested model updates                      | No                   | `false`             |
| `fail-on-violations`  | Fail the workflow if violations are detected                | No                   | `false`             |
| `skip-file-filtering` | Analyze all changed files instead of filtering by relevance | No                   | `false`             |

## Action outputs

| Output             | Description                                    |
| ------------------ | ---------------------------------------------- |
| `has-violations`   | Whether architectural violations were detected |
| `violations-count` | Number of violations detected                  |
| `analysis-summary` | Summary of the analysis results                |

Use outputs in subsequent workflow steps:

```yaml
steps:
  - uses: erode-app/core@main
    id: erode
    with:
      model-repo: your-org/architecture
      github-token: ${{ secrets.GITHUB_TOKEN }}
      gemini-api-key: ${{ secrets.GEMINI_API_KEY }}

  - if: steps.erode.outputs.has-violations == 'true'
    run: echo "Found ${{ steps.erode.outputs.violations-count }} violations"
```

## PR comments

After analysis, erode posts a comment on the pull request containing:

- A **summary** of the analysis result
- A **violations table** listing each finding with its severity (high, medium, or low), the affected dependency, and a description
- **Suggestions** for resolving each violation
- The component and architecture context used during analysis

If no violations are found, the comment confirms that the PR aligns with the declared architecture.

## GitHub App Token

For organizations, GitHub Apps are the recommended authentication method. Unlike personal access tokens, App tokens are short-lived, scoped to specific repositories, and not tied to individual user accounts — so they keep working when people leave the organization. Permissions are managed centrally through the App's installation settings.

Use the [`create-github-app-token`](https://github.com/actions/create-github-app-token) action to generate a token at the start of each workflow run:

```yaml
name: Architecture Drift Check
on: [pull_request]

concurrency:
  group: erode-${{ github.event.pull_request.number }}
  cancel-in-progress: true

permissions: {}

jobs:
  erode:
    if: github.actor != 'dependabot[bot]' && !github.event.pull_request.draft
    runs-on: ubuntu-latest
    steps:
      - uses: actions/create-github-app-token@v2
        id: app-token
        with:
          app-id: ${{ vars.ERODE_APP_ID }}
          private-key: ${{ secrets.ERODE_APP_PRIVATE_KEY }}
          owner: ${{ github.repository_owner }}

      - uses: erode-app/core@main
        with:
          model-repo: your-org/architecture
          github-token: ${{ steps.app-token.outputs.token }}
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
```

The `owner` field ensures the token covers all repositories the App is installed on within the organization. `permissions: {}` drops the default `GITHUB_TOKEN` permissions since the App token provides its own, and `concurrency` cancels stale runs when a PR is updated.

## Tips

- Start with the Gemini provider during evaluation — it is generally cheaper. OpenAI is another good option for production workflows.
- Keep your architecture model up to date. erode can only detect drift against what is declared in the model.
- Set `fail-on-violations: 'true'` to block PRs that introduce undeclared dependencies.
- See [Configuration](/docs/guides/configuration/) for tuning diff limits, timeouts, and model overrides.
