param(
    [ValidateRange(1024, 65520)][int]$DashboardPort = 5177,
    [switch]$NoBrowser,
    [switch]$FrontendOnly
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DashboardRoot = Join-Path $ProjectRoot 'apps\dashboard'
$RuntimeDir = Join-Path $ProjectRoot '.codex\runtime'
$BackendPort = 8010

function Test-ServiceIdentity {
    param([string]$Url, [string]$Service)
    try {
        $response = Invoke-RestMethod -Uri $Url -TimeoutSec 2 -Headers @{ 'Cache-Control' = 'no-cache' }
        return $response.service -eq $Service
    } catch {
        return $false
    }
}

function Test-PortInUse {
    param([int]$Port)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $pending = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $pending.AsyncWaitHandle.WaitOne(300)) { return $false }
        $client.EndConnect($pending)
        return $true
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

function Wait-Service {
    param([string]$Url, [string]$Service, [int]$Seconds = 30)
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        if (Test-ServiceIdentity $Url $Service) { return $true }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    return $false
}

function Find-BackendPython {
    $candidates = @(
        (Join-Path $ProjectRoot 'server\.venv-runtime\Scripts\python.exe'),
        (Join-Path $ProjectRoot 'server\.venv\Scripts\python.exe')
    )
    $systemPython = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($systemPython) { $candidates += $systemPython.Source }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            try {
                & $candidate -c 'import uvicorn, fastapi' 2>$null
                if ($LASTEXITCODE -eq 0) { return $candidate }
            } catch {
                continue
            }
        }
    }
    return $null
}

try {
    if (-not (Test-Path -LiteralPath (Join-Path $DashboardRoot 'package.json'))) {
        throw "Dashboard project was not found: $DashboardRoot"
    }
    New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null

    # Reuse only services that identify themselves as this project's API.
    $backendReady = Test-ServiceIdentity "http://127.0.0.1:$BackendPort/api/health" 'public-security-platform-api'
    if (-not $backendReady -and -not $FrontendOnly) {
        if (Test-PortInUse $BackendPort) {
            Write-Warning "Port $BackendPort is occupied by another service. The dashboard will remain available."
        } else {
            $python = Find-BackendPython
            if ($python) {
                $env:PYTHONUTF8 = '1'
                $env:PYTHONIOENCODING = 'utf-8'
                Start-Process -FilePath $python -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--app-dir', 'server', '--host', '127.0.0.1', '--port', "$BackendPort") -WorkingDirectory $ProjectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $RuntimeDir 'public-security-api.log') -RedirectStandardError (Join-Path $RuntimeDir 'public-security-api-error.log') | Out-Null
                $backendReady = Wait-Service "http://127.0.0.1:$BackendPort/api/health" 'public-security-platform-api'
            }
        }
    }
    if (-not $backendReady) {
        Write-Warning "Business API is unavailable. The dashboard will label offline/demo data. Logs: $RuntimeDir"
    }

    $selectedPort = $null
    for ($port = $DashboardPort; $port -le $DashboardPort + 10; $port++) {
        if (Test-ServiceIdentity "http://127.0.0.1:$port/platform-health.json" 'cicsic-dashboard') {
            $selectedPort = $port
            break
        }
        if (-not (Test-PortInUse $port)) {
            $selectedPort = $port
            $node = (Get-Command node.exe -ErrorAction Stop).Source
            $vite = Join-Path $DashboardRoot 'node_modules\vite\bin\vite.js'
            if (-not (Test-Path -LiteralPath $vite)) {
                $vite = Join-Path $ProjectRoot 'node_modules\vite\bin\vite.js'
            }
            if (-not (Test-Path -LiteralPath $vite)) { throw 'Vite is missing. Run npm install in the project first.' }
            $dashboardProcess = Start-Process -FilePath $node -ArgumentList @("`"$vite`"", "`"$DashboardRoot`"", '--host', '127.0.0.1', '--port', "$port", '--strictPort') -WorkingDirectory $DashboardRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $RuntimeDir "public-security-dashboard-$port.log") -RedirectStandardError (Join-Path $RuntimeDir "public-security-dashboard-$port-error.log") -PassThru
            Write-Host "Starting dashboard on port $port (process $($dashboardProcess.Id))."
            break
        }
    }
    if ($null -eq $selectedPort) { throw 'No free dashboard port was found. Existing processes were left unchanged.' }
    $url = "http://127.0.0.1:$selectedPort/"
    if (-not (Wait-Service "${url}platform-health.json" 'cicsic-dashboard')) {
        throw "Dashboard did not become ready. See $RuntimeDir\public-security-dashboard-$selectedPort-error.log"
    }
    if (-not $NoBrowser) {
        Start-Process -FilePath $url
    }
    Write-Host "Dashboard ready: $url" -ForegroundColor Green
    Write-Host "Logs: $RuntimeDir"
} catch {
    Write-Host "Startup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
