#!/bin/bash
# Install / remove the room bot as a macOS LaunchAgent (starts at login, restarts on crash).
#   tools/room-bot/install-launchd.sh            # install + start (room 7777)
#   BOT_ROOM=1234 tools/room-bot/install-launchd.sh
#   tools/room-bot/install-launchd.sh uninstall
# Logs: ~/Library/Logs/yacht-room-bot.log
# Needs admin access to the production RTDB through Application Default Credentials
# (gcloud auth application-default login) and a logged-in `claude` CLI.
set -euo pipefail

LABEL="com.yacht.room-bot"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/yacht-room-bot.log"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NODE="$(command -v node)"
CLAUDE="${CLAUDE_BIN:-$(readlink -f "$HOME/.local/bin/claude" 2>/dev/null || command -v claude)}"
ROOM="${BOT_ROOM:-7777}"

if [ "${1:-}" = "uninstall" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "removed $LABEL"
  exit 0
fi

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$ROOT/tools/room-bot/bot.js</string></array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>BOT_ROOM</key><string>$ROOM</string>
    <key>CLAUDE_BIN</key><string>$CLAUDE</string>
    <key>PATH</key><string>$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed $LABEL (room $ROOM). log: $LOG"
sleep 5
tail -5 "$LOG"
