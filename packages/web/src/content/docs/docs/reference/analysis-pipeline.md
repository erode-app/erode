---
title: Analysis Pipeline
description: Detailed stage-by-stage reference for Erode's analysis pipeline.
head:
  - tag: script
    attrs:
      src: /architecture/likec4-views.js
---

<div class="likec4-embed">
<likec4-view view-id="pipeline" browser="true" dynamic-variant="sequence"></likec4-view>
</div>

> [Open full interactive viewer →](/architecture/#/view/pipeline/)

## Stage 1 -- Component resolution

|                |                                                                           |
| -------------- | ------------------------------------------------------------------------- |
| **Model tier** | Fast                                                                      |
| **Input**      | Repository metadata, architecture model with multiple matching components |
| **Output**     | Selected component ID                                                     |

When a repository maps to multiple components in the architecture model, this stage uses AI to determine which component is most relevant to the current pull request. The fast model evaluates the repo context against each candidate component and selects the best match.

This stage is **skipped entirely** when only one component matches the repository.

## Stage 2 -- Dependency scan

|                |                                                              |
| -------------- | ------------------------------------------------------------ |
| **Model tier** | Fast                                                         |
| **Input**      | PR diff, selected component context                          |
| **Output**     | Structured list of added, removed, and modified dependencies |

The PR diff is analyzed to extract dependency changes. The fast model identifies new integrations, removed connections, and modified interactions between components. The output is a structured dependency list that serves as input to the analysis stage.

This keeps the analysis stage focused on dependency changes rather than the full diff.

## Stage 3 -- PR analysis

|                |                                                                          |
| -------------- | ------------------------------------------------------------------------ |
| **Model tier** | Advanced                                                                 |
| **Input**      | Dependency list from Stage 2, full architecture model, component context |
| **Output**     | Violation findings with severity, suggestions, and summary               |

The advanced model compares the extracted dependency changes against the full declared architecture. For each undeclared or violating dependency, it produces a finding with:

- **Severity**: `HIGH`, `MEDIUM`, or `LOW`
- **Description**: What the violation is and why it matters
- **Suggestion**: How to resolve the drift (update the model, refactor the code, or accept the change)
- **Summary**: An overall assessment of the PR's architectural impact

## Stage 4 -- Model update

|                |                                                                   |
| -------------- | ----------------------------------------------------------------- |
| **Model tier** | Fast (deterministic fallback)                                     |
| **Input**      | Structured relationships from Stage 3, current architecture model |
| **Output**     | Patched model file with new relationship declarations             |

When `--patch-local` or `--open-pr` is passed and Stage 3 produces structured relationship data, the pipeline generates a deterministic patch. New relationship lines are inserted into the correct location in the DSL file. A fast model call assists with placement, with a deterministic fallback if validation fails.

This stage is **skipped** when neither `--patch-local` nor `--open-pr` is set, or when Stage 3 produces no relationship updates.

## Prompt templates

Each stage loads a markdown prompt template from `src/analysis/prompts/` at runtime. Templates use `{{variable}}` substitution to inject context such as the PR diff, component metadata, and architecture model content. The prompt builder assembles the final prompt from these templates before sending it to the AI provider.

## Error handling

API errors are detected automatically across all stages. The pipeline handles:

- **Rate limiting**: Detected from provider response headers and status codes. Reported with retry guidance.
- **Timeouts**: Controlled by `GEMINI_TIMEOUT`, `OPENAI_TIMEOUT`, and `ANTHROPIC_TIMEOUT` environment variables.
- **Acceleration limits**: Provider-specific quota errors are identified and reported with context.

All errors are wrapped in structured error types that carry an error code, a user-facing message, and metadata about the failed request.
