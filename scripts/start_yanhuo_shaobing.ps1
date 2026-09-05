$ErrorActionPreference = 'Stop'

$ProjectRoot = 'D:\CICSIC'
$BackendPort = 8010
$DashboardPort = 5173
$RuntimeDir = Join-Path $ProjectRoot '.codex\runtime'
$BackendLog = Join-Path $RuntimeDir 'yanhuo-backend.log'
$DashboardLog = Join-Path $RuntimeDir 'yanhuo-dashboard.log'

function Test-ListeningPort {
    param([int]$Port)

    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Wait-HttpReady {
    param(
        [string]$Url,
        [string]$ServiceName,
        [int]$TimeoutSeconds = 30
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return
            }
        } catch {
            Start-Sleep -Milliseconds 700
        }
    }

    throw "$ServiceName did not become ready within $TimeoutSeconds seconds."
}

try {
    New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null

    $backendPython = Join-Path $ProjectRoot 'server\.venv-runtime\Scripts\python.exe'
    if (-not (Test-Path $backendPython)) {
        throw "Backend Python was not found: $backendPython"
    }

    if (-not (Test-ListeningPort -Port $BackendPort)) {
        $backendCommand = @"
`$env:DATABASE_URL = 'sqlite:///D:/CICSIC/.codex/local-demo/linkage.db'
`$env:CICSIC_ALLOW_SQLITE_TESTS = '1'
`$env:PYTHONUNBUFFERED = '1'
& '$backendPython' -m uvicorn app.main:app --app-dir server --host 127.0.0.1 --port $BackendPort *>> '$BackendLog'
"@
        Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $backendCommand -WorkingDirectory $ProjectRoot -WindowStyle Hidden
    }
    Wait-HttpReady -Url "http://127.0.0.1:$BackendPort/api/health" -ServiceName 'Backend API'

    if (-not (Test-ListeningPort -Port $DashboardPort)) {
        $npm = Get-Command npm.cmd -ErrorAction Stop
        $dashboardCommand = "& '$($npm.Source)' run dev --workspace apps/dashboard -- --host 127.0.0.1 --port $DashboardPort *>> '$DashboardLog'"
        Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $dashboardCommand -WorkingDirectory $ProjectRoot -WindowStyle Hidden
    }
    Wait-HttpReady -Url "http://127.0.0.1:$DashboardPort/command" -ServiceName 'Command dashboard'

    Start-Process 'http://127.0.0.1:5173/command'
    Start-Process 'http://127.0.0.1:8010/docs'
    Write-Host 'Yanhuo Shaobing is running.' -ForegroundColor Green
} catch {
    Write-Host "Startup failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Logs: $RuntimeDir" -ForegroundColor Yellow
    exit 1
}
