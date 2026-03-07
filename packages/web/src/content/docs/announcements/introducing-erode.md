---
title: Introducing Erode
date: 2026-02-27
authors:
  - anders
excerpt: >
  Architecture models rot because nobody updates them. Erode checks every PR
  against your declared model and flags what drifted, while it is still one
  change and not a six-month cleanup.
---

You know how it goes. A frontend calls a backend it should not, a shared library creeps into everything, and nobody catches it because each PR looked fine on its own. Six months later you are debugging latency across services that were never supposed to talk to each other.

Someone draws a diagram of the system. It is useful for two weeks, then it rots because updating it means opening some other tool and doing a chore nobody asked for.

I kept running into this, which is why I built Erode.

## What it does

Erode checks every code change against a model of your system. If a change introduces a dependency that is not declared, it flags it. It does not block merges by default. It just makes the drift visible while it is still one PR and not a six-month cleanup.

The model can be [LikeC4](/docs/models/likec4/) or [Structurizr](/docs/models/structurizr/). All Erode needs is nodes and connections. It does not care which format or framework defines them.

## How it works

Erode runs a multi-stage AI pipeline on the diff:

1. **Component resolution** identifies which architecture component the changed code belongs to.
2. **Dependency scan** extracts new dependency signals from the diff.
3. **Drift analysis** compares those signals against the declared model and reports violations.

The result is a clear finding explaining what drifted and why it matters.

A violation is not necessarily a problem. Software evolves. What matters is that the change is visible and the decision to keep it or fix it is conscious.

## Getting started

The fastest way to try Erode is with the [playground repository](https://github.com/erode-app/playground). Fork it, add your API key, and open a PR that introduces an undeclared dependency.

For your own project, add the [GitHub Action](/docs/integrations/github-actions/) or run the CLI directly:

```bash
npx @erode-app/cli analyze ./model --url https://github.com/org/repo/pull/42
```

See the [getting started guide](/docs/getting-started/) for setup instructions including CI integration with GitHub Actions, GitLab CI, and Bitbucket Pipelines.

## What's next

- [Why It Matters](/docs/why-it-matters/): the case for architecture models that keep pace with your code
- [How It Works](/docs/how-it-works/): the AI pipeline behind the analysis
- [GitHub](https://github.com/erode-app/erode): the source code
