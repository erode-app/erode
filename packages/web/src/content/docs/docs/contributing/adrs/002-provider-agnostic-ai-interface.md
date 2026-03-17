---
title: 'ADR-002: Provider-agnostic AI interface'
description: AIProvider interface with BaseProvider abstract class and factory pattern for multi-provider support.
---

**Status:** Accepted\
**Date:** 2026-02-26\
**Authors:** Anders Hassis

## Context

Erode needs AI capabilities for dependency extraction, component selection, and drift analysis. Different teams prefer different AI providers (Gemini, Anthropic, OpenAI) based on cost, availability, or organizational requirements.

Coupling the analysis pipeline directly to a single provider's SDK would force all users onto that provider. Supporting multiple providers without an abstraction would duplicate prompt building, retry logic, JSON extraction, and response validation across each implementation.

## Decision

Define an `AIProvider` interface with methods matching the pipeline stages: `selectComponent`, `extractDependencies`, `analyzeDrift`, and `patchModel`. Implement a `BaseProvider` abstract class that contains all shared logic (prompt building via `PromptBuilder`, retry with `withRetry`, JSON extraction, Zod validation). Concrete providers (`GeminiProvider`, `AnthropicProvider`, `OpenAIProvider`) only implement `callModel()`, the single method that makes the SDK-specific API call.

A `ProviderFactory` creates the correct provider based on the `AI_PROVIDER` configuration value.

## Rationale

The `BaseProvider` pattern minimizes duplication. Each new provider only needs to implement one method. All shared concerns (retries, validation, error wrapping) stay in one place.

The factory pattern keeps provider selection out of the pipeline code. The pipeline calls `AIProvider` methods without knowing which SDK runs underneath.

## Consequences

### Positive

- Adding a new AI provider requires implementing one method (`callModel`) plus a model constants file.
- Prompt building, retry logic, and response validation are consistent across all providers.
- Users switch providers with a single configuration change.

### Negative

- The `callModel` abstraction assumes all providers accept a text prompt and return text. Providers with fundamentally different interaction models (streaming, tool use) would need interface changes.
- `BaseProvider` becomes a shared dependency. Changes to shared logic affect all providers simultaneously.

## Related commits

- `8691ba8` - chore(release): release 0.4.0 (#24)
