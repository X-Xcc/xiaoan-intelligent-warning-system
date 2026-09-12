$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$source = Get-Content -Raw (Join-Path $root 'deploy/native/start.ps1')

if ($source -notmatch 'function Test-NativeDashboardBuild') {
    throw 'Native startup must validate the dashboard build mode before reusing dist.'
}
if ($source -notmatch 'if \(-not \(Test-NativeDashboardBuild\s+\$Root\)\)') {
    throw 'Native startup must rebuild when the existing dashboard dist is not native-configured.'
}

Write-Output 'Native dashboard build guard is present.'
