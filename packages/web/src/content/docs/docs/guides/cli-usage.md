---
title: CLI Usage
description: Run erode from the command line.
---

erode can be run directly from the command line to analyze a pull request against your architecture model.

## Installation

```bash
npm install -g erode
```

## Usage

The main command is `erode analyze`:

```bash
erode analyze --pr <number> --repo <owner/repo>
```

### Required flags

| Flag | Description |
|------|-------------|
| `--pr` | The pull request number to analyze |
| `--repo` | The repository in `owner/repo` format |

### Optional flags

| Flag | Description | Default |
|------|-------------|---------|
| `--model-path` | Path to the LikeC4 model directory | Current directory |

## Environment variables

The following environment variables must be set before running erode:

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | A GitHub personal access token with read access to the repository and pull requests |
| `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` | API key for your chosen AI provider |

Optionally set `AI_PROVIDER` to `gemini` (default) or `anthropic` to select the AI provider.

## Example

```bash
export GITHUB_TOKEN="ghp_..."
export GEMINI_API_KEY="AIza..."

erode analyze --pr 42 --repo acme/backend --model-path ./architecture
```

## Output

erode prints analysis results to stdout, including any violations found, their severity, and suggestions. When running against a GitHub pull request, erode also posts a comment on the PR with the full analysis results.
