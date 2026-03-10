#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMPLATE_PATH="$ROOT_DIR/ops/symphony/WORKFLOW.template.md"
GENERATED_DIR="$ROOT_DIR/.tmp/symphony"
GENERATED_WORKFLOW="$GENERATED_DIR/WORKFLOW.generated.md"

# Load local env files if present (without overriding explicitly exported vars).
if [ -f "$ROOT_DIR/.env.local" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_DIR/.env.local"
  set +a
fi
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_DIR/.env"
  set +a
fi

SYMPHONY_DIR="${SYMPHONY_DIR:-$HOME/symphony}"
SYMPHONY_ELIXIR_DIR="$SYMPHONY_DIR/elixir"
WORKSPACE_ROOT="${SYMPHONY_WORKSPACE_ROOT:-$HOME/code/miftah-symphony-workspaces}"
SOURCE_REPO_URL="${SYMPHONY_SOURCE_REPO_URL:-git@github.com:khayroul/miftah.git}"
SYMPHONY_PORT="${SYMPHONY_PORT:-4040}"
SYMPHONY_ACK_FLAG="--i-understand-that-this-will-be-running-without-the-usual-guardrails"

if [ ! -f "$TEMPLATE_PATH" ]; then
  echo "Workflow template not found: $TEMPLATE_PATH"
  exit 1
fi

if [ ! -d "$SYMPHONY_ELIXIR_DIR" ]; then
  echo "Symphony not found at $SYMPHONY_ELIXIR_DIR"
  echo "Run: npm run symphony:setup"
  exit 1
fi

if [ -z "${LINEAR_API_KEY:-}" ]; then
  echo "Missing LINEAR_API_KEY."
  echo "Export it first: export LINEAR_API_KEY='lin_api_...'"
  exit 1
fi

if [ -z "${LINEAR_PROJECT_SLUG:-}" ]; then
  echo "Missing LINEAR_PROJECT_SLUG."
  echo "Set it from your Linear project URL slug, e.g.:"
  echo "  export LINEAR_PROJECT_SLUG='miftah-xxxx'"
  exit 1
fi

mkdir -p "$GENERATED_DIR" "$WORKSPACE_ROOT"

sed \
  -e "s|__LINEAR_PROJECT_SLUG__|$LINEAR_PROJECT_SLUG|g" \
  -e "s|__WORKSPACE_ROOT__|$WORKSPACE_ROOT|g" \
  -e "s|__SOURCE_REPO_URL__|$SOURCE_REPO_URL|g" \
  "$TEMPLATE_PATH" >"$GENERATED_WORKFLOW"

echo "[run] Generated workflow: $GENERATED_WORKFLOW"
echo "[run] Symphony workspace root: $WORKSPACE_ROOT"
echo "[run] Dashboard: http://localhost:$SYMPHONY_PORT"

cd "$SYMPHONY_ELIXIR_DIR"
mise exec -- ./bin/symphony "$GENERATED_WORKFLOW" --port "$SYMPHONY_PORT" "$SYMPHONY_ACK_FLAG"
