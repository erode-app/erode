---
title: Known Limitations
description: Current limitations and caveats of Erode's architecture drift analysis.
---

## Monorepo multi-component analysis

When a repository maps to multiple architectural components (common in monorepos), Erode selects a single primary component in [Stage 1](/docs/reference/analysis-pipeline/#stage-1----component-resolution) and runs dependency extraction from that component's perspective.

This means cross-component dependencies can be under-detected when a pull request touches files belonging to several components at once. For example, if `api_gateway` is the selected component and the PR also modifies `order_service`, outbound calls from `api_gateway` route handlers to `order_service` endpoints may be classified as internal API changes rather than external dependencies.

**Mitigation:** Stage 2 receives file ownership context that maps changed files to their respective components. This helps the AI distinguish between internal changes and cross-component calls within the same repository.

**Future work:** Per-component dependency extraction (running Stage 2 once per affected component with a scoped diff) would provide full coverage but increases cost linearly with the number of affected components.

## Single architecture model format per run

Each `analyze` or `check` invocation works with a single model format — either [LikeC4](/docs/models/likec4/) or [Structurizr](/docs/models/structurizr/). You cannot mix formats within a single analysis run.

## AI model variability

Results may vary between AI providers and between runs due to LLM non-determinism. The same diff analyzed twice may produce slightly different dependency extractions or violation severities. Structured output schemas and prompt engineering reduce this variance, but it cannot be eliminated entirely.

## Convention-based file mapping

The file-to-component mapping in monorepos relies on matching directory names to component IDs and names. Standard naming conventions (underscore, hyphen, and collapsed forms) are supported, but repositories with non-standard layouts may see reduced mapping accuracy. Explicit path mapping configuration is planned for a future release.
