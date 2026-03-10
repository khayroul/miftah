#!/usr/bin/env bash
set -euo pipefail

LABEL="com.miftah.bot"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"

launchctl bootout "gui/$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
echo "Stopped: ${LABEL}"
