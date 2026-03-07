---
title: Claude Code Integration
description: Add architecture drift detection to Claude Code sessions.
---

Erode integrates with [Claude Code](https://docs.anthropic.com/en/docs/claude-code) through a custom skill that checks local changes for architecture drift during coding sessions. When Claude Code edits code that introduces an undeclared dependency, the skill flags it and shows what changed, what the model declares, and how to fix the mismatch.

## Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed
- An architecture model in your repository (see [Model Formats](/docs/models/))
- An [AI provider](/docs/reference/ai-providers/) API key

No global install is needed. The skill runs Erode via `npx`, which downloads
the package on first use and caches it for subsequent runs.

## Setup

### 1. Create the skill file

Create `.claude/skills/erode-check/SKILL.md` in your repository:

````markdown
---
name: erode-check
description: >-
  Use this skill whenever code changes introduce new imports, API calls,
  database connections, message queues, or service-to-service communication.
  Also use before any commit or push. Catches undeclared dependencies and
  architecture violations using Erode.
allowed-tools: Bash, Read, Glob, Grep
---

# Architecture Drift Check

Run `erode check` against local changes to detect undeclared dependencies
and architecture violations before pushing.

## When to Activate

Run this check proactively:

1. **After adding new integrations** -- run when you write code that
   introduces new imports, API calls, database connections, message queue
   producers/consumers, or service-to-service communication
2. **Before committing** -- run before creating any commit to verify no
   drift was introduced during the session
3. **On request** -- run when the user mentions "architecture check",
   "drift check", or "erode"

Skip this check for changes that cannot introduce new dependencies:

- Documentation-only changes (no code paths affected)
- Test-only changes (test code is not part of the production architecture)
- Config/tooling changes like tsconfig, eslint, or prettier (no runtime dependencies)
- Refactors that modify existing logic without adding external calls

## How to Run

Choose the mode based on git state:

**Unstaged changes exist** (you just wrote code):

```bash
npx @erode-app/cli check --format json
```

**Changes are staged** (ready to commit):

```bash
npx @erode-app/cli check --format json --staged
```

**Commits exist on the branch** (ready to push):

```bash
npx @erode-app/cli check --format json --branch main
```

The model path is read from `.eroderc.json` (`adapter.modelPath`). Pass
`<model-path>` as a positional argument to override it.

Add `--fail-on-violations` when you want a non-zero exit code on drift.

The repository URL is auto-detected from the git remote. Use `--repo
<url>` only if auto-detection fails.

## Interpreting Results

Parse the JSON output. The key fields are:

- `status`: `"success"` (no drift), `"violations"` (drift found), or
  `"error"`
- `analysis.violations[]`: each violation has `severity` (high, medium,
  low), `description`, `file`, `line`, and `suggestion`
- `analysis.summary`: human-readable overview
- `analysis.modelUpdates`: suggested relationship changes for the
  architecture model
- `dependencyChanges[]`: each entry has `type` (added, removed, modified),
  `dependency`, `file`, and `description` -- use this to explain what
  dependency changes were detected

### When violations are found

1. **Read each violation** and its suggestion
2. **Decide the right fix** -- either:
   - Refactor the code to use the declared dependency path (e.g., call
     through an API gateway instead of directly)
   - Or note that the architecture model needs updating (the dependency
     is intentional but undeclared)
3. **Tell the user** what you found, the severity, and your recommended
   fix
4. **Do not silently suppress violations** -- always surface them

### When no violations are found

Briefly confirm: "Architecture check passed, no undeclared dependencies
detected."

### When the command fails

If `erode check` exits with an error, read the error message. Common causes:
the AI provider API key is not set, the model path in `.eroderc.json` does
not exist, or there is no git remote configured. Report the error to the
user with the suggested fix from the error message.

## Configuration

The model path and provider are read from `.eroderc.json` at the repository
root. API keys come from environment variables (`ERODE_GEMINI_API_KEY`,
`ERODE_OPENAI_API_KEY`, or `ERODE_ANTHROPIC_API_KEY`).
````

### 2. Add a project config (if you don't have one)

The skill reads model path and provider settings from `.eroderc.json` in the
repository root. If you already have one, skip this step.

```json
{
  "$schema": "https://erode.dev/schemas/v0/eroderc.schema.json",
  "ai": { "provider": "gemini" },
  "adapter": { "modelPath": "./architecture" }
}
```

Set `adapter.modelPath` to the directory containing your architecture model
files. Set `ai.provider` to your preferred provider (`gemini`, `openai`, or
`anthropic`).

API keys go in environment variables (`ERODE_GEMINI_API_KEY`,
`ERODE_OPENAI_API_KEY`, or `ERODE_ANTHROPIC_API_KEY`), not in the config
file. See [Configuration](/docs/reference/configuration/) for the full reference.

### 3. Commit the skill and config

```bash
git add .claude/skills/erode-check/SKILL.md .eroderc.json
git commit -m "chore: add erode architecture check skill for Claude Code"
```

The skill is now available to Claude Code in all sessions for this repository.

## How it works

When Claude Code makes changes that introduce new integrations (imports, API calls, service connections), the skill runs `erode check` against the local diff. Erode analyzes the changes against your declared architecture model and reports any undeclared dependencies.

A violation is not necessarily a problem. Claude Code surfaces what it found so you can decide: fix the code to follow the declared path, or update the model to reflect the new dependency. Either way, the change is conscious.

## Optional: Hook-based automation

For automatic checking after every code edit, add a [PostToolUse hook](https://docs.anthropic.com/en/docs/claude-code/hooks) to `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "if jq -re '.tool_input.file_path // .tool_input.filePath // empty' | grep -qE '\\.(ts|js|py|go|java|rs)$'; then npx @erode-app/cli check --format json 2>&1; fi"
          }
        ]
      }
    ]
  }
}
```

This runs `erode check` after every edit to a source file and feeds the output back to Claude Code.

:::caution
The hook approach runs on every edit, which triggers multiple AI API calls each time. This adds up quickly during active sessions. The skill approach above is recommended for most users. It only runs when Claude Code judges that new integrations were introduced.
:::

## What's next

- [CLI Commands](/docs/reference/cli-commands/): all `erode check` flags and options
- [Configuration](/docs/reference/configuration/): environment variables for tuning the analysis
- [How It Works](/docs/how-it-works/): understand the AI pipeline behind the check
