---
title: 'ADR-012: LikeC4 model edits via diff blocks'
description: An opt-in LikeC4 patch strategy that lets LikeC4 place and validate suggested model changes.
---

**Status:** Proposed\
**Date:** 2026-11-17\
**Authors:** Anders Hassis

## Context

When Erode finds undeclared dependencies or new components, it generates DSL for them and patches the model file. Both adapters (see [ADR-003](/docs/contributing/adrs/003-architecture-model-adapter-system/)) share `BasePatcher`. It picks a target file by heuristics, asks the fast model to insert the lines, falls back to inserting them before the closing brace of the `model` block, and validates the result by loading a temp copy of the workspace.

Text patching does not know the model's structure. It cannot nest a new element under its parent, it can choose the wrong file in multi-file workspaces, and the LLM step can reorder or drop content that validation does not catch.

LikeC4 1.61 adds model diffs: a `diff` block lists planned `add` and `remove` changes, and `modelEdits.preview({ type: 'apply-diff', ... })` on a `LikeC4` instance returns the text of each changed document after the diff is merged into the model. Preview does not write files. A probe against LikeC4 1.61.0 confirmed that relationships are inserted as plain DSL inside the `model` block, `extend parent { ... }` places a new element inside its parent definition, and the file with the diff comes back with an empty `after` (delete).

## Decision

Add an opt-in LikeC4-only patch strategy, `adapter.likec4.patchStrategy: 'model-edits'` (env `ERODE_LIKEC4_PATCH_STRATEGY`). The default stays `text`.

With `model-edits`, the LikeC4 patcher:

1. Builds a `diff` block with a random id (`erode_<hex>`) from the new components and relationship lines. Dotted component IDs become `extend <parent> { <leaf> = ... }`.
2. Writes the block as a new file into the temp workspace copy, loads it with the LikeC4 SDK, and checks that `modelEdits.preview` exists.
3. Calls `preview` with `action: 'apply'`, drops the proposal file from the result, and uses the single remaining document's `after` as the patched content. The file path is mapped back from the temp copy to the original workspace.
4. Validates the patched content with the existing DSL validator, then runs post-patch formatting as before. As with text patching, a skipped validation (validator unavailable) is accepted and flagged as `validationSkipped`.

Any failure falls back to text patching: missing API, diff errors, overlaps with other diffs, more than one changed model file, a model file emptied, or failed validation.

The user's repository receives plain DSL. No `diff` syntax reaches the patch, so the user's own LikeC4 version does not need 1.61. Structurizr keeps text patching.

## Rationale

LikeC4 owns the grammar, the scoping rules, and the formatter. Letting it place the change avoids reimplementing parts of the language in Erode. The diff block is a small, stable surface: it has the syntax of a `model` block, which Erode already generates.

Alternatives considered:

- **Text patching only (status quo).** Simple and format-agnostic, but blind to structure. It stays as the default and the fallback.
- **`toDSL()` / `writeDSL()` round-trip.** Regenerates whole files from the parsed model. Lossy: comments, ordering, and formatting choices in the user's files change, which makes the model PR noisy and hard to review.
- **Editing the Langium AST through LikeC4 internals.** Precise, but depends on unexported APIs that can change in any minor release.

## Consequences

### Positive

- New elements land inside their parent definition instead of as invalid dotted definitions at the top level.
- LikeC4 rejects diffs that reference unknown elements before Erode writes anything.
- Model PRs contain only the added lines, in LikeC4's own placement.

### Negative

- Erode's bundled LikeC4 must be 1.61 or later. Older SDKs fall back to text patching.
- Each patch loads the workspace up to three times: for preview, for validation, and for formatting when `formatAfterPatch` is on.
- The strategy is LikeC4-only, so the two adapters behave differently when patching.

### Risks

- **Multi-file output.** A diff can change several files, but `PatchResult` holds one file. The spike falls back to text when more than one model file changes. Supporting this needs a multi-file `PatchResult` and changes to the PR writers.
- **Empty `after` means delete.** The proposal file is expected to come back empty. Any other document with an empty `after` is treated as a failure, never as a deletion.
- **Overlaps.** If the user's workspace has diffs that touch the same elements, preview reports overlaps. Erode never passes `acceptOverlaps`; it falls back to text.
- **Spike scope.** Preview runs without a `projectId`, so multi-project workspaces likely fall back. `excludePaths` is not applied to the temp copy. `insertedLines` for new components still holds the text-strategy lines, which can differ from the nested DSL in the patch.
- **API stability.** `modelEdits` and `modelDiffs` are new in 1.61. The preview result is validated with a Zod schema so a shape change falls back instead of producing a broken patch.

## Amendments

- **2026-11-17:** `model-edits` is now the default `patchStrategy`; `text` stays selectable and remains the fallback whenever model edits return no patch. The text path relies on line heuristics that failed on real models: it wrote dotted IDs such as `a.b.c = service` (invalid DSL, so the relationships in the same patch were dropped too), took `extend x.datamodel {` for the `model` block, and counted braces inside strings and comments. Model edits let LikeC4 place the change instead. The text path was fixed as well: dotted IDs become `extend <parent> { <leaf> = ... }`, sharing the helper that builds the diff block, and a shared scanner skips strings (`'...'`, `"..."`, `'''...'''`) and comments when finding the `model` block and its closing brace. Structurizr uses the same scanner with double quotes only and `#` comment lines. The `insertedLines` risk above still holds in a narrower form: the text-path lines are now valid `extend` DSL, but under `model-edits` they can differ from where LikeC4 placed the element.

## Related commits

- `build(deps): bump likec4 from 1.59.3 to 1.61.0`
- `feat(core): add opt-in LikeC4 model-edits patch strategy`
