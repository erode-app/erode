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
adapter system (LikeC4 and Structurizr). No dependency on the LikeC4 MCP
server.

Both are **AI-powered** — they use the existing AI provider system
(`AIProvider` interface, with Anthropic/Gemini/OpenAI backends) to understand
code changes and detect architectural intent.

---

## Part 1: Erode MCP Server

### Package: `packages/mcp/`

New workspace package using `@modelcontextprotocol/sdk` for the server
implementation. Consumes `@erode/core` as a dependency.

The server loads the architecture model **once at startup** via
`createAdapter(format)` + `adapter.loadFromPath(path)`. All tools operate
against this in-memory model. The model path and format are configured at
launch, not per-tool-call.

### MCP Tools

#### 1. `check-dependency`

> "Can component X depend on component Y?"

Fast, structural check using `adapter.isAllowedDependency(fromId, toId)`.
No AI needed. Accepts component IDs or repository URLs (resolved via
`adapter.findComponentByRepository()`).

```
Input:  { from: string, to: string }
        // Each can be a component ID (e.g. "cloud.api_gateway")
        // or a repository URL (e.g. "https://github.com/org/api")
Output: {
  allowed: boolean,
  fromComponent: { id, name, type, repository },
  toComponent: { id, name, type, repository },
  existingRelationship?: { kind, title },
  suggestion?: string
}
```

Use case: AI assistant adds an import or HTTP client call — checks if that
dependency is architecturally declared before writing the code.

#### 2. `get-architecture-context`

> "What are the architectural constraints for the component I'm working on?"

Returns the full architectural context for a component. Uses
`adapter.findAllComponentsByRepository()`, `getComponentDependencies()`,
`getComponentDependents()`, and `getComponentRelationships()`.

When a repository maps to **multiple components** (monorepo), all matching
components are returned with their individual dependency graphs. The AI
assistant can use file paths to narrow down which component is relevant
(mirrors Stage 1 logic in the analyze pipeline).

```
Input:  { repo?: string, componentId?: string }
Output: {
  components: [{
    component: { id, name, type, description, technology, tags, repository },
    dependencies: [{ id, name, type, repository }],
    dependents: [{ id, name, type, repository }],
    relationships: [{ target: { id, name }, kind, title }]
  }],
  modelFormat: "likec4" | "structurizr",
  totalComponents: number
}
```

Use case: AI assistant calls this at session start. The returned dependency
list becomes a guardrail: "you may call these services, not others."

#### 3. `analyze-change`

> "Does this code change violate the architecture?"

Runs the existing Stage 2 (dependency extraction) and Stage 3 (drift analysis)
AI pipeline against a local diff. **This makes 2 AI API calls** — one to the
fast model (Haiku/Flash/GPT-4.1-mini) for dependency extraction, one to the
advanced model (Sonnet/Flash/GPT-4.1) for drift analysis. Same cost profile as
the `analyze` command, minus the GitHub API call.

```
Input:  { diff: string, repo: string }
Output: {
  hasViolations: boolean,
  violations: [{ severity, description, file?, line?, suggestion? }],
  improvements?: string[],
  warnings?: string[],
  dependencyChanges: { dependencies: [...], summary: string },
  suggestedModelUpdates?: {
    relationships: [{ source, target, kind?, description }],
    newComponents: [{ id, kind, name, description?, tags?, technology? }]
  }
}
```

**Implementation challenge**: The existing `DriftAnalysisPromptData` requires
`ChangeRequestMetadata` (PR number, title, author, base/head refs) which
doesn't exist for local diffs. The check pipeline needs to synthesize minimal
metadata from git state:

- PR number → 0 (local)
- Title → git branch name or "Local changes"
- Author → `git config user.name`
- Base/head refs → derived from `--branch` flag or current HEAD
- Stats → computed from the diff

Similarly, `DependencyExtractionPromptData` requires `repository.owner` and
`repository.repo` — these must be parsed from the repo URL or git remote.

Use case: Developer asks their AI assistant to review changes before committing.

#### 4. `find-component`

> "Which architectural component owns this repository/code?"

Lookup by repository URL via `adapter.findAllComponentsByRepository()`, or
by component ID via `adapter.findComponentById()`.

Note: The adapter has no free-text search capability. A `query` parameter
would require adding fuzzy matching over component names/descriptions —
this is a new capability not in `@erode/core` today.

```
Input:  { repo?: string, componentId?: string }
Output: { components: [{ id, name, type, repository, description, tags, technology }] }
```

#### 5. `validate-model`

> "Is the architecture model healthy?"

Delegates to the existing `runValidate` pipeline from `@erode/core`. Uses the
model already loaded at server startup (no `modelPath` parameter needed).

```
Input:  {}  // no parameters — uses the server's loaded model
Output: {
  valid: boolean,
  versionCheck?: { found, version, compatible, minimum },
  stats: { total, linked, unlinked },
  unlinkedComponents: [{ id, name }]
}
```

#### 6. `list-components`

> "What components exist in the architecture?"

Returns all components from `adapter.getAllComponents()`. Filtering by kind or
tag is done in the MCP tool handler (the adapter doesn't support filtered
queries — it returns all components and the tool filters in memory).

```
Input:  { filter?: { kind?: string, tag?: string } }
Output: { components: [{ id, name, type, repository, description, tags, technology }] }
```

### MCP Resources

#### `architecture://model`

The loaded architecture model as a resource. Exposes the full component and
relationship graph as structured JSON. AI assistants can read this to get
system-wide context without multiple tool calls.

Content: serialized `ArchitectureModel` — `components[]` and
`relationships[]` from `architecture-types.ts`.

### MCP Prompts

#### `review-changes`

Pre-built prompt template that guides an AI assistant through an architecture
review workflow:

1. Call `get-architecture-context` with the current repo
2. Generate a diff of local changes
3. Call `analyze-change` with the diff
4. Present findings to the developer

This gives users a one-click "review my changes" experience.

### Server Configuration

```jsonc
// Claude Code: .mcp.json
// VS Code: .vscode/mcp.json
// Claude Desktop: claude_desktop_config.json
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

CLI flags:

- `--model <path>` — Path to architecture model directory (required)
- `--format <likec4|structurizr>` — Model format (default: `likec4`)
- `--stdio` — Use stdio transport (default)
- `--http` — Use streamable HTTP transport
- `--port <number>` — HTTP port (default: 33335)
- `--no-watch` — Disable file watching

The server watches the model directory for `.c4`/`.dsl` file changes and
reloads automatically via `adapter.loadFromPath()`.

### Implementation Notes

- Uses `@modelcontextprotocol/sdk` TypeScript SDK
- Model loaded once at startup, reloaded on file changes
- `check-dependency`, `get-architecture-context`, `find-component`, and
  `list-components` are instant in-memory lookups — no AI, no API keys needed
- `analyze-change` requires an AI provider (API key) and makes 2 AI calls
- `validate-model` is pure adapter logic, no AI needed
- All tools return structured JSON, not prose — the AI assistant formats
- `CONFIG` singleton from `@erode/core` is initialized from env vars at
  process startup, which works for MCP servers (env set in config)
- Error handling: tool errors are returned as MCP error responses with
  `ErodeError` codes mapped to human-readable messages

---

## Part 2: `erode check` CLI Command

### Usage

```bash
# Check uncommitted changes against architecture
erode check ./architecture --repo https://github.com/org/my-service

# Check staged changes only (for pre-commit hooks)
erode check ./architecture --repo https://github.com/org/my-service --staged

# Check branch diff against main (for pre-push hooks)
erode check ./architecture --repo https://github.com/org/my-service --branch main

# Auto-detect repo URL from git remote
erode check ./architecture
```

### Pipeline: `runCheck`

New pipeline in `packages/core/src/pipelines/check.ts`:

1. **Accept diff as input** — The pipeline takes a diff string, not a PR URL.
   The CLI command generates this diff via `git diff`; the MCP tool receives
   it directly.
2. **Load model** — `createAdapter(format)` + `adapter.loadFromPath(path)`,
   same as existing pipelines.
3. **Resolve repo identity** — Parse `--repo` URL into `owner/repo`, or
   derive from `git remote get-url origin`. Needed for
   `DependencyExtractionPromptData.repository`.
4. **Find component(s)** — `adapter.findAllComponentsByRepository(repoUrl)`.
   If multiple components match (monorepo), use Stage 1 component selection
   (AI call to fast model) or accept `--component <id>` flag.
5. **Synthesize metadata** — Build a minimal `ChangeRequestMetadata` from git
   state (branch name as title, `git config user.name` as author, diff stats
   computed from the diff).
6. **Stage 2: Extract dependencies** — `provider.extractDependencies()` with
   the diff. Uses fast model (Haiku/Flash). Same prompt template as analyze.
7. **Stage 3: Drift analysis** — `provider.analyzeDrift()`. Uses advanced
   model (Sonnet/Pro). Same prompt template as analyze.
8. **Output** — Console output with violations, or JSON for scripting.

### Exit Codes

- `0` — No violations found
- `1` — Violations detected
- `2` — Error (model not found, API failure, etc.)

### Git Hook Integration

```bash
# .husky/pre-commit (check staged changes)
erode check ./architecture --staged

# .husky/pre-push (check branch diff against main)
erode check ./architecture --branch main
```

Note: The pre-push hook should use `--branch` (not `--staged`) to compare
the full branch diff against the base branch.

---

## Part 3: Shared Core Logic

Both the MCP server and the CLI command share the same core:

```
packages/core/src/pipelines/check.ts    # New: local diff analysis pipeline
packages/core/src/analysis/             # Existing: prompt builder + templates
packages/core/src/adapters/             # Existing: LikeC4 + Structurizr adapters
packages/core/src/providers/            # Existing: Anthropic/Gemini/OpenAI
```

The `runCheck` pipeline is the shared entry point for AI-powered analysis.
The MCP `analyze-change` tool and the `erode check` CLI command both call it.

The structural checks (`check-dependency`, `get-architecture-context`,
`find-component`, `list-components`) are direct
`ArchitectureModelAdapter` method calls — no new pipeline needed, no AI
needed.

### Key Difference from `runAnalyze`

The existing `runAnalyze` pipeline is tightly coupled to platform readers
(GitHub/GitLab/Bitbucket) for fetching PR data. The new `runCheck` pipeline
decouples from this by accepting a raw diff string and minimal metadata.
This means:

- No `GITHUB_TOKEN` required for local checks
- No PR URL required
- The same prompt templates work (they operate on diffs, not PR API objects)
- `ChangeRequestMetadata` is synthesized from git state, not fetched from API

---

## Part 4: Implementation Phases

### Phase 1: Core Check Pipeline + CLI Command

Add `packages/core/src/pipelines/check.ts`:

- Accept a diff string, repo URL, and model path as input
- Synthesize `ChangeRequestMetadata` from git state
- Reuse Stage 2 + Stage 3 via existing `AIProvider` methods
- Return structured results (same `DriftAnalysisResult` type)

Add `erode check` command to `packages/cli/`:

- Git diff generation (working tree, staged, branch comparison)
- Repo URL detection from git remote
- Console output formatting (reuse existing formatters)
- Exit codes for scripting/hooks

These go together because the CLI command is the most direct way to test
the pipeline.

### Phase 2: MCP Server

Add `packages/mcp/` workspace package:

- MCP server with all 6 tools + 1 resource + 1 prompt
- Model loading at startup with file watching
- stdio and HTTP transports
- npm publishable as `@erode/mcp`
- Structural tools work without AI provider config
- `analyze-change` requires AI provider config (env vars)

### Phase 3: Developer Experience

- Auto-detect repo URL from git remote (avoid `--repo` flag)
- `.erode.json` project config file for defaults:

  ```json
  {
    "model": "./architecture",
    "format": "likec4",
    "repo": "https://github.com/org/my-service"
  }
  ```

- `erode init` command to generate `.erode.json` and optionally set up
  git hooks
- Documentation and examples on the web package

---

## How This Relates to LikeC4 MCP

The LikeC4 MCP server and Erode MCP server are **complementary but
independent**:

| Capability | LikeC4 MCP | Erode MCP |
|---|---|---|
| Browse architecture model | Yes | Yes (subset) |
| Search elements by metadata | Yes (`search-element`) | No (ID/repo lookup only) |
| View diagrams in editor | Yes (`open-view`) | No |
| Check dependency rules | No | Yes (`check-dependency`) |
| Analyze code for drift | No | Yes (`analyze-change`) |
| Suggest model updates | No | Yes (in `analyze-change` output) |
| AI-powered analysis | No | Yes |
| Deployment model queries | Yes (`read-deployment`) | No |

Users _can_ install both for the richest experience (LikeC4 MCP for browsing,
diagrams, and deployment views; Erode MCP for drift detection and dependency
validation), but neither depends on the other.

**Overlap**: Both can list/read components. This is intentional — Erode MCP
must be self-contained. Users who only want drift checking should not need
to install LikeC4 MCP.

---

## Open Questions

1. **Free-text component search** — `find-component` currently only supports
   lookup by ID or repo URL (matching adapter capabilities). Should we add
   fuzzy search over component names/descriptions? This would require new
   logic not in the adapter interface today.

2. **Model patching via MCP** — `analyze-change` returns suggested model
   updates. Should the MCP server expose a tool to apply these patches
   (using the existing `ModelPatcher`)? Or is that too risky for an
   automated tool?

3. **Cost awareness** — `analyze-change` makes 2 AI API calls per invocation.
   Should there be rate limiting, caching, or a confirmation step? An eager AI
   assistant could call this frequently.

4. **Prompt template changes** — The current `drift-analysis.md` template
   references PR-specific concepts ("PR", "change request"). Should there be
   a variant template for local changes, or is the existing template
   flexible enough with synthetic metadata?

---

## Key Design Decisions

1. **Standalone** — Erode MCP loads models directly. No LikeC4 MCP dependency.
   Simpler setup, fewer moving parts.

2. **AI-powered** — The core value is AI understanding of code intent, not just
   pattern matching. Structural checks are a fast bonus, not the main feature.

3. **Diff-based, not file-based** — `analyze-change` works on diffs, not entire
   files. This matches the existing pipeline and keeps AI costs low.

4. **Model loaded at startup** — The MCP server loads the model once and
   watches for changes, rather than accepting `modelPath` per tool call.
   This is faster and matches how developers work (one model per project).

5. **Same AI providers** — Reuses the existing provider system. If you have an
   Anthropic key for PR analysis, the same key works for local checks.

6. **Works with both model formats** — LikeC4 and Structurizr are both
   supported via the existing adapter system. The `--format` flag or
   `MODEL_FORMAT` env var controls which adapter is used.
