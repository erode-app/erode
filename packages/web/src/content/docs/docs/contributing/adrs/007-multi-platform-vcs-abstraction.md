---
title: 'ADR-007: Multi-platform VCS abstraction'
description: SourcePlatformReader and SourcePlatformWriter interfaces for GitHub, GitLab, and Bitbucket.
---

**Status:** Accepted\
**Date:** 2026-02-26\
**Authors:** Anders Hassis

## Context

Erode analyzes pull requests and merge requests from multiple version control platforms. GitHub calls them pull requests. GitLab calls them merge requests. Bitbucket calls them pull requests but uses a different API shape. Each platform has different APIs for fetching diffs, listing files, posting comments, and creating branches.

The analysis pipeline should not care which platform the change request came from. It needs diffs, file lists, and metadata in a consistent shape.

## Decision

Define two interfaces that split platform operations by direction:

- **`SourcePlatformReader`**. Parses change request URLs into a platform-agnostic `ChangeRequestRef`, fetches full change request data as `ChangeRequestData`, and retrieves commit lists.
- **`SourcePlatformWriter`**. Creates or updates change requests, posts comments (with upsert support via markers), deletes comments, and closes change requests.

Platform-agnostic types (`ChangeRequestRef`, `ChangeRequestData`, `ChangeRequestFile`, `ChangeAuthor`, `BranchRef`) normalize the differences. `PlatformId` carries platform-specific identifiers (owner/repo) that only the platform's own implementation accesses.

Three implementations exist: GitHub, GitLab, and Bitbucket. A `PlatformFactory` selects the implementation based on the change request URL.

## Rationale

Splitting read and write interfaces follows the interface segregation principle. The `analyze` pipeline only needs `SourcePlatformReader`. The `publish` pipeline needs `SourcePlatformWriter`. Neither depends on capabilities it does not use.

URL-based platform detection means users do not need to configure which platform they use. The system infers it from the PR/MR URL.

## Consequences

### Positive

- The pipeline processes GitHub PRs, GitLab MRs, and Bitbucket PRs with identical code paths.
- Adding a new platform requires implementing the reader/writer interfaces without changing pipeline code.
- Platform-specific API details stay encapsulated in their implementations.

### Negative

- The normalized `ChangeRequestData` type must accommodate all platforms. Platform-specific fields that do not map cleanly get lost or require optional properties.
- Comment upsert behavior (via `upsertMarker`) works differently across platforms, requiring platform-specific logic inside each writer.

## Related commits

- `8691ba8` - chore(release): release 0.4.0 (#24)
- `8687790` - fix: support GitLab and Bitbucket repository URLs in adapters (#36)
