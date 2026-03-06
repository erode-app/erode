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
  Check local code changes for architecture drift using Erode. Triggers
  after significant code changes to catch undeclared dependencies and
  structural violations before they reach code review.
allowed-tools: Bash, Read, Glob, Grep
---

# Architecture Drift Check

Run `erode check` against local changes to detect undeclared dependencies
and architecture violations before pushing.

## When to Activate

Run this skill proactively in these situations:

1. **After writing code that adds a new integration** — new imports,
   API calls, database connections, message queue producers/consumers,
   or service-to-service communication
2. **Before committing** — when the user asks you to commit, run this
   first to verify no drift was introduced
3. **When the user asks** — any mention of "architecture check",
   "drift check", or "erode check"

Do NOT run this skill for:

- Documentation-only changes
- Test-only changes
- Config/tooling changes (tsconfig, eslint, prettier, etc.)
- Changes that only modify existing logic without new external calls

## How to Run

Pick the right mode depending on the situation:

**After writing code** (unstaged changes in the working tree):

```bash
npx @erode-app/cli check <model-path> --format json
```

**Before committing** (changes already staged with `git add`):

```bash
npx @erode-app/cli check <model-path> --format json --staged
```

**Before pushing** (all commits on the branch vs. base branch):

```bash
npx @erode-app/cli check <model-path> --format json --branch main
```

Replace `<model-path>` with the path to the architecture model directory
in this repository (check for directories containing `.c4` or `.dsl`
files, commonly `architecture/`, `model/`, or `docs/architecture/`).

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

### When violations are found

1. **Read each violation** and its suggestion
2. **Decide the right fix** — either:
   - Refactor the code to use the declared dependency path (e.g., call
     through an API gateway instead of directly)
   - Or note that the architecture model needs updating (the dependency
     is intentional but undeclared)
3. **Tell the user** what you found, the severity, and your recommended
   fix
4. **Do not silently suppress violations** — always surface them

### When no violations are found

Briefly confirm: "Architecture check passed, no undeclared dependencies
detected."

## Configuration

Add a `.eroderc.json` file to the repository root with your provider
and API key:

    {
      "$schema": "https://erode.dev/schemas/v0/eroderc.schema.json",
      "ai": { "provider": "openai" },
      "openai": { "apiKey": "sk-..." }
    }

Add `.eroderc.json` to `.gitignore` to keep credentials out of version
control. Alternatively, set the API key as an environment variable
(`ERODE_OPENAI_API_KEY`, `ERODE_GEMINI_API_KEY`, or
`ERODE_ANTHROPIC_API_KEY`) and commit a `.eroderc.json` with only
non-secret settings.

See [Configuration](/docs/guides/configuration/) for the full reference.
````

### 2. Commit the skill

```bash
git add .claude/skills/erode-check/SKILL.md
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
            "command": "if jq -re '.tool_input.file_path // .tool_input.filePath // empty' | grep -qE '\\.(ts|js|py|go|java|rs)$'; then npx @erode-app/cli check ./architecture --format json 2>&1; fi"
          }
        ]
      }
    ]
  }
}
```

Replace `./architecture` with your model path. This runs `erode check` after every edit to a source file and feeds the output back to Claude Code.

:::caution
The hook approach runs on every edit, which triggers multiple AI API calls each time. This adds up quickly during active sessions. The skill approach above is recommended for most users — it only runs when Claude Code judges that new integrations were introduced.
:::

## What's next

- [CLI Usage](/docs/guides/cli-usage/) — all `erode check` flags and options
- [Configuration](/docs/guides/configuration/) — environment variables for tuning the analysis
- [How It Works](/docs/how-it-works/) — understand the AI pipeline behind the check
