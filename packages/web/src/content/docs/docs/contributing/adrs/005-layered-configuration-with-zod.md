---
title: 'ADR-005: Layered configuration with Zod'
description: Three-layer config precedence with Zod schema validation and environment variable overrides.
---

**Status:** Accepted
**Date:** 2026-03-04
**Authors:** Anders Hassis

## Context

Erode needs configuration for AI provider selection, API keys, model paths, platform tokens, analysis constraints, and debug settings. Some values should be shared across a team (provider choice, model format). Others are user-specific or secret (API keys, tokens).

A single configuration source does not cover both needs. Environment variables work for secrets and CI but are tedious for complex settings. Config files work for shared settings but should not contain secrets.

## Decision

Use a three-layer configuration system with this precedence (highest wins):

1. **Zod schema defaults.** Every config field has a default value defined in the `ConfigSchema`.
2. **`.eroderc.json` file.** Loaded from the current directory or home directory. Validated after deep-merging onto the defaults skeleton.
3. **Environment variables.** Mapped to config paths via `ENV_MAP`. Type coercion (`toNumber`, `toBoolean`, `toStringArray`) converts string env vars to the correct types.

The final merged object is parsed through `ConfigSchema` (Zod), which validates types, ranges, and formats. `deepMerge` includes prototype pollution protection by rejecting `__proto__`, `constructor`, and `prototype` keys.

## Rationale

Teams commit `.eroderc.json` to share provider choice, model format, and constraints. Developers and CI systems use environment variables for secrets. Zod defaults mean neither source needs to be complete.

Zod validation catches configuration errors early with clear messages. The schema also serves as documentation of all available options and their valid ranges.

## Consequences

### Positive

- Teams share settings via `.eroderc.json` in version control.
- Secrets stay in environment variables, never in config files.
- Zod validation catches invalid configuration at startup, not at analysis time.
- JSON Schema generation from the Zod schema enables editor autocompletion for `.eroderc.json`.

### Negative

- Three configuration layers make it harder to determine where a value came from when debugging.
- The `ENV_MAP` must be manually kept in sync with the Zod schema. Adding a config field requires updating both.
- Config is loaded once at module initialization (`createConfig()`). Changing configuration requires restarting the process.

## Related commits

- `8691ba8` - chore(release): release 0.4.0 (#24)
