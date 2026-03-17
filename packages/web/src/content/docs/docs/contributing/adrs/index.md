---
title: Architecture decision records
description: Index of architectural decisions made in the Erode project.
---

This project tracks significant architectural decisions as ADRs. Each record captures the context, the decision, the reasoning, and the trade-offs.

## Records

| ADR                                                                     | Decision                            | Date       | Status   |
| ----------------------------------------------------------------------- | ----------------------------------- | ---------- | -------- |
| [001](/docs/contributing/adrs/001-multi-stage-analysis-pipeline/)       | Multi-stage AI analysis pipeline    | 2026-02-24 | Accepted |
| [002](/docs/contributing/adrs/002-provider-agnostic-ai-interface/)      | Provider-agnostic AI interface      | 2026-02-26 | Accepted |
| [003](/docs/contributing/adrs/003-architecture-model-adapter-system/)   | Architecture model adapter system   | 2026-02-27 | Accepted |
| [004](/docs/contributing/adrs/004-template-based-prompt-system/)        | Template-based prompt system        | 2026-02-24 | Accepted |
| [005](/docs/contributing/adrs/005-layered-configuration-with-zod/)      | Layered configuration with Zod      | 2026-02-25 | Accepted |
| [006](/docs/contributing/adrs/006-structured-error-hierarchy/)          | Structured error hierarchy          | 2026-02-27 | Accepted |
| [007](/docs/contributing/adrs/007-multi-platform-vcs-abstraction/)      | Multi-platform VCS abstraction      | 2026-02-26 | Accepted |
| [008](/docs/contributing/adrs/008-monorepo-workspace-structure/)        | Monorepo workspace structure        | 2026-02-25 | Accepted |
| [009](/docs/contributing/adrs/009-docker-and-github-action-deployment/) | Docker and GitHub Action deployment | 2026-02-24 | Accepted |
| [010](/docs/contributing/adrs/010-local-diff-check-command/)            | Local diff check command            | 2026-03-07 | Accepted |

## Adding a new ADR

1. Find the next number by checking the table above.
2. Create a new file in this directory: `NNN-kebab-case-title.md`.
3. Use the [Michael Nygard format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) with sections for Context, Decision, Rationale, and Consequences.
4. Add the record to the table above.
