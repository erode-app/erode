---
title: 'ADR-004: Template-based prompt system'
description: Markdown prompt templates with variable substitution, copied to dist at build time.
---

**Status:** Accepted\
**Date:** 2026-02-24\
**Authors:** Anders Hassis

## Context

Erode sends structured prompts to AI models at each pipeline stage. These prompts contain both static instructions (analysis rules, output format) and dynamic data (diff content, component info, dependency lists).

Embedding prompts as string literals in TypeScript makes them hard to read, edit, and review. Prompt engineering requires fast iteration, and long template literals obscure the actual prompt structure.

## Decision

Store prompts as standalone Markdown files in `packages/core/src/analysis/prompts/` (and `adapters/likec4/prompts/` for adapter-specific prompts). Use `{{variable}}` placeholders for dynamic data.

`TemplateEngine` loads templates from disk and replaces placeholders using dot-path variable resolution. `PromptBuilder` composes data objects into the variable structure each template expects.

Templates are not TypeScript files. They are copied to `dist/` during the build step, not compiled.

## Rationale

Markdown files are easy to read and edit without TypeScript knowledge. Prompt engineers can iterate on instructions without touching application code.

The `{{variable}}` syntax is simple and sufficient. It supports dot-path access for nested objects and handles arrays by joining values. No complex template logic is needed because data shaping happens in `PromptBuilder` before substitution.

Copying to `dist/` instead of compiling keeps templates as plain text at runtime, matching how they are authored.

## Consequences

### Positive

- Prompts are readable as standalone documents.
- Non-developers can review and suggest prompt changes.
- Template changes do not require TypeScript compilation.
- Each pipeline stage has a clearly defined prompt file.

### Negative

- The build step must copy templates to `dist/`. Forgetting this breaks runtime template loading.
- No compile-time checking that template variables match the data passed to them. Mismatched variables produce empty strings silently.
- Template loading uses synchronous `readFileSync`, which is acceptable at startup but would not scale to many templates loaded per request.

## Related commits

- `8691ba8` - chore(release): release 0.4.0 (#24)
