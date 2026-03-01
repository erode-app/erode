#!/bin/bash
# erode GitHub Action entrypoint
# All analysis, commenting, step summaries, and output handling is done by core.
# This script only handles GitHub Actions-specific bootstrapping that requires bash.
set -euo pipefail

# GitHub Actions sets INPUT_<name> env vars preserving hyphens from input names.
# Bash can't reference vars with hyphens, so normalize to underscores.
while IFS='=' read -r name value; do
  norm="${name//-/_}"
  if [[ "$name" != "$norm" ]]; then
    export "$norm=$value"
  fi
done < <(env | grep '^INPUT_')

# ── 1. Extract PR URL from event payload ──

PR_URL=$(jq -r '.pull_request.html_url // empty' "$GITHUB_EVENT_PATH")
if [ -z "$PR_URL" ]; then
  echo "::error::Not a pull_request event. This action only runs on pull_request triggers."
  exit 1
fi

# ── 2. Map action inputs to CLI environment variables ──

export AI_PROVIDER="${INPUT_AI_PROVIDER:-anthropic}"
export ANTHROPIC_API_KEY="${INPUT_ANTHROPIC_API_KEY:-}"
export GEMINI_API_KEY="${INPUT_GEMINI_API_KEY:-}"
export GITHUB_TOKEN="${INPUT_GITHUB_TOKEN:?github-token input is required}"
export MODEL_FORMAT="${INPUT_MODEL_FORMAT:-likec4}"
export MODEL_REPO_PR_TOKEN="${INPUT_MODEL_REPO_TOKEN:-$GITHUB_TOKEN}"

# ── 3. Clone model repository ──

MODEL_CLONE_DIR="/tmp/model-repo"
CLONE_TOKEN="${INPUT_MODEL_REPO_TOKEN:-$GITHUB_TOKEN}"

GIT_ASKPASS_SCRIPT="/tmp/git-askpass-$$"
printf '#!/bin/sh\necho "%s"' "$CLONE_TOKEN" > "$GIT_ASKPASS_SCRIPT"
chmod +x "$GIT_ASKPASS_SCRIPT"

GIT_ASKPASS="$GIT_ASKPASS_SCRIPT" git clone --depth 1 --branch "${INPUT_MODEL_REF:-main}" \
  "https://x-access-token@github.com/${INPUT_MODEL_REPO:?model-repo input is required}.git" \
  "$MODEL_CLONE_DIR"

rm -f "$GIT_ASKPASS_SCRIPT"

# ── 4. Build CLI args and exec ──

CORE_ARGS=(
  analyze "${MODEL_CLONE_DIR}/${INPUT_MODEL_PATH:-.}"
  --url "$PR_URL"
  --model-format "$MODEL_FORMAT"
  --format json
  --comment
  --github-actions
)

CORE_ARGS+=(--model-repo "$INPUT_MODEL_REPO")
[ "${INPUT_OPEN_PR:-false}" = "true" ] && CORE_ARGS+=(--open-pr)
[ "${INPUT_SKIP_FILE_FILTERING:-false}" = "true" ] && CORE_ARGS+=(--skip-file-filtering)
[ "${INPUT_FAIL_ON_VIOLATIONS:-false}" = "true" ] && CORE_ARGS+=(--fail-on-violations)

exec node /app/packages/core/dist/ci-entry.js "${CORE_ARGS[@]}"
