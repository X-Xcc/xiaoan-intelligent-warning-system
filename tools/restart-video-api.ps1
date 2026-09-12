param([switch]$Apply, [switch]$ResumeAll, [switch]$Recover)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
trap {
    $message = $_.Exception.Message + " (line " + $_.InvocationInfo.ScriptLineNumber + ")"
    [IO.File]::WriteAllText((Join-Path $root '.verify/video-api-restart.error.txt'), $message)
    Write-Error $message
    exit 1
}
. (Join-Path $root 'deploy/native/common.ps1')
$native = Get-NativeDirectory
$settings = Read-NativeEnv (Join-Path $native '.env')
$runtime = Read-NativeEnv (Join-Path $native 'runtime.env')
$base = "http://127.0.0.1:$($settings['API_PORT'])"
$token = if ($runtime['CICSIC_ADMIN_TOKEN']) { $runtime['CICSIC_ADMIN_TOKEN'] } else { $settings['CICSIC_ADMIN_TOKEN'] }
$headers = @{ 'X-Admin-Token' = $token }
$inventory = if ($Recover) { @{ items = @() } } else { Invoke-RestMethod "$base/api/device-bridges/" -Headers $headers }
$active = @($inventory.items | Where-Object { $ResumeAll -or $_.status -ne 'stopped' } | ForEach-Object { $_.id })
$listener = @(Get-NetTCPConnection -State Listen -LocalPort ([int]$settings['API_PORT']) -ErrorAction SilentlyContinue)
if ($listener.Count -ne 1 -and -not ($Recover -and $listener.Count -eq 0)) { throw 'Expected one native API listener.' }
$apiId = if ($listener.Count) { [int]$listener[0].OwningProcess } else { 0 }
$recordedId = [int](Get-Content -LiteralPath (Join-Path $native 'run/api.pid') -Raw).Trim()
$process = if ($apiId) { Get-CimInstance Win32_Process -Filter "ProcessId=$apiId" }
if ($apiId -and $apiId -ne $recordedId -and $process.ParentProcessId -ne $recordedId) {
    throw 'API listener does not match the recorded native process.'
}
Write-Output "Verified native API; $($active.Count) active cameras will be restored."
if (-not $Apply) { return }
foreach ($id in $active) {
    Invoke-RestMethod "$base/api/device-bridges/$id/stop" -Method Post -Headers $headers | Out-Null
}
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class VideoApiProcess {
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern IntPtr OpenProcess(uint access, bool inherit, int id);
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll")]
    public static extern bool CloseHandle(IntPtr handle);
}
'@
function Stop-VerifiedApiProcess([int]$id) {
    # Request only the terminate permission for the already verified API process.
    $handle = [VideoApiProcess]::OpenProcess(1, $false, $id)
    if ($handle -eq [IntPtr]::Zero) { throw "Cannot acquire API termination permission ($id)." }
    try {
        if (-not [VideoApiProcess]::TerminateProcess($handle, 0)) { throw "Cannot stop API process ($id)." }
    } finally { [VideoApiProcess]::CloseHandle($handle) | Out-Null }
}
if ($apiId) { Stop-VerifiedApiProcess $apiId }
if ($apiId -and $recordedId -ne $apiId) {
    if (Get-Process -Id $recordedId -ErrorAction SilentlyContinue) {
        try { Stop-VerifiedApiProcess $recordedId } catch {
            if (Get-Process -Id $recordedId -ErrorAction SilentlyContinue) { throw }
        }
    }
}
Set-NativeEnvironment $settings
Set-NativeEnvironment $runtime
$env:APP_ENV = 'production'
$env:CICSIC_ADMIN_AUTH_ENABLED = 'true'
$env:DATABASE_URL = "postgresql://xiaoan:$($settings['POSTGRES_PASSWORD'])@127.0.0.1:$($settings['POSTGRES_PORT'])/xiaoan"
$env:CICSIC_BRIDGE_DATA_DIR = Join-Path $root 'server/.secrets/device-bridges'
$env:CICSIC_BRIDGE_AUTOSTART = 'false'
$env:CICSIC_EVIDENCE_DIR = Join-Path $root 'server/data/event-evidence'
$env:SECURITY_MODEL_PATH = Join-Path $root 'server/models/yolov8n-pose.pt'
$env:SECURITY_VIDEO_BASE_URL = "http://127.0.0.1:$($settings['DETECTOR_PORT'])"
$python = Join-Path $native '.runtime/api-venv/Scripts/python.exe'
$child = Start-Process -FilePath $python -ArgumentList @('-m','uvicorn','app.main:app','--app-dir','server','--host','127.0.0.1','--port',$settings['API_PORT']) `
    -WorkingDirectory $root -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $native 'logs/api.out.log') `
    -RedirectStandardError (Join-Path $native 'logs/api.err.log')
[IO.File]::WriteAllText((Join-Path $native 'run/api.pid'), [string]$child.Id)
Wait-NativeHttp "$base/api/health/ready"
if ($Recover -and $ResumeAll) {
    $restored = Invoke-RestMethod "$base/api/device-bridges/" -Headers $headers
    $active = @($restored.items | ForEach-Object { $_.id })
}
foreach ($id in $active) {
    Invoke-RestMethod "$base/api/device-bridges/$id/start" -Method Post -Headers $headers | Out-Null
}
Write-Output 'API restarted. Previously active camera connections requested.'
