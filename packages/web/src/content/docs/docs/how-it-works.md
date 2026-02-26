---
title: How It Works
description: Understand the multi-stage AI pipeline that powers erode.
head:
  - tag: script
    attrs:
      src: /architecture/likec4-views.js
---

erode uses a multi-stage AI pipeline to analyze pull requests for architecture drift. The pipeline is designed to be cost-effective: cheaper, faster models handle extraction and routing, while stronger models perform the deeper architectural analysis.

<div class="likec4-embed">
<likec4-view view-id="pipeline-overview" browser="true"></likec4-view>
</div>

> [Open full interactive viewer →](/architecture/#/view/pipeline-overview/)

## File filtering

Before any AI stage runs, erode filters the PR diff to remove files that are irrelevant to architecture analysis. Tests, documentation, lock files, build config, CI config, and build output are all stripped out automatically. This reduces noise and saves API usage.

The built-in skip patterns cover:

- **Tests** — `*.test.ts`, `*.spec.js`, `__tests__/`, etc.
- **Documentation** — `*.md`, `docs/`, `README`, `CHANGELOG`
- **Config & tooling** — `.vscode/`, `.prettierrc`, `tsconfig.json`, `vite.config.*`
- **Lock files** — `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
- **Build output** — `dist/`, `build/`, `.next/`, `coverage/`
- **CI/CD** — `.github/`, `.gitlab-ci.yml`, `.circleci/`

To analyze all files regardless of these patterns, set `skip-file-filtering: 'true'` in the [GitHub Action](/docs/ci/github-actions/) or pass `--skip-file-filtering` on the CLI.

## Stage 0 -- Resolve

When a repository maps to multiple components in the LikeC4 model, erode uses AI to determine which component is most relevant to the pull request. This stage uses a cheaper model (Haiku for Anthropic, Flash for Gemini) to keep costs low.

This stage is skipped entirely when the repository maps to a single component.

## Stage 1 -- Scan

The PR diff is fed to a fast model that extracts dependency changes and new integrations. The output is a structured list of added, removed, or modified dependencies found in the code changes.

This extraction step isolates the dependency signal from the noise of a full diff, producing a clean input for the analysis stage.

## Stage 2 -- Analyze

This is the core of erode. A stronger model (Sonnet for Anthropic, Pro for Gemini) compares the extracted dependency changes against the declared architecture model. It produces violation findings, each with:

- A **severity level** (high, medium, or low)
- A description of the drift
- **Actionable suggestions** for resolving the violation

## Stage 3 -- Generate (optional)

When enabled, erode produces LikeC4 DSL updates that bring the architecture model back in sync with reality. This can be used to open a follow-up pull request that updates the model.

## Prompt templates

Each stage's behavior is defined by a markdown prompt template with `{{variable}}` substitution. These templates are maintained alongside the source code and are assembled at runtime by the prompt builder.

For a detailed stage-by-stage reference including inputs, outputs, and error handling, see [Analysis Pipeline](/docs/reference/analysis-pipeline/).
