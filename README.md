# erode

Architecture erosion detection for GitHub PRs, GitLab MRs, and Bitbucket PRs using LikeC4 models and AI.

Compares pull request diffs against a [LikeC4](https://likec4.dev) architecture model to find undeclared dependencies and architectural violations. Works as both a CLI tool and a GitHub Action. Supports GitHub pull requests, GitLab merge requests (experimental), and Bitbucket pull requests (experimental).

Supported AI providers: **Gemini** (default), **OpenAI**, and **Anthropic** (experimental).

## Quick start

Add erode to your GitHub Actions workflow:

```yaml
name: Architecture Drift Check
on: [pull_request]

jobs:
  erode:
    runs-on: ubuntu-latest
    steps:
      - uses: erode-app/core@main
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
  --comment --fail-on-violations
```

See the [CLI usage guide](https://erode.dev/docs/guides/cli-usage/) for all commands and flags.

## Documentation

Full documentation is available at [erode.dev](https://erode.dev):

- [Configuration](https://erode.dev/docs/guides/configuration/) — environment variables, diff limits, timeouts, model overrides
- [CLI Usage](https://erode.dev/docs/guides/cli-usage/) — all commands and flags
- [GitHub Actions](https://erode.dev/docs/ci/github-actions/) — action inputs, outputs, and workflow examples
- [GitLab CI](https://erode.dev/docs/ci/gitlab-ci/) — Docker image setup and pipeline configuration
- [Self-Hosted](https://erode.dev/docs/ci/self-hosted/) — fork, Docker, and CLI deployment options
- [LikeC4 Model](https://erode.dev/docs/models/likec4/) — writing the architecture model

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

## License

[Apache 2.0](LICENSE)
