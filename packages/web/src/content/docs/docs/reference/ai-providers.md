---
title: AI Providers
description: Supported AI providers and model configuration.
head:
  - tag: script
    attrs:
      src: /architecture/likec4-views.js
---

erode supports two AI providers: **Gemini** (default) and **Anthropic**. Set the provider with the `AI_PROVIDER` environment variable.

<div class="likec4-embed">
<likec4-view view-id="providers" browser="true"></likec4-view>
</div>

> [Open full interactive viewer →](/architecture/#/view/providers/)

## Model tiers

Each provider uses two model tiers to balance cost and quality:

- **Fast model**: Used for Stage 0 (component resolution) and Stage 1 (dependency scan). These are cheaper, faster models suited for extraction tasks.
- **Advanced model**: Used for Stage 2 (PR analysis) and Stage 3 (LikeC4 generation). These are stronger models that handle the deeper architectural reasoning.

## Default models

### Gemini

| Tier     | Default model      |
| -------- | ------------------ |
| Fast     | `gemini-2.5-flash` |
| Advanced | `gemini-2.5-flash` |

### Anthropic

| Tier     | Default model                |
| -------- | ---------------------------- |
| Fast     | `claude-haiku-4-5-20251001`  |
| Advanced | `claude-sonnet-4-5-20250929` |

## Overriding models

You can override the default models with environment variables:

| Variable                   | Description                                    |
| -------------------------- | ---------------------------------------------- |
| `GEMINI_FAST_MODEL`        | Gemini model for fast tier (Stages 0–1)        |
| `GEMINI_ADVANCED_MODEL`    | Gemini model for advanced tier (Stages 2–3)    |
| `ANTHROPIC_FAST_MODEL`     | Anthropic model for fast tier (Stages 0–1)     |
| `ANTHROPIC_ADVANCED_MODEL` | Anthropic model for advanced tier (Stages 2–3) |

## Timeout configuration

| Variable            | Default    |
| ------------------- | ---------- |
| `GEMINI_TIMEOUT`    | `60000` ms |
| `ANTHROPIC_TIMEOUT` | `60000` ms |

These control the maximum wait time for each API request. Increase them if you experience timeouts with large diffs.

## Choosing a provider

Gemini is the default provider and is generally cheaper per request. Anthropic may produce different analysis quality depending on the codebase and model complexity.

Start with Gemini during evaluation and switch to Anthropic if you want to compare results.
