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

- **core** — Analysis engine with AI pipeline, providers, adapters, and platform integrations.
- **cli** — Interactive terminal interface.
- **web** — Documentation and landing page.
- **eslint-config** — Shared ESLint configuration for all packages.
