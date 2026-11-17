---
title: 'ADR-014: Native structured AI output'
description: JSON-returning stages use each provider's structured output with a schema generated from Zod, plus one repair round.
---

**Status:** Proposed\
**Date:** 2026-11-17\
**Authors:** Anders Hassis

## Context

[ADR-002](/docs/contributing/adrs/002-provider-agnostic-ai-interface/) gave providers one method, `callModel`, that takes a prompt and returns text. Prompts asked for JSON in prose, and `BaseProvider` took the first `{` onward, ran `JSON.parse`, then validated with Zod. ADR-002 noted that tool use would need an interface change.

That path failed the whole run on a trailing comma, a `//` comment, a preamble containing `{`, or one enum value outside the schema, such as `"severity":"critical"`. Retries covered only rate limits and timeouts, so none of these were retried.

All three SDKs can now constrain output to a JSON Schema.

## Decision

- Extend the abstract `callModel(model, prompt, phase, profile, output?)` with an optional structured-output spec. With a spec it returns the JSON document as text; without one it returns free text (model patching).
- Generate the request schema from the existing Zod schemas with `z.toJSONSchema(schema, { io: 'input' })`. Drop keywords that providers reject or support unevenly (`pattern`, `format`, string length, array length and numeric bounds such as `minimum`, `maximum` and `multipleOf`) and set `additionalProperties: false` on every object.
- Per provider:

| Provider  | Mechanism                                                                                     |
| --------- | --------------------------------------------------------------------------------------------- |
| Anthropic | `output_config: { format: { type: 'json_schema', schema } }`; JSON returned in the text block |
| OpenAI    | Responses API `text.format: { type: 'json_schema', strict: true }`                            |
| Gemini    | `responseMimeType: 'application/json'` with `responseJsonSchema`                              |

- OpenAI strict mode needs every property in `required`. Optional properties become nullable: a type array for primitives, `anyOf` with `{ type: 'null' }` for objects and arrays. `BaseProvider` removes null-valued properties before Zod validation.
- Component selection uses an object with `componentId`, whose schema enum is the candidate IDs.
- `BaseProvider` still validates every response with Zod. On a JSON parse or validation failure it sends one repair request: the original prompt plus the Zod issue list. A second failure raises `PROVIDER_INVALID_RESPONSE`. For component selection it returns `null`, so the pipeline falls back to the default component as before.
- Truncation, safety, empty-response and API errors are not repaired; they behave as before.

## Rationale

Constrained decoding removes most malformed output at the source, and Zod remains the single source of truth for the response shape, so there are no hand-written duplicate schemas. Generating from the input side keeps the request schema correct when a response schema gains a `.transform`.

Anthropic uses `output_config.format` rather than a forced tool. Structured outputs are available on all current Claude models, while `tool_choice` `{ type: 'tool' }` and `{ type: 'any' }` return a 400 error on several current models and with manual extended thinking. Anthropic limits a request schema to 24 optional parameters and 16 parameters using `anyOf` or type arrays; a test keeps the drift and dependency schemas within those limits.

The repair round covers what the schema cannot express: regex patterns, length limits and cross-field rules such as "`line` requires `file`".

## Consequences

### Positive

- Formatting slips no longer fail a run.
- A bad enum or a missing field costs one extra request instead of the whole run.
- Prompts no longer carry JSON output templates; field guidance stays as prose.

### Negative

- Providers keep a single `callModel(..., output?)`, but each must translate the optional spec into its own native request shape.
- Models without structured output support fail on the first request. Examples are OpenAI models older than `gpt-4o-2024-08-06` and Gemini models without `responseJsonSchema`.
- A repair doubles the latency and cost of that stage.
- Gemini does not guarantee schema adherence; Zod and the repair round remain the safety net.
- New optional or nullable fields in the drift schema count toward Anthropic's complexity limits.

## Related commits

- `feat(core): use native structured output for JSON stages`
