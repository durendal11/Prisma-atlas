param(
    [string]$EdgeDir = ""
)

$ErrorActionPreference = "Stop"

function Test-EdgeFolder {
    param([string]$Path)

    if (-not $Path) {
        return $false
    }

    return (Test-Path (Join-Path $Path "agent.py")) -and (Test-Path (Join-Path $Path "headless_proxy\edge_pusher.py"))
}

function Resolve-EdgeFolder {
    param([string]$Candidate)

    if (Test-EdgeFolder $Candidate) {
        return (Resolve-Path $Candidate).Path
    }

    $scriptDir = Split-Path -Parent $PSCommandPath
    if (Test-EdgeFolder $scriptDir) {
        return (Resolve-Path $scriptDir).Path
    }

    Write-Host "Enter full path to your pig-ai-watch\\edge folder:" -ForegroundColor Yellow
    $manual = Read-Host
    if (Test-EdgeFolder $manual) {
        return (Resolve-Path $manual).Path
    }

    throw "Could not locate a valid edge folder."
}

function Find-PythonExe {
    param([string]$ResolvedEdgeDir)

    $pigAiWatchDir = (Resolve-Path (Join-Path $ResolvedEdgeDir "..")).Path
    $repoRoot = (Resolve-Path (Join-Path $ResolvedEdgeDir "..\..")).Path

    $candidates = @(
        (Join-Path $ResolvedEdgeDir ".venv\Scripts\python.exe"),
        (Join-Path $pigAiWatchDir ".venv\Scripts\python.exe"),
        (Join-Path $repoRoot ".venv\Scripts\python.exe")
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    $pythonCmd = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($pythonCmd) {
        return $pythonCmd.Source
    }

    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCmd) {
        return $pythonCmd.Source
    }

    throw "Python executable not found. Install Python or create a virtual environment first."
}

$resolvedEdgeDir = Resolve-EdgeFolder -Candidate $EdgeDir
$pythonExe = Find-PythonExe -ResolvedEdgeDir $resolvedEdgeDir

$agentTaskName = "PRISMA-Edge-Agent"
$pusherTaskName = "PRISMA-Edge-Pusher"

$controlDir = Join-Path $resolvedEdgeDir "windows_control"
$logsDir = Join-Path $resolvedEdgeDir "logs"
$agentLoopBat = Join-Path $controlDir "run-agent-loop.bat"
$pusherLoopBat = Join-Path $controlDir "run-pusher-loop.bat"
$controlBat = Join-Path $controlDir "PRISMA-Edge-Control.bat"

New-Item -ItemType Directory -Path $controlDir -Force | Out-Null
New-Item -ItemType Directory -Path $logsDir -Force | Out-Null

$agentLoopContent = @"
@echo off
cd /d "$resolvedEdgeDir"
:loop
"$pythonExe" "$resolvedEdgeDir\agent.py"
timeout /t 5 /nobreak >nul
goto loop
"@
Set-Content -Path $agentLoopBat -Value $agentLoopContent -Encoding ASCII

$pusherLoopContent = @"
@echo off
cd /d "$resolvedEdgeDir\headless_proxy"
:loop
"$pythonExe" "$resolvedEdgeDir\headless_proxy\edge_pusher.py"
timeout /t 5 /nobreak >nul
goto loop
"@
Set-Content -Path $pusherLoopBat -Value $pusherLoopContent -Encoding ASCII

$controlBatContent = @"
@echo off
title PRISMA Edge Control

:menu
cls
echo ==============================
echo   PRISMA EDGE CONTROL (WIN)
echo ==============================
echo 1. Start Edge (Detection Only)
echo 2. Start Edge + Stream Proxy
echo 3. Stop Edge
echo 4. Status
echo 5. Open Logs
echo 6. Exit
choice /C 123456 /N /M "Select option: "

if errorlevel 6 goto :end
if errorlevel 5 goto :logs
if errorlevel 4 goto :status
if errorlevel 3 goto :stop
if errorlevel 2 goto :startfull
if errorlevel 1 goto :startdet

:startdet
schtasks /Run /TN "$agentTaskName" >nul 2>&1
schtasks /End /TN "$pusherTaskName" >nul 2>&1
echo Detection mode started.
timeout /t 2 >nul
goto :menu

:startfull
schtasks /Run /TN "$agentTaskName" >nul 2>&1
schtasks /Run /TN "$pusherTaskName" >nul 2>&1
echo Detection + stream proxy started.
timeout /t 2 >nul
goto :menu

:stop
schtasks /End /TN "$agentTaskName" >nul 2>&1
schtasks /End /TN "$pusherTaskName" >nul 2>&1
echo Edge services stopped.
timeout /t 2 >nul
goto :menu

:status
echo.
echo Agent Task:
schtasks /Query /TN "$agentTaskName" /V /FO LIST | findstr /I "Status:"
echo.
echo Pusher Task:
schtasks /Query /TN "$pusherTaskName" /V /FO LIST | findstr /I "Status:"
echo.
pause
goto :menu

:logs
start "" "$logsDir"
goto :menu

:end
exit /b 0
"@
Set-Content -Path $controlBat -Value $controlBatContent -Encoding ASCII

$agentTaskCmd = '"' + $agentLoopBat + '"'
$pusherTaskCmd = '"' + $pusherLoopBat + '"'

& schtasks.exe /Create /F /SC ONLOGON /RL LIMITED /TN $agentTaskName /TR $agentTaskCmd | Out-Null
& schtasks.exe /Create /F /SC ONLOGON /RL LIMITED /TN $pusherTaskName /TR $pusherTaskCmd | Out-Null

& schtasks.exe /Run /TN $agentTaskName | Out-Null
& schtasks.exe /End /TN $pusherTaskName 2>$null | Out-Null

$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "PRISMA Edge Control.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $controlBat
$shortcut.WorkingDirectory = $controlDir
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,221"
$shortcut.Save()

Write-Host "Windows Edge Control installed." -ForegroundColor Green
Write-Host "Control panel shortcut: $shortcutPath"
Write-Host "Default mode started: Detection Only"
