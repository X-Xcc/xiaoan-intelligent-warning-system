param(
    [ValidateRange(1024, 65535)][int]$ApiPort = 8012,
    [ValidateRange(1024, 65535)][int]$WebPort = 5180,
    [string]$PythonPath = $env:CICSIC_BRIDGE_PYTHON,
    [string]$WebRoot = ''
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Python = if ($PythonPath) { $PythonPath } else { Join-Path $Root 'server\.venv-runtime\Scripts\python.exe' }
$WebDirectory = if ($WebRoot) { (Resolve-Path -LiteralPath $WebRoot).Path } else { $Root }
$StateDir = Join-Path $Root 'server\.secrets\bridge-console'
$DeviceDir = Join-Path $Root 'server\.secrets\device-bridges'

if (-not (Test-Path -LiteralPath $Python)) {
    throw 'The project Python runtime is missing. Install server/requirements.txt first.'
}
foreach ($port in @($ApiPort, $WebPort)) {
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
        throw "Port $port is occupied. Use -ApiPort and -WebPort to choose unused ports."
    }
}
if ($ApiPort -eq $WebPort) { throw 'API and web ports must be different.' }

New-Item -ItemType Directory -Path $StateDir,$DeviceDir -Force | Out-Null
$TokenFile = Join-Path $StateDir 'admin.token'
if (-not (Test-Path -LiteralPath $TokenFile)) {
    $bytes = New-Object byte[] 32
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($bytes) } finally { $random.Dispose() }
    [System.IO.File]::WriteAllText($TokenFile, [Convert]::ToBase64String($bytes))
}
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
foreach ($directory in @($StateDir, $DeviceDir)) {
    & icacls.exe $directory /inheritance:r /grant:r ($identity + ':(OI)(CI)F') 'SYSTEM:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to restrict access to local credentials.' }
}

$env:CICSIC_ADMIN_TOKEN = [System.IO.File]::ReadAllText($TokenFile).Trim()
$env:APP_ENV = 'local'
$env:CICSIC_ALLOW_SHORT_LOCAL_ADMIN_TOKEN = 'true'
$env:CICSIC_ADMIN_AUTH_ENABLED = 'true'
$env:CICSIC_BRIDGE_DATA_DIR = $DeviceDir
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$env:CICSIC_PROXY_TARGET = "http://127.0.0.1:$ApiPort"
$env:VITE_API_BASE_URL = '/api'

function Stop-LaunchedProcess([System.Diagnostics.Process]$Process) {
    if ($Process -and -not $Process.HasExited) {
        & taskkill.exe /PID $Process.Id /T /F | Out-Null
    }
}

$web = $null
$api = Start-Process -FilePath $Python -ArgumentList @(
    '-m', 'uvicorn', 'app.main:app', '--app-dir', ('"' + (Join-Path $Root 'server') + '"'),
    '--host', '127.0.0.1', '--port', $ApiPort, '--log-level', 'warning'
) -WorkingDirectory $Root -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput (Join-Path $StateDir 'api.stdout.log') `
  -RedirectStandardError (Join-Path $StateDir 'api.stderr.log')

try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if ($api.HasExited) { throw 'API startup failed. Check the local API error log.' }
        try {
            $health = Invoke-RestMethod "http://127.0.0.1:$ApiPort/api/health" -TimeoutSec 1
            if ($health.status -eq 'ok') { $ready = $true; break }
        } catch { Start-Sleep -Milliseconds 250 }
    }
    if (-not $ready) { throw 'API did not become ready. Check DATABASE_URL and server/.env.' }
    $web = Start-Process -FilePath $env:ComSpec -ArgumentList @(
        '/d', '/c', "npm --workspace apps/dashboard run dev -- --port $WebPort --strictPort"
    ) -WorkingDirectory $WebDirectory -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput (Join-Path $StateDir 'web.stdout.log') `
      -RedirectStandardError (Join-Path $StateDir 'web.stderr.log')
    $webReady = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if ($web.HasExited) { throw 'Web startup failed. Check the local web error log.' }
        try {
            $page = Invoke-WebRequest "http://127.0.0.1:$WebPort/admin/bridges" -UseBasicParsing -TimeoutSec 1
            $proxy = Invoke-RestMethod "http://127.0.0.1:$WebPort/api/health" -TimeoutSec 1
            if ($page.StatusCode -eq 200 -and $proxy.status -eq 'ok') { $webReady = $true; break }
        } catch { Start-Sleep -Milliseconds 250 }
    }
    if (-not $webReady) { throw 'Web or API proxy did not become ready. Check frontend dependencies and proxy configuration.' }
    [pscustomobject]@{
        apiPid = $api.Id; webPid = $web.Id; apiPort = $ApiPort; webPort = $WebPort
        url = "http://127.0.0.1:$WebPort/admin/bridges"
        tokenFile = $TokenFile; startedAt = (Get-Date).ToString('o')
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $StateDir 'processes.json') -Encoding utf8
    Write-Output "Device console: http://127.0.0.1:$WebPort/admin/bridges"
    Write-Output "Local admin token: $TokenFile"
    Write-Output "API PID: $($api.Id); web launcher PID: $($web.Id)"
} catch {
    Stop-LaunchedProcess $web
    Stop-LaunchedProcess $api
    throw
}
