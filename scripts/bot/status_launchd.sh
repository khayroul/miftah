#!/usr/bin/env bash
set -euo pipefail

LABEL="com.miftah.bot"

if launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1; then
  echo "Service loaded: ${LABEL}"
  launchctl print "gui/$(id -u)/${LABEL}" | sed -n '1,120p'
else
  echo "Service not loaded: ${LABEL}"
  exit 1
fi
