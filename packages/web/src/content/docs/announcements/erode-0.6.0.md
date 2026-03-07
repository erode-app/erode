---
title: Catch drift before the PR
date: 2026-03-06
authors:
  - anders
excerpt: >
  0.6.0 adds local drift detection so you can catch architectural violations
  before pushing a PR, not after someone has already reviewed the code.
---

Until now, Erode only ran in CI. You found out about drift after pushing a PR
and after someone already reviewed the code.

0.6.0 adds local detection. Three things shipped:

## `erode check`

A new command that runs the same AI pipeline as `analyze` but operates on local git diffs instead of fetching PR data from a platform API.

```bash
erode check ./model                # unstaged changes
erode check ./model --staged       # staged changes
erode check ./model --branch main  # branch diff
```

No platform tokens needed. No PR required. Just a local git repo and an AI provider key. Wire it into git hooks with `--fail-on-violations` for automatic checking. See [CLI Commands](/docs/reference/cli-commands/) for all flags and options.

## Claude Code skill

A [custom skill](/docs/integrations/claude-code/) that runs `erode check` during Claude Code sessions. When Claude Code writes code that introduces a new import, API call, or service connection, the skill flags undeclared dependencies and surfaces them in the conversation.

The skill triggers on new integrations and before commits. It skips changes that cannot introduce dependencies (docs, tests, config). A violation is not an error. Claude Code shows what it found so you can decide: fix the code or update the model.

## npm publishing

Erode is now published as [`@erode-app/cli`](https://www.npmjs.com/package/@erode-app/cli) on npm. Run it with `npx @erode-app/cli check ./model`, no global install needed. This is what makes the Claude Code skill work. See [Getting Started](/docs/getting-started/) for setup.

## What's next

- [CLI Commands](/docs/reference/cli-commands/): all `erode check` flags and options
- [Claude Code integration](/docs/integrations/claude-code/): setup guide for the skill
- [Getting Started](/docs/getting-started/): CI setup for `erode analyze`
