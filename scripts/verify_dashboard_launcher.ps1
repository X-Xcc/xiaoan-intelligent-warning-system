$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'start_public_security.ps1'
$blocker = $null
$startedPid = $null

try {
    for ($port = 5200; $port -lt 5250; $port += 2) {
        $occupied = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
            Where-Object { $_.LocalPort -in @($port, ($port + 1)) }
        if (-not $occupied) { break }
    }
    if ($port -ge 5250) { throw 'No free port pair for launcher verification.' }
    $blocker = New-Object System.Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $port)
    $blocker.Start()

    $firstRun = & $launcher -NoBrowser -FrontendOnly -DashboardPort $port *>&1 | Out-String
    $pidMatch = [regex]::Match($firstRun, 'process (\d+)')
    if ($pidMatch.Success) { $startedPid = [int]$pidMatch.Groups[1].Value }
    $expectedPort = $port + 1
    if ($firstRun -notmatch "Dashboard ready: http://127.0.0.1:$expectedPort/") {
        throw "Launcher did not avoid the occupied port: $firstRun"
    }
    if (-not $startedPid) { throw 'The cold-start test did not create a new service.' }
    $identity = Invoke-RestMethod "http://127.0.0.1:$expectedPort/platform-health.json"
    if ($identity.service -ne 'cicsic-dashboard') { throw 'Unexpected service identity.' }
    Write-Output 'PASS: cold start waits for this dashboard and avoids an occupied port.'

    $secondRun = & $launcher -NoBrowser -FrontendOnly -DashboardPort $port *>&1 | Out-String
    if ($secondRun -notmatch "Dashboard ready: http://127.0.0.1:$expectedPort/" -or $secondRun -match 'Starting dashboard') {
        throw "Existing dashboard was not reused: $secondRun"
    }
    $listener = Get-NetTCPConnection -LocalPort $expectedPort -State Listen
    if ($listener.OwningProcess -ne $startedPid) { throw 'Dashboard process changed during reuse.' }
    Write-Output 'PASS: repeated launch reuses the ready dashboard without duplicate servers.'
} finally {
    if ($blocker) { $blocker.Stop() }
    if ($startedPid) {
        # Stop only the process created and recorded by this test.
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $startedPid"
        if ($process.CommandLine -match 'vite' -and $process.CommandLine -match "--port $expectedPort") {
            Stop-Process -Id $startedPid -ErrorAction SilentlyContinue
        }
    }
}
