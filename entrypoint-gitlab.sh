#!/bin/bash
# erode GitLab CI entrypoint
# Runs erode analysis on a GitLab merge request.
# Requires GitLab CI variables: CI_MERGE_REQUEST_IID, CI_PROJECT_URL, CI_SERVER_URL, CI_PROJECT_PATH
set -euo pipefail

# ── 1. Build MR URL from GitLab CI variables ──

if [ -z "${CI_MERGE_REQUEST_IID:-}" ]; then
  echo "ERROR: CI_MERGE_REQUEST_IID not set. This script must run in a merge_request pipeline."
  exit 1
fi

MR_URL="${CI_PROJECT_URL}/-/merge_requests/${CI_MERGE_REQUEST_IID}"

# ── 2. Export env vars for the CLI ──

export AI_PROVIDER="${AI_PROVIDER:-anthropic}"
export MODEL_FORMAT="${ERODE_MODEL_FORMAT:-likec4}"
# ANTHROPIC_API_KEY, GEMINI_API_KEY, GITLAB_TOKEN should be set as CI/CD variables

# ── 3. Clone model repository (if separate from source) ──

MODEL_DIR="${ERODE_MODEL_PATH:-.}"

if [ -n "${ERODE_MODEL_REPO:-}" ]; then
  MODEL_CLONE_DIR="/tmp/model-repo"
  CLONE_TOKEN="${ERODE_MODEL_REPO_TOKEN:-$GITLAB_TOKEN}"

  GIT_ASKPASS_SCRIPT="/tmp/git-askpass-$$"
  ESCAPED_TOKEN=$(printf '%s' "$CLONE_TOKEN" | sed "s/'/'\\\\''/g")
  printf "#!/bin/sh\necho '%s'" "$ESCAPED_TOKEN" > "$GIT_ASKPASS_SCRIPT"
  chmod +x "$GIT_ASKPASS_SCRIPT"

  GIT_ASKPASS="$GIT_ASKPASS_SCRIPT" git clone --depth 1 --branch "${ERODE_MODEL_REF:-main}" \
    "https://gitlab-ci-token@${CI_SERVER_HOST:-gitlab.com}/${ERODE_MODEL_REPO}.git" \
    "$MODEL_CLONE_DIR"

  rm -f "$GIT_ASKPASS_SCRIPT"

  MODEL_DIR="${MODEL_CLONE_DIR}/${ERODE_MODEL_PATH:-.}"
fi

# ── 4. Build CLI args and exec ──

CORE_ARGS=(
  analyze "$MODEL_DIR"
  --url "$MR_URL"
  --model-format "$MODEL_FORMAT"
  --format json
  --comment
)

[ -n "${ERODE_MODEL_REPO:-}" ] && CORE_ARGS+=(--model-repo "$ERODE_MODEL_REPO")
[ "${ERODE_OPEN_PR:-false}" = "true" ] && CORE_ARGS+=(--open-pr)
[ "${ERODE_SKIP_FILE_FILTERING:-false}" = "true" ] && CORE_ARGS+=(--skip-file-filtering)
[ "${ERODE_FAIL_ON_VIOLATIONS:-false}" = "true" ] && CORE_ARGS+=(--fail-on-violations)

exec node /app/packages/core/dist/ci-entry.js "${CORE_ARGS[@]}"
