---
name: likec4-syntax-sync
description: >-
  Sync the local LikeC4 syntax guide with the upstream LikeC4 skills repository
  (github.com/likec4/likec4/tree/main/skills/likec4-dsl). Use when the user asks
  to update, sync, or check the LikeC4 syntax guide, when upstream LikeC4 DSL
  changes are suspected, or when mentioning likec4 syntax sync, DSL drift, or
  syntax guide update.
---

# LikeC4 Syntax Sync

Keep `packages/core/src/adapters/likec4/prompts/likec4-syntax-guide.md` in sync
with the canonical upstream LikeC4 DSL skill at `likec4/likec4`.

Our guide is injected into every model-patch prompt via `{{syntaxGuide}}`, so it
must stay both accurate and concise (under 40 lines).

## Step 1: Fetch Upstream

Fetch the relevant upstream files using `gh api`:

```bash
gh api repos/likec4/likec4/contents/skills/likec4-dsl/SKILL.md --jq '.content' | base64 -d
gh api repos/likec4/likec4/contents/skills/likec4-dsl/references/model.md --jq '.content' | base64 -d
gh api repos/likec4/likec4/contents/skills/likec4-dsl/references/identifier-validity.md --jq '.content' | base64 -d
gh api repos/likec4/likec4/contents/skills/likec4-dsl/references/specification.md --jq '.content' | base64 -d
```

Only these files contain model-patching-relevant syntax. Skip all others.

## Step 2: Compare

Read the local file at `packages/core/src/adapters/likec4/prompts/likec4-syntax-guide.md`
and compare against upstream for changes in these areas:

- **Identifiers**: validity rules, allowed characters, start-with constraints
- **Elements**: syntax forms (`ID = KIND` and `KIND ID`), nesting, property order
- **Relationships**: implicit/explicit source, typed (`-[KIND]->`, `.REL_KIND`), `this`/`it`
- **Properties**: `title`, `summary`, `description`, `notes`, `technology`, `#tag`, `link`, `metadata`
- **Strings**: quoting styles, escaping, triple-quote multi-line markdown
- **Extend patterns**: `extend FQN { }` for elements, `extend SOURCE -> TARGET` for relationships
- **Anti-patterns**: dots in identifiers, parent-child relationships, redefinition vs extend

**Explicitly skip** (not relevant to model-patching): views, deployment, CLI commands,
styling/shapes/colors/icons, dynamic views, predicates, wildcards, project configuration,
response discipline, eval guidance.

## Step 3: Update

Apply changes to the local file following these rules:

- Keep under 40 lines total
- Preserve the existing section structure and `## LikeC4 DSL SYNTAX REFERENCE` heading
- Use terse reference-card style, not explanatory prose
- Only add information that affects model-patching correctness
- Do not duplicate existing content

## Step 4: Verify

```bash
cd packages/core && npx vitest run src/analysis/__tests__/prompt-builder.test.ts
npm run test
```

Confirm:

- Tests pass
- File starts with `## LikeC4 DSL SYNTAX REFERENCE`
- File is under 40 lines
