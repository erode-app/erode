# erode

Architecture erosion detection for GitHub PRs and GitLab MRs using LikeC4 models and AI.

Compares pull request diffs against a [LikeC4](https://likec4.dev) architecture model to find undeclared dependencies and architectural violations. Works as both a CLI tool and a GitHub Action. Supports GitHub pull requests and GitLab merge requests.

Supported AI providers: **Gemini** and **Anthropic**.

## Quick start

```bash
npm install
```

### Environment variables

Set via `.env` or export directly:

| Variable | Required | Description |
|---|---|---|
| `GITHUB_TOKEN` | Conditional | Required for GitHub PRs |
| `GITLAB_TOKEN` | Conditional | Required for GitLab MRs |
| `GITLAB_BASE_URL` | No | GitLab instance URL (default: `https://gitlab.com`) |
| `AI_PROVIDER` | No | `gemini` (default) or `anthropic` |
| `GEMINI_API_KEY` | Conditional | Required when using Gemini |
| `ANTHROPIC_API_KEY` | Conditional | Required when using Anthropic |

### Run directly (no build)

```bash
npx tsx src/cli.ts --help
```

### Build and run

```bash
npm run build
node dist/cli.js --help
```

## CLI commands

### `components <model-path>`

List components from an architecture model.

```bash
erode components ./model --format table
```

Options:
- `--model-format <format>` — Architecture model format (default: `likec4`)
- `--format <format>` — Output format: `table`, `json`, `yaml` (default: `table`)

### `connections <model-path> --repo <url>`

Show component connections from an architecture model.

```bash
erode connections ./model --repo https://github.com/org/repo
erode connections ./model --repo https://gitlab.com/group/project
```

Options:
- `--model-format <format>` — Architecture model format (default: `likec4`)
- `--repo <url>` — Repository URL (GitHub or GitLab)
- `--output <format>` — Output format: `console`, `json` (default: `console`)

### `analyze <model-path> --url <url>`

Analyze a change request for architecture drift.

```bash
erode analyze ./model --url https://github.com/org/repo/pull/42
erode analyze ./model --url https://gitlab.com/group/project/-/merge_requests/42
```

Options:
- `--url <url>` — Change request URL (GitHub PR or GitLab MR)
- `--model-format <format>` — Architecture model format (default: `likec4`)
- `--generate-model` — Generate architecture model code from the analysis
- `--output-file <path>` — Write structured JSON output to a file
- `--format <format>` — Output format: `console`, `json` (default: `console`)
- `--open-pr` — Create a PR with suggested model updates (requires `--generate-model`)
- `--dry-run` — Preview without creating a PR
- `--draft` — Create change request as draft (default: `true`)
- `--skip-file-filtering` — Analyze all changed files (skip pattern-based filtering)
- `--comment` — Post analysis results as a PR/MR comment (upserts by marker)
- `--github-actions` — Write GitHub Actions outputs and step summary
- `--fail-on-violations` — Exit with code 1 when violations are found

### `validate <model-path>`

Check that all components in an architecture model have repository links.

```bash
erode validate ./model
erode validate ./model --format json
```

Options:
- `--model-format <format>` — Architecture model format (default: `likec4`)
- `--format <format>` — Output format: `table`, `json` (default: `table`)

Exits with code 1 if any components are missing repository links.

## Repository links

erode maps repositories to LikeC4 components using `link` directives. Each component that represents a deployable service should have a link to its repository:

```
my_service = service 'My Service' {
  link https://github.com/org/my-service
}
```

For monorepos, multiple components can share the same repository URL. When analyzing a PR, Stage 0 uses AI to select the most relevant component:

```
frontend = webapp 'Frontend' {
  link https://github.com/org/monorepo
}

backend = service 'Backend API' {
  link https://github.com/org/monorepo
}
```

Use `erode validate` to check that all components in your model have repository links.

## GitHub Action usage

> **Note:** The GitHub Action only supports GitHub pull requests. For GitLab merge requests, see [GitLab CI usage](#gitlab-ci-usage) below.

### Basic example

```yaml
name: Architecture Drift Detection
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  erode:
    runs-on: ubuntu-latest
    steps:
      - uses: erode-app/core@main
        with:
          model-repo: 'org/architecture-model'
          model-path: '.'
          ai-provider: 'anthropic'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Advanced example

Use `fail-on-violations` to block PRs, `create-pr` to auto-generate model updates, and read outputs in subsequent steps:

```yaml
name: Architecture Drift Detection
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  erode:
    runs-on: ubuntu-latest
    steps:
      - uses: erode-app/core@main
        id: erode
        with:
          model-repo: 'org/architecture-model'
          ai-provider: 'anthropic'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          create-pr: 'true'
          fail-on-violations: 'true'

      - name: Check results
        if: always()
        run: |
          echo "Violations found: ${{ steps.erode.outputs.has-violations }}"
          echo "Count: ${{ steps.erode.outputs.violations-count }}"
```

### Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `model-repo` | Yes | | Repository containing the architecture model (`owner/repo`) |
| `model-path` | No | `.` | Path to the model within the model repository |
| `model-ref` | No | `main` | Git ref (branch/tag) of the model repository |
| `ai-provider` | No | `anthropic` | AI provider (`anthropic` or `gemini`) |
| `anthropic-api-key` | No | | Anthropic API key |
| `gemini-api-key` | No | | Gemini API key |
| `github-token` | Yes | | GitHub token for API access |
| `model-repo-token` | No | | Separate token for the model repository |
| `create-pr` | No | `false` | Create a PR with suggested model updates |
| `fail-on-violations` | No | `false` | Fail the action if violations are detected |
| `skip-file-filtering` | No | `false` | Analyze all changed files |

### Outputs

| Output | Description |
|---|---|
| `has-violations` | Whether architectural violations were detected |
| `violations-count` | Number of violations detected |
| `analysis-summary` | Summary of the analysis results |

## GitLab CI usage

### Using the Docker image

The Docker image includes `entrypoint-gitlab.sh` which handles model cloning and MR URL construction automatically:

```yaml
erode:
  image: ghcr.io/erode-app/core:latest
  entrypoint: ["/entrypoint-gitlab.sh"]
  rules:
    - if: $CI_MERGE_REQUEST_IID
  variables:
    GITLAB_TOKEN: $GITLAB_API_TOKEN
    ANTHROPIC_API_KEY: $ANTHROPIC_API_KEY
    LIKEC4_MODEL_REPO: "group/architecture-model"
```

The entrypoint supports these variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `GITLAB_TOKEN` | Yes | | GitLab API token with `api` scope |
| `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` | Yes | | AI provider API key |
| `AI_PROVIDER` | No | `anthropic` | `anthropic` or `gemini` |
| `LIKEC4_MODEL_REPO` | No | | Model repository path (e.g. `group/architecture-model`). Omit if the model is in the same repo |
| `LIKEC4_MODEL_PATH` | No | `.` | Path to model within the repository |
| `LIKEC4_MODEL_REF` | No | `main` | Git ref for the model repository |
| `LIKEC4_MODEL_REPO_TOKEN` | No | `$GITLAB_TOKEN` | Separate token for model repository access |
| `LIKEC4_CREATE_PR` | No | `false` | Create MR with suggested model updates |
| `LIKEC4_FAIL_ON_VIOLATIONS` | No | `false` | Exit with code 1 when violations are found |
| `LIKEC4_SKIP_FILE_FILTERING` | No | `false` | Analyze all changed files |
| `GITLAB_BASE_URL` | No | `https://gitlab.com` | For self-hosted GitLab instances |

### Calling the CLI directly

If you prefer more control, disable the default entrypoint and call the CLI:

```yaml
erode:
  image: ghcr.io/erode-app/core:latest
  entrypoint: [""]
  script:
    - >
      node /app/dist/cli.js analyze ./model
      --url "$CI_PROJECT_URL/-/merge_requests/$CI_MERGE_REQUEST_IID"
      --format json --comment --fail-on-violations
  rules:
    - if: $CI_MERGE_REQUEST_IID
  variables:
    GITLAB_TOKEN: $GITLAB_API_TOKEN
    ANTHROPIC_API_KEY: $ANTHROPIC_API_KEY
```

### Cloning model from a separate repository

```yaml
erode:
  image: ghcr.io/erode-app/core:latest
  entrypoint: [""]
  script:
    - git clone --depth 1 "https://gitlab-ci-token:${GITLAB_TOKEN}@gitlab.com/group/architecture-model.git" /tmp/model
    - >
      node /app/dist/cli.js analyze /tmp/model
      --url "$CI_PROJECT_URL/-/merge_requests/$CI_MERGE_REQUEST_IID"
      --format json --comment
  rules:
    - if: $CI_MERGE_REQUEST_IID
  variables:
    GITLAB_TOKEN: $GITLAB_API_TOKEN
    ANTHROPIC_API_KEY: $ANTHROPIC_API_KEY
```

> **Note:** Platform detection currently identifies `github.com` and `gitlab.com` from PR/MR URLs. Self-hosted GitLab instances require setting `GITLAB_BASE_URL`, but URL-based platform detection may not work — pass the full MR URL explicitly via `--url`.

## CLI usage in other CI systems

erode works in any CI environment. Set the required environment variables and call the CLI:

```bash
export GITHUB_TOKEN="..."        # or GITLAB_TOKEN for GitLab
export ANTHROPIC_API_KEY="..."   # or GEMINI_API_KEY

erode analyze ./path/to/model \
  --url "https://github.com/org/repo/pull/42" \
  --comment \
  --fail-on-violations \
  --format json
```

The `--comment` flag posts results back to the PR/MR. The `--fail-on-violations` flag exits with code 1 when violations are detected, useful for blocking merges in CI pipelines.

## Development

Requires Node.js >= 24.0.0.

```bash
npm run build          # Compile TypeScript and copy prompt templates
npm run test           # Run all tests (vitest)
npm run lint           # ESLint (zero warnings allowed)
npm run dev            # tsx watch mode
```

## License

[Apache 2.0](LICENSE)
