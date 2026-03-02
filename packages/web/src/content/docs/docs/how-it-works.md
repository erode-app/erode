---
title: How It Works
description: Understand the multi-stage AI pipeline that powers Erode.
head:
  - tag: script
    attrs:
      src: /architecture/likec4-views.js
---

Erode uses a multi-stage AI pipeline to analyze pull requests for architecture drift. Cheaper, faster models handle extraction and routing, while stronger models handle the analysis.

<div class="likec4-embed">
<likec4-view view-id="pipeline-overview" browser="true"></likec4-view>
</div>

> [Open full interactive viewer →](/architecture/#/view/pipeline-overview/)

## File filtering

Before any AI stage runs, Erode filters the PR diff to remove files that are irrelevant to architecture analysis. Tests, documentation, lock files, build config, CI config, and build output are all stripped out automatically. This reduces noise and saves API usage.

The built-in skip patterns cover:

- **Tests** — `*.test.ts`, `*.spec.js`, `__tests__/`, etc.
- **Documentation** — `*.md`, `docs/`, `README`, `CHANGELOG`
- **Config & tooling** — `.vscode/`, `.prettierrc`, `tsconfig.json`, `vite.config.*`
- **Lock files** — `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
- **Build output** — `dist/`, `build/`, `.next/`, `coverage/`
- **CI/CD** — `.github/`, `.gitlab-ci.yml`, `.circleci/`

To analyze all files regardless of these patterns, set `skip-file-filtering: 'true'` in the [GitHub Action](/docs/ci/github-actions/) or pass `--skip-file-filtering` on the CLI.

## Stage 1 -- Resolve

When a repository maps to multiple components in the architecture model, Erode uses AI to determine which component is most relevant to the pull request. This stage uses a cheaper model (Haiku for Anthropic, Mini for OpenAI, Flash for Gemini) to keep costs low.

This stage is skipped entirely when the repository maps to a single component.

## Stage 2 -- Scan

The PR diff is fed to a fast model that extracts dependency changes and new integrations. The output is a structured list of added, removed, or modified dependencies found in the code changes.

This keeps the analysis stage focused on dependency changes rather than the full diff.

## Stage 3 -- Analyze

A stronger model (Sonnet for Anthropic, GPT-4.1 for OpenAI, Flash for Gemini) compares the extracted dependency changes against the declared architecture model and produces violation findings, each with:

- A **severity level** (high, medium, or low)
- A description of the drift
- **Suggestions** for resolving the violation

## Stage 4 -- Update

When `--patch-local` or `--open-pr` is passed, Erode generates a deterministic patch that inserts new relationship declarations into the architecture model file. A fast model assists with placement, with a deterministic fallback if DSL validation fails.

This stage is skipped when neither flag is set or when Stage 3 produces no relationship updates.

## Publish

After analysis, the pipeline publishes results: creating a PR with model updates (`--open-pr`), posting a comment on the source PR (`--comment`), or writing GitHub Actions outputs (`--github-actions`). See [Analysis Pipeline](/docs/reference/analysis-pipeline/) for details.

## Prompt templates

Each stage's behavior is defined by a markdown prompt template with `{{variable}}` substitution. These templates are maintained alongside the source code and are assembled at runtime by the prompt builder.

For a detailed stage-by-stage reference including inputs, outputs, and error handling, see [Analysis Pipeline](/docs/reference/analysis-pipeline/).
