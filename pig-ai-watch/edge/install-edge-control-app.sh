#!/bin/bash
# Build and install a clickable macOS app to control PRISMA edge services.

set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer is for macOS only."
  exit 1
fi

if ! command -v osacompile >/dev/null 2>&1; then
  echo "osacompile is required but not available on this Mac."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EDGE_DIR="$SCRIPT_DIR"
TARGET_DIR="${1:-$HOME/Applications}"
APP_NAME="PRISMA Edge Control.app"
APP_PATH="$TARGET_DIR/$APP_NAME"
TMP_SCRIPT="$(mktemp /tmp/prisma-edge-control.XXXXXX.applescript)"
MODEL_VERSION_LABEL="pig-ai-watch alpha"

mkdir -p "$TARGET_DIR"

cat > "$TMP_SCRIPT" <<EOF
property appTitle : "PRISMA Edge Control"
property edgeDir : "${EDGE_DIR}"
property modelVersion : "${MODEL_VERSION_LABEL}"
property agentLabel : "com.prisma.edge-agent"
property pusherLabel : "com.prisma.edge-pusher"

on run
  set homeDir to POSIX path of (path to home folder)
  set agentPlist to homeDir & "Library/LaunchAgents/" & agentLabel & ".plist"
  set pusherPlist to homeDir & "Library/LaunchAgents/" & pusherLabel & ".plist"
  set logsDir to edgeDir & "/logs"

    repeat
        set pickedAction to choose from list {"Start Edge (Detection Only)", "Start Edge + Stream Proxy", "Stop Edge", "Status", "Open Logs", "Quit"} with title appTitle with prompt "YOLO Model: " & modelVersion & return & return & "Choose an action:" default items {"Status"} OK button name "Run" cancel button name "Quit"
      if pickedAction is false then exit repeat
      set actionChoice to item 1 of pickedAction
      if actionChoice is "Quit" then exit repeat

        if actionChoice is "Start Edge (Detection Only)" then
        if my fileExists(agentPlist) then
          do shell script "launchctl load -w " & quoted form of agentPlist & " >/dev/null 2>&1; launchctl unload -w " & quoted form of pusherPlist & " >/dev/null 2>&1"
          display notification "Edge detection started (stream proxy disabled)." with title appTitle
        else
          display dialog "Edge services are not installed yet. Run setup-macos-launchd.sh first." buttons {"OK"} default button "OK" with icon caution with title appTitle
        end if

      else if actionChoice is "Start Edge + Stream Proxy" then
      if my fileExists(agentPlist) and my fileExists(pusherPlist) then
        do shell script "launchctl load -w " & quoted form of agentPlist & " >/dev/null 2>&1; launchctl load -w " & quoted form of pusherPlist & " >/dev/null 2>&1"
          display notification "Edge detection + stream proxy started." with title appTitle
      else
        display dialog "Edge services are not installed yet. Run setup-macos-launchd.sh first." buttons {"OK"} default button "OK" with icon caution with title appTitle
      end if

    else if actionChoice is "Stop Edge" then
      do shell script "launchctl unload -w " & quoted form of agentPlist & " >/dev/null 2>&1; launchctl unload -w " & quoted form of pusherPlist & " >/dev/null 2>&1"
      display notification "Edge services stopped." with title appTitle

    else if actionChoice is "Status" then
      set agentState to my serviceState(agentLabel)
      set pusherState to my serviceState(pusherLabel)
        display dialog "YOLO Model: " & modelVersion & return & return & "Agent: " & agentState & return & "Pusher: " & pusherState & return & return & "Tip: If camera fails to open, use Detection Only mode." buttons {"OK"} default button "OK" with title appTitle

    else if actionChoice is "Open Logs" then
      do shell script "mkdir -p " & quoted form of logsDir & "; open " & quoted form of logsDir

    else
      exit repeat
    end if
  end repeat
end run

on fileExists(filePath)
  try
    do shell script "test -f " & quoted form of filePath
    return true
  on error
    return false
  end try
end fileExists

on serviceState(serviceLabel)
  try
    do shell script "launchctl print gui/$(id -u)/" & serviceLabel & " >/dev/null 2>&1"
    return "Running"
  on error
    return "Stopped"
  end try
end serviceState
EOF

rm -rf "$APP_PATH"
osacompile -o "$APP_PATH" "$TMP_SCRIPT"
rm -f "$TMP_SCRIPT"

echo "Installed: $APP_PATH"
echo "Open it from Finder > Applications (or ~/Applications)."
