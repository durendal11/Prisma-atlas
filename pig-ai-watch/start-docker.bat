@echo off
REM ════════════════════════════════════════════════════════════
REM  PRISMA ATLAS — Pig AI Watch  •  Windows Docker Launcher
REM  Prerequisites: Docker Desktop for Windows
REM ════════════════════════════════════════════════════════════

echo.
echo  ====================================================
echo   PRISMA ATLAS - Pig AI Watch (Docker)
echo  ====================================================
echo.

REM Check Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Docker is not running.
    echo  Please start Docker Desktop and try again.
    pause
    exit /b 1
)

REM Create .env if it doesn't exist
if not exist .env (
    echo  Creating .env from .env.example ...
    copy .env.example .env >nul
)

echo  Building and starting all services...
echo.
docker compose up --build -d

echo.
echo  ====================================================
echo   All services are starting!
echo.
echo   Frontend:  http://localhost:3000
echo   Landing:   http://localhost:3000/welcome
echo   Backend:   http://localhost:8000
echo   Database:  localhost:5432
echo  ====================================================
echo.
echo  To seed the database (first run):
echo    docker compose --profile seed up seed
echo.
echo  To view logs:
echo    docker compose logs -f
echo.
echo  To stop everything:
echo    docker compose down
echo.
pause
