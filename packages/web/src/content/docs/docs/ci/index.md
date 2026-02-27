---
title: CI Integration
description: Set up Erode in your CI pipeline to detect architecture drift on every pull request.
head:
  - tag: script
    attrs:
      src: /architecture/likec4-views.js
---

Erode runs inside your CI pipeline and analyzes every pull request against your architecture model. When a PR introduces an undeclared dependency, Erode flags the violation and comments directly on the pull request.

All platforms use the same Docker image and analysis engine — only the entrypoint and platform-specific environment variables differ.

<div class="likec4-embed">
<likec4-view view-id="platforms" browser="true"></likec4-view>
</div>

> [Open full interactive viewer →](/architecture/#/view/platforms/)

## Supported platforms

| Platform            | Status       | Guide                                                |
| ------------------- | ------------ | ---------------------------------------------------- |
| GitHub Actions      | Stable       | [GitHub Actions](/docs/ci/github-actions/)           |
| GitLab CI           | Experimental | [GitLab CI](/docs/ci/gitlab-ci/)                     |
| Bitbucket Pipelines | Experimental | [Bitbucket Pipelines](/docs/ci/bitbucket-pipelines/) |

You can also run Erode on any infrastructure using the [self-hosted](/docs/ci/self-hosted/) guide.

## GitHub Actions

The GitHub Action is the most mature integration. It supports action inputs and outputs, automatic PR comments, and optional model-update PRs out of the box.

[Get started with GitHub Actions →](/docs/ci/github-actions/)

## GitLab CI

:::caution[Experimental]
GitLab CI support is new. The entrypoint and environment variable interface may change in future releases.
:::

Erode provides an entrypoint script (`entrypoint-gitlab.sh`) that handles model cloning and merge request URL construction. It works with both gitlab.com and self-hosted instances.

[Set up GitLab CI →](/docs/ci/gitlab-ci/)

## Bitbucket Pipelines

:::caution[Experimental]
Bitbucket Pipelines support is new. The entrypoint and environment variable interface may change in future releases.
:::

Erode provides an entrypoint script (`entrypoint-bitbucket.sh`) for Bitbucket Cloud. Self-hosted Bitbucket Data Center and Server instances are also supported.

[Set up Bitbucket Pipelines →](/docs/ci/bitbucket-pipelines/)

## Self-hosted

Run Erode on any infrastructure — bare metal, Kubernetes, or other CI systems — using the Docker image or the CLI directly.

[Self-hosted guide →](/docs/ci/self-hosted/)
