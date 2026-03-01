---
title: AI Providers
description: Supported AI providers and model configuration.
head:
  - tag: script
    attrs:
      src: /architecture/likec4-views.js
---

Erode supports three AI providers: **Gemini** (default), **OpenAI**, and **Anthropic** (experimental). Set the provider with the `AI_PROVIDER` environment variable.

<div class="likec4-embed">
<likec4-view view-id="providers" browser="true"></likec4-view>
</div>

> [Open full interactive viewer →](/architecture/#/view/providers/)

## Model tiers

Each provider uses two model tiers to balance cost and quality:

- **Fast model**: Used for Stage 1 (component resolution), Stage 2 (dependency scan), and model patching. These are cheaper, faster models suited for extraction tasks.
- **Advanced model**: Used for Stage 3 (PR analysis). These are stronger models that handle the deeper architectural reasoning.

## Default models

### Gemini

| Tier     | Default model      |
| -------- | ------------------ |
| Fast     | `gemini-2.5-flash` |
| Advanced | `gemini-2.5-flash` |

### OpenAI

| Tier     | Default model  |
| -------- | -------------- |
| Fast     | `gpt-4.1-mini` |
| Advanced | `gpt-4.1`      |

### Anthropic (experimental)

| Tier     | Default model                |
| -------- | ---------------------------- |
| Fast     | `claude-haiku-4-5-20251001`  |
| Advanced | `claude-sonnet-4-5-20250929` |

:::caution
Anthropic support is experimental and may not produce consistent results across all codebases. Use Gemini or OpenAI for production workflows.
:::

## Overriding models

You can override the default models with environment variables:

| Variable                   | Description                                 |
| -------------------------- | ------------------------------------------- |
| `GEMINI_FAST_MODEL`        | Gemini model for fast tier (Stages 1–2)     |
| `GEMINI_ADVANCED_MODEL`    | Gemini model for advanced tier (Stage 3)    |
| `OPENAI_FAST_MODEL`        | OpenAI model for fast tier (Stages 1–2)     |
| `OPENAI_ADVANCED_MODEL`    | OpenAI model for advanced tier (Stage 3)    |
| `ANTHROPIC_FAST_MODEL`     | Anthropic model for fast tier (Stages 1–2)  |
| `ANTHROPIC_ADVANCED_MODEL` | Anthropic model for advanced tier (Stage 3) |

## Timeout configuration

| Variable            | Default    |
| ------------------- | ---------- |
| `GEMINI_TIMEOUT`    | `60000` ms |
| `OPENAI_TIMEOUT`    | `60000` ms |
| `ANTHROPIC_TIMEOUT` | `60000` ms |

These control the maximum wait time for each API request. Increase them if you experience timeouts with large diffs.

## Choosing a provider

Gemini is the default provider and is cheaper per request. OpenAI offers strong analysis quality with broad model availability. Anthropic support is experimental.

Start with Gemini or OpenAI during evaluation.
