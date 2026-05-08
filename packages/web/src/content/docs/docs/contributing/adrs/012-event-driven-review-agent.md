---
title: 'ADR-012: Event-driven review agent'
description: Bounded webhook-triggered agent runtime that reuses the core analysis pipeline.
---

**Status:** Accepted\
**Date:** 2026-05-08\
**Authors:** Anders Hassis

## Context

Erode already runs as a CLI and CI action. Users can add it to workflows, but CI still requires explicit pipeline setup in each repository. A hosted or self-hosted agent can make architecture review automatic by reacting to pull request events and publishing findings without requiring every repository to wire the action manually.

The existing analysis engine is intentionally deterministic: it loads a model, fetches a change request diff, runs the staged AI pipeline, and publishes structured findings. Replacing that with a general autonomous coding agent would increase permissions, reduce predictability, and blur the boundary between architecture review and source-code modification.

## Decision

Introduce a separate `packages/agent` workspace package for an event-driven review agent. The agent receives pull request events, validates and normalizes them, applies agent configuration, and invokes the existing `runAnalyze()` pipeline from `@erode-app/core`.

The agent is bounded:

- It reacts to explicit change request events.
- It follows a fixed review workflow.
- It publishes one managed analysis comment.
- It can optionally open or update a draft architecture-model PR.
- It does not modify source pull request branches or perform unrelated repository work.

GitHub is the first supported event source because GitHub App webhooks and installation tokens provide the clearest distribution path. The core VCS abstraction remains the boundary for reading and writing change request data.

## Rationale

Keeping the agent outside `packages/core` preserves the existing separation between analysis engine and runtime surfaces. Core remains reusable by the CLI, CI action, and the new agent. The agent package owns webhook handling, auth, event normalization, and orchestration decisions.

A bounded workflow keeps the security and product behavior understandable. The agent automates when Erode runs and where results are published; it does not replace the staged analysis pipeline or become a general-purpose coding assistant.

## Consequences

### Positive

- Repositories can get automatic architecture review without custom CI wiring.
- Core pipeline behavior remains shared across CLI, CI, and agent runtimes.
- Agent permissions can stay narrow and auditable.
- GitHub-first event handling can be added without changing provider or adapter interfaces.

### Negative

- A new package adds another runtime surface to build, test, and release.
- GitHub App auth introduces operational setup beyond the existing action.
- GitLab and Bitbucket agent support require separate event/auth adapters later.

## Related Commits

- Pending implementation commit.
