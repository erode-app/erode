---
title: Bitbucket Pipelines
description: Set up erode as a Bitbucket Pipelines step.
sidebar:
  badge:
    text: Experimental
    variant: caution
---

erode analyzes Bitbucket pull requests using the same Docker image published for the GitHub Action.

## Using the Docker image

The image includes `entrypoint-bitbucket.sh`, which handles model cloning and PR URL construction automatically:

```yaml
pipelines:
  pull-requests:
    '**':
      - step:
          name: erode
          image: ghcr.io/erode-app/core:latest
          script:
            - /entrypoint-bitbucket.sh
          variables:
            BITBUCKET_TOKEN: $BITBUCKET_TOKEN
            ANTHROPIC_API_KEY: $ANTHROPIC_API_KEY
            LIKEC4_MODEL_REPO: 'workspace/architecture-model'
```

:::note
Bitbucket Pipelines does **not** provide a built-in token like GitHub's `GITHUB_TOKEN`. You must create an [app password](https://support.atlassian.com/bitbucket-cloud/docs/app-passwords/) or a [repository/workspace access token](https://support.atlassian.com/bitbucket-cloud/docs/repository-access-tokens/) and store it as a [repository variable](https://support.atlassian.com/bitbucket-cloud/docs/variables-and-secrets/).
:::

### Environment variables

| Variable                                                   | Required | Default                         | Description                                                 |
| ---------------------------------------------------------- | -------- | ------------------------------- | ----------------------------------------------------------- |
| `BITBUCKET_TOKEN`                                          | Yes      |                                 | App password or repository/workspace access token           |
| `GEMINI_API_KEY`, `OPENAI_API_KEY`, or `ANTHROPIC_API_KEY` | Yes      |                                 | AI provider API key                                         |
| `AI_PROVIDER`                                              | No       | `anthropic`                     | `gemini`, `openai`, or `anthropic`                          |
| `LIKEC4_MODEL_REPO`                                        | No       |                                 | Model repository path (e.g. `workspace/architecture-model`) |
| `LIKEC4_MODEL_PATH`                                        | No       | `.`                             | Path to model within the repository                         |
| `LIKEC4_MODEL_REF`                                         | No       | `main`                          | Git ref for the model repository                            |
| `LIKEC4_MODEL_REPO_TOKEN`                                  | No       | `$BITBUCKET_TOKEN`              | Separate token for model repository access                  |
| `LIKEC4_OPEN_PR`                                           | No       | `false`                         | Create PR with suggested model updates                      |
| `LIKEC4_FAIL_ON_VIOLATIONS`                                | No       | `false`                         | Exit with code 1 when violations are found                  |
| `LIKEC4_SKIP_FILE_FILTERING`                               | No       | `false`                         | Analyze all changed files                                   |
| `BITBUCKET_BASE_URL`                                       | No       | `https://api.bitbucket.org/2.0` | For self-hosted Bitbucket Data Center/Server instances      |

## Calling the CLI directly

If you prefer more control, call the CLI directly instead of using the entrypoint:

```yaml
pipelines:
  pull-requests:
    '**':
      - step:
          name: erode
          image: ghcr.io/erode-app/core:latest
          script:
            - >
              node /app/packages/core/dist/ci-entry.js analyze ./model
              --url "https://bitbucket.org/${BITBUCKET_WORKSPACE}/${BITBUCKET_REPO_SLUG}/pull-requests/${BITBUCKET_PR_ID}"
              --format json --comment --fail-on-violations
          variables:
            BITBUCKET_TOKEN: $BITBUCKET_TOKEN
            ANTHROPIC_API_KEY: $ANTHROPIC_API_KEY
```

## Cloning model from a separate repository

```yaml
pipelines:
  pull-requests:
    '**':
      - step:
          name: erode
          image: ghcr.io/erode-app/core:latest
          script:
            - git clone --depth 1 "https://x-token-auth:${BITBUCKET_TOKEN}@bitbucket.org/workspace/architecture-model.git" /tmp/model
            - >
              node /app/packages/core/dist/ci-entry.js analyze /tmp/model
              --url "https://bitbucket.org/${BITBUCKET_WORKSPACE}/${BITBUCKET_REPO_SLUG}/pull-requests/${BITBUCKET_PR_ID}"
              --format json --comment
          variables:
            BITBUCKET_TOKEN: $BITBUCKET_TOKEN
            ANTHROPIC_API_KEY: $ANTHROPIC_API_KEY
```

If your token is an app password (`username:app_password` format), use it directly in the clone URL instead of `x-token-auth:${BITBUCKET_TOKEN}`.

## Self-hosted Bitbucket

Set `BITBUCKET_BASE_URL` to point at your Data Center or Server instance:

```yaml
variables:
  BITBUCKET_BASE_URL: https://bitbucket.example.com/rest/api/1.0
```

Platform detection identifies `bitbucket.org` from PR URLs. Self-hosted Bitbucket instances require `BITBUCKET_BASE_URL` and the full PR URL passed via `--url`.

See [Configuration](/docs/guides/configuration/) for all environment variables and [Self-Hosted](/docs/ci/self-hosted/) for other deployment options.
