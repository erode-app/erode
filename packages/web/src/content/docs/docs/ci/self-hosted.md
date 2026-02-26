---
title: Self-Hosted
description: Run erode outside the official GitHub Action.
---

The [GitHub Action](/docs/ci/github-actions/) is the fastest way to get started, but you may want to run erode yourself if you:

- Need full control over the runtime environment
- Use GitHub Enterprise Server, self-hosted GitLab, or Bitbucket Cloud
- Run a CI platform other than GitHub Actions or GitLab CI

## Option 1: Fork the repo

The simplest self-hosted path for GitHub users. Fork the repository and reference your fork as a GitHub Action — the same `action.yml` inputs and outputs work without changes.

1. Fork [`erode-app/core`](https://github.com/erode-app/core) to your organization
2. Add repository secrets for your AI key and GitHub token
3. Reference the fork in your workflow:

```yaml
- uses: your-org/erode@main
  with:
    model-repo: your-org/architecture
    github-token: ${{ secrets.GITHUB_TOKEN }}
    gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
```

All [action inputs and outputs](/docs/ci/github-actions/#action-inputs) work the same way.

## Option 2: Docker image

For any CI platform, use the published container image:

```bash
docker run --rm \
  -e GITHUB_TOKEN="$GITHUB_TOKEN" \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  ghcr.io/erode-app/core:latest \
  analyze /model --url "$PR_URL" --comment --fail-on-violations
```

Mount a local model directory if the model is not in a remote repository:

```bash
docker run --rm \
  -v ./architecture:/model \
  -e GITHUB_TOKEN="$GITHUB_TOKEN" \
  -e GEMINI_API_KEY="$GEMINI_API_KEY" \
  ghcr.io/erode-app/core:latest \
  analyze /model --url "$PR_URL" --comment
```

### Example: generic CI job

```yaml
analyze:
  image: ghcr.io/erode-app/core:latest
  entrypoint: ['']
  script:
    - >
      node /app/packages/core/dist/ci-entry.js analyze /model
      --url "$PR_URL"
      --comment --fail-on-violations
  variables:
    GITHUB_TOKEN: $MY_GITHUB_TOKEN
    ANTHROPIC_API_KEY: $MY_ANTHROPIC_KEY
```

Override the entrypoint to call the CI entry point directly. The image includes Node.js and the built erode package at `/app/packages/core/dist/ci-entry.js`.

## Option 3: CLI

Clone the repository, build, and run erode as a regular Node.js CLI:

```bash
git clone https://github.com/erode-app/core.git
cd core
npm install && npm run build
```

Then run the analysis:

```bash
export GITHUB_TOKEN="..."
export ANTHROPIC_API_KEY="..."

node packages/cli/dist/cli.js analyze ./path/to/model \
  --url "https://github.com/org/repo/pull/42" \
  --comment \
  --fail-on-violations
```

See [CLI Usage](/docs/guides/cli-usage/) for the full command reference and [Configuration](/docs/guides/configuration/) for all environment variables.
