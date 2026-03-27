#!/bin/bash
# Start all PRISMA ATLAS development services

set -e

# Resolve script directory so this works from any current working directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Allow port overrides via env vars without editing source.
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

echo "🚀 Starting PRISMA ATLAS Development Services..."

# Kill any existing processes on our ports
echo "Cleaning up existing processes..."
lsof -ti:"$FRONTEND_PORT" -ti:3001 -ti:5174 -ti:"$BACKEND_PORT" | xargs kill -9 2>/dev/null || true

# Start backend
echo "Starting Backend (port $BACKEND_PORT)..."
pushd "$SCRIPT_DIR/backend" >/dev/null
if [ -d "$SCRIPT_DIR/backend/venv" ]; then
	source "$SCRIPT_DIR/backend/venv/bin/activate" 2>/dev/null || true
elif [ -d "$ROOT_DIR/.venv" ]; then
	source "$ROOT_DIR/.venv/bin/activate" 2>/dev/null || true
elif [ -d "$SCRIPT_DIR/.venv" ]; then
	source "$SCRIPT_DIR/.venv/bin/activate" 2>/dev/null || true
fi
if command -v uvicorn >/dev/null 2>&1; then
	uvicorn app.main:app --host 0.0.0.0 --port "$BACKEND_PORT" --reload &
else
	python -m uvicorn app.main:app --host 0.0.0.0 --port "$BACKEND_PORT" --reload &
fi
BACKEND_PID=$!
popd >/dev/null

# Give backend a moment to boot
sleep 2

# Start frontend
echo "Starting Frontend (port $FRONTEND_PORT)..."
pushd "$SCRIPT_DIR/frontend" >/dev/null
npm run dev -- --port "$FRONTEND_PORT" &
FRONTEND_PID=$!
popd >/dev/null

# Give frontend a moment to boot
sleep 2

echo ""
echo "✅ All services started!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 Frontend:     http://localhost:$FRONTEND_PORT"
echo "🎯 Landing:      http://localhost:$FRONTEND_PORT/welcome"
echo "🔧 Backend API:  http://localhost:$BACKEND_PORT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for Ctrl+C
trap "echo '🛑 Stopping all services...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM
wait
