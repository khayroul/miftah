#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

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

if [ -z "${LINEAR_API_KEY:-}" ]; then
  echo "LINEAR_API_KEY is not set."
  exit 1
fi

echo "[linear] Fetching projects..."

response="$(
curl -sS https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  --data '{"query":"query { viewer { id name } projects(first: 50) { nodes { id name slugId state url } } }"}'
)"

if ! command -v jq >/dev/null 2>&1; then
  echo "$response"
  exit 0
fi

echo "$response" | jq -r '
    if .errors then
      "ERROR: " + (.errors[0].message // "unknown")
    else
      "viewer: \(.data.viewer.name) (\(.data.viewer.id))\n" +
      (.data.projects.nodes[] | "- \(.name) | slug=\(.slugId) | state=\(.state) | url=\(.url)")
    end
  '
