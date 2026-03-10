#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_DIR="$PROJECT_ROOT/.tmp/launchd"

mkdir -p "$LOG_DIR"
echo "Tailing logs from: $LOG_DIR"
tail -n 120 -f "$LOG_DIR/bot.out.log" "$LOG_DIR/bot.err.log"
