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

cd /d "%~dp0"

REM Check Docker is running
docker info >nul 2>&1
if %errorlevel% equ 0 goto docker_ready

echo  Docker is not currently running. Attempting to start Docker Desktop...
if exist "%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe" (
    start "" "%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe"
) else if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
    start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
)

echo  Waiting for Docker engine to initialize...
set attempts=0

:wait_docker
timeout /t 3 /nobreak >nul
docker info >nul 2>&1
if %errorlevel% equ 0 goto docker_ready
set /a attempts+=1
if %attempts% lss 20 goto wait_docker

echo.
echo  ERROR: Docker engine is still not responding.
echo  Please manually open Docker Desktop from your Start Menu, wait for it to finish starting, and run this script again.
pause
exit /b 1

:docker_ready

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
