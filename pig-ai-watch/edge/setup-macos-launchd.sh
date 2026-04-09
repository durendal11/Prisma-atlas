#!/bin/bash
# Install PRISMA edge services as user LaunchAgents on macOS.
# This keeps edge processes alive after crashes and starts them at login.

set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer is for macOS only."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EDGE_DIR="$SCRIPT_DIR"
PUSHER_DIR="$EDGE_DIR/headless_proxy"
PLIST_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$EDGE_DIR/logs"
SERVICE_PATH="/opt/homebrew/bin:/opt/local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
AGENT_LABEL="com.prisma.edge-agent"
PUSHER_LABEL="com.prisma.edge-pusher"
AGENT_PLIST="$PLIST_DIR/${AGENT_LABEL}.plist"
PUSHER_PLIST="$PLIST_DIR/${PUSHER_LABEL}.plist"

find_python() {
  if [[ -x "$EDGE_DIR/.venv/bin/python" ]]; then
    echo "$EDGE_DIR/.venv/bin/python"
    return 0
  fi

  if [[ -x "$APP_DIR/.venv/bin/python" ]]; then
    echo "$APP_DIR/.venv/bin/python"
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return 0
  fi

  if command -v python >/dev/null 2>&1; then
    command -v python
    return 0
  fi

  return 1
}

PYTHON_CMD="$(find_python || true)"
if [[ -z "$PYTHON_CMD" ]]; then
  echo "No Python executable found. Install Python or create a virtual environment first."
  exit 1
fi

mkdir -p "$PLIST_DIR" "$LOG_DIR"

cat > "$AGENT_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${PYTHON_CMD}</string>
    <string>${EDGE_DIR}/agent.py</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${EDGE_DIR}</string>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${SERVICE_PATH}</string>
    <key>PYTHONUNBUFFERED</key>
    <string>1</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/edge-agent.out.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/edge-agent.err.log</string>
</dict>
</plist>
EOF

cat > "$PUSHER_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PUSHER_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${PYTHON_CMD}</string>
    <string>${PUSHER_DIR}/edge_pusher.py</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${PUSHER_DIR}</string>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${SERVICE_PATH}</string>
    <key>PYTHONUNBUFFERED</key>
    <string>1</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/edge-pusher.out.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/edge-pusher.err.log</string>
</dict>
</plist>
EOF

launchctl unload "$AGENT_PLIST" >/dev/null 2>&1 || true
launchctl unload "$PUSHER_PLIST" >/dev/null 2>&1 || true

launchctl load -w "$AGENT_PLIST"
launchctl load -w "$PUSHER_PLIST"

echo "Installed LaunchAgents:"
echo "- $AGENT_LABEL"
echo "- $PUSHER_LABEL"
echo
echo "Logs:"
echo "- $LOG_DIR/edge-agent.out.log"
echo "- $LOG_DIR/edge-agent.err.log"
echo "- $LOG_DIR/edge-pusher.out.log"
echo "- $LOG_DIR/edge-pusher.err.log"
