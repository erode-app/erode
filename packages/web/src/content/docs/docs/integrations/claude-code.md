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

Download [`SKILL.md`](https://erode.dev/.well-known/agent-skills/erode-check/SKILL.md)
and save it to `.claude/skills/erode-check/SKILL.md` in your repository:

```bash
mkdir -p .claude/skills/erode-check
curl -o .claude/skills/erode-check/SKILL.md \
  https://erode.dev/.well-known/agent-skills/erode-check/SKILL.md
```

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

## Agent skills discovery

The erode-check skill is published at
[`erode.dev/.well-known/agent-skills/`](https://erode.dev/.well-known/agent-skills/index.json)
following the [Agent Skills Discovery RFC](https://github.com/cloudflare/agent-skills-discovery-rfc).
Agents that support the protocol can discover and load the skill automatically
without manual setup.

## What's next

- [CLI Commands](/docs/reference/cli-commands/): all `erode check` flags and options
- [Configuration](/docs/reference/configuration/): environment variables for tuning the analysis
- [How It Works](/docs/how-it-works/): understand the AI pipeline behind the check
