# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

erode is a CLI tool that detects architecture drift by comparing GitHub pull requests against a LikeC4 architecture model. It uses AI (Gemini or Anthropic) to analyze PR diffs and identify undeclared dependencies or violations of the declared architecture.

## Commands

```bash
npm run build          # Clean, compile TypeScript, copy prompt templates to dist/
npm run test           # Run all tests (vitest)
npm run test -- src/providers/__tests__/some-provider.test.ts  # Run single test file
npm run lint           # ESLint with strict TypeScript checks (zero warnings allowed)
npm run lint:fix       # Auto-fix lint issues
npm run format         # Prettier format
npm run format:check   # Check formatting
npm run typecheck      # TypeScript type checking only (no emit)
npm run knip           # Find unused files, dependencies, and exports (knip)
npm run dev            # tsx watch mode
```

## Architecture

### Multi-Stage Analysis Pipeline

The `analyze` command (`src/commands/analyze.ts`) orchestrates a multi-stage AI pipeline:

1. **Stage 0 - Component Resolution**: When a repo maps to multiple LikeC4 components, AI picks the most relevant one (uses cheaper/faster model: Haiku/Flash)
2. **Stage 1 - Dependency Scan**: AI extracts dependency changes from the PR diff (Haiku/Flash)
3. **Stage 2 - PR Analysis**: AI analyzes the PR for architectural drift violations against the declared model (uses stronger model: Sonnet/Pro)
4. **Stage 3 - LikeC4 Generation** (optional): AI generates LikeC4 DSL code to update the architecture model

### Key Abstractions

- **`AIProvider`** (`src/providers/ai-provider.ts`): Provider-agnostic interface for all AI operations. Implemented by `AnthropicProvider` and `GeminiProvider`.
- **`ArchitectureModelAdapter`** (`src/adapters/architecture-adapter.ts`): Interface for loading/querying architecture models. Currently only `LikeC4Adapter` implements it.
- **`PromptBuilder`** (`src/analysis/prompt-builder.ts`): Assembles prompts from markdown templates (`src/analysis/prompts/*.md`) using `PromptLoader`'s `{{variable}}` substitution.

### Provider System

`src/providers/provider-factory.ts` creates the AI provider based on `AI_PROVIDER` env var (default: `gemini`). Each provider uses different models per stage — cheaper models for extraction, stronger models for analysis.

### Configuration

All config is environment-variable-driven via `src/utils/config.ts`. It maps env vars to a Zod-validated config object (`CONFIG`). Key env vars: `AI_PROVIDER`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`. Tests run with `DEBUG_MODE=true` (set in `vitest.config.ts`) which skips API key validation.

### Error Handling

Custom error hierarchy in `src/errors.ts`: `ErodeError` (base) → `ConfigurationError`, `ApiError`. All errors carry an `ErrorCode` enum, a user-facing message, and context metadata. `ApiError` auto-detects rate limiting, timeouts, and acceleration limits from provider responses.

## Conventions

- **File/folder naming**: kebab-case enforced by `eslint-plugin-check-file`
- **Max file length**: 500 lines (enforced by ESLint)
- **Validation**: All external input (CLI options, API responses, config) validated with Zod schemas in `src/schemas/` and `src/utils/validation.ts`
- **Imports**: Use `.js` extensions (ESM with Node16 module resolution)
- **Unused vars**: Prefix with `_` (e.g., `_unused`)
- **Prompt templates**: Markdown files in `src/analysis/prompts/` and `src/adapters/likec4/prompts/` — these are copied to `dist/` during build, not compiled by TypeScript
- **Tests**: Colocated in `__tests__/` directories next to the code they test. `oldversion/` directory is excluded from compilation, tests, and linting.
