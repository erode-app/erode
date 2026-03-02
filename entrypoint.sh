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

PR_URL=$(jq -r '.pull_request.html_url // .issue.pull_request.html_url // empty' "$GITHUB_EVENT_PATH")
if [ -z "$PR_URL" ]; then
  echo "::error::Could not extract PR URL. This action runs on pull_request or issue_comment (on a PR) triggers."
  exit 1
fi

# ── 2. Map action inputs to CLI environment variables ──

export AI_PROVIDER="${INPUT_AI_PROVIDER:-anthropic}"
export ANTHROPIC_API_KEY="${INPUT_ANTHROPIC_API_KEY:-}"
export GEMINI_API_KEY="${INPUT_GEMINI_API_KEY:-}"
export OPENAI_API_KEY="${INPUT_OPENAI_API_KEY:-}"
export GITHUB_TOKEN="${INPUT_GITHUB_TOKEN:?github-token input is required}"
export MODEL_FORMAT="${INPUT_MODEL_FORMAT:-likec4}"
export MODEL_REPO_PR_TOKEN="${INPUT_MODEL_REPO_TOKEN:-$GITHUB_TOKEN}"

# ── 3. Auth setup for model-repo access ──

CLONE_TOKEN="${INPUT_MODEL_REPO_TOKEN:-$GITHUB_TOKEN}"

GIT_ASKPASS_SCRIPT="/tmp/git-askpass-$$"
ESCAPED_TOKEN=$(printf '%s' "$CLONE_TOKEN" | sed "s/'/'\\\\''/g")
printf "#!/bin/sh\necho '%s'" "$ESCAPED_TOKEN" > "$GIT_ASKPASS_SCRIPT"
chmod +x "$GIT_ASKPASS_SCRIPT"

# ── 4. Build CLI args and exec ──

CORE_ARGS=(
  analyze "${INPUT_MODEL_PATH:-.}"
  --url "$PR_URL"
  --model-format "$MODEL_FORMAT"
  --format json
  --comment
  --github-actions
)

CORE_ARGS+=(--model-repo "$INPUT_MODEL_REPO")
CORE_ARGS+=(--model-ref "${INPUT_MODEL_REF:-main}")

OPEN_PR="${INPUT_OPEN_PR:-false}"
if [ "$OPEN_PR" = "true" ]; then
  CORE_ARGS+=(--open-pr)
elif [ "$OPEN_PR" = "auto" ]; then
  PR_NUMBER=$(jq -r '.pull_request.number // .issue.number // empty' "$GITHUB_EVENT_PATH")
  SOURCE_REPO=$(jq -r '.repository.full_name // empty' "$GITHUB_EVENT_PATH")
  if [ -n "$PR_NUMBER" ] && [ -n "$SOURCE_REPO" ]; then
    SLUG=$(echo "$SOURCE_REPO" | tr '/' '-')
    BRANCH="erode/${SLUG}/pr-${PR_NUMBER}"
    if GIT_ASKPASS="$GIT_ASKPASS_SCRIPT" git ls-remote --exit-code --heads \
      "https://x-access-token@github.com/${INPUT_MODEL_REPO}.git" \
      "$BRANCH" >/dev/null 2>&1; then
      CORE_ARGS+=(--open-pr)
    fi
  fi
fi

rm -f "$GIT_ASKPASS_SCRIPT"

[ "${INPUT_SKIP_FILE_FILTERING:-false}" = "true" ] && CORE_ARGS+=(--skip-file-filtering)
[ "${INPUT_FAIL_ON_VIOLATIONS:-false}" = "true" ] && CORE_ARGS+=(--fail-on-violations)

exec node /app/packages/core/dist/ci-entry.js "${CORE_ARGS[@]}"
