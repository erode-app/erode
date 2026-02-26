---
title: GitLab CI
description: Set up erode as a GitLab CI pipeline job.
---

erode analyzes GitLab merge requests using the same Docker image published for the GitHub Action.

## Using the Docker image

The image includes `entrypoint-gitlab.sh`, which handles model cloning and MR URL construction automatically:

```yaml
erode:
  image: ghcr.io/erode-app/core:latest
  entrypoint: ['/entrypoint-gitlab.sh']
  rules:
    - if: $CI_MERGE_REQUEST_IID
  variables:
    GITLAB_TOKEN: $GITLAB_API_TOKEN
    ANTHROPIC_API_KEY: $ANTHROPIC_API_KEY
    LIKEC4_MODEL_REPO: 'group/architecture-model'
```

### Environment variables

| Variable                                | Required | Default              | Description                                                                                    |
| --------------------------------------- | -------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| `GITLAB_TOKEN`                          | Yes      |                      | GitLab API token with `api` scope                                                              |
| `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` | Yes      |                      | AI provider API key                                                                            |
| `AI_PROVIDER`                           | No       | `anthropic`          | `anthropic` or `gemini`                                                                        |
| `LIKEC4_MODEL_REPO`                     | No       |                      | Model repository path (e.g. `group/architecture-model`). Omit if the model is in the same repo |
| `LIKEC4_MODEL_PATH`                     | No       | `.`                  | Path to model within the repository                                                            |
| `LIKEC4_MODEL_REF`                      | No       | `main`               | Git ref for the model repository                                                               |
| `LIKEC4_MODEL_REPO_TOKEN`               | No       | `$GITLAB_TOKEN`      | Separate token for model repository access                                                     |
| `LIKEC4_OPEN_PR`                        | No       | `false`              | Create MR with suggested model updates                                                         |
| `LIKEC4_FAIL_ON_VIOLATIONS`             | No       | `false`              | Exit with code 1 when violations are found                                                     |
| `LIKEC4_SKIP_FILE_FILTERING`            | No       | `false`              | Analyze all changed files                                                                      |
| `GITLAB_BASE_URL`                       | No       | `https://gitlab.com` | For self-hosted GitLab instances                                                               |

## Calling the CLI directly

If you prefer more control, disable the default entrypoint and call the CLI:

```yaml
erode:
  image: ghcr.io/erode-app/core:latest
  entrypoint: ['']
  script:
    - >
      node /app/packages/core/dist/ci-entry.js analyze ./model
      --url "$CI_PROJECT_URL/-/merge_requests/$CI_MERGE_REQUEST_IID"
      --format json --comment --fail-on-violations
  rules:
    - if: $CI_MERGE_REQUEST_IID
  variables:
    GITLAB_TOKEN: $GITLAB_API_TOKEN
    ANTHROPIC_API_KEY: $ANTHROPIC_API_KEY
```

## Cloning model from a separate repository

```yaml
erode:
  image: ghcr.io/erode-app/core:latest
  entrypoint: ['']
  script:
    - git clone --depth 1 "https://gitlab-ci-token:${GITLAB_TOKEN}@gitlab.com/group/architecture-model.git" /tmp/model
    - >
      node /app/packages/core/dist/ci-entry.js analyze /tmp/model
      --url "$CI_PROJECT_URL/-/merge_requests/$CI_MERGE_REQUEST_IID"
      --format json --comment
  rules:
    - if: $CI_MERGE_REQUEST_IID
  variables:
    GITLAB_TOKEN: $GITLAB_API_TOKEN
    ANTHROPIC_API_KEY: $ANTHROPIC_API_KEY
```

## Self-hosted GitLab

Set `GITLAB_BASE_URL` to point at your instance:

```yaml
variables:
  GITLAB_BASE_URL: https://gitlab.example.com
```

Platform detection identifies `github.com` and `gitlab.com` from PR/MR URLs. Self-hosted GitLab instances require `GITLAB_BASE_URL` and the full MR URL passed via `--url`.

See [Configuration](/docs/guides/configuration/) for all environment variables and [Self-Hosted](/docs/ci/self-hosted/) for other deployment options.
