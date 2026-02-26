---
title: Configuration
description: Environment variables for tuning the erode analysis engine.
---

erode is configured through environment variables. There are no configuration files.

For GitHub Actions-specific inputs (`model-repo`, `fail-on-violations`, etc.), see [GitHub Actions](/docs/ci/github-actions/).

## AI provider

| Variable            | Description                                             | Default  |
| ------------------- | ------------------------------------------------------- | -------- |
| `AI_PROVIDER`       | AI provider to use (`gemini`, `openai`, or `anthropic`) | `gemini` |
| `GEMINI_API_KEY`    | Google Gemini API key                                   | —        |
| `OPENAI_API_KEY`    | OpenAI API key                                          | —        |
| `ANTHROPIC_API_KEY` | Anthropic API key (experimental)                        | —        |

## Architecture model

| Variable               | Description                                         | Default  |
| ---------------------- | --------------------------------------------------- | -------- |
| `MODEL_FORMAT`         | Architecture model format                           | `likec4` |
| `LIKEC4_EXCLUDE_PATHS` | Comma-separated paths to exclude from model loading | —        |
| `LIKEC4_EXCLUDE_TAGS`  | Comma-separated tags to exclude from model loading  | —        |

## Diff limits

| Variable             | Description                                    | Default |
| -------------------- | ---------------------------------------------- | ------- |
| `MAX_FILES_PER_DIFF` | Maximum number of files to include in the diff | `50`    |
| `MAX_LINES_PER_DIFF` | Maximum number of lines to include in the diff | `5000`  |
| `MAX_CONTEXT_CHARS`  | Maximum characters of architectural context    | `10000` |

Large diffs are truncated to stay within these limits. If a PR exceeds them, erode processes the most relevant files first based on the architecture model context.

## Provider model overrides

Each AI provider uses two model tiers: a fast model for extraction stages and an advanced model for analysis. Override the defaults with these variables:

| Variable                   | Description                                 |
| -------------------------- | ------------------------------------------- |
| `GEMINI_FAST_MODEL`        | Gemini model for Stages 1–2 (extraction)    |
| `GEMINI_ADVANCED_MODEL`    | Gemini model for Stages 3–4 (analysis)      |
| `OPENAI_FAST_MODEL`        | OpenAI model for Stages 1–2 (extraction)    |
| `OPENAI_ADVANCED_MODEL`    | OpenAI model for Stages 3–4 (analysis)      |
| `ANTHROPIC_FAST_MODEL`     | Anthropic model for Stages 1–2 (extraction) |
| `ANTHROPIC_ADVANCED_MODEL` | Anthropic model for Stages 3–4 (analysis)   |

See [AI Providers](/docs/reference/ai-providers/) for default model names and guidance on choosing a provider.

## GitHub

| Variable              | Description                             | Default             |
| --------------------- | --------------------------------------- | ------------------- |
| `GITHUB_TOKEN`        | GitHub token for API access             | —                   |
| `GITHUB_TIMEOUT`      | Request timeout for GitHub API (ms)     | `30000`             |
| `MODEL_REPO_PR_TOKEN` | Separate token for the model repository | Uses `GITHUB_TOKEN` |

### Token permissions

`GITHUB_TOKEN` is used to read the source PR and post analysis comments. `MODEL_REPO_PR_TOKEN` is used to create model update PRs (branches, commits, pull requests) on the model repository and falls back to `GITHUB_TOKEN` when not set.

**Same repository** — source code and architecture model live in one repo, so a single token covers everything:

| Feature                              | Permissions                                             |
| ------------------------------------ | ------------------------------------------------------- |
| Read PR and diff                     | Contents: Read, Pull requests: Read                     |
| Post analysis comments               | Issues: Read and write                                  |
| Create model update PR (`--open-pr`) | Contents: Read and write, Pull requests: Read and write |

**External model repository** — source and model are in separate repos, each with its own token:

| Token                 | Repository  | Permissions                                                 |
| --------------------- | ----------- | ----------------------------------------------------------- |
| `GITHUB_TOKEN`        | Source repo | Contents: Read, Pull requests: Read, Issues: Read and write |
| `MODEL_REPO_PR_TOKEN` | Model repo  | Contents: Read and write, Pull requests: Read and write     |

#### Fine-grained PATs

Select these **Repository permissions** when creating a fine-grained personal access token:

- **Contents** — Read-only (or Read and write if using `--open-pr` on that repo)
- **Pull requests** — Read-only (or Read and write if using `--open-pr` on that repo)
- **Issues** — Read and write (source repo only)

#### Classic PATs

The `repo` scope covers all required permissions. If the model repository is public, `public_repo` is sufficient for `MODEL_REPO_PR_TOKEN`.

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

| Variable          | Description                   | Default              |
| ----------------- | ----------------------------- | -------------------- |
| `GITLAB_TOKEN`    | GitLab token with `api` scope | —                    |
| `GITLAB_BASE_URL` | GitLab instance URL           | `https://gitlab.com` |

### Token permissions

`GITLAB_TOKEN` is used for all operations on the source project — reading MR diffs, posting notes, and (with `--open-pr`) creating branches, commits, and merge requests. The `api` scope is required; `read_api` is **not** sufficient.

For external model projects, the CI entrypoint accepts `LIKEC4_MODEL_REPO_TOKEN` (see [GitLab CI](/docs/ci/gitlab-ci/)).

| Type                  | Scope | Minimum role |
| --------------------- | ----- | ------------ |
| Personal Access Token | `api` | —            |
| Project Access Token  | `api` | Developer    |
| Group Access Token    | `api` | Developer    |

## Bitbucket (experimental)

| Variable             | Description                     | Default                         |
| -------------------- | ------------------------------- | ------------------------------- |
| `BITBUCKET_TOKEN`    | Bitbucket app password or token | —                               |
| `BITBUCKET_BASE_URL` | Bitbucket API base URL          | `https://api.bitbucket.org/2.0` |

### Token permissions

`BITBUCKET_TOKEN` handles all operations — there is no separate model-repo token. If the token contains `:` (e.g. `username:app_password`), erode uses HTTP Basic auth; otherwise it uses Bearer auth.

| Feature                              | App password scopes                       |
| ------------------------------------ | ----------------------------------------- |
| Read PRs and diffs                   | Repositories: Read                        |
| Post PR comments                     | Pull requests: Write                      |
| Create model update PR (`--open-pr`) | Repositories: Write, Pull requests: Write |

Minimum scopes (no `--open-pr`): **Repositories: Read** + **Pull requests: Write**.
Full scopes (with `--open-pr`): **Repositories: Write** + **Pull requests: Write**.

Repository access tokens and workspace access tokens use the same permission categories but authenticate with Bearer auth.

## Timeouts

| Variable            | Description                                  | Default |
| ------------------- | -------------------------------------------- | ------- |
| `GEMINI_TIMEOUT`    | Request timeout for Gemini API calls (ms)    | `60000` |
| `OPENAI_TIMEOUT`    | Request timeout for OpenAI API calls (ms)    | `60000` |
| `ANTHROPIC_TIMEOUT` | Request timeout for Anthropic API calls (ms) | `60000` |
| `GITHUB_TIMEOUT`    | Request timeout for GitHub API calls (ms)    | `30000` |

## Debug

| Variable     | Description            | Default |
| ------------ | ---------------------- | ------- |
| `DEBUG_MODE` | Enable debug output    | `false` |
| `VERBOSE`    | Enable verbose logging | `false` |
