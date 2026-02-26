---
title: CLI Usage
description: Run erode from the command line.
---

erode provides four commands for working with architecture models and analyzing change requests.

## Installation

erode is not yet published as an npm package. Clone the repository and build from source:

```bash
git clone https://github.com/erode-app/core.git
cd core
npm install && npm run build
```

The built CLI is at `packages/cli/dist/cli.js`. Run it with Node.js:

```bash
node packages/cli/dist/cli.js --help
```

## Interactive mode

When run without arguments in an interactive terminal, erode starts an Ink-based wizard that guides you through command selection and option entry.

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
| `--generate-model`      | Generate architecture model code from the analysis                    |           |
| `--open-pr`             | Create a PR with suggested model updates                              |           |
| `--dry-run`             | Preview without creating a PR                                         |           |
| `--draft`               | Create change request as draft                                        | `true`    |
| `--output-file <path>`  | Write structured JSON output to a file                                |           |
| `--skip-file-filtering` | Analyze all changed files (skip pattern-based filtering)              |           |
| `--comment`             | Post analysis results as a PR/MR comment                              |           |
| `--github-actions`      | Write GitHub Actions outputs and step summary                         |           |
| `--fail-on-violations`  | Exit with code 1 when violations are found                            |           |

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
