# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

erode is a CLI tool that detects architecture drift by comparing GitHub pull requests against a LikeC4 architecture model. It uses AI (Gemini or Anthropic) to analyze PR diffs and identify undeclared dependencies or violations of the declared architecture.

## Project Structure

This is an npm workspace monorepo:

- `packages/core/` — CLI analysis engine (TypeScript)
- `packages/web/` — Landing page (Astro)

## Commands

```bash
npm run build          # Build core package (TypeScript + prompt templates)
npm run test           # Run all tests (vitest)
npm run lint           # ESLint (zero warnings allowed)
npm run format         # Prettier format (all packages)
npm run format:check   # Check formatting
npm run lint:md        # Lint markdown files (markdownlint)
npm run lint:md:fix    # Auto-fix markdown lint issues
npm run check:ci       # Run all CI checks for core
npm run dev:web        # Start Astro dev server
```

### Core-specific commands (run from repo root)

```bash
npm run typecheck --workspace=packages/core   # TypeScript type checking
npm run knip                                   # Find unused files/deps/exports (runs from root)
npm run lint:fix --workspace=packages/core    # Auto-fix lint issues
npm run dev --workspace=packages/core         # tsx watch mode
npm run test -- packages/core/src/providers/__tests__/some-provider.test.ts  # Single test
```

## Architecture

### Multi-Stage Analysis Pipeline

The `analyze` command (`packages/core/src/commands/analyze.ts`) orchestrates a multi-stage AI pipeline:

1. **Stage 1 - Component Resolution**: When a repo maps to multiple LikeC4 components, AI picks the most relevant one (uses cheaper/faster model: Haiku/Flash)
2. **Stage 2 - Dependency Scan**: AI extracts dependency changes from the PR diff (Haiku/Flash)
3. **Stage 3 - PR Analysis**: AI analyzes the PR for architectural drift violations against the declared model (uses stronger model: Sonnet/Pro)

### Key Abstractions

- **`AIProvider`** (`packages/core/src/providers/ai-provider.ts`): Provider-agnostic interface for all AI operations. Implemented by `AnthropicProvider` and `GeminiProvider`.
- **`ArchitectureModelAdapter`** (`packages/core/src/adapters/architecture-adapter.ts`): Interface for loading/querying architecture models. Currently only `LikeC4Adapter` implements it.
- **`PromptBuilder`** (`packages/core/src/analysis/prompt-builder.ts`): Assembles prompts from markdown templates (`packages/core/src/analysis/prompts/*.md`) using `TemplateEngine`'s (`packages/core/src/analysis/template-engine.ts`) `{{variable}}` substitution.

### Provider System

`packages/core/src/providers/provider-factory.ts` creates the AI provider based on `AI_PROVIDER` env var (default: `gemini`). Each provider uses different models per stage — cheaper models for extraction, stronger models for analysis.

### Configuration

All config is environment-variable-driven via `packages/core/src/utils/config.ts`. It maps env vars to a Zod-validated config object (`CONFIG`). Key env vars: `AI_PROVIDER`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`. Tests run with `DEBUG_MODE=true` (set in `packages/core/vitest.config.ts`) which skips API key validation.

### Error Handling

Custom error hierarchy in `packages/core/src/errors.ts`: `ErodeError` (base) → `ConfigurationError`, `ApiError`, `AdapterError`. All errors carry an `ErrorCode` enum with categorized prefixes (`CONFIG_*`, `AUTH_*`, `IO_*`, `NET_*`, `PROVIDER_*`, `PLATFORM_*`, `MODEL_*`, `INPUT_*`, `INTERNAL_*`), a user-facing message, and context metadata. `ApiError` classifies HTTP errors via `classifyHttpError()` to detect rate limiting, timeouts, and acceleration limits.

## Conventions

- **File/folder naming**: kebab-case enforced by `eslint-plugin-check-file`
- **Max file length**: 500 lines (enforced by ESLint)
- **Validation**: All external input (CLI options, API responses, config) validated with Zod schemas in `packages/core/src/schemas/` and `packages/core/src/utils/validation.ts`
- **Imports**: Use `.js` extensions (ESM with Node16 module resolution)
- **Unused vars**: Prefix with `_` (e.g., `_unused`)
- **Prompt templates**: Markdown files in `packages/core/src/analysis/prompts/` and `packages/core/src/adapters/likec4/prompts/` — these are copied to `dist/` during build, not compiled by TypeScript
- **Tests**: Colocated in `__tests__/` directories next to the code they test.
- **Markdown**: All `.md` files are linted by markdownlint-cli2 (config in `.markdownlint.json`). Prompt template directories are excluded via `.markdownlintignore`.
- **Git**: Never use `git -C` — always run git commands from the working directory.
