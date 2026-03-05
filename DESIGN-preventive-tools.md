# Erode Preventive Tools — Design Document

## Problem

Erode currently detects architecture drift **reactively** — at PR review time.
By then, a developer may have spent hours or days building on the wrong
foundation. We need to shift detection **left** into the coding phase itself.

## Solution Overview

Two complementary preventive mechanisms, sharing the same core logic:

1. **Erode MCP Server** (`packages/mcp/`) — Exposes architecture knowledge and
   drift-checking to AI coding assistants (Claude Code, Cursor, VS Code
   Copilot). The AI assistant can proactively check architectural constraints
   while the developer writes code.

2. **`erode check` CLI command** — Local command developers run against their
   working tree (uncommitted changes, staged changes, or a branch diff) to
   catch violations before pushing.

Both are **standalone** — they load architecture models directly via the existing
adapter system. No dependency on the LikeC4 MCP server.

Both are **AI-powered** — they use the existing AI provider system to understand
code changes and detect architectural intent, not just structural pattern
matching.

---

## Part 1: Erode MCP Server

### Package: `packages/mcp/`

New workspace package using `@modelcontextprotocol/sdk` for the server
implementation. Consumes `@erode/core` as a dependency.

### MCP Tools

#### 1. `check-dependency`

> "Can component X depend on component Y?"

Fast, structural check against the loaded model. No AI needed.

```
Input:  { from: string, to: string }
Output: { allowed: boolean, fromComponent: {...}, toComponent: {...},
          existingRelationship?: {...}, suggestion?: string }
```

Use case: AI assistant imports a new library or calls a new service — checks if
that dependency is architecturally declared.

#### 2. `get-architecture-context`

> "What are the allowed dependencies and constraints for what I'm working on?"

Returns the full architectural context for a component, identified by repository
URL or component ID.

```
Input:  { repo?: string, componentId?: string }
Output: { component: {...}, dependencies: [...], dependents: [...],
          relationships: [...], allComponents: [...] }
```

Use case: AI assistant loads this at the start of a coding session to understand
what the developer's component is allowed to interact with. This becomes context
for all subsequent code generation.

#### 3. `analyze-change`

> "Does this code change violate the architecture?"

AI-powered analysis of a diff or set of file changes against the architecture
model. This is a lightweight version of the full `analyze` pipeline, designed
for local/incremental use.

```
Input:  { diff: string, repo: string, modelPath: string }
Output: { violations: [...], improvements: [...], warnings: [...],
          suggestedModelUpdates?: {...} }
```

Use case: Developer asks their AI assistant to review changes before committing.
The assistant calls this tool with the current diff.

#### 4. `find-component`

> "Which architectural component owns this repository/code?"

```
Input:  { repo?: string, query?: string }
Output: { components: [{ id, name, type, repository, description }] }
```

Use case: Developer is in an unfamiliar repo and wants to understand where it
sits in the architecture.

#### 5. `validate-model`

> "Is the architecture model healthy?"

Runs the existing validate pipeline. Returns version check, missing links, etc.

```
Input:  { modelPath: string }
Output: { valid: boolean, issues: [...], stats: {...} }
```

#### 6. `list-components`

> "What components exist in the architecture?"

Returns all components, optionally filtered.

```
Input:  { modelPath: string, filter?: { kind?: string, tag?: string } }
Output: { components: [...] }
```

### MCP Resources

#### `architecture://model`

The loaded architecture model as a resource. AI assistants can read this to get
full context about the system architecture without making tool calls.

### Server Configuration

```jsonc
// .vscode/mcp.json or claude_desktop_config.json
{
  "mcpServers": {
    "erode": {
      "command": "npx",
      "args": ["@erode/mcp", "--model", "./architecture"],
      "env": {
        "AI_PROVIDER": "anthropic",
        "ANTHROPIC_API_KEY": "sk-..."
      }
    }
  }
}
```

Supports `--stdio` (default) and `--http` transports.

The server watches the model directory for changes and reloads automatically.

### Implementation Notes

- Uses `@modelcontextprotocol/sdk` TypeScript SDK
- Loads models once at startup via `createAdapter()` + `loadFromPath()`
- `check-dependency` and `get-architecture-context` are instant (in-memory
  lookups on the loaded model)
- `analyze-change` creates a lightweight analysis pipeline using existing
  `PromptBuilder` + `AIProvider`
- All tools return structured JSON, not prose — the AI assistant formats for the
  user

---

## Part 2: `erode check` CLI Command

### Usage

```bash
# Check uncommitted changes against architecture
erode check ./architecture --repo https://github.com/org/my-service

# Check staged changes only
erode check ./architecture --repo https://github.com/org/my-service --staged

# Check branch diff against main
erode check ./architecture --repo https://github.com/org/my-service --branch main

# Quick structural check only (no AI, fast)
erode check ./architecture --repo https://github.com/org/my-service --structural
```

### Pipeline: `runCheck`

New pipeline in `packages/core/src/pipelines/check.ts`:

1. **Generate diff** — Run `git diff` (or `git diff --staged`, or
   `git diff main...HEAD`) to get the local changes
2. **Load model** — Same as existing pipelines
3. **Find component** — Map repo URL to component(s)
4. **Extract dependencies** — AI stage (Stage 2 from analyze pipeline), reused
5. **Check against model** — For each extracted dependency, call
   `adapter.isAllowedDependency()` and flag undeclared ones
6. **AI analysis** (optional) — Run Stage 3 drift analysis for deeper violations
7. **Output** — Console output with violations, or JSON for scripting

### Exit Codes

- `0` — No violations found
- `1` — Violations detected
- `2` — Error (model not found, API failure, etc.)

This enables use in pre-commit/pre-push hooks:

```bash
# .husky/pre-push
erode check ./architecture --repo $(git remote get-url origin) --staged
```

---

## Part 3: Shared Core Logic

Both the MCP server and the CLI command share the same core:

```
packages/core/src/pipelines/check.ts    # New pipeline
packages/core/src/analysis/             # Existing prompt builder + templates
packages/core/src/adapters/             # Existing adapters
packages/core/src/providers/            # Existing AI providers
```

The `runCheck` pipeline is the shared entry point. The MCP `analyze-change` tool
and the `erode check` CLI command both call it.

The structural checks (`check-dependency`, `get-architecture-context`) are
direct adapter method calls — no new pipeline needed.

---

## Part 4: Implementation Phases

### Phase 1: Core Check Pipeline

Add `packages/core/src/pipelines/check.ts` with the local diff analysis logic.
This is the foundation both the MCP server and CLI command build on.

- Accept a diff string (not a PR URL) as input
- Reuse Stage 2 (dependency extraction) and Stage 3 (drift analysis) prompts
- Return structured results

### Phase 2: CLI Command

Add `erode check` command to `packages/cli/`:

- Git diff generation (working tree, staged, branch comparison)
- Console output formatting
- Exit codes for scripting/hooks

### Phase 3: MCP Server

Add `packages/mcp/` workspace package:

- MCP server with all 6 tools
- Model watching and hot-reload
- stdio and HTTP transports
- npm publishable as `@erode/mcp`

### Phase 4: Developer Experience

- Pre-built hook scripts (`erode init-hooks`)
- `.erode.json` project config file (model path, repo URL, provider settings)
  so developers don't need to pass flags every time
- Documentation and examples on the web package

---

## How This Relates to LikeC4 MCP

The LikeC4 MCP server and Erode MCP server are **complementary but
independent**:

| Capability | LikeC4 MCP | Erode MCP |
|---|---|---|
| Browse architecture model | Yes | Yes (subset) |
| Search elements | Yes | Yes (`find-component`) |
| View diagrams | Yes | No |
| Check dependency rules | No | Yes |
| Analyze code for drift | No | Yes |
| Suggest model updates | No | Yes |
| AI-powered analysis | No | Yes |

Users _can_ install both for the richest experience (LikeC4 MCP for browsing
and visualization, Erode MCP for drift detection), but neither depends on the
other.

---

## Key Design Decisions

1. **Standalone** — Erode MCP loads models directly. No LikeC4 MCP dependency.
   Simpler setup, fewer moving parts.

2. **AI-powered** — The core value is AI understanding of code intent, not just
   pattern matching. Structural checks are a fast bonus, not the main feature.

3. **Diff-based, not file-based** — `analyze-change` works on diffs, not entire
   files. This matches the existing pipeline and keeps AI costs low.

4. **Model-watching** — The MCP server watches for `.c4`/`.dsl` file changes and
   reloads. Developers editing the architecture model get instant feedback.

5. **Same AI providers** — Reuses the existing provider system. If you have an
   Anthropic key for PR analysis, the same key works for local checks.
