#!/bin/bash
set -euo pipefail

# Copy non-TypeScript assets to dist/ after compilation.
# Called by: npm run copy-assets (via package.json "build" script)

# Analysis prompt templates
mkdir -p dist/analysis/prompts
cp src/analysis/prompts/*.md dist/analysis/prompts/

# LikeC4 adapter prompt templates
mkdir -p dist/adapters/likec4/prompts
cp src/adapters/likec4/prompts/*.md dist/adapters/likec4/prompts/

# Skip patterns file
cp src/skip-patterns dist/skip-patterns
