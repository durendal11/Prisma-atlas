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

function Test-PythonRuntime {
    param(
        [string]$Exe,
        [string[]]$Args
    )

    if (-not $Exe) {
        return $false
    }

    try {
        $output = & $Exe @Args 2>&1
        $exitCode = $LASTEXITCODE
        $text = ($output | Out-String)

        if ($exitCode -ne 0) {
            return $false
        }

        if ($text -match "Python was not found" -or $text -match "Microsoft Store") {
            return $false
        }

        return $true
    }
    catch {
        return $false
    }
}

function Find-PythonCommand {
    param([string]$ResolvedEdgeDir)

    $pigAiWatchDir = (Resolve-Path (Join-Path $ResolvedEdgeDir "..")).Path
    $repoRoot = (Resolve-Path (Join-Path $ResolvedEdgeDir "..\..")).Path

    $venvCandidates = @(
        (Join-Path $ResolvedEdgeDir ".venv\Scripts\python.exe"),
        (Join-Path $pigAiWatchDir ".venv\Scripts\python.exe"),
        (Join-Path $repoRoot ".venv\Scripts\python.exe")
    )

    foreach ($candidate in $venvCandidates) {
        if ((Test-Path $candidate) -and (Test-PythonRuntime -Exe $candidate -Args @("--version"))) {
            return @{ Exe = $candidate; Args = @() }
        }
    }

    $pyLauncher = Get-Command py.exe -ErrorAction SilentlyContinue
    if (-not $pyLauncher) {
        $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    }
    if ($pyLauncher -and (Test-PythonRuntime -Exe $pyLauncher.Source -Args @("-3", "--version"))) {
        return @{ Exe = $pyLauncher.Source; Args = @("-3") }
    }

    $pythonCmd = Get-Command python.exe -ErrorAction SilentlyContinue
    if (-not $pythonCmd) {
        $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    }

    if ($pythonCmd -and ($pythonCmd.Source -notmatch "\\WindowsApps\\python(\.exe)?$") -and (Test-PythonRuntime -Exe $pythonCmd.Source -Args @("--version"))) {
        return @{ Exe = $pythonCmd.Source; Args = @() }
    }

    throw "Python runtime not found. Install Python 3 (or create .venv) and rerun installer."
}

try {
    $resolvedEdgeDir = Resolve-EdgeFolder -Candidate $EdgeDir
    $pythonCommand = Find-PythonCommand -ResolvedEdgeDir $resolvedEdgeDir
    $pythonExe = $pythonCommand.Exe
    $pythonArgs = $pythonCommand.Args
    $pythonLaunch = '"' + $pythonExe + '"'
    if ($pythonArgs -and $pythonArgs.Count -gt 0) {
        $pythonLaunch = $pythonLaunch + " " + ($pythonArgs -join " ")
    }
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
    $statusBat = Join-Path $controlDir "Status-Edge-Background.bat"
    $viewAgentLogsBat = Join-Path $controlDir "View-Agent-Logs.bat"
    $viewPusherLogsBat = Join-Path $controlDir "View-Pusher-Logs.bat"
    $forceStopBat = Join-Path $controlDir "Force-Stop-Edge.bat"
    $controlBat = Join-Path $controlDir "PRISMA-Edge-Control.bat"
    $agentWindowTitle = "PRISMA_EDGE_AGENT_$taskSuffix"
    $pusherWindowTitle = "PRISMA_EDGE_PUSHER_$taskSuffix"
    $agentOutLog = Join-Path $logsDir "edge-agent.out.log"
    $agentErrLog = Join-Path $logsDir "edge-agent.err.log"
    $pusherOutLog = Join-Path $logsDir "edge-pusher.out.log"
    $pusherErrLog = Join-Path $logsDir "edge-pusher.err.log"

    New-Item -ItemType Directory -Path $controlDir -Force | Out-Null
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
    New-Item -ItemType File -Path $agentOutLog -Force | Out-Null
    New-Item -ItemType File -Path $agentErrLog -Force | Out-Null
    New-Item -ItemType File -Path $pusherOutLog -Force | Out-Null
    New-Item -ItemType File -Path $pusherErrLog -Force | Out-Null

    $agentLoopContent = @"
@echo off
set "LOG_OUT=$agentOutLog"
set "LOG_ERR=$agentErrLog"
cd /d "$resolvedEdgeDir"
echo [%date% %time%] Agent loop initialized.>>"%LOG_OUT%"
:loop
echo [%date% %time%] Starting agent...>>"%LOG_OUT%"
$pythonLaunch "$resolvedEdgeDir\agent.py" >>"%LOG_OUT%" 2>>"%LOG_ERR%"
set "RC=%ERRORLEVEL%"
echo [%date% %time%] Agent exited with code %RC%. Restarting in 5s...>>"%LOG_ERR%"
timeout /t 5 /nobreak >nul
goto loop
"@
    Set-Content -Path $agentLoopBat -Value $agentLoopContent -Encoding ASCII

    $pusherLoopContent = @"
@echo off
set "LOG_OUT=$pusherOutLog"
set "LOG_ERR=$pusherErrLog"
cd /d "$resolvedEdgeDir\headless_proxy"
echo [%date% %time%] Proxy loop initialized.>>"%LOG_OUT%"
:loop
echo [%date% %time%] Starting proxy...>>"%LOG_OUT%"
$pythonLaunch "$resolvedEdgeDir\headless_proxy\edge_pusher.py" >>"%LOG_OUT%" 2>>"%LOG_ERR%"
set "RC=%ERRORLEVEL%"
echo [%date% %time%] Proxy exited with code %RC%. Restarting in 5s...>>"%LOG_ERR%"
timeout /t 5 /nobreak >nul
goto loop
"@
    Set-Content -Path $pusherLoopBat -Value $pusherLoopContent -Encoding ASCII

    $viewAgentLogsContent = @"
@echo off
if not exist "$agentOutLog" type nul > "$agentOutLog"
if not exist "$agentErrLog" type nul > "$agentErrLog"
powershell -NoProfile -NoExit -Command "Write-Host 'Live agent logs (output + error). Close window when done.' -ForegroundColor Cyan; Get-Content -Path '$agentOutLog','$agentErrLog' -Tail 40 -Wait"
"@
    Set-Content -Path $viewAgentLogsBat -Value $viewAgentLogsContent -Encoding ASCII

    $viewPusherLogsContent = @"
@echo off
if not exist "$pusherOutLog" type nul > "$pusherOutLog"
if not exist "$pusherErrLog" type nul > "$pusherErrLog"
powershell -NoProfile -NoExit -Command "Write-Host 'Live proxy logs (output + error). Close window when done.' -ForegroundColor Cyan; Get-Content -Path '$pusherOutLog','$pusherErrLog' -Tail 40 -Wait"
"@
    Set-Content -Path $viewPusherLogsBat -Value $viewPusherLogsContent -Encoding ASCII

    $forceStopContent = @"
@echo off
schtasks /End /TN "$agentTaskName" >nul 2>&1
schtasks /End /TN "$pusherTaskName" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq $agentWindowTitle" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq $pusherWindowTitle" >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { (`$_.CommandLine -match 'agent\.py') -or (`$_.CommandLine -match 'edge_pusher\.py') } | ForEach-Object { Stop-Process -Id `$_.ProcessId -Force -ErrorAction SilentlyContinue }"
echo Forced stop command executed for tasks and processes.
timeout /t 2 >nul
"@
    Set-Content -Path $forceStopBat -Value $forceStopContent -Encoding ASCII

    $agentTaskCmd = '"' + $agentLoopBat + '"'
    $pusherTaskCmd = '"' + $pusherLoopBat + '"'

    $installMode = "task-scheduler"
    $taskSetupWarning = ""
    try {
        Invoke-Schtasks -Arguments @("/Create", "/F", "/SC", "ONLOGON", "/RL", "LIMITED", "/TN", $agentTaskName, "/TR", $agentTaskCmd) | Out-Null
        Invoke-Schtasks -Arguments @("/Create", "/F", "/SC", "ONLOGON", "/RL", "LIMITED", "/TN", $pusherTaskName, "/TR", $pusherTaskCmd) | Out-Null

        Invoke-Schtasks -Arguments @("/Run", "/TN", $agentTaskName) | Out-Null
        Invoke-Schtasks -Arguments @("/End", "/TN", $pusherTaskName) -AllowFailure | Out-Null
    }
    catch {
        $schedulerError = ($_.Exception.Message | Out-String).Trim()
        if ($schedulerError -match "Access is denied") {
            $installMode = "startup-fallback"
            $taskSetupWarning = $schedulerError
        }
        else {
            throw
        }
    }

    if ($installMode -eq "task-scheduler") {
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

        $statusContent = @"
@echo off
    echo Install Mode: Task Scheduler
    echo.
echo Agent Task:
    schtasks /Query /TN "$agentTaskName" /V /FO LIST | findstr /I "Status: Last Run Time: Last Result:"
echo.
echo Pusher Task:
    schtasks /Query /TN "$pusherTaskName" /V /FO LIST | findstr /I "Status: Last Run Time: Last Result:"
    echo.
    echo Agent Log (last 5):
    powershell -NoProfile -Command "if (Test-Path '$agentOutLog') { Get-Content -Path '$agentOutLog' -Tail 5 } else { '(no agent output log yet)' }"
    echo.
    echo Agent Errors (last 5):
    powershell -NoProfile -Command "if (Test-Path '$agentErrLog') { Get-Content -Path '$agentErrLog' -Tail 5 } else { '(no agent error log yet)' }"
    echo.
    echo Proxy Log (last 5):
    powershell -NoProfile -Command "if (Test-Path '$pusherOutLog') { Get-Content -Path '$pusherOutLog' -Tail 5 } else { '(no proxy output log yet)' }"
    echo.
    echo Proxy Errors (last 5):
    powershell -NoProfile -Command "if (Test-Path '$pusherErrLog') { Get-Content -Path '$pusherErrLog' -Tail 5 } else { '(no proxy error log yet)' }"
"@
        Set-Content -Path $statusBat -Value $statusContent -Encoding ASCII
    }
    else {
        $startBackgroundContent = @"
@echo off
set "AGENT_TITLE=$agentWindowTitle"
set "PUSHER_TITLE=$pusherWindowTitle"

if /I "%~1"=="full" (
    call :start_proc "%AGENT_TITLE%" "$agentLoopBat"
    call :start_proc "%PUSHER_TITLE%" "$pusherLoopBat"
    echo Edge started in background (Detection + Stream Proxy).
) else (
    call :start_proc "%AGENT_TITLE%" "$agentLoopBat"
    call :stop_proc "%PUSHER_TITLE%"
    echo Edge started in background (Detection Only).
)
timeout /t 2 >nul
exit /b 0

:start_proc
set "TITLE=%~1"
set "BAT=%~2"
tasklist /v /fo list | findstr /I /C:"Window Title: %TITLE%" >nul 2>&1
if errorlevel 1 (
    start "%TITLE%" /MIN cmd /c ""%BAT%""
)
exit /b 0

:stop_proc
set "TITLE=%~1"
taskkill /F /FI "WINDOWTITLE eq %TITLE%" >nul 2>&1
exit /b 0
"@
        Set-Content -Path $startBackgroundBat -Value $startBackgroundContent -Encoding ASCII

        $stopBackgroundContent = @"
@echo off
set "AGENT_TITLE=$agentWindowTitle"
set "PUSHER_TITLE=$pusherWindowTitle"
taskkill /F /FI "WINDOWTITLE eq %AGENT_TITLE%" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq %PUSHER_TITLE%" >nul 2>&1
echo Edge background processes stopped.
timeout /t 2 >nul
"@
        Set-Content -Path $stopBackgroundBat -Value $stopBackgroundContent -Encoding ASCII

        $statusContent = @"
@echo off
    echo Install Mode: Startup Fallback
    echo.
echo Agent Process:
tasklist /v /fo list | findstr /I /C:"Window Title: $agentWindowTitle" >nul 2>&1
if errorlevel 1 (
    echo Status: Stopped
) else (
    echo Status: Running
)
echo.
echo Pusher Process:
tasklist /v /fo list | findstr /I /C:"Window Title: $pusherWindowTitle" >nul 2>&1
if errorlevel 1 (
    echo Status: Stopped
) else (
    echo Status: Running
)
echo.
echo Agent Log (last 5):
powershell -NoProfile -Command "if (Test-Path '$agentOutLog') { Get-Content -Path '$agentOutLog' -Tail 5 } else { '(no agent output log yet)' }"
echo.
echo Agent Errors (last 5):
powershell -NoProfile -Command "if (Test-Path '$agentErrLog') { Get-Content -Path '$agentErrLog' -Tail 5 } else { '(no agent error log yet)' }"
echo.
echo Proxy Log (last 5):
powershell -NoProfile -Command "if (Test-Path '$pusherOutLog') { Get-Content -Path '$pusherOutLog' -Tail 5 } else { '(no proxy output log yet)' }"
echo.
echo Proxy Errors (last 5):
powershell -NoProfile -Command "if (Test-Path '$pusherErrLog') { Get-Content -Path '$pusherErrLog' -Tail 5 } else { '(no proxy error log yet)' }"
"@
        Set-Content -Path $statusBat -Value $statusContent -Encoding ASCII
    }

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
echo 6. Live Agent Logs
echo 7. Live Proxy Logs
echo 8. Force Stop (All)
echo 9. Exit
choice /C 123456789 /N /M "Select option: "

if errorlevel 9 goto :end
if errorlevel 8 goto :force
if errorlevel 7 goto :viewproxy
if errorlevel 6 goto :viewagent
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
call "$statusBat"
echo.
pause
goto :menu

:logs
start "" "$logsDir"
goto :menu

:viewagent
call "$viewAgentLogsBat"
goto :menu

:viewproxy
call "$viewPusherLogsBat"
goto :menu

:force
call "$forceStopBat"
echo Force stop completed.
timeout /t 2 >nul
goto :menu

:end
exit /b 0
"@
    Set-Content -Path $controlBat -Value $controlBatContent -Encoding ASCII

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

    $startupShortcutPath = Join-Path ([Environment]::GetFolderPath("Startup")) "PRISMA Edge Auto Start.lnk"
    if ($installMode -eq "startup-fallback") {
        $autoStartShortcut = $shell.CreateShortcut($startupShortcutPath)
        $autoStartShortcut.TargetPath = $startBackgroundBat
        $autoStartShortcut.WorkingDirectory = $controlDir
        $autoStartShortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,221"
        $autoStartShortcut.Save()

        # Start detection mode immediately after install in startup fallback mode.
        & cmd.exe /c ('"' + $startBackgroundBat + '"') | Out-Null
    }

    Write-Host "Windows Edge Control installed." -ForegroundColor Green
    Write-Host "Control panel shortcut: $shortcutPath"
    Write-Host "Background start shortcut: $backgroundShortcutPath"
    Write-Host "Background stop shortcut: $stopShortcutPath"
    Write-Host "Logs folder: $logsDir"
    if ($installMode -eq "task-scheduler") {
        Write-Host "Install mode: Task Scheduler" -ForegroundColor Green
        Write-Host "Task names: $agentTaskName, $pusherTaskName"
    }
    else {
        Write-Host "Install mode: Startup Fallback" -ForegroundColor Yellow
        Write-Host "Auto-start shortcut: $startupShortcutPath"
        if ($taskSetupWarning) {
            Write-Host "Task scheduler warning: $taskSetupWarning" -ForegroundColor Yellow
        }
    }
    Write-Host "Python runtime: $pythonLaunch"
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
