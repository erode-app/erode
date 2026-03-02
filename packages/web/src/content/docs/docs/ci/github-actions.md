---
title: GitHub Actions
description: Set up Erode as a GitHub Actions workflow.
---

The recommended way to run Erode is as a GitHub Actions workflow that checks every pull request automatically.

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
      - uses: erode-app/erode@main
        with:
          model-repo: your-org/architecture
          github-token: ${{ secrets.GITHUB_TOKEN }}
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
```

:::tip[Working example]
See the [playground repository](https://github.com/erode-app/playground) for a complete working setup with a LikeC4 model and GitHub Actions workflow you can fork.
:::

The `if` guard skips dependabot PRs and draft PRs. Since Erode uses AI tokens on every run, this avoids spending them on automated dependency bumps and work-in-progress PRs that rarely introduce architectural drift. Remove the guard if you want Erode to run on all PRs.

The action runs in a Docker container that clones the model repository directly — you do not need an `actions/checkout` step.

## Remote model repository

Erode expects the architecture model to live in its own repository (or a subdirectory of one). The `model-repo` input tells the action where to find it.

```yaml
- uses: erode-app/erode@main
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
- uses: erode-app/erode@main
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
| `open-pr`             | Open a PR with model updates (`true`, `false`, or `auto`)   | No                   | `false`             |
| `fail-on-violations`  | Fail the workflow if violations are detected                | No                   | `false`             |
| `skip-file-filtering` | Analyze all changed files instead of filtering by relevance | No                   | `false`             |

## Action outputs

| Output             | Description                                    |
| ------------------ | ---------------------------------------------- |
| `has-violations`   | Whether architectural violations were detected |
| `violations-count` | Number of violations detected                  |
| `analysis-summary` | Summary of the analysis results                |
| `model-format`     | The architecture model format used             |

Use outputs in subsequent workflow steps:

```yaml
steps:
  - uses: erode-app/erode@main
    id: erode
    with:
      model-repo: your-org/architecture
      github-token: ${{ secrets.GITHUB_TOKEN }}
      gemini-api-key: ${{ secrets.GEMINI_API_KEY }}

  - if: steps.erode.outputs.has-violations == 'true'
    run: echo "Found ${{ steps.erode.outputs.violations-count }} violations"
```

## Model update PRs

The `open-pr` input controls whether Erode creates a pull request against the model repository with updated relationship declarations. It accepts three values:

| Value   | Behavior                                                                                |
| ------- | --------------------------------------------------------------------------------------- |
| `false` | Never create a model PR (default)                                                       |
| `true`  | Always create or update a model PR when model updates are found                         |
| `auto`  | Only update a model PR if one was previously created for this source PR (sticky opt-in) |

When `open-pr` is `true` or `auto` (with an existing branch), Erode runs Stage 4 (Model Update) to generate a deterministic patch from the Stage 3 structured analysis data, then creates or updates a pull request against the model repository.

- PRs are created as drafts by default (GitHub/GitLab). Bitbucket has no draft support.
- The PR body includes a link to the source analysis PR for traceability.
- If a subsequent analysis finds no violations, any existing model PR for that source PR is automatically closed.

:::note
Relationship removals are informational only. The PR body lists relationships that may need removal, but the reviewer must remove them manually.
:::

### On-demand updates with `/erode update-model`

With `open-pr: 'auto'`, Erode skips PR creation on regular analysis runs. Instead, when model updates are detected, the analysis comment includes a call-to-action:

> Reply `/erode update-model` on this PR to open a model update PR.

To handle that comment, add the `issue_comment` trigger to your workflow. Use `open-pr: 'true'` for comment-triggered runs so the initial model PR is created, and `'auto'` for regular `pull_request` runs so subsequent pushes keep it updated:

```yaml
name: Architecture Drift Check
on:
  pull_request:
  issue_comment:
    types: [created]

jobs:
  erode:
    if: >-
      (github.event_name == 'pull_request' &&
       github.actor != 'dependabot[bot]' &&
       !github.event.pull_request.draft)
      ||
      (github.event_name == 'issue_comment' &&
       github.event.issue.pull_request &&
       contains(github.event.comment.body, '/erode update-model'))
    runs-on: ubuntu-latest
    steps:
      - uses: erode-app/erode@main
        with:
          model-repo: your-org/architecture
          open-pr: ${{ github.event_name == 'issue_comment' && 'true' || 'auto' }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
```

The flow:

1. A `pull_request` run with `auto` finds no existing branch, so it skips PR creation and shows the CTA.
2. A reviewer comments `/erode update-model`. The `issue_comment` trigger fires with `open-pr: 'true'`, creating the model PR.
3. Further pushes to the source PR trigger `pull_request` with `auto`. The branch now exists, so the model PR is updated automatically.

The `issue_comment` trigger fires for all PR comments. The `if` guard ensures the job only runs when the comment contains `/erode update-model` and the issue is actually a pull request.

:::tip
Use `open-pr: 'true'` if you want a model PR on every analysis run. Use `open-pr: 'auto'` with the workflow above if you prefer on-demand creation.
:::

## PR comments

After analysis, Erode posts a comment on the pull request containing:

- A **summary** of the analysis result
- A **violations table** listing each finding with its severity (high, medium, or low), the affected dependency, and a description
- **Suggestions** for resolving each violation
- The component and architecture context used during analysis

If no violations are found, the comment confirms that the PR aligns with the declared architecture.

## GitHub App token

For organizations, GitHub Apps are the recommended authentication method. Unlike personal access tokens, App tokens are short-lived, scoped to specific repositories, and not tied to individual user accounts, so they keep working when people leave the organization. Permissions are managed centrally through the App's installation settings.

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

      - uses: erode-app/erode@main
        with:
          model-repo: your-org/architecture
          github-token: ${{ steps.app-token.outputs.token }}
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
```

The `owner` field ensures the token covers all repositories the App is installed on within the organization. `permissions: {}` drops the default `GITHUB_TOKEN` permissions since the App token provides its own, and `concurrency` cancels stale runs when a PR is updated.

## Tips

- Start with the Gemini provider during evaluation. It is cheaper per request. OpenAI is another good option for production workflows.
- Keep your architecture model up to date. Erode can only detect drift against what is declared in the model.
- Set `fail-on-violations: 'true'` to block PRs that introduce undeclared dependencies.
- See [Configuration](/docs/guides/configuration/) for tuning diff limits, timeouts, and model overrides.
