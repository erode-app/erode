---
title: 'ADR-009: Docker and GitHub Action deployment'
description: Multi-platform Docker image with platform-specific entrypoints and GitHub Action wrapper.
---

**Status:** Accepted\
**Date:** 2026-02-24\
**Authors:** Anders Hassis

## Context

Erode runs in CI pipelines across GitHub Actions, GitLab CI, and Bitbucket Pipelines. Each platform passes configuration differently: GitHub Actions uses `INPUT_*` environment variables, GitLab CI and Bitbucket Pipelines use their own conventions. The tool also needs Node.js and git available at runtime.

Users need a way to run Erode in CI without managing Node.js installation, dependency resolution, or version pinning themselves.

## Decision

Package Erode as a Docker image with three platform-specific entrypoint scripts:

- `entrypoint.sh` for GitHub Actions. Maps `INPUT_*` variables to `ERODE_*` equivalents.
- `entrypoint-gitlab.sh` for GitLab CI. Maps GitLab CI variables.
- `entrypoint-bitbucket.sh` for Bitbucket Pipelines. Maps Bitbucket pipeline variables.

Provide a GitHub Action definition (`action.yml`) that wraps the Docker image. The action declares typed inputs with descriptions, making it discoverable in the GitHub Actions marketplace.

Use release-please for automated versioning and publishing. The release workflow builds multi-platform Docker images and publishes npm packages.

## Rationale

Docker ensures a consistent runtime environment regardless of the CI runner's base image. Platform-specific entrypoints keep variable mapping logic separate from the core analysis code.

The GitHub Action wrapper gives GitHub users a native experience (`uses: erode-app/erode@v0`) while the Docker image serves GitLab and Bitbucket users directly.

## Consequences

### Positive

- CI users get a working environment without managing Node.js or dependencies.
- Platform-specific configuration mapping stays in shell scripts, not application code.
- The GitHub Action provides typed inputs with documentation visible in the marketplace.
- Multi-platform Docker builds support both amd64 and arm64 runners.

### Negative

- Docker image size includes the full Node.js runtime and all dependencies. This adds pull time to CI runs.
- Three entrypoint scripts must be maintained in parallel. Changes to configuration options require updating all three.
- Users who want to run Erode without Docker must install it via npm, which is a separate consumption path to maintain.

## Related commits

- `8691ba8` - chore(release): release 0.4.0 (#24)
- `712a642` - feat: add erode check command, npm publishing, and Claude Code skill (#39)
