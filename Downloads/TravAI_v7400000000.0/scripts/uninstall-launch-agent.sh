#!/bin/bash
set -euo pipefail
LABEL="com.travai.runtime"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout gui/"$(id -u)" "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "TravAI launch agent removed."
