param(
    [Parameter(Mandatory = $true)][string]$ApiBaseUrl,
    [ValidateRange(1024, 65525)][int]$WebPort = 5177
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$WebRoot = Join-Path $Root 'apps\dashboard'
$StateDir = Join-Path $Root '.verify\alarm-linkage'
$ApiBaseUrl = $ApiBaseUrl.TrimEnd('/')
$api = [uri]$ApiBaseUrl
if (-not $api.IsAbsoluteUri -or $api.Scheme -notin @('http', 'https') -or
    $api.UserInfo -or $api.Query -or $api.Fragment -or -not $api.AbsolutePath.EndsWith('/api')) {
    throw 'ApiBaseUrl must be an HTTP(S) API base ending in /api, without credentials or query parameters.'
}

$health = Invoke-RestMethod "$ApiBaseUrl/health" -TimeoutSec 8
if ($health.status -ne 'ok' -or $health.service -ne 'public-security-platform-api') {
    throw 'The selected endpoint is not the current platform API. No service was changed.'
}
$events = Invoke-RestMethod "$ApiBaseUrl/events?kind=help" -TimeoutSec 8
if (-not ($events.PSObject.Properties.Name -contains 'items')) {
    throw 'The selected API did not return an alarm queue.'
}
if (Get-NetTCPConnection -State Listen -LocalPort $WebPort -ErrorAction SilentlyContinue) {
    throw "Port $WebPort is occupied. Use -WebPort to select a free port; no existing process was stopped."
}

$node = (Get-Command node.exe -ErrorAction Stop).Source
$vite = Join-Path $Root 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $vite)) { throw 'Vite is missing. Install workspace dependencies first.' }
New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
$names = @('VITE_API_BASE_URL', 'VITE_SECURITY_MONITOR_URL', 'CICSIC_PROXY_TARGET')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    $env:VITE_API_BASE_URL = '/api'
    $env:VITE_SECURITY_MONITOR_URL = '/api/security-video/feed?cam=0'
    $env:CICSIC_PROXY_TARGET = $ApiBaseUrl.Substring(0, $ApiBaseUrl.Length - 4)
    $web = Start-Process -FilePath $node -ArgumentList @(
        "`"$vite`"", '--host', '127.0.0.1', '--port', $WebPort, '--strictPort'
    ) -WorkingDirectory $WebRoot -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput (Join-Path $StateDir "web-$WebPort.stdout.log") `
      -RedirectStandardError (Join-Path $StateDir "web-$WebPort.stderr.log")
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}

$url = "http://127.0.0.1:$WebPort"
try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        $web.Refresh()
        if ($web.HasExited) { throw 'Web startup failed. Check .verify/alarm-linkage logs.' }
        try {
            $page = Invoke-WebRequest "$url/command" -Headers @{ Accept = 'text/html' } -UseBasicParsing -TimeoutSec 2
            $proxy = Invoke-RestMethod "$url/api/health" -TimeoutSec 3
            if ($page.StatusCode -eq 200 -and $proxy.service -eq 'public-security-platform-api') {
                $ready = $true
                break
            }
        } catch { Start-Sleep -Milliseconds 300 }
    }
    if (-not $ready) { throw 'The Web page or API proxy did not become ready.' }
    [ordered]@{
        apiBaseUrl = $ApiBaseUrl
        webUrl = "$url/command"
        webPid = $web.Id
        startedAt = (Get-Date).ToString('o')
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $StateDir "web-$WebPort.json") -Encoding utf8
    Write-Output "Alarm workspace: $url/command"
    Write-Output "Receiving API: $ApiBaseUrl"
    Write-Output "Existing help receipts: $(@($events.items).Count)"
} catch {
    if ($web -and -not $web.HasExited) { Stop-Process -Id $web.Id }
    throw
}
