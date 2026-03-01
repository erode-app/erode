#!/bin/bash
# erode Bitbucket Pipelines entrypoint
# Runs erode analysis on a Bitbucket pull request.
# Requires Bitbucket Pipelines variables: BITBUCKET_PR_ID, BITBUCKET_WORKSPACE, BITBUCKET_REPO_SLUG
set -euo pipefail

# ── 1. Build PR URL from Bitbucket Pipelines variables ──

if [ -z "${BITBUCKET_PR_ID:-}" ]; then
  echo "ERROR: BITBUCKET_PR_ID not set. This script must run in a pull request pipeline."
  exit 1
fi

PR_URL="https://bitbucket.org/${BITBUCKET_WORKSPACE}/${BITBUCKET_REPO_SLUG}/pull-requests/${BITBUCKET_PR_ID}"

# ── 2. Export env vars for the CLI ──

export AI_PROVIDER="${AI_PROVIDER:-anthropic}"
export MODEL_FORMAT="${ERODE_MODEL_FORMAT:-likec4}"
# ANTHROPIC_API_KEY, GEMINI_API_KEY, BITBUCKET_TOKEN should be set as repository variables

# ── 3. Clone model repository (if separate from source) ──

MODEL_DIR="${ERODE_MODEL_PATH:-.}"

if [ -n "${ERODE_MODEL_REPO:-}" ]; then
  MODEL_CLONE_DIR="/tmp/model-repo"
  CLONE_TOKEN="${ERODE_MODEL_REPO_TOKEN:-$BITBUCKET_TOKEN}"

  # App passwords use username:app_password format — use directly in URL.
  # Repository/workspace access tokens use x-token-auth:{token} format.
  if echo "$CLONE_TOKEN" | grep -q ':'; then
    CLONE_AUTH="$CLONE_TOKEN"
  else
    CLONE_AUTH="x-token-auth:${CLONE_TOKEN}"
  fi

  git clone --depth 1 --branch "${ERODE_MODEL_REF:-main}" \
    "https://${CLONE_AUTH}@bitbucket.org/${ERODE_MODEL_REPO}.git" \
    "$MODEL_CLONE_DIR"

  MODEL_DIR="${MODEL_CLONE_DIR}/${ERODE_MODEL_PATH:-.}"
fi

# ── 4. Build CLI args and exec ──

CORE_ARGS=(
  analyze "$MODEL_DIR"
  --url "$PR_URL"
  --model-format "$MODEL_FORMAT"
  --format json
  --comment
)

[ "${ERODE_OPEN_PR:-false}" = "true" ] && CORE_ARGS+=(--open-pr)
[ "${ERODE_SKIP_FILE_FILTERING:-false}" = "true" ] && CORE_ARGS+=(--skip-file-filtering)
[ "${ERODE_FAIL_ON_VIOLATIONS:-false}" = "true" ] && CORE_ARGS+=(--fail-on-violations)

exec node /app/packages/core/dist/ci-entry.js "${CORE_ARGS[@]}"
