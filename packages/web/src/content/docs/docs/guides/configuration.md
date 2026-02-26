---
title: Configuration
description: Environment variables for tuning the erode analysis engine.
---

erode is configured through environment variables. There are no configuration files.

For GitHub Actions-specific inputs (`model-repo`, `fail-on-violations`, etc.), see [GitHub Actions](/docs/ci/github-actions/).

## AI provider

| Variable            | Description                                  | Default  |
| ------------------- | -------------------------------------------- | -------- |
| `AI_PROVIDER`       | AI provider to use (`gemini` or `anthropic`) | `gemini` |
| `GEMINI_API_KEY`    | Google Gemini API key                        | —        |
| `ANTHROPIC_API_KEY` | Anthropic API key                            | —        |

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
| `GEMINI_FAST_MODEL`        | Gemini model for Stages 0–1 (extraction)    |
| `GEMINI_ADVANCED_MODEL`    | Gemini model for Stages 2–3 (analysis)      |
| `ANTHROPIC_FAST_MODEL`     | Anthropic model for Stages 0–1 (extraction) |
| `ANTHROPIC_ADVANCED_MODEL` | Anthropic model for Stages 2–3 (analysis)   |

See [AI Providers](/docs/reference/ai-providers/) for default model names and guidance on choosing a provider.

## GitHub

| Variable              | Description                             | Default             |
| --------------------- | --------------------------------------- | ------------------- |
| `GITHUB_TOKEN`        | GitHub token for API access             | —                   |
| `GITHUB_TIMEOUT`      | Request timeout for GitHub API (ms)     | `30000`             |
| `MODEL_REPO_PR_TOKEN` | Separate token for the model repository | Uses `GITHUB_TOKEN` |

## GitLab

| Variable          | Description                   | Default              |
| ----------------- | ----------------------------- | -------------------- |
| `GITLAB_TOKEN`    | GitLab token with `api` scope | —                    |
| `GITLAB_BASE_URL` | GitLab instance URL           | `https://gitlab.com` |

## Timeouts

| Variable            | Description                                  | Default |
| ------------------- | -------------------------------------------- | ------- |
| `GEMINI_TIMEOUT`    | Request timeout for Gemini API calls (ms)    | `60000` |
| `ANTHROPIC_TIMEOUT` | Request timeout for Anthropic API calls (ms) | `60000` |
| `GITHUB_TIMEOUT`    | Request timeout for GitHub API calls (ms)    | `30000` |

## Debug

| Variable     | Description            | Default |
| ------------ | ---------------------- | ------- |
| `DEBUG_MODE` | Enable debug output    | `false` |
| `VERBOSE`    | Enable verbose logging | `false` |
