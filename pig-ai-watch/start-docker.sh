#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
#  PRISMA ATLAS — Pig AI Watch  •  Docker Launcher (macOS/Linux)
#  Prerequisites: Docker & Docker Compose
# ════════════════════════════════════════════════════════════════
set -e

cd "$(dirname "$0")"

echo ""
echo "===================================================="
echo " PRISMA ATLAS - Pig AI Watch (Docker)"
echo "===================================================="
echo ""

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running."
    echo "Please start Docker Desktop and try again."
    exit 1
fi

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env from .env.example ..."
    cp .env.example .env
fi

echo "Building and starting all services..."
echo ""
docker compose up --build -d

echo ""
echo "===================================================="
echo " All services are starting!"
echo ""
echo " Frontend:  http://localhost:3000"
echo " Landing:   http://localhost:3000/welcome"
echo " Backend:   http://localhost:8000"
echo " Database:  localhost:5432"
echo "===================================================="
echo ""
echo " To seed the database (first run):"
echo "   docker compose --profile seed up seed"
echo ""
echo " To view logs:"
echo "   docker compose logs -f"
echo ""
echo " To stop everything:"
echo "   docker compose down"
echo ""
