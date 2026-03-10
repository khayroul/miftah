#!/usr/bin/env bash
set -euo pipefail

SYMPHONY_DIR="${SYMPHONY_DIR:-$HOME/symphony}"

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required to install mise."
  exit 1
fi

if ! command -v mise >/dev/null 2>&1; then
  echo "[setup] Installing mise..."
  brew install mise
fi

if [ ! -d "$SYMPHONY_DIR/.git" ]; then
  echo "[setup] Cloning Symphony into $SYMPHONY_DIR"
  git clone https://github.com/openai/symphony.git "$SYMPHONY_DIR"
else
  echo "[setup] Symphony repo already exists at $SYMPHONY_DIR"
fi

cd "$SYMPHONY_DIR/elixir"

echo "[setup] Trusting and installing toolchain with mise..."
mise trust
mise install

echo "[setup] Installing deps and building Symphony binary..."
mise exec -- mix setup
mise exec -- mix build

echo "[setup] Done. Binary: $SYMPHONY_DIR/elixir/bin/symphony"
