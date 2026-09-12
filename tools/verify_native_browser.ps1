$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../deploy/native/common.ps1')

$script:opened = @()
function Start-Process {
    param($FilePath)
    $script:opened += $FilePath
}

Open-NativeDashboard 'http://127.0.0.1:18080'
if ($script:opened.Count -ne 1 -or $script:opened[0] -ne 'http://127.0.0.1:18080') {
    throw 'The configured dashboard URL must open exactly once.'
}

function Start-Process { throw 'No default browser is registered.' }
$warnings = @()
Open-NativeDashboard 'http://127.0.0.1:18080' -WarningVariable warnings -WarningAction SilentlyContinue
if ($warnings.Count -ne 1 -or [string]$warnings[0] -notlike '*http://127.0.0.1:18080*') {
    throw 'Browser failure must leave services running and display the manual URL.'
}
Write-Output 'PASS: configured browser URL and non-fatal browser failure.'
