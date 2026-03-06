---
title: Configuration
description: Environment variables for tuning the Erode analysis engine.
---

Erode is configured through environment variables or a `.eroderc.json` configuration file. For GitHub Actions-specific inputs (`model-repo`, `fail-on-violations`, etc.), see [GitHub Actions](/docs/ci/github-actions/).

## Precedence

Erode resolves configuration in the following order (highest priority wins):

1. **Environment variables** (`ERODE_*`), whether set directly, through CI secrets, or via a `.env` file
2. **`.eroderc.json`**, project-level settings from the config file
3. **Defaults**, built-in defaults for all settings

This means you can commit `.eroderc.json` with project settings (model format, constraints, adapter config) and provide secrets (API keys, tokens) through environment variables in CI or a local `.env` file.

## Configuration file

Create a `.eroderc.json` file in your project root or home directory:

```json
{
  "$schema": "https://erode.dev/schemas/eroderc.schema.json",
  "ai": { "provider": "gemini" },
  "gemini": { "apiKey": "AIza..." }
}
```

The `$schema` field enables autocomplete and validation in editors that support JSON Schema. All sections are optional; Erode fills in defaults for anything you omit.

Erode looks for `.eroderc.json` in the current working directory first, then the home directory. Any `ERODE_*` environment variables override matching values from the config file.

Environment variable names map to nested JSON keys. For example:

| Environment variable       | JSON path                     |
| -------------------------- | ----------------------------- |
| `ERODE_AI_PROVIDER`        | `ai.provider`                 |
| `ERODE_GEMINI_API_KEY`     | `gemini.apiKey`               |
| `ERODE_MAX_FILES_PER_DIFF` | `constraints.maxFilesPerDiff` |
| `ERODE_MODEL_FORMAT`       | `adapter.format`              |

## AI provider

| Variable                  | Description                                             | Default  |
| ------------------------- | ------------------------------------------------------- | -------- |
| `ERODE_AI_PROVIDER`       | AI provider to use (`gemini`, `openai`, or `anthropic`) | `gemini` |
| `ERODE_GEMINI_API_KEY`    | Google Gemini API key                                   | —        |
| `ERODE_OPENAI_API_KEY`    | OpenAI API key                                          | —        |
| `ERODE_ANTHROPIC_API_KEY` | Anthropic API key (experimental)                        | —        |

## Architecture model

| Variable                     | Description                                             | Default  |
| ---------------------------- | ------------------------------------------------------- | -------- |
| `ERODE_MODEL_FORMAT`         | Architecture model format (`likec4` or `structurizr`)   | `likec4` |
| `ERODE_STRUCTURIZR_CLI_PATH` | Path to the Structurizr CLI WAR file (for `.dsl` files) | —        |
| `ERODE_LIKEC4_EXCLUDE_PATHS` | Comma-separated paths to exclude from model loading     | —        |
| `ERODE_LIKEC4_EXCLUDE_TAGS`  | Comma-separated tags to exclude from model loading      | —        |

## Diff limits

| Variable                   | Description                                    | Default |
| -------------------------- | ---------------------------------------------- | ------- |
| `ERODE_MAX_FILES_PER_DIFF` | Maximum number of files to include in the diff | `50`    |
| `ERODE_MAX_LINES_PER_DIFF` | Maximum number of lines to include in the diff | `5000`  |
| `ERODE_MAX_CONTEXT_CHARS`  | Maximum characters of architectural context    | `10000` |

Erode truncates large diffs to stay within these limits. If a PR exceeds them, Erode processes the most relevant files first based on the architecture model context.

## Provider model overrides

Each AI provider uses two model tiers: a fast model for extraction stages and an advanced model for analysis. Override the defaults with these variables:

| Variable                         | Description                                      |
| -------------------------------- | ------------------------------------------------ |
| `ERODE_GEMINI_FAST_MODEL`        | Gemini model for Stages 1–2 and model updates    |
| `ERODE_GEMINI_ADVANCED_MODEL`    | Gemini model for Stage 3 (analysis)              |
| `ERODE_OPENAI_FAST_MODEL`        | OpenAI model for Stages 1–2 and model updates    |
| `ERODE_OPENAI_ADVANCED_MODEL`    | OpenAI model for Stage 3 (analysis)              |
| `ERODE_ANTHROPIC_FAST_MODEL`     | Anthropic model for Stages 1–2 and model updates |
| `ERODE_ANTHROPIC_ADVANCED_MODEL` | Anthropic model for Stage 3 (analysis)           |

See [AI Providers](/docs/reference/ai-providers/) for default model names and guidance on choosing a provider.

## GitHub

| Variable                    | Description                             | Default                   |
| --------------------------- | --------------------------------------- | ------------------------- |
| `ERODE_GITHUB_TOKEN`        | GitHub token for API access             | —                         |
| `ERODE_GITHUB_TIMEOUT`      | Request timeout for GitHub API (ms)     | `30000`                   |
| `ERODE_MODEL_REPO_PR_TOKEN` | Separate token for the model repository | Uses `ERODE_GITHUB_TOKEN` |

### Token permissions

Erode uses `ERODE_GITHUB_TOKEN` to read the source PR and post analysis comments. `ERODE_MODEL_REPO_PR_TOKEN` is used to create model update PRs (branches, commits, pull requests) on the model repository and falls back to `ERODE_GITHUB_TOKEN` when not set.

**Same repository** — source code and architecture model live in one repo, so a single token covers everything:

| Feature                              | Permissions                                             |
| ------------------------------------ | ------------------------------------------------------- |
| Read PR and diff                     | Contents: Read, Pull requests: Read                     |
| Post analysis comments               | Issues: Read and write                                  |
| Create model update PR (`--open-pr`) | Contents: Read and write, Pull requests: Read and write |

**External model repository** — source and model are in separate repos, each with its own token:

| Token                       | Repository  | Permissions                                                 |
| --------------------------- | ----------- | ----------------------------------------------------------- |
| `ERODE_GITHUB_TOKEN`        | Source repo | Contents: Read, Pull requests: Read, Issues: Read and write |
| `ERODE_MODEL_REPO_PR_TOKEN` | Model repo  | Contents: Read and write, Pull requests: Read and write     |

#### Fine-grained PATs

Select these **Repository permissions** when creating a fine-grained personal access token:

- **Contents** — Read-only (or Read and write if using `--open-pr` on that repo)
- **Pull requests** — Read-only (or Read and write if using `--open-pr` on that repo)
- **Issues** — Read and write (source repo only)

#### Classic PATs

The `repo` scope covers all required permissions. If the model repository is public, `public_repo` is sufficient for `ERODE_MODEL_REPO_PR_TOKEN`.

#### GitHub Apps (recommended for organizations)

GitHub Apps are the recommended token strategy for organizations:

- **Short-lived tokens** — automatically generated and rotated on every workflow run, eliminating long-lived secrets
- **Repository-scoped** — access is limited to specific repositories, not broad user-level access
- **Not tied to user accounts** — tokens keep working when people leave the organization or change roles
- **Centralized permissions** — managed through the App's installation settings, not individual developer tokens

Use the same Repository permissions as fine-grained PATs above. See [GitHub App Token](/docs/ci/github-actions/#github-app-token) for a complete workflow example.

:::note
PR comments are created through GitHub's Issues API (`issues.createComment`), so **Issues: Read and write** is required even though it looks like a Pull requests operation.
:::

## GitLab (experimental)

| Variable                | Description                   | Default              |
| ----------------------- | ----------------------------- | -------------------- |
| `ERODE_GITLAB_TOKEN`    | GitLab token with `api` scope | —                    |
| `ERODE_GITLAB_BASE_URL` | GitLab instance URL           | `https://gitlab.com` |

### Token permissions

Erode uses `ERODE_GITLAB_TOKEN` for all operations on the source project: reading MR diffs, posting notes, and (with `--open-pr`) creating branches, commits, and merge requests. The `api` scope is required; `read_api` is **not** sufficient.

For external model projects, the CI entrypoint accepts `ERODE_MODEL_REPO_TOKEN` (see [GitLab CI](/docs/ci/gitlab-ci/)).

| Type                  | Scope | Minimum role |
| --------------------- | ----- | ------------ |
| Personal Access Token | `api` | —            |
| Project Access Token  | `api` | Developer    |
| Group Access Token    | `api` | Developer    |

## Bitbucket (experimental)

| Variable                   | Description                     | Default                         |
| -------------------------- | ------------------------------- | ------------------------------- |
| `ERODE_BITBUCKET_TOKEN`    | Bitbucket app password or token | —                               |
| `ERODE_BITBUCKET_BASE_URL` | Bitbucket API base URL          | `https://api.bitbucket.org/2.0` |

### Token permissions

`ERODE_BITBUCKET_TOKEN` handles all operations. There is no separate model-repo token. If the token contains `:` (e.g. `username:app_password`), Erode uses HTTP Basic auth; otherwise it uses Bearer auth.

| Feature                              | App password scopes                       |
| ------------------------------------ | ----------------------------------------- |
| Read PRs and diffs                   | Repositories: Read                        |
| Post PR comments                     | Pull requests: Write                      |
| Create model update PR (`--open-pr`) | Repositories: Write, Pull requests: Write |

Minimum scopes (no `--open-pr`): **Repositories: Read** + **Pull requests: Write**.
Full scopes (with `--open-pr`): **Repositories: Write** + **Pull requests: Write**.

Repository access tokens and workspace access tokens use the same permission categories but authenticate with Bearer auth.

## Timeouts

| Variable                  | Description                                  | Default |
| ------------------------- | -------------------------------------------- | ------- |
| `ERODE_GEMINI_TIMEOUT`    | Request timeout for Gemini API calls (ms)    | `60000` |
| `ERODE_OPENAI_TIMEOUT`    | Request timeout for OpenAI API calls (ms)    | `60000` |
| `ERODE_ANTHROPIC_TIMEOUT` | Request timeout for Anthropic API calls (ms) | `60000` |
| `ERODE_GITHUB_TIMEOUT`    | Request timeout for GitHub API calls (ms)    | `30000` |

## Debug

| Variable           | Description            | Default |
| ------------------ | ---------------------- | ------- |
| `ERODE_DEBUG_MODE` | Enable debug output    | `false` |
| `ERODE_VERBOSE`    | Enable verbose logging | `false` |

## What's next

- [CLI usage](/docs/guides/cli-usage/) — run Erode locally against any pull request
- [AI Providers](/docs/reference/ai-providers/) — supported providers, default models, and overrides
- [Analysis pipeline](/docs/reference/analysis-pipeline/) — stage-by-stage reference for the analysis engine
