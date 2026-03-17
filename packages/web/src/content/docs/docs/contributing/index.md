---
title: Contributing
description: How to contribute to the Erode monorepo.
head:
  - tag: script
    attrs:
      src: /architecture/likec4-views.js
---

Erode is an npm workspace monorepo. The diagram below shows the package structure and their relationships.

<div class="likec4-embed">
<likec4-view view-id="packages" browser="true"></likec4-view>
</div>

> [Open full interactive viewer →](/architecture/#/view/packages/)

## Packages

| Package           | npm               | Description                                                             |
| ----------------- | ----------------- | ----------------------------------------------------------------------- |
| **core**          | `@erode-app/core` | Analysis engine. Exports the `erode-ci` binary used by CI integrations. |
| **cli**           | `@erode-app/cli`  | Interactive terminal interface. Exports the `erode` binary.             |
| **web**           | private           | Documentation and landing page.                                         |
| **architecture**  | private           | LikeC4 architecture diagrams.                                           |
| **eslint-config** | private           | Shared ESLint configuration.                                            |

### CI entry point

GitHub Actions, GitLab CI, and Bitbucket Pipelines all invoke `erode-ci` (core's `dist/ci-entry.js`).
The entrypoint scripts live at the repo root: `entrypoint.sh`, `entrypoint-gitlab.sh`, `entrypoint-bitbucket.sh`.
