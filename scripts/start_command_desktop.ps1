param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $root 'tmp\command-launcher'
$url = 'http://127.0.0.1:5188/command?mode=playback'
$mutex = New-Object System.Threading.Mutex($false, 'Local\CICSIC_Command_Desktop')
$locked = $false

function Test-Ready([string]$Kind) {
    try {
        if ($Kind -eq 'api') {
            $config = Invoke-RestMethod 'http://127.0.0.1:8021/api/command/config' -TimeoutSec 2
            $schema = Invoke-RestMethod 'http://127.0.0.1:8021/openapi.json' -TimeoutSec 2
            return ($config.demoEnabled -eq $true -and $schema.paths.PSObject.Properties.Name -contains '/api/command/demo-session/{persona}')
        }
        $page = Invoke-WebRequest $url -Headers @{Accept='text/html'} -UseBasicParsing -TimeoutSec 3
        $module = Invoke-WebRequest 'http://127.0.0.1:5188/src/pages/CommandOperationsPage.tsx' -UseBasicParsing -TimeoutSec 3
        return ($page.StatusCode -eq 200 -and $page.Content.Contains('id="root"') -and $module.Content.Contains('CommandOperationsPage'))
    } catch { return $false }
}

function Assert-PortFree([int]$Port) {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    if ($listener) { throw "Port $Port is occupied by another or unhealthy service. No process was stopped. See $logs" }
}

function Wait-Ready([string]$Kind, $Process) {
    $deadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadline) {
        if (Test-Ready $Kind) { return }
        $Process.Refresh()
        if ($Process.HasExited) { throw "$Kind exited during startup. See $logs" }
        Start-Sleep -Milliseconds 750
    }
    throw "$Kind did not become ready within 90 seconds. See $logs"
}

try {
    $locked = $mutex.WaitOne(120000)
    if (-not $locked) { throw 'Another startup is still running. Please try again shortly.' }
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
    $python = Join-Path $root 'server\.venv-runtime\Scripts\python.exe'
    $vite = Join-Path $root 'node_modules\vite\bin\vite.js'
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    foreach ($file in @($python, $vite)) {
        if (-not (Test-Path -LiteralPath $file)) { throw "Required runtime missing: $file" }
    }
    if (-not (Test-Ready 'api')) {
        Assert-PortFree 8021
        Write-Host 'Starting isolated API...'
        $api = Start-Process -FilePath $python -ArgumentList @("`"$(Join-Path $root 'scripts\serve_command_demo.py')`"", '--port', '8021') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'api.out.log') -RedirectStandardError (Join-Path $logs 'api.err.log')
        Wait-Ready 'api' $api
    }
    if (-not (Test-Ready 'web')) {
        Assert-PortFree 5188
        Write-Host 'Starting web workspace...'
        $web = Start-Process -FilePath $node -ArgumentList @("`"$vite`"", '--config', 'vite.command.config.ts') -WorkingDirectory (Join-Path $root 'apps\dashboard') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'web.out.log') -RedirectStandardError (Join-Path $logs 'web.err.log')
        Wait-Ready 'web' $web
    }
    Write-Host "Ready: $url"
    if (-not $NoBrowser) { Start-Process $url }
} catch {
    Write-Host "Startup failed: $($_.Exception.Message)" -ForegroundColor Red
    if (-not $NoBrowser) { Read-Host 'Press Enter to close' | Out-Null }
    exit 1
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
