---
title: CLI Usage
description: Run Erode from the command line.
---

Erode provides four commands for working with architecture models and analyzing change requests.

## Installation

Erode is not yet published as an npm package. Clone the repository and build from source:

```bash
git clone https://github.com/erode-app/erode.git
cd core
npm install && npm run build
```

The built CLI is at `packages/cli/dist/cli.js`. Run it with Node.js:

```bash
node packages/cli/dist/cli.js --help
```

## Interactive mode

When run without arguments in an interactive terminal, Erode starts an Ink-based wizard that guides you through command selection and option entry.

## Commands

### `analyze <model-path>`

Analyze a change request for architecture drift.

```bash
erode analyze ./model --url https://github.com/org/repo/pull/42
erode analyze ./model --url https://gitlab.com/group/project/-/merge_requests/42
erode analyze ./model --url https://bitbucket.org/workspace/repo/pull-requests/42
```

| Flag                    | Description                                                           | Default   |
| ----------------------- | --------------------------------------------------------------------- | --------- |
| `--url <url>`           | Change request URL (GitHub PR, GitLab MR, or Bitbucket PR). Required. |           |
| `--model-format <fmt>`  | Architecture model format                                             | `likec4`  |
| `--format <fmt>`        | Output format: `console`, `json`                                      | `console` |
| `--open-pr`             | Create a PR with model updates (see below)                            |           |
| `--patch`               | Patch the architecture model in-place (see below)                     |           |
| `--dry-run`             | Preview without creating a PR or writing patches                      |           |
| `--draft`               | Create change request as draft                                        | `true`    |
| `--output-file <path>`  | Write structured JSON output to a file                                |           |
| `--skip-file-filtering` | Analyze all changed files (skip pattern-based filtering)              |           |
| `--comment`             | Post analysis results as a PR/MR comment                              |           |
| `--github-actions`      | Write GitHub Actions outputs and step summary                         |           |
| `--fail-on-violations`  | Exit with code 1 when violations are found                            |           |

#### `--patch` behavior

`--patch` runs Stage 4 (Model Patching) and writes the patched model file in-place. Combine with `--dry-run` to preview the patch without writing.

#### `--open-pr` behavior

`--open-pr` implies `--patch`. After generating the patch (Stage 4), it creates a pull request against the model repository with the updated relationship declarations.

- PRs are created as drafts by default (GitHub/GitLab). Bitbucket has no draft support.
- The PR body includes a link to the source analysis PR for traceability.
- If a subsequent analysis finds no violations, any existing model PR for that source PR is automatically closed.

:::note
Relationship removals are informational only. The PR body lists relationships that may need removal, but the reviewer must remove them manually.
:::

### `components <model-path>`

List components from an architecture model.

```bash
erode components ./model
erode components ./model --format json
```

| Flag                   | Description                            | Default  |
| ---------------------- | -------------------------------------- | -------- |
| `--model-format <fmt>` | Architecture model format              | `likec4` |
| `--format <fmt>`       | Output format: `table`, `json`, `yaml` | `table`  |

### `connections <model-path>`

Show component connections from an architecture model.

```bash
erode connections ./model --repo https://github.com/org/repo
erode connections ./model --repo https://gitlab.com/group/project
```

| Flag                   | Description                      | Default   |
| ---------------------- | -------------------------------- | --------- |
| `--repo <url>`         | Repository URL. Required.        |           |
| `--model-format <fmt>` | Architecture model format        | `likec4`  |
| `--output <fmt>`       | Output format: `console`, `json` | `console` |

### `validate <model-path>`

Check that all components in an architecture model have repository links.

```bash
erode validate ./model
erode validate ./model --format json
```

| Flag                   | Description                    | Default  |
| ---------------------- | ------------------------------ | -------- |
| `--model-format <fmt>` | Architecture model format      | `likec4` |
| `--format <fmt>`       | Output format: `table`, `json` | `table`  |

Exits with code 1 if any components are missing repository links.

## Environment variables

Set these before running any command:

| Variable                                                   | Description                                                                                                                   |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN`                                             | Required for GitHub PRs. See [Configuration](/docs/guides/configuration/#github) for required permissions.                    |
| `GITLAB_TOKEN`                                             | Required for GitLab MRs. Requires `api` scope.                                                                                |
| `BITBUCKET_TOKEN`                                          | Required for Bitbucket PRs. See [Configuration](/docs/guides/configuration/#bitbucket-experimental) for required permissions. |
| `GEMINI_API_KEY`, `OPENAI_API_KEY`, or `ANTHROPIC_API_KEY` | API key for your chosen AI provider.                                                                                          |
| `AI_PROVIDER`                                              | `gemini` (default), `openai`, or `anthropic`.                                                                                 |

See [Configuration](/docs/guides/configuration/) for the full list of environment variables including diff limits, timeouts, and model overrides.

## Example

```bash
export GITHUB_TOKEN="ghp_..."
export GEMINI_API_KEY="AIza..."

node packages/cli/dist/cli.js analyze ./architecture \
  --url https://github.com/acme/backend/pull/42 \
  --comment \
  --fail-on-violations
```

## What's next

- [Configuration](/docs/guides/configuration/) — environment variables for tuning diff limits, timeouts, and model overrides
- [CI Integration](/docs/ci/) — run Erode automatically on every pull request
- [AI Providers](/docs/reference/ai-providers/) — supported providers and model selection
