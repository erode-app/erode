---
title: 'ADR-013: Single repository locator'
description: One parser for repository identity across git remotes, model links, model repositories and change request URLs.
---

**Status:** Proposed\
**Date:** 2026-11-17\
**Authors:** Anders Hassis

## Context

Repository identity was parsed in five places: `normalizeToHttps` and `parseRepoFromRemote` in `git-diff.ts`, `normalizeRepositoryUrl` and `isRepositoryHostUrl` in `url-utils.ts`, `parseModelRepo` in `model-source.ts`, a regex per platform reader, and host checks in `platform-factory.ts`. Each accepted different forms, so one run could disagree with itself:

- `ssh://` remotes with a port, scp remotes with a user other than `git`, and SSH host aliases were not normalized.
- `--model-repo git@github.com:org/models.git` produced an invalid clone URL.
- `www.` hosts passed platform detection but failed in the readers.
- PR URLs with `/files`, `/diffs`, a trailing slash, a query or a fragment were rejected by GitLab and Bitbucket.
- Self-hosted hosts from `ERODE_GITHUB_BASE_URL` and `ERODE_GITLAB_BASE_URL` were not repository hosts, so model links to them were dropped.

## Decision

Add `packages/core/src/utils/repo-locator.ts` with `parseRepoLocator(input)`. It returns the platform, host, port, path segments, owner, repo, slug and a canonical HTTPS URL, or `null`.

- It accepts HTTPS and HTTP URLs, `ssh://` and `git+ssh://` with user and port, scp-style `user@host:path`, and `owner/repo` when the caller opts in.
- It strips credentials, `.git`, trailing slashes and platform suffixes (`/-/...`, `/tree/...`, `/blob/...`, `/pull/...`).
- Hosts come from a built-in list plus the hosts in the configured base URLs.
- Owner and repo keep their case. Matching against model links uses the lowercased canonical URL.

All call sites use the locator. `normalizeToHttps` and `parseRepoFromRemote` remain as thin wrappers because they are part of the public API. Readers parse PR URLs through one helper that finds the platform marker in the URL path and ignores anything after the number.

## Rationale

A single parser makes a remote, a model link and a PR URL for the same repository resolve to the same key. A dependency such as `git-url-parse` was not used; about 250 lines of `URL` handling and one scp regex cover the required forms without an extra package.

## Consequences

- Model links and remotes on configured self-hosted hosts now match components.
- An SSH `--model-repo` is cloned over SSH as given, without a token.
- Bitbucket Server and Data Center URLs are parsed for repository identity, but PR analysis still supports Bitbucket Cloud only.
- SSH host aliases are resolved only when they follow the `<host>-<suffix>` pattern; other aliases need `--repo`.
