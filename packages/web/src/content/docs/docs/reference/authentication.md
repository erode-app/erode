---
title: Authentication
description: Token types and permissions for GitHub, GitLab, and Bitbucket.
---

Erode needs a platform token to read diffs and post analysis comments. This page covers the required permissions for each platform. For the environment variable names and other configuration, see [Configuration](/docs/reference/configuration/).

## GitHub

Erode uses `ERODE_GITHUB_TOKEN` to read the source PR and post analysis comments. `ERODE_MODEL_REPO_PR_TOKEN` is used to create model update PRs (branches, commits, pull requests) on the model repository and falls back to `ERODE_GITHUB_TOKEN` when not set.

### Token permissions

**Same repository** (source code and architecture model live in one repo, so a single token covers everything):

| Feature                              | Permissions                                             |
| ------------------------------------ | ------------------------------------------------------- |
| Read PR and diff                     | Contents: Read, Pull requests: Read                     |
| Post analysis comments               | Issues: Read and write                                  |
| Create model update PR (`--open-pr`) | Contents: Read and write, Pull requests: Read and write |

**External model repository** (source and model are in separate repos, each with its own token):

| Token                       | Repository  | Permissions                                                 |
| --------------------------- | ----------- | ----------------------------------------------------------- |
| `ERODE_GITHUB_TOKEN`        | Source repo | Contents: Read, Pull requests: Read, Issues: Read and write |
| `ERODE_MODEL_REPO_PR_TOKEN` | Model repo  | Contents: Read and write, Pull requests: Read and write     |

### Fine-grained PATs

Select these **Repository permissions** when creating a fine-grained personal access token:

- **Contents**: Read-only (or Read and write if using `--open-pr` on that repo)
- **Pull requests**: Read-only (or Read and write if using `--open-pr` on that repo)
- **Issues**: Read and write (source repo only)

### Classic PATs

The `repo` scope covers all required permissions. If the model repository is public, `public_repo` is sufficient for `ERODE_MODEL_REPO_PR_TOKEN`.

### GitHub Apps (recommended for organizations)

GitHub Apps are the recommended token strategy for organizations:

- **Short-lived tokens**: automatically generated and rotated on every workflow run, eliminating long-lived secrets
- **Repository-scoped**: access is limited to specific repositories, not broad user-level access
- **Not tied to user accounts**: tokens keep working when people leave the organization or change roles
- **Centralized permissions**: managed through the App's installation settings, not individual developer tokens

Use the same Repository permissions as fine-grained PATs above. See [GitHub App Token](/docs/integrations/github-actions/#github-app-token) for a complete workflow example.

:::note
PR comments are created through GitHub's Issues API (`issues.createComment`), so **Issues: Read and write** is required even though it looks like a Pull requests operation.
:::

## GitLab (experimental)

Erode uses `ERODE_GITLAB_TOKEN` for all operations on the source project: reading MR diffs, posting notes, and (with `--open-pr`) creating branches, commits, and merge requests. The `api` scope is required; `read_api` is **not** sufficient.

For external model projects, the CI entrypoint accepts `ERODE_MODEL_REPO_TOKEN` (see [GitLab CI](/docs/integrations/gitlab-ci/)).

| Type                  | Scope | Minimum role |
| --------------------- | ----- | ------------ |
| Personal Access Token | `api` | —            |
| Project Access Token  | `api` | Developer    |
| Group Access Token    | `api` | Developer    |

## Bitbucket (experimental)

`ERODE_BITBUCKET_TOKEN` handles all operations. There is no separate model-repo token. If the token contains `:` (e.g. `username:app_password`), Erode uses HTTP Basic auth; otherwise it uses Bearer auth.

| Feature                              | App password scopes                       |
| ------------------------------------ | ----------------------------------------- |
| Read PRs and diffs                   | Repositories: Read                        |
| Post PR comments                     | Pull requests: Write                      |
| Create model update PR (`--open-pr`) | Repositories: Write, Pull requests: Write |

Minimum scopes (no `--open-pr`): **Repositories: Read** + **Pull requests: Write**.
Full scopes (with `--open-pr`): **Repositories: Write** + **Pull requests: Write**.

Repository access tokens and workspace access tokens use the same permission categories but authenticate with Bearer auth.
