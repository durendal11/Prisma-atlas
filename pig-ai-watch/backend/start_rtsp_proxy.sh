#!/bin/bash
# =============================================================================
# PrismaAtlas — Start MediaMTX RTSP Proxy
# =============================================================================
# Starts MediaMTX in pull-mode: it connects to the camera directly and serves
# local RTSP streams at rtsp://127.0.0.1:8554/pen_X
#
# Usage:
#   ./start_rtsp_proxy.sh          # foreground (Ctrl+C to stop)
#   ./start_rtsp_proxy.sh --bg     # background (PID saved for stop)
#   ./start_rtsp_proxy.sh --stop   # stop background instance
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$SCRIPT_DIR/mediamtx.yml"
PIDFILE="$SCRIPT_DIR/.mediamtx.pid"

# Check mediamtx is installed
if ! command -v mediamtx &> /dev/null; then
    echo "ERROR: mediamtx not found. Install with: brew install mediamtx"
    exit 1
fi

# Stop mode
if [[ "$1" == "--stop" ]]; then
    if [[ -f "$PIDFILE" ]]; then
        PID=$(cat "$PIDFILE")
        echo "Stopping MediaMTX (PID $PID)..."
        kill "$PID" 2>/dev/null && rm -f "$PIDFILE"
        echo "Stopped."
    else
        echo "No running MediaMTX found."
    fi
    exit 0
fi

echo "╔══════════════════════════════════════════════════╗"
echo "║       PrismaAtlas — MediaMTX RTSP Proxy         ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Config:  $CONFIG"
echo "║  RTSP:    rtsp://127.0.0.1:8554/pen_5           ║"
echo "║  API:     http://127.0.0.1:9997                 ║"
echo "║  HLS:     http://127.0.0.1:8888/pen_5           ║"
echo "╚══════════════════════════════════════════════════╝"

# Background mode
if [[ "$1" == "--bg" ]]; then
    mediamtx "$CONFIG" &
    echo $! > "$PIDFILE"
    echo "MediaMTX started in background (PID $(cat "$PIDFILE"))"
    echo "Stop with: $0 --stop"
    exit 0
fi

# Foreground mode (default)
echo "Press Ctrl+C to stop..."
exec mediamtx "$CONFIG"
