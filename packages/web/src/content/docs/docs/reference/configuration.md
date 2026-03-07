---
title: Configuration
description: Environment variables for tuning the Erode analysis engine.
---

Erode is configured through environment variables or a `.eroderc.json` configuration file. For GitHub Actions-specific inputs (`model-repo`, `fail-on-violations`, etc.), see [GitHub Actions](/docs/integrations/github-actions/).

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
  "$schema": "https://erode.dev/schemas/v0/eroderc.schema.json",
  "ai": { "provider": "gemini" }
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
| `ERODE_MODEL_PATH`         | `adapter.modelPath`           |
| `ERODE_MODEL_REPO`         | `adapter.modelRepo`           |
| `ERODE_MODEL_REF`          | `adapter.modelRef`            |

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
| `ERODE_MODEL_PATH`           | Path to the architecture model directory                | —        |
| `ERODE_MODEL_REPO`           | Repository URL or owner/repo containing the model       | —        |
| `ERODE_MODEL_REF`            | Branch or tag to clone from the model repository        | `main`   |
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

## Platform tokens

| Variable                    | Description                             | Default                         |
| --------------------------- | --------------------------------------- | ------------------------------- |
| `ERODE_GITHUB_TOKEN`        | GitHub token for API access             | —                               |
| `ERODE_MODEL_REPO_PR_TOKEN` | Separate token for the model repository | Uses `ERODE_GITHUB_TOKEN`       |
| `ERODE_GITLAB_TOKEN`        | GitLab token with `api` scope           | —                               |
| `ERODE_GITLAB_BASE_URL`     | GitLab instance URL                     | `https://gitlab.com`            |
| `ERODE_BITBUCKET_TOKEN`     | Bitbucket app password or token         | —                               |
| `ERODE_BITBUCKET_BASE_URL`  | Bitbucket API base URL                  | `https://api.bitbucket.org/2.0` |

See [Authentication](/docs/reference/authentication/) for required permissions, token types, and platform-specific setup.

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

- [CLI Commands](/docs/reference/cli-commands/) — run Erode locally against any pull request
- [Authentication](/docs/reference/authentication/) — token permissions for GitHub, GitLab, and Bitbucket
- [AI Providers](/docs/reference/ai-providers/) — supported providers, default models, and overrides
- [Analysis pipeline](/docs/reference/analysis-pipeline/) — stage-by-stage reference for the analysis engine
