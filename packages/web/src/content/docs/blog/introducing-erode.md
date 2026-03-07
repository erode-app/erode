---
title: Introducing Erode
date: 2025-06-15
authors:
  - anders
excerpt: >
  Erode detects architecture drift by comparing pull requests against your
  declared architecture model. Today we are making it available as an open-source
  CLI and CI integration.
---

Software teams draw architecture diagrams, agree on component boundaries, and then watch those boundaries erode one pull request at a time. By the time someone notices, the codebase has drifted far from the intended design.

Erode closes that feedback loop. It reads your architecture model (LikeC4 or Structurizr), fetches a pull request diff, and uses AI to flag any changes that introduce undeclared dependencies or violate the declared structure.

## How it works

Erode runs a multi-stage AI pipeline:

1. **Component resolution** identifies which architecture component the changed code belongs to.
2. **Dependency scan** extracts new dependency signals from the diff.
3. **Drift analysis** compares those signals against the declared model and reports violations.

The result is a clear, actionable comment on your pull request explaining what drifted and why it matters.

## Getting started

Install erode and point it at your architecture model:

```bash
npm install -g erode
erode analyze --pr <url>
```

Or run it locally against uncommitted changes:

```bash
erode check
```

See the [getting started guide](/docs/getting-started/) for full setup instructions including CI integration with GitHub Actions, GitLab CI, and Bitbucket Pipelines.

## What's next

We are working on richer reporting, support for additional model formats, and tighter IDE integration. Follow the project on [GitHub](https://github.com/erode-app/erode) to stay updated.
