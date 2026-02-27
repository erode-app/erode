---
title: Structurizr Model
description: Use a Structurizr workspace as the architecture model that erode reads.
sidebar:
  badge:
    text: Experimental
    variant: caution
---

Erode reads a Structurizr workspace to understand your system's intended structure. It compares pull request changes against this model to detect drift.

:::caution[Experimental]
Structurizr support is new and under active development. If you are starting fresh, [LikeC4](/docs/models/likec4/) is the recommended format. Please report issues on [GitHub](https://github.com/erode-app/core/issues).
:::

:::tip[See it in action]
Check out the [playground example PR](https://github.com/erode-app/playground/pull/2) to see erode analyzing a Structurizr workspace.
:::

## What is Structurizr

Structurizr is a toolset for creating software architecture models based on the C4 model. The Structurizr DSL lets you define workspaces containing people, software systems, containers, and components with their relationships.

For full documentation, see [docs.structurizr.com/dsl/language](https://docs.structurizr.com/dsl/language).

## Basic example

A minimal Structurizr workspace with two containers and a relationship:

```text
workspace {
  model {
    softwareSystem = softwareSystem "My System" {
      backend = container "Backend API" {
        description "Handles business logic and data access"
        url "https://github.com/your-org/backend"
      }

      frontend = container "Frontend App" {
        description "Web application served to users"
        url "https://github.com/your-org/frontend"
      }
    }

    frontend -> backend "Calls REST API"
  }
}
```

Each element needs a `url` property pointing to its GitHub repository. Erode uses this to match a pull request to the right element in the model. Elements without a `url` are invisible to the analysis.

This declares that the frontend depends on the backend through a REST API. If a pull request introduces a direct database call from the frontend, erode would flag this as an undeclared dependency.

## Prerequisites

Erode can load Structurizr models in two ways:

- **`.json` files** — pre-exported workspace JSON. No extra tooling needed.
- **`.dsl` files** — Structurizr DSL source. Requires the Structurizr CLI to export to JSON.

The erode Docker image and GitHub Action bundle Java 21 and the Structurizr CLI, so `.dsl` files work out of the box. If running the CLI locally, you need one of:

- **Java 21+** with `STRUCTURIZR_CLI_PATH` pointing to the Structurizr WAR file
- **Docker** — erode falls back to `docker run structurizr/structurizr` automatically

To skip runtime dependencies entirely, pre-export your workspace:

```bash
java -jar structurizr.war export -workspace workspace.dsl -format json
```

Then point erode at the generated `.json` file.

## Where to put model files

Erode loads the workspace file (`.dsl` or `.json`) from the path you point it at. There are two options:

### Same repository

Place the workspace file in a dedicated directory:

```text
my-repo/
  architecture/
    workspace.dsl
  src/
    ...
```

Then set `model-path` to `./architecture` when using the CLI, or `model-path: architecture` in the GitHub Action.

### Separate repository (recommended)

Keep the architecture model in its own repository so it can be shared across services:

```text
your-org/architecture/
  workspace.dsl
```

Point the GitHub Action at this repository using `model-repo`:

```yaml
- uses: erode-app/core@main
  with:
    model-format: structurizr
    model-repo: your-org/architecture
    github-token: ${{ secrets.GITHUB_TOKEN }}
    gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
```

See [GitHub Actions](/docs/ci/github-actions/) for all model repository options including `model-path`, `model-ref`, and `model-repo-token`.

## How erode uses the model

During analysis, erode:

1. Loads the Structurizr workspace and resolves the element(s) relevant to the repository
2. Extracts dependency changes from the PR diff
3. Compares those changes against the declared relationships in the model
4. Reports any dependencies that exist in the code but are missing from the model

A more complete architecture model gives erode more accurate results.

## ID resolution

Erode resolves element IDs using the following priority:

1. **`erode.id` property** — if an element has a `properties` block with `erode.id`, that value is used directly
2. **DSL identifier** — the variable name assigned to the element (e.g., `backend` in `backend = container "Backend API"`)
3. **snake_case name** — the element name converted to snake_case (e.g., `"Backend API"` becomes `backend_api`)

IDs are hierarchical: a container inside a software system gets a dotted path like `my_system.backend`.

## Version requirements

The erode Docker image and GitHub Action bundle Structurizr CLI v2026.02.01. If running locally with `.dsl` files, you need Java 21+ or Docker. Pre-exported `.json` files have no version dependency.
