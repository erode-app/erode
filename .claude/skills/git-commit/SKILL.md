---
name: git-commit
description: >-
  Conventional commits with project conventions. Use when the user asks to
  commit, make a commit, or wants to follow the project's git commit standard.
allowed-tools: Bash, Glob, Grep, Read
---

# Git Commit Standard

All commits in this project follow the Conventional Commits spec, tailored
for a monorepo with `packages/core/` and `packages/web/`.

## Subject Line

```
type(scope): description
```

- Lowercase everything
- Imperative mood ("add", not "added" or "adds")
- No trailing period
- Max 72 characters

## Types

| Type       | Use for                                 |
| ---------- | --------------------------------------- |
| `feat`     | New functionality visible to users      |
| `fix`      | Bug fixes                               |
| `docs`     | Documentation-only changes              |
| `style`    | Formatting, whitespace, no logic change |
| `refactor` | Code restructuring, no behavior change  |
| `test`     | Adding or updating tests only           |
| `build`    | Build system, dependencies, Docker      |
| `ci`       | CI/CD pipeline changes                  |
| `chore`    | Maintenance that doesn't fit elsewhere  |

## Scopes

- `web` — changes scoped to `packages/web/`
- `core` — changes scoped to `packages/core/` (optional since it's the primary package)
- `deps` / `deps-dev` — dependency bumps
- Omit scope for repo-wide or cross-package changes

## Body

- Explain **why**, not what (the diff shows what)
- Wrap at 72 characters
- Include `Resolves ABC-123` when closing a Linear issue

## Instructions

When asked to commit:

1. Run `git status` (never use `-uall`) and `git diff --cached` to understand staged changes
2. If nothing is staged, identify which files should be staged based on the user's intent
3. Pick the correct type and scope from the tables above
4. Write a concise subject line in imperative mood
5. Add a body only when the "why" isn't obvious from the subject
6. Use a HEREDOC for the commit message to preserve formatting
7. Never amend unless the user explicitly asks
8. Never skip hooks (no `--no-verify`)
