@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%.") do set "EDGE_DIR=%%~fI"
set "PS1_PATH=%SCRIPT_DIR%install-edge-control-windows.ps1"
set "PS1_URL=https://raw.githubusercontent.com/durendal11/Prisma-atlas/main/pig-ai-watch/frontend/public/downloads/edge/install-edge-control-windows.ps1"

if not exist "%PS1_PATH%" (
  echo PowerShell installer not found locally.
  echo Downloading it now...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing '%PS1_URL%' -OutFile '%PS1_PATH%' } catch { Write-Host $_.Exception.Message; exit 1 }"
  if not exist "%PS1_PATH%" (
    echo Failed to download installer script.
    echo Please download install-edge-control-windows.ps1 manually and place it beside this file.
    echo.
    pause
    exit /b 1
  )
)

echo Starting PRISMA Edge one-click installer...
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1_PATH%" -EdgeDir "%EDGE_DIR%" -NoPause
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo Installer exited with code %EXIT_CODE%.
) else (
  echo Installation completed.
)

echo Press any key to close.
pause >nul
exit /b %EXIT_CODE%
