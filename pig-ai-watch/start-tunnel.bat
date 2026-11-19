@echo off
setlocal enabledelayedexpansion
REM ════════════════════════════════════════════════════════════
REM  PRISMA ATLAS — Pig AI Watch  •  Local + Cloudflare Tunnel
REM  Prerequisites: Docker Desktop for Windows
REM ════════════════════════════════════════════════════════════

title Prisma Atlas - Pig AI Watch Live Server

echo.
echo  ====================================================
echo   PRISMA ATLAS - Pig AI Watch (Local Cloud Server)
echo  ====================================================
echo.

cd /d "%~dp0"

REM 1. Check Docker is running
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
if %attempts% lss 30 goto wait_docker

echo.
echo  ERROR: Docker engine is still not responding.
echo  Please open Docker Desktop from your Start Menu, wait for it to finish starting, and run this script again.
pause
exit /b 1

:docker_ready

REM 2. Create .env from .env.example if missing
if not exist .env (
    echo  Creating .env from .env.example ...
    copy .env.example .env >nul
)

echo.
echo  [1/3] Building and starting local services (DB, Backend, Frontend, MediaMTX, Tunnel)...
docker compose up -d
REM Fresh tunnel container each run: old quick tunnels expire, and old logs hold dead links.
docker compose up -d --force-recreate tunnel

echo.
echo  [2/3] Checking database seed (admin user)...
docker compose --profile seed up seed

echo.
echo  [3/3] Connecting Cloudflare Tunnel to the internet...
echo  Waiting for your free public HTTPS link...
echo.

set tunnel_attempts=0

:wait_tunnel
timeout /t 3 /nobreak >nul
set tunnel_found=0
for /f "tokens=*" %%i in ('docker logs pig-ai-watch-tunnel 2^>^&1 ^| findstr /C:"trycloudflare.com"') do (
    set tunnel_found=1
)

if "!tunnel_found!"=="1" goto show_tunnel

set /a tunnel_attempts+=1
if %tunnel_attempts% lss 20 goto wait_tunnel

echo  Warning: Tunnel link retrieval took longer than usual.
echo  You can view it anytime by running: docker logs pig-ai-watch-tunnel
goto show_local

:show_tunnel
echo.
echo  ========================================================================
echo   SUCCESS! YOUR FARM DASHBOARD IS LIVE ON THE INTERNET:
echo.
echo   PUBLIC LINK (Mobile / Remote):
for /f "tokens=*" %%a in ('docker logs pig-ai-watch-tunnel 2^>^&1 ^| findstr /C:"trycloudflare.com"') do (
    echo   %%a
)
echo.
echo   LOCAL LINK (This laptop only):
echo   Dashboard:  http://localhost:3000
echo   API Docs:   http://localhost:8000/docs
echo.
echo  ========================================================================
echo.
echo   CCTV / Video Streaming:
echo   • Add cameras in the dashboard UI under Camera Setup.
echo   • Stream paths map to rtsp://localhost:8554/pen_1 etc.
echo.
echo   (Keep this window open or minimize it. Press Ctrl+C or close to stop.)
echo.
docker logs -f pig-ai-watch-tunnel
pause
exit /b 0

:show_local
echo.
echo  Local Dashboard is ready at: http://localhost:3000
echo  Run "docker logs pig-ai-watch-tunnel" to find your public URL.
echo.
pause
