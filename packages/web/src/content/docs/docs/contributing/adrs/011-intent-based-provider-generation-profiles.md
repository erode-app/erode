---
title: 'ADR-011: Intent-based provider generation profiles'
description: Shared analysis stages describe generation intent, and providers translate that intent into request budgets.
---

**Status:** Accepted\
**Date:** 2026-05-05\
**Authors:** Anders Hassis

## Context

Erode runs the same analysis stages across Gemini, Anthropic, and OpenAI. The shared
provider flow used raw token counts when it called each model. That made stage code
carry provider-specific budget details.

OpenAI's Responses API names the limit `max_output_tokens`, and reasoning models can
spend part of that budget before producing visible output. Anthropic and Gemini expose
different request parameters and have different response behavior. The shared pipeline
needs to describe what it wants, not how each provider should size the request.

## Decision

Introduce a provider-agnostic generation profile for model calls. A profile describes
the expected output size and reasoning effort. `BaseProvider` maps each analysis phase
to a default profile, and concrete providers translate the profile into SDK-specific
request parameters.

Keep model tier selection unchanged. Component resolution, dependency scanning, and
model patching use the fast model. Drift analysis uses the advanced model.

## Rationale

The analysis stages know the shape of the work. Providers know their API parameters and
model behavior. Keeping those concerns separate makes it easier to tune OpenAI,
Anthropic, and Gemini independently without changing the shared pipeline.

The profile also makes cost intent visible. Simple extraction work stays on cheaper
models with small outputs and low reasoning effort. Drift analysis keeps the stronger
model, but still defaults to low reasoning effort to keep feedback fast. Model updates
use medium reasoning because they generate a concrete patch.

## Consequences

### Positive

- Provider-specific token parameters stay inside provider implementations.
- OpenAI can use `max_output_tokens` and reasoning effort without leaking those names
  into shared analysis code.
- Cost-aware model tier selection remains explicit in `BaseProvider`.

### Negative

- Output profile names become a shared contract that providers must translate.
- Dynamic output hints can still affect provider cost, latency, quota usage, or model
  output caps.

## Related commits

- `9289f90` - refactor openai provider with new api
