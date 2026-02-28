# erode

Architecture erosion detection for GitHub PRs, GitLab MRs, and Bitbucket PRs using LikeC4 or Structurizr models and AI.

Compares pull request diffs against a [LikeC4](https://likec4.dev) or [Structurizr](https://docs.structurizr.com/dsl/language) architecture model to surface undeclared dependencies and structural changes. Works as both a CLI tool and a GitHub Action. Supports GitHub pull requests, GitLab merge requests (experimental), and Bitbucket pull requests (experimental).

Supported AI providers: **Gemini** (default), **OpenAI**, and **Anthropic** (experimental).

## Why

Your architecture already exists in the code. Erode makes it visible during code review, showing not just the code diff but the architectural diff, so teams can have the conversation while the change is still small. A finding is not necessarily a problem. What matters is that the change is conscious and documented.

[Read the full case](https://erode.dev/docs/why-it-matters/) for why this matters.

## Quick start

Add erode to your GitHub Actions workflow:

```yaml
name: Architecture Drift Review
on: [pull_request]

jobs:
  erode:
    runs-on: ubuntu-latest
    steps:
      - uses: erode-app/erode@main
        with:
          model-repo: 'org/architecture-model'
          github-token: ${{ secrets.GITHUB_TOKEN }}
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
```

See the [GitHub Actions guide](https://erode.dev/docs/ci/github-actions/) for inputs, outputs, and advanced examples.

### CLI

```bash
node packages/cli/dist/cli.js analyze ./model \
  --url https://github.com/org/repo/pull/42 \
  --comment
```

See the [CLI usage guide](https://erode.dev/docs/guides/cli-usage/) for all commands and flags.

## Documentation

Full documentation is available at [erode.dev](https://erode.dev):

- [Configuration](https://erode.dev/docs/guides/configuration/) — environment variables, diff limits, timeouts, model overrides
- [CLI Usage](https://erode.dev/docs/guides/cli-usage/) — all commands and flags
- [GitHub Actions](https://erode.dev/docs/ci/github-actions/) — action inputs, outputs, and workflow examples
- [GitLab CI](https://erode.dev/docs/ci/gitlab-ci/) — Docker image setup and pipeline configuration
- [Self-Hosted](https://erode.dev/docs/ci/self-hosted/) — fork, Docker, and CLI deployment options
- [LikeC4 Model](https://erode.dev/docs/models/likec4/) — writing a LikeC4 architecture model
- [Structurizr Model](https://erode.dev/docs/models/structurizr/) — using a Structurizr workspace

## Development

Requires Node.js >= 24.0.0.

```bash
npm install
npm run build          # Build core package (TypeScript + prompt templates)
npm run test           # Run all tests (vitest)
npm run lint           # ESLint (zero warnings allowed)
npm run format         # Prettier format (all packages)
npm run dev:web        # Start Astro dev server
```

## Releasing

[Release Please](https://github.com/googleapis/release-please) automates releases. It runs on every push to `main`, reads conventional commit messages, and maintains a release PR with the changelog.

Merge the release PR to create a GitHub release, tag, and Docker image.

### Version bumps

The commit type determines the version bump:

| Commit                                    | Bump  | Example       |
| ----------------------------------------- | ----- | ------------- |
| `fix: ...`                                | Patch | 0.1.1 → 0.1.2 |
| `feat: ...`                               | Minor | 0.1.1 → 0.2.0 |
| `feat!: ...` or `BREAKING CHANGE:` footer | Major | 0.1.1 → 1.0.0 |

To force a major bump, add `!` after the commit type or include a `BREAKING CHANGE:` footer:

```text
feat!: remove deprecated config options

BREAKING CHANGE: ERODE_MODEL_PATH no longer accepts relative paths.
```

Either the `!` or the footer is enough on its own.

### What counts toward a release

Only commits that touch `packages/core/` or `packages/cli/` trigger version bumps. Commits scoped to `packages/web/`, `packages/architecture/`, or `packages/eslint-config/` are excluded and will not appear in the changelog.

## License

[Apache 2.0](LICENSE)
