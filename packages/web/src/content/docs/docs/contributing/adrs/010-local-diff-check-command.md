---
title: 'ADR-010: Local diff check command'
description: New check pipeline for pre-push drift detection on local git diffs, with shared pipeline extraction.
---

**Status:** Accepted
**Date:** 2026-03-07
**Authors:** Anders Hassis

## Context

The `analyze` command works on pull requests that already exist on a platform. This means drift is only detected after code is pushed and a PR is opened. Developers have no way to catch architectural violations before pushing.

The `analyze` pipeline also contained all analysis logic in a single file. Adding a second pipeline that shares the same analysis stages (model loading, component lookup, drift analysis) would duplicate significant code.

## Decision

Add an `erode check` command that runs drift analysis on local git diffs. The command:

1. Generates a diff between the current branch and a base branch (default: `main`) using `git-diff.ts`.
2. Loads the architecture model from a local path.
3. Runs the same three-stage analysis pipeline as `analyze`.

Extract shared pipeline logic from `analyze.ts` into `pipeline-shared.ts`. This shared module provides: `loadArchitectureModel`, `buildArchitecturalContext`, `findComponentsForRepo`, `selectComponentWithAI`, `runDriftStage`, `resolveAndCloneModel`, and `buildEmptyResult`.

Both `analyze` and `check` import from `pipeline-shared.ts` and add only their pipeline-specific orchestration.

## Rationale

Pre-push detection catches drift earlier in the development cycle, before a PR exists. This reduces review friction and avoids "fix drift" follow-up commits.

Extracting shared logic into `pipeline-shared.ts` follows the DRY principle. Both pipelines use identical analysis stages. The extraction makes it clear which parts are shared (model loading, drift analysis) and which are pipeline-specific (PR fetching vs. git diff generation).

## Consequences

### Positive

- Developers catch drift before pushing, reducing review cycles.
- The `check` command works offline (no platform API calls) once the model is available locally.
- Shared pipeline logic is maintained in one place. Bug fixes to analysis stages apply to both commands.
- The `check` command integrates naturally as a pre-push git hook or Claude Code skill.

### Negative

- Local diffs may differ from the final PR diff (due to rebasing, squashing, or additional commits). `check` results are advisory, not authoritative.
- `pipeline-shared.ts` becomes a coordination point. Changes to shared functions require testing both pipelines.
- The `check` command requires the architecture model to be available locally, which may need cloning from a remote repository.

## Related commits

- `712a642` - feat: add erode check command, npm publishing, and Claude Code skill (#39)
