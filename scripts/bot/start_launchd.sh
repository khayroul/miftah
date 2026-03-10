#!/usr/bin/env bash
set -euo pipefail

LABEL="com.miftah.bot"
launchctl kickstart -k "gui/$(id -u)/${LABEL}"
echo "Started: ${LABEL}"
