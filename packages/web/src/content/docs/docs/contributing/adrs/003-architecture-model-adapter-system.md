---
title: 'ADR-003: Architecture model adapter system'
description: ArchitectureModelAdapter interface supporting LikeC4 and Structurizr model formats.
---

**Status:** Accepted\
**Date:** 2026-03-04\
**Authors:** Anders Hassis

## Context

Architecture models can be written in different formats. LikeC4 uses a custom DSL (`.c4` files). Structurizr uses its own workspace format. Teams choose based on existing tooling, team preferences, or ecosystem compatibility.

Erode needs to load, query, and patch architecture models regardless of format. Hardcoding support for a single format would limit adoption.

## Decision

Define an `ArchitectureModelAdapter` interface that covers all operations the pipeline needs: loading a model from a path, finding components by repository URL or ID, querying dependencies and dependents, checking if a dependency is declared, and listing relationships. Each adapter carries `AdapterMetadata` with format-specific display information and help text.

Two implementations exist: `LikeC4Adapter` and `StructurizrAdapter`. An `AdapterFactory` creates the correct one based on configuration.

## Rationale

The adapter pattern decouples the pipeline from model format details. Adding a new format means implementing the interface without changing pipeline code.

`AdapterMetadata` lets each adapter provide format-specific user-facing messages (like "no component found" help text) without the pipeline knowing format details.

## Consequences

### Positive

- New architecture model formats can be added by implementing the interface.
- Pipeline code stays format-agnostic.
- Each adapter owns its parsing, querying, and error handling logic.

### Negative

- The interface must cover the superset of all format capabilities. Format-specific features that do not fit the interface require workarounds or optional methods.
- The `checkVersion` method is optional, creating inconsistency in version checking across adapters.

## Related commits

- `8691ba8` - chore(release): release 0.4.0 (#24)
