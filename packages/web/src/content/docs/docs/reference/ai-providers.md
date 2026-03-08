---
title: AI Providers
description: Supported AI providers and model configuration.
head:
  - tag: script
    attrs:
      src: /architecture/likec4-views.js
---

Erode supports three AI providers: **Gemini** (default), **OpenAI**, and **Anthropic** (experimental). Set the provider with the `ERODE_AI_PROVIDER` environment variable.

<div class="likec4-embed">
<likec4-view view-id="providers" browser="true"></likec4-view>
</div>

> [Open full interactive viewer →](/architecture/#/view/providers/)

## Model tiers

Each provider uses two model tiers to balance cost and quality:

- **Fast model**: Used for Stage 1 (component resolution), Stage 2 (dependency scan), and model updates. These are cheaper, faster models suited for extraction tasks.
- **Advanced model**: Used for Stage 3 (PR analysis). These are stronger models that handle the deeper architectural reasoning.

## Default models

### Gemini

| Tier     | Default model      |
| -------- | ------------------ |
| Fast     | `gemini-2.5-flash` |
| Advanced | `gemini-2.5-pro`   |

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

Override the default models per provider with environment variables. See [Configuration: Provider model overrides](/docs/reference/configuration/#provider-model-overrides) for the full list.

## Timeouts

Each provider has a configurable request timeout (default: 60 seconds). Increase them if you experience timeouts with large diffs. See [Configuration: Timeouts](/docs/reference/configuration/#timeouts) for all timeout variables.

## Choosing a provider

Gemini is the default provider and is cheaper per request. OpenAI offers strong analysis quality with broad model availability. Anthropic support is experimental.

Start with Gemini or OpenAI during evaluation.
