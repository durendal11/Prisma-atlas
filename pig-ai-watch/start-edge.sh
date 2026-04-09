#!/bin/bash
# Start both edge services in one command:
#   - edge/agent.py
#   - edge/headless_proxy/edge_pusher.py

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EDGE_DIR="$SCRIPT_DIR/edge"
PUSHER_DIR="$EDGE_DIR/headless_proxy"

if [ ! -d "$EDGE_DIR" ] || [ ! -d "$PUSHER_DIR" ]; then
  echo "Required edge directories were not found under: $SCRIPT_DIR"
  exit 1
fi

PYTHON_CMD=""
if [ -x "$ROOT_DIR/.venv/bin/python" ]; then
  PYTHON_CMD="$ROOT_DIR/.venv/bin/python"
elif [ -x "$SCRIPT_DIR/.venv/bin/python" ]; then
  PYTHON_CMD="$SCRIPT_DIR/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_CMD="$(command -v python3)"
elif command -v python >/dev/null 2>&1; then
  PYTHON_CMD="$(command -v python)"
else
  echo "No Python executable found. Install Python or create a virtual environment."
  exit 1
fi

echo "Using Python: $PYTHON_CMD"
echo "Starting edge services..."

cd "$EDGE_DIR"
"$PYTHON_CMD" agent.py &
AGENT_PID=$!
echo "Started agent.py (PID $AGENT_PID)"

cd "$PUSHER_DIR"
"$PYTHON_CMD" edge_pusher.py &
PUSHER_PID=$!
echo "Started edge_pusher.py (PID $PUSHER_PID)"

cleanup() {
  echo
  echo "Stopping edge services..."
  kill "$AGENT_PID" "$PUSHER_PID" 2>/dev/null || true
  wait "$AGENT_PID" 2>/dev/null || true
  wait "$PUSHER_PID" 2>/dev/null || true
}

trap cleanup INT TERM

echo "Both services are running. Press Ctrl+C to stop."

while true; do
  if ! kill -0 "$AGENT_PID" 2>/dev/null; then
    echo "agent.py exited. Stopping edge_pusher.py..."
    cleanup
    exit 1
  fi

  if ! kill -0 "$PUSHER_PID" 2>/dev/null; then
    echo "edge_pusher.py exited. Stopping agent.py..."
    cleanup
    exit 1
  fi

  sleep 1
done
