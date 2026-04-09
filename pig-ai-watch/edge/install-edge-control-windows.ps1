param(
    [string]$EdgeDir = "",
    [string]$TaskNameSuffix = "",
    [switch]$NoPause
)

$ErrorActionPreference = "Stop"

function Wait-BeforeExit {
    param([switch]$SkipPause)

    if (-not $SkipPause) {
        Write-Host ""
        [void](Read-Host "Press Enter to close")
    }
}

function Normalize-PathInput {
    param([string]$RawPath)

    if (-not $RawPath) {
        return ""
    }

    $value = $RawPath.Trim()
    if ($value.StartsWith('"') -and $value.EndsWith('"') -and $value.Length -ge 2) {
        $value = $value.Substring(1, $value.Length - 2)
    }

    if ($value.StartsWith("'") -and $value.EndsWith("'") -and $value.Length -ge 2) {
        $value = $value.Substring(1, $value.Length - 2)
    }

    return $value.Trim()
}

function Get-SafeTaskSuffix {
    param([string]$RawValue)

    $fallback = "user"
    if (-not $RawValue) {
        return $fallback
    }

    $clean = ($RawValue -replace "[^a-zA-Z0-9_-]", "-").Trim('-')
    if (-not $clean) {
        return $fallback
    }

    if ($clean.Length -gt 24) {
        return $clean.Substring(0, 24)
    }

    return $clean
}

function Invoke-Schtasks {
    param(
        [string[]]$Arguments,
        [switch]$AllowFailure
    )

    $output = & schtasks.exe @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0 -and -not $AllowFailure) {
        $details = ($output | Out-String).Trim()
        if (-not $details) {
            $details = "schtasks failed (exit code $exitCode)"
        }
        throw $details
    }

    return @{
        Output = $output
        ExitCode = $exitCode
    }
}

function Test-EdgeFolder {
    param([string]$Path)

    $safePath = Normalize-PathInput -RawPath $Path
    if (-not $safePath) {
        return $false
    }

    try {
        return (Test-Path (Join-Path $safePath "agent.py")) -and (Test-Path (Join-Path $safePath "headless_proxy\edge_pusher.py"))
    }
    catch {
        return $false
    }
}

function Resolve-EdgeFolder {
    param([string]$Candidate)

    $normalizedCandidate = Normalize-PathInput -RawPath $Candidate

    if (Test-EdgeFolder $normalizedCandidate) {
        return (Resolve-Path -LiteralPath $normalizedCandidate).Path
    }

    $scriptDir = Split-Path -Parent $PSCommandPath
    if (Test-EdgeFolder $scriptDir) {
        return (Resolve-Path -LiteralPath $scriptDir).Path
    }

    Write-Host "Enter full path to your pig-ai-watch\\edge folder:" -ForegroundColor Yellow
    $manual = Normalize-PathInput -RawPath (Read-Host)
    if (Test-EdgeFolder $manual) {
        return (Resolve-Path -LiteralPath $manual).Path
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

try {
    $resolvedEdgeDir = Resolve-EdgeFolder -Candidate $EdgeDir
    $pythonExe = Find-PythonExe -ResolvedEdgeDir $resolvedEdgeDir
    $yoloModelVersion = "pig-ai-watch alpha"

    $taskSuffixSource = if ($TaskNameSuffix) { $TaskNameSuffix } else { $env:USERNAME }
    $taskSuffix = Get-SafeTaskSuffix -RawValue $taskSuffixSource

    $agentTaskName = "PRISMA-Edge-Agent-$taskSuffix"
    $pusherTaskName = "PRISMA-Edge-Pusher-$taskSuffix"

    $controlDir = Join-Path $resolvedEdgeDir "windows_control"
    $logsDir = Join-Path $resolvedEdgeDir "logs"
    $agentLoopBat = Join-Path $controlDir "run-agent-loop.bat"
    $pusherLoopBat = Join-Path $controlDir "run-pusher-loop.bat"
    $startBackgroundBat = Join-Path $controlDir "Start-Edge-Background.bat"
    $stopBackgroundBat = Join-Path $controlDir "Stop-Edge-Background.bat"
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

    $startBackgroundContent = @"
@echo off
if /I "%~1"=="full" (
    schtasks /Run /TN "$agentTaskName" >nul 2>&1
    schtasks /Run /TN "$pusherTaskName" >nul 2>&1
    echo Edge started in background (Detection + Stream Proxy).
) else (
    schtasks /Run /TN "$agentTaskName" >nul 2>&1
    schtasks /End /TN "$pusherTaskName" >nul 2>&1
    echo Edge started in background (Detection Only).
)
timeout /t 2 >nul
"@
    Set-Content -Path $startBackgroundBat -Value $startBackgroundContent -Encoding ASCII

    $stopBackgroundContent = @"
@echo off
schtasks /End /TN "$agentTaskName" >nul 2>&1
schtasks /End /TN "$pusherTaskName" >nul 2>&1
echo Edge background tasks stopped.
timeout /t 2 >nul
"@
    Set-Content -Path $stopBackgroundBat -Value $stopBackgroundContent -Encoding ASCII

    $controlBatContent = @"
@echo off
title PRISMA Edge Control

:menu
cls
echo ==============================
echo   PRISMA EDGE CONTROL (WIN)
echo ==============================
echo YOLO Model: $yoloModelVersion
echo.
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
call "$startBackgroundBat"
echo Detection mode started.
timeout /t 2 >nul
goto :menu

:startfull
call "$startBackgroundBat" full
echo Detection + stream proxy started.
timeout /t 2 >nul
goto :menu

:stop
call "$stopBackgroundBat"
echo Edge services stopped.
timeout /t 2 >nul
goto :menu

:status
echo YOLO Model: $yoloModelVersion
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

    Invoke-Schtasks -Arguments @("/Create", "/F", "/SC", "ONLOGON", "/RL", "LIMITED", "/TN", $agentTaskName, "/TR", $agentTaskCmd) | Out-Null
    Invoke-Schtasks -Arguments @("/Create", "/F", "/SC", "ONLOGON", "/RL", "LIMITED", "/TN", $pusherTaskName, "/TR", $pusherTaskCmd) | Out-Null

    Invoke-Schtasks -Arguments @("/Run", "/TN", $agentTaskName) | Out-Null
    Invoke-Schtasks -Arguments @("/End", "/TN", $pusherTaskName) -AllowFailure | Out-Null

    $desktopPath = [Environment]::GetFolderPath("Desktop")
    $shortcutPath = Join-Path $desktopPath "PRISMA Edge Control.lnk"
    $backgroundShortcutPath = Join-Path $desktopPath "Start PRISMA Edge (Background).lnk"
    $stopShortcutPath = Join-Path $desktopPath "Stop PRISMA Edge.lnk"
    $shell = New-Object -ComObject WScript.Shell

    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $controlBat
    $shortcut.WorkingDirectory = $controlDir
    $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,221"
    $shortcut.Save()

    $startShortcut = $shell.CreateShortcut($backgroundShortcutPath)
    $startShortcut.TargetPath = $startBackgroundBat
    $startShortcut.WorkingDirectory = $controlDir
    $startShortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,221"
    $startShortcut.Save()

    $stopShortcut = $shell.CreateShortcut($stopShortcutPath)
    $stopShortcut.TargetPath = $stopBackgroundBat
    $stopShortcut.WorkingDirectory = $controlDir
    $stopShortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,131"
    $stopShortcut.Save()

    Write-Host "Windows Edge Control installed." -ForegroundColor Green
    Write-Host "Control panel shortcut: $shortcutPath"
    Write-Host "Background start shortcut: $backgroundShortcutPath"
    Write-Host "Background stop shortcut: $stopShortcutPath"
    Write-Host "Task names: $agentTaskName, $pusherTaskName"
    Write-Host "YOLO model version: $yoloModelVersion"
    Write-Host "Default mode started: Detection Only"
}
catch {
    Write-Host ""
    Write-Host "Installation failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Message -match "Illegal characters in path") {
        Write-Host ""
        Write-Host "The edge path could not be parsed correctly." -ForegroundColor Yellow
        Write-Host "Run with an explicit path:" -ForegroundColor Yellow
        Write-Host ".\install-edge-control-windows.ps1 -EdgeDir \"C:\\path\\to\\Prisma-atlas\\pig-ai-watch\\edge\""
    }
    if ($_.Exception.Message -match "Access is denied") {
        Write-Host ""
        Write-Host "Task registration was denied by Windows." -ForegroundColor Yellow
        Write-Host "Run once in Administrator PowerShell to delete old tasks:" -ForegroundColor Yellow
        Write-Host "schtasks /Delete /TN \"PRISMA-Edge-Agent\" /F"
        Write-Host "schtasks /Delete /TN \"PRISMA-Edge-Pusher\" /F"
    }
    Write-Host ""
    Write-Host "Try running in PowerShell:" -ForegroundColor Yellow
    Write-Host "powershell -ExecutionPolicy Bypass -File .\install-edge-control-windows.ps1"
    exit 1
}
finally {
    Wait-BeforeExit -SkipPause:$NoPause
}
