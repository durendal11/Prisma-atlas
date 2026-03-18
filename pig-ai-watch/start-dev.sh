#!/bin/bash
# Start all PRISMA ATLAS development services

set -e

echo "🚀 Starting PRISMA ATLAS Development Services..."

# Kill any existing processes on our ports
echo "Cleaning up existing processes..."
lsof -ti:3000 -ti:3001 -ti:5174 -ti:8000 | xargs kill -9 2>/dev/null || true

# Start backend
echo "Starting Backend (port 8000)..."
pushd backend >/dev/null
if [ -d "../.venv" ]; then
	source ../.venv/bin/activate 2>/dev/null || true
fi
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
popd >/dev/null

# Give backend a moment to boot
sleep 2

# Start frontend
echo "Starting Frontend (port 3000)..."
pushd frontend >/dev/null
npm run dev -- --port 3000 &
FRONTEND_PID=$!
popd >/dev/null

# Give frontend a moment to boot
sleep 2

echo ""
echo "✅ All services started!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 Frontend:     http://localhost:3000"
echo "🎯 Landing:      http://localhost:3000/welcome"
echo "🔧 Backend API:  http://localhost:8000"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for Ctrl+C
trap "echo '🛑 Stopping all services...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM
wait
