---
name: doc-sync
description: >-
  Detect documentation drift by comparing source-of-truth code (CLI commands,
  flags, env vars, GH Action inputs/outputs) against web docs and README.
  Use when files that define the user-facing interface change, when the user
  asks to check docs, or when mentioning doc drift, stale docs, or documentation sync.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Documentation Sync

Detect discrepancies between code (source of truth) and documentation by
extracting the user-facing interface from code and comparing it against docs.

## When to Activate

Suggest running this skill when you detect changes to any of these files
(staged, unstaged, or in recent commits):

### CLI interface

- `packages/cli/src/commands/analyze.ts`
- `packages/cli/src/commands/validate.ts`
- `packages/cli/src/commands/components.ts`
- `packages/cli/src/commands/connections.ts`
- `packages/cli/src/utils/command-schemas.ts`

### CI entry & GitHub Action

- `packages/core/src/ci-entry.ts`
- `action.yml`

### Environment variables & config

- `packages/core/src/utils/config.ts`

### Public API & output

- `packages/core/src/index.ts`
- `packages/core/src/output.ts`
- `packages/core/src/output/structured-output.ts`
- `packages/core/src/output/ci-output.ts`
- `packages/core/src/schemas/*.schema.ts`

When any of these appear in changes, say:

> Source-of-truth files changed. Want me to run doc-sync to check for documentation drift?

## Documentation Targets

| Doc file                                                            | What it documents                        |
| ------------------------------------------------------------------- | ---------------------------------------- |
| `packages/web/src/content/docs/docs/guides/cli-usage.md`            | CLI commands, arguments, flags           |
| `packages/web/src/content/docs/docs/guides/configuration.md`        | Environment variables, defaults          |
| `packages/web/src/content/docs/docs/ci/github-actions.md`           | GH Action inputs, outputs, CI setup      |
| `packages/web/src/content/docs/docs/getting-started.md`             | Quick-start examples                     |
| `packages/web/src/content/docs/docs/how-it-works.md`                | Pipeline stages overview                 |
| `packages/web/src/content/docs/docs/reference/ai-providers.md`      | Provider names, default models, timeouts |
| `packages/web/src/content/docs/docs/reference/analysis-pipeline.md` | Stage details                            |
| `packages/web/src/content/docs/docs/models/likec4.md`               | Model format, repository links           |
| `README.md`                                                         | Commands, flags, env vars, examples      |

## Workflow

### Step 1: Extract from Code

**1a. CLI Commands & Flags**

Read each command file in `packages/cli/src/commands/` and extract:

- Command name (from `new Command('name')`)
- Description (from `.description()`)
- Arguments (from `.argument()` — name, description, required/optional)
- Options (from `.option()` and `.requiredOption()` — flag, description, default, required)

Note: `connections` uses `--output` for format selection, not `--format` like other commands.

Cross-check with Zod schemas in `packages/cli/src/utils/command-schemas.ts` — defaults there take precedence.

Read `packages/core/src/ci-entry.ts` to extract the `erode-ci` binary's flags (`getFlag`/`hasFlag` calls).

**1b. GitHub Action Interface**

Read `action.yml` in the repo root and extract all `inputs` (name, description, required, default) and `outputs` (name, description).

Read `packages/core/src/output/ci-output.ts` to verify the output names written to `GITHUB_OUTPUT` match `action.yml` outputs.

**1c. Environment Variables**

Read `packages/core/src/utils/config.ts` and extract:

- Every key in `ENV_MAPPINGS` — these are the env var names
- The config path each maps to
- The default value from `ConfigSchema` (`.default()` calls)
- Zod constraints (`.min()`, `.max()`, `.enum()`)

**1d. Structured Output**

Read `packages/core/src/output/structured-output.ts` for `StructuredAnalysisOutput` fields. Note: `status` has four values: `success`, `violations`, `error`, `skipped`.

### Step 2: Compare Against Docs

For each documentation target, check:

**Completeness:**

- Every CLI command listed with correct arguments and all flags
- Every env var from `ENV_MAPPINGS` in configuration docs
- Every GH Action input/output from `action.yml` in github-actions docs
- Default values match code exactly

**Accuracy:**

- Flag names match code (e.g., `--url` not `--pr`)
- Positional args shown correctly (e.g., `<model-path>` is a positional arg)
- Required vs optional status matches
- Model names in provider docs match config defaults

**Cross-page consistency:**

- Same item described consistently across all pages
- README and web docs don't contradict each other

**Known intentional differences** (do NOT flag as bugs):

- `action.yml` defaults `ai-provider` to `anthropic`, but `config.ts` defaults `AI_PROVIDER` to `gemini` — these are different interfaces with different defaults

### Step 3: Report

Group findings by category:

- **Missing from docs** — Items in code but not documented
- **Incorrect in docs** — Wrong values (flag names, defaults, descriptions)
- **Inconsistent across docs** — Same item differs between pages
- **Up to date** — Confirmed-correct items

For every finding: name the exact file, the code value, and the doc value.

### Step 4: Propose Edits

For each affected doc file, draft the specific markdown changes as before/after blocks. Group by file. Present for user review before applying.

## Rules

1. Be specific — exact file, line, code snippet vs doc snippet for every finding
2. Flag newly-added items prominently (new env var or flag with zero documentation)
3. Check both web docs AND README
4. Skip internal/non-user-facing items (private types, implementation details)
5. Do not flag known intentional differences (see list above)
