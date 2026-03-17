---
title: 'ADR-006: Structured error hierarchy'
description: ErodeError base class with categorized error codes and specialized subclasses.
---

**Status:** Accepted\
**Date:** 2026-03-04\
**Authors:** Anders Hassis

## Context

Erode interacts with multiple external systems: AI provider APIs, version control platform APIs, file system operations, and architecture model parsers. Each can fail in different ways. Users need clear, actionable error messages. The CLI error handler needs to distinguish between recoverable failures (rate limits) and terminal ones (missing API key).

Generic `Error` objects do not carry enough context for either need.

## Decision

Implement a custom error hierarchy:

- **`ErodeError`** (base class). Carries an `ErrorCode` enum value, a user-facing message, a metadata context object, and a `recoverable` flag.
- **`ConfigurationError`**. For missing or invalid configuration. Always non-recoverable.
- **`ApiError`**. For AI provider HTTP failures. Auto-classifies responses using `classifyHttpError()` to detect rate limiting (429), timeouts (408), and Anthropic-specific acceleration limits. Rate-limited and timed-out errors are marked recoverable.
- **`AdapterError`**. For architecture model loading and querying failures. Carries the adapter type and optional suggestions.

`ErrorCode` uses categorized prefixes: `CONFIG_*`, `AUTH_*`, `IO_*`, `NET_*`, `PROVIDER_*`, `PLATFORM_*`, `MODEL_*`, `INPUT_*`, `INTERNAL_*`.

## Rationale

Categorized error codes let the CLI error handler format messages differently per category without inspecting error messages. The `recoverable` flag drives retry logic in the pipeline. `ApiError`'s HTTP classification means provider-specific retry decisions live in the error class, not scattered across provider implementations.

Static factory methods (`fromAnthropicError`, `fromGeminiError`, `fromOpenAIError`, `fromLikeC4Error`, `fromStructurizrError`) standardize error wrapping at system boundaries.

## Consequences

### Positive

- Error handling code can branch on `ErrorCode` instead of parsing messages.
- The `recoverable` flag centralizes retry decisions.
- `ApiError` detects rate limits and acceleration limits automatically, providing specific user guidance.
- Context metadata aids debugging without exposing internals to users.

### Negative

- New error scenarios require adding to the `ErrorCode` enum, which touches the central `errors.ts` file.
- The hierarchy is three levels deep. Adding another subclass level would increase complexity.

## Related commits

- `8691ba8` - chore(release): release 0.4.0 (#24)
