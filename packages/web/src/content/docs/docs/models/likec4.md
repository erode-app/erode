---
title: LikeC4 Model
description: Write the architecture model that erode reads.
---

erode reads a LikeC4 architecture model to understand your system's intended structure. It compares pull request changes against this model to detect drift.

## What is LikeC4

LikeC4 is a DSL (domain-specific language) for describing software architecture as code. It lets you define components, their relationships, and how they are deployed in a structured, version-controlled format.

For full documentation, see [likec4.dev](https://likec4.dev).

## Basic example

A minimal LikeC4 model with two components and a relationship:

```likec4
specification {
  element component
}

model {
  component backend "Backend API" {
    description "Handles business logic and data access"
  }

  component frontend "Frontend App" {
    description "Web application served to users"
  }

  frontend -> backend "Calls REST API"
}
```

This declares that the frontend depends on the backend through a REST API. If a pull request introduces a direct database call from the frontend, erode would flag this as an undeclared dependency.

## Where to put model files

erode loads all `.c4` files from the directory you point it at. There are two options:

### Same repository

Place model files in a dedicated directory:

```
my-repo/
  architecture/
    model.c4
    views.c4
  src/
    ...
```

Then set `model-path` to `./architecture` when using the CLI, or `model-path: architecture` in the GitHub Action.

### Separate repository (recommended)

Keep the architecture model in its own repository so it can be shared across services:

```
your-org/architecture/
  model.c4
  views.c4
```

Point the GitHub Action at this repository using `model-repo`:

```yaml
- uses: erode-app/core@main
  with:
    model-repo: your-org/architecture
    github-token: ${{ secrets.GITHUB_TOKEN }}
    gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
```

See [GitHub Actions](/docs/ci/github-actions/) for all model repository options including `model-path`, `model-ref`, and `model-repo-token`.

## How erode uses the model

During analysis, erode:

1. Loads the LikeC4 model and resolves the component(s) relevant to the repository
2. Extracts dependency changes from the PR diff
3. Compares those changes against the declared relationships in the model
4. Reports any dependencies that exist in the code but are missing from the model

This comparison is what makes drift detection possible. The more complete your architecture model, the more accurate erode's analysis will be.
