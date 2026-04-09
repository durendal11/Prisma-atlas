#!/bin/bash
# PRISMA Edge Installer (macOS)
# Usage:
#   bash install-edge-control-macos.sh /path/to/pig-ai-watch/edge
# If path is omitted, script will prompt for it.

set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer is for macOS only."
  exit 1
fi

EDGE_DIR="${1:-}"

if [[ -z "$EDGE_DIR" ]]; then
  read -r -p "Enter full path to your pig-ai-watch/edge folder: " EDGE_DIR
fi

if [[ ! -d "$EDGE_DIR" ]]; then
  echo "Edge directory does not exist: $EDGE_DIR"
  exit 1
fi

if [[ ! -f "$EDGE_DIR/setup-macos-launchd.sh" || ! -f "$EDGE_DIR/install-edge-control-app.sh" ]]; then
  echo "Required scripts not found in: $EDGE_DIR"
  echo "Expected: setup-macos-launchd.sh and install-edge-control-app.sh"
  exit 1
fi

echo "Installing edge background services..."
bash "$EDGE_DIR/setup-macos-launchd.sh"

echo "Installing PRISMA Edge Control app..."
bash "$EDGE_DIR/install-edge-control-app.sh"

echo "Done. Open PRISMA Edge Control.app from ~/Applications"
