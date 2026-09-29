#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then echo "Node.js not found in PATH"; exit 1; fi
LABEL="com.travai.runtime"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOGDIR="$HOME/Library/Logs/TravAI"
mkdir -p "$HOME/Library/LaunchAgents" "$LOGDIR"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>$LABEL</string>
<key>ProgramArguments</key><array><string>$NODE_BIN</string><string>$ROOT/server.mjs</string></array>
<key>WorkingDirectory</key><string>$ROOT</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
<key>ThrottleInterval</key><integer>10</integer>
<key>ProcessType</key><string>Interactive</string>
<key>StandardOutPath</key><string>$LOGDIR/runtime.out.log</string>
<key>StandardErrorPath</key><string>$LOGDIR/runtime.err.log</string>
</dict></plist>
PLIST
launchctl bootout gui/"$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap gui/"$(id -u)" "$PLIST"
launchctl enable gui/"$(id -u)"/$LABEL
launchctl kickstart -k gui/"$(id -u)"/$LABEL
echo "TravAI launch agent installed: $PLIST"
echo "Logs: $LOGDIR"
