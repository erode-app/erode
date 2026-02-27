---
name: adr
description: Create and manage Architecture Decision Records (ADRs). Use when making architectural changes (refactoring, API versioning, new domain layers, schema changes), when reviewing recent commits for documentation needs, or when the user mentions ADR, architecture decisions, or documenting technical decisions.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Architecture Decision Records

Create and manage ADRs in `docs/adr/` to document significant architectural decisions.

## Instructions

### When to Create an ADR

Suggest creating an ADR when detecting:

- Commits containing: refactor, architecture, migrate, introduce, domain layer, api version
- New files in: `domain/`, `api/`, `services/`, `models/`
- Schema changes: `prisma/schema.prisma` modified
- Config changes: `tsconfig.json`, `eslint.config.js` significantly changed

Skip ADR suggestion for:

- Commits containing only: fix, chore, docs, test, style
- Changes only in: `tests/`, `*.test.ts`, `*.spec.ts`
- Single file changes under 50 lines

### Creating an ADR

1. Find the next ADR number by listing `docs/adr/`
2. Check recent plan files in `~/.claude/plans/` for context
3. Analyze recent commits: `git log --since="7 days ago" --oneline`
4. Extract Context, Decision, and Rationale from plans/commits
5. Create the ADR file using the template below
6. Update `docs/adr/README.md` index

### Listing ADRs

List existing ADRs: `ls -1 docs/adr/*.md | grep -v README`

## Template

Use Michael Nygard format in `docs/adr/NNN-kebab-case-title.md`:

```markdown
# ADR-XXX: Title

**Status:** Accepted
**Date:** YYYY-MM-DD
**Authors:** [Names]

## Context

[What is the issue we're solving? What forces are at play?]

## Decision

[What is the change we're making?]

## Rationale

[Why is this the right choice?]

## Consequences

### Positive

- [Benefit 1]

### Negative

- [Tradeoff 1]

## Related Commits

- `hash` - commit message
```

## Examples

**User asks:** "Document the recent API versioning changes"
**Action:** Create ADR covering the v1 prefix, Zod validation, and thin client decisions

**After refactoring:** When Claude completes a significant refactor, proactively suggest documenting the decision

**Reviewing work:** When asked to review recent architectural changes, check if ADRs exist and suggest creating them if missing
