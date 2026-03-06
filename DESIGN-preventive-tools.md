# Erode Preventive Tools — Design Document

## Problem

Erode currently detects architecture drift **reactively** — at PR review time.
By then, a developer may have spent hours or days building on the wrong
foundation. We need to shift detection **left** into the coding phase itself.

## Solution: `erode check` CLI Command

A local command developers run against their working tree to catch drift before
pushing. It reuses the existing Stage 2 (dependency extraction) and Stage 3
(drift analysis) AI pipeline, but operates on local git diffs instead of PR
API data.

---

## Usage

```bash
# Check uncommitted changes against architecture
erode check ./architecture --repo https://github.com/org/my-service

# Check staged changes only (for pre-commit hooks)
erode check ./architecture --repo https://github.com/org/my-service --staged

# Check branch diff against main (for pre-push hooks)
erode check ./architecture --repo https://github.com/org/my-service --branch main

# Override component selection (skip Stage 1 AI call)
erode check ./architecture --repo https://github.com/org/my-service --component cloud.api

# JSON output for scripting
erode check ./architecture --repo https://github.com/org/my-service --format json
```

### Exit Codes

- `0` — No violations found
- `1` — Violations detected (when `--fail-on-violations` is set)
- `2` — Error (model not found, API failure, etc.)

### Git Hook Integration

```bash
# .husky/pre-commit
erode check ./architecture --staged --fail-on-violations

# .husky/pre-push
erode check ./architecture --branch main --fail-on-violations
```

---

## Implementation

### New Files

| File                                   | Purpose                             |
| -------------------------------------- | ----------------------------------- |
| `packages/core/src/pipelines/check.ts` | Core pipeline (shared logic)        |
| `packages/core/src/utils/git-diff.ts`  | Generate diffs from local git state |
| `packages/cli/src/commands/check.ts`   | CLI command definition              |

### Modified Files

| File                                        | Change                     |
| ------------------------------------------- | -------------------------- |
| `packages/core/src/index.ts`                | Export `runCheck` pipeline |
| `packages/cli/src/cli.ts`                   | Register `check` command   |
| `packages/cli/src/utils/command-schemas.ts` | Add `CheckOptionsSchema`   |

---

### Core Pipeline: `runCheck`

Location: `packages/core/src/pipelines/check.ts`

```typescript
interface CheckOptions {
  modelPath: string;
  diff: string; // Pre-generated diff string
  repo: string; // Repository URL
  repoOwner: string; // Parsed repository owner
  repoName: string; // Parsed repository name
  modelFormat?: string; // 'likec4' | 'structurizr'
  componentId?: string; // Skip Stage 1 if provided
  format?: 'console' | 'json';
  files?: GitDiffFile[]; // Changed files from the diff
  stats?: GitDiffStats; // Diff statistics (additions, deletions, filesChanged)
  skipFileFiltering?: boolean; // Bypass .erodeignore patterns
}

interface CheckResult {
  analysisResult: DriftAnalysisResult;
  hasViolations: boolean;
}
```

**Pipeline steps:**

1. **Load model** — `createAdapter(format)` + `loadFromPath(path)`
2. **Find component(s)** — `adapter.findAllComponentsByRepository(repo)`
3. **Component selection** — If multiple matches and no `--component` flag,
   use Stage 1 AI selection via `provider.selectComponent()`. Extract file
   list from the diff (parse `diff --git a/path b/path` lines).
4. **Stage 2** — `provider.extractDependencies()` with the diff. Synthesize
   the `commit` and `repository` fields from options.
5. **Build prompt data** — Assemble `DriftAnalysisPromptData` using adapter
   queries. Synthesize `ChangeRequestMetadata` from available info.
6. **Stage 3** — `provider.analyzeDrift(promptData)`
7. **Return** — `CheckResult` wrapping the `DriftAnalysisResult`

**Synthesizing `ChangeRequestMetadata`:** The drift analysis prompt expects
PR metadata. For local checks we synthesize minimal values:

```typescript
const metadata: ChangeRequestMetadata = {
  number: 0,
  title: 'Local changes',
  description: null,
  repository: `${owner}/${repoName}`,
  author: { login: 'local' },
  base: { ref: branch ?? 'HEAD', sha: '' },
  head: { ref: 'working-tree', sha: '' },
  stats: { commits: 0, additions, deletions, files_changed },
  commits: [],
};
```

This is enough context for the AI — the prompts primarily use the diff
content and architectural context, not PR metadata.

---

### Git Diff Utility

Location: `packages/core/src/utils/git-diff.ts`

Thin wrapper around `child_process.execSync` to generate diffs:

```typescript
interface GitDiffOptions {
  staged?: boolean; // git diff --staged
  branch?: string; // git diff <branch>...HEAD
  cwd?: string; // Working directory
}

interface GitDiffResult {
  diff: string;
  stats: { additions: number; deletions: number; filesChanged: number };
  files: { filename: string; status: string }[];
}

function generateGitDiff(options: GitDiffOptions): GitDiffResult;
```

- Default (no flags): `git diff` (unstaged changes)
- `--staged`: `git diff --staged`
- `--branch main`: `git diff main...HEAD`
- Parse diff stats from `git diff --stat`
- Parse file list from `diff --git a/... b/...` headers

---

### CLI Command

Location: `packages/cli/src/commands/check.ts`

```text
erode check <model-path>
  --repo <url>              Repository URL (auto-detected from git remote if omitted)
  --model-format <format>   Model format (default: likec4)
  --staged                  Check staged changes only
  --branch <branch>         Compare against branch (e.g., main)
  --component <id>          Skip component selection, use this ID
  --format <format>         Output format: console | json
  --fail-on-violations      Exit with code 1 if violations found
  --skip-file-filtering     Bypass .erodeignore patterns
```

The command:

1. Generates a diff via `generateGitDiff()`
2. Validates the diff is non-empty (exit 0 with message if no changes)
3. Calls `runCheck()` with the diff and options
4. Formats output (reuse existing `OutputFormatter`)
5. Sets exit code based on results

---

### Schema

Addition to `packages/cli/src/utils/command-schemas.ts`:

```typescript
export const CheckOptionsSchema = z.object({
  repo: z.url(),
  modelFormat: z.string().default('likec4'),
  staged: z.boolean().optional().default(false),
  branch: z.string().optional(),
  component: z.string().optional(),
  format: z.enum(['console', 'json']).optional().default('console'),
  failOnViolations: z.boolean().optional().default(false),
  skipFileFiltering: z.boolean().optional().default(false),
});
```

---

## What Gets Reused vs. What's New

| Component                                | Status                           |
| ---------------------------------------- | -------------------------------- |
| `ArchitectureModelAdapter` interface     | Reused as-is                     |
| `AIProvider.extractDependencies()`       | Reused as-is                     |
| `AIProvider.analyzeDrift()`              | Reused as-is                     |
| `AIProvider.selectComponent()`           | Reused as-is                     |
| `PromptBuilder` + templates              | Reused as-is                     |
| `createAdapter()` / `createAIProvider()` | Reused as-is                     |
| `ProgressReporter` / `ConsoleProgress`   | Reused as-is                     |
| `OutputFormatter`                        | Reused as-is                     |
| `loadSkipPatterns` / `applySkipPatterns` | Reused for file filtering        |
| `runCheck` pipeline                      | **New** — orchestrates the above |
| `generateGitDiff` utility                | **New** — local diff generation  |
| `erode check` CLI command                | **New** — Commander.js command   |
| `CheckOptionsSchema`                     | **New** — Zod schema             |
