---
title: 'ADR-008: Monorepo workspace structure'
description: npm workspaces separating core library, CLI, documentation, architecture model, and shared config.
---

**Status:** Accepted\
**Date:** 2026-02-25\
**Authors:** Anders Hassis

## Context

Erode has multiple concerns: the analysis engine, the interactive CLI, CI platform entrypoints, a documentation site, an architecture model of itself, and shared ESLint rules. These concerns have different build targets, different dependencies, and different release cadences.

The codebase started as a single package combining CLI, analysis engine, and web concerns. It was split into a workspace structure on 2026-02-25. The CLI package originally used Ink (React-based terminal UI) for interactive rendering, which was later replaced with plain console output (commit `aa616fd` on 2026-03-04) to reduce complexity.

A single-package structure would mix CLI dependencies with web dependencies and couple the analysis engine to the terminal interface.

## Decision

Use npm workspaces with five packages:

| Package                  | Published         | Purpose                                                             |
| ------------------------ | ----------------- | ------------------------------------------------------------------- |
| `packages/core`          | `@erode-app/core` | Analysis engine. Exports the `erode-ci` binary for CI integrations. |
| `packages/cli`           | `@erode-app/cli`  | Interactive terminal interface. Exports the `erode` binary.         |
| `packages/web`           | private           | Astro-based documentation and landing page.                         |
| `packages/architecture`  | private           | LikeC4 architecture model of Erode itself.                          |
| `packages/eslint-config` | private           | Shared ESLint configuration.                                        |

The core package is the primary dependency. The CLI imports from core. CI entrypoints invoke core directly. The web package is independent.

## Rationale

Separating core from CLI allows CI integrations to depend on core without pulling in CLI dependencies (interactive prompts, terminal formatting). This keeps Docker images and CI runners lean.

The architecture package demonstrates Erode's own approach: model your system's architecture alongside the code. This also provides a real-world test fixture for development.

Shared ESLint config prevents lint rule drift across packages.

## Consequences

### Positive

- Core can be published and consumed independently of the CLI.
- Each package manages its own dependencies, reducing install size for consumers.
- The architecture package serves as both documentation and a test fixture.
- Shared lint config keeps code style consistent across all packages.

### Negative

- npm workspace hoisting can cause unexpected dependency resolution. Lock file changes are noisy.
- Cross-package type changes require building core before CLI can use updated types.
- Five packages increase the number of `package.json` files and build configurations to maintain.

## Related commits

- `8691ba8` - chore(release): release 0.4.0 (#24)
- `712a642` - feat: add erode check command, npm publishing, and Claude Code skill (#39)
