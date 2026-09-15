$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$native = Join-Path $root 'deploy\native'

try {
    . (Join-Path $native 'common.ps1')
    $path = Join-Path $native '.env'
    $runtimePath = Join-Path $native 'runtime.env'
    $runtime = Read-NativeEnv $runtimePath
    if ($runtime.Contains('CICSIC_ADMIN_TOKEN') -or $runtime.Contains('CICSIC_ALLOW_SHORT_ADMIN_TOKEN')) {
        throw 'runtime.env overrides the admin token settings. Review these overrides before continuing.'
    }
    Write-Host 'Setting the local-only admin token to 1234. Do not expose this deployment remotely.'
    Set-NativeSettingValue $path 'CICSIC_ADMIN_TOKEN' '1234'
    $settings = Read-NativeEnv $path
    if ($settings.Contains('CICSIC_ALLOW_SHORT_ADMIN_TOKEN')) {
        Set-NativeSettingValue $path 'CICSIC_ALLOW_SHORT_ADMIN_TOKEN' 'true'
    } else {
        Add-NativeSetting $path 'CICSIC_ALLOW_SHORT_ADMIN_TOKEN' 'true'
    }
    $settings = Read-NativeEnv $path
    if ($settings['CICSIC_ADMIN_TOKEN'] -ne '1234' -or $settings['CICSIC_ALLOW_SHORT_ADMIN_TOKEN'] -ne 'true') {
        throw 'Configuration verification failed. Services were not stopped.'
    }
    $python = Join-Path $native '.runtime\api-venv\Scripts\python.exe'
    & $python --version
    if ($LASTEXITCODE -ne 0) { throw 'Python is unavailable. Services were not stopped.' }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $native 'stop.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'Service stop failed.' }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $native 'start.ps1') -SkipBuild
    if ($LASTEXITCODE -ne 0) { throw 'Service startup failed.' }
    $port = $settings['API_PORT']
    $result = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/device-bridges/auth" `
        -Headers @{'X-Admin-Token' = '1234'} -TimeoutSec 10
    if ($result.authorized -ne $true) { throw 'The API rejected 1234 after restart.' }
    Write-Host 'SUCCESS: The API accepted admin token 1234.' -ForegroundColor Green
    Write-Host 'Refresh the device bridge page, then authorize with 1234.'
} catch {
    Write-Host ('FAILED: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
