---
title: 'ADR-001: Multi-stage AI analysis pipeline'
description: Three-stage pipeline using cheaper models for extraction and stronger models for drift analysis.
---

**Status:** Accepted
**Date:** 2026-03-04
**Authors:** Anders Hassis

## Context

Erode analyzes pull requests for architectural drift by comparing code changes against a declared architecture model. This requires multiple distinct AI tasks: identifying which component a repo maps to, extracting dependency changes from diffs, and evaluating those changes for violations.

Running all tasks on a single powerful model wastes money on simple extraction work. Running everything on a cheap model produces poor analysis quality. The system needs to balance cost and accuracy across different task complexities.

## Decision

Split the analysis into three sequential stages, each using the model tier appropriate to its complexity:

1. **Stage 1, Component Resolution** (FAST model). When a repository maps to multiple architecture components, AI selects the most relevant one based on changed files.
2. **Stage 2, Dependency Scan** (FAST model). AI extracts dependency changes from the git diff, producing structured JSON.
3. **Stage 3, Drift Analysis** (ADVANCED model). AI evaluates the extracted changes against the declared architecture model and reports violations.

FAST models (Haiku, Flash, GPT-4-mini) handle extraction. ADVANCED models (Sonnet, Pro, GPT-4) handle reasoning.

## Rationale

Extraction tasks (stages 1 and 2) are well-defined, low-ambiguity problems. Cheap, fast models handle them accurately. Drift analysis (stage 3) requires nuanced reasoning about architectural intent, which benefits from stronger models.

This split keeps per-analysis costs low while preserving analysis quality where it matters. Each stage produces validated output (via Zod schemas) before the next stage consumes it, making failures easy to diagnose.

## Consequences

### Positive

- Cost per analysis stays low because most tokens flow through cheap models.
- Analysis quality is high for the final drift judgment.
- Each stage is independently testable and debuggable.
- Users can override model choices per stage via configuration.

### Negative

- Three sequential API calls add latency compared to a single call.
- Stage boundaries create coupling between the output schema of one stage and the input expectations of the next.
- Adding a new stage requires updating both the pipeline orchestrator and the provider interface.

## Related commits

- `8691ba8` - chore(release): release 0.4.0 (#24)
