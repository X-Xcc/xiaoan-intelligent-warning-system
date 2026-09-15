[CmdletBinding()]
param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'

function Stop-UpdateProcess {
    param([int]$ProcessId)
    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $process) { return }
    # A parent exit can terminate its child between lookup and Stop-Process.
    try {
        Stop-Process -InputObject $process -Force -ErrorAction Stop
    } catch {
        if (-not $process.HasExited) { throw }
    }
    try {
        Wait-Process -InputObject $process -Timeout 15 -ErrorAction Stop
    } catch {
        if (-not $process.HasExited) { throw }
    }
}

$root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $root 'deploy/native/common.ps1')
$native = Get-NativeDirectory
$stagedWar = Join-Path $root 'integrations/detector/server/target/staged/yolov8-security.war'
$stagedWeb = Join-Path $root 'integrations/detector/web/dist-anonymous-check'
$targetWar = Join-Path $root 'integrations/detector/server/target/yolov8-security.war'
$targetWeb = Join-Path $root 'integrations/detector/web/dist'
foreach ($path in @($stagedWar, $stagedWeb, $targetWar, $targetWeb)) {
    if (-not [IO.Path]::GetFullPath($path).StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Update path is outside the project.'
    }
}
if (-not (Test-Path -LiteralPath $stagedWar -PathType Leaf) -or
    -not (Test-Path -LiteralPath (Join-Path $stagedWeb 'index.html') -PathType Leaf)) {
    throw 'The staged detector build is missing. Rebuild before applying.'
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($stagedWar)
try {
    $entry = $archive.GetEntry('META-INF/MANIFEST.MF')
    if (-not $entry) { throw 'The staged WAR has no manifest.' }
    $reader = [IO.StreamReader]::new($entry.Open())
    try { $manifest = $reader.ReadToEnd() } finally { $reader.Dispose() }
    if ($manifest -notmatch 'Main-Class: org.springframework.boot.loader.launch.WarLauncher') {
        throw 'The staged WAR is not an executable Spring Boot build.'
    }
} finally { $archive.Dispose() }
$settings = Read-NativeEnv (Join-Path $native '.env')
$processIds = @()
foreach ($service in @(@{ Name = 'api'; Port = $settings['API_PORT'] },
                       @{ Name = 'detector'; Port = $settings['DETECTOR_PORT'] })) {
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort ([int]$service.Port) -ErrorAction SilentlyContinue)
    $owners = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
    $pidPath = Join-Path $native "run/$($service.Name).pid"
    if ($owners.Count -gt 1) { throw "Multiple processes own the $($service.Name) port." }
    if ($owners.Count -eq 0) { continue }
    if (-not (Test-Path -LiteralPath $pidPath)) { throw "Missing $($service.Name) process record." }
    $recorded = [int](Get-Content -LiteralPath $pidPath -Raw).Trim()
    $listenerId = [int]$owners[0]
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$listenerId"
    if ($listenerId -ne $recorded -and $process.ParentProcessId -ne $recorded) {
        throw "The $($service.Name) listener does not match this deployment."
    }
    $processIds += $recorded
    $processIds += $listenerId
}
if ($CheckOnly) {
    Write-Output 'Staged executable, web assets, paths and service process records verified.'
    return
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Right-click apply-open-access.cmd and select Run as administrator.'
}
$active = @()
try {
    $inventory = Invoke-RestMethod "http://127.0.0.1:$($settings['API_PORT'])/api/device-bridges"
    $active = @($inventory.items | Where-Object { $_.status -ne 'stopped' } | ForEach-Object { $_.id })
    foreach ($id in $active) {
        Invoke-RestMethod "http://127.0.0.1:$($settings['API_PORT'])/api/device-bridges/$id/stop" -Method Post | Out-Null
    }
} catch {
    Write-Output 'Device state could not be read. Stored device configuration will be preserved.'
}
foreach ($processId in @($processIds | Select-Object -Unique)) {
    Stop-UpdateProcess -ProcessId $processId
}
Copy-Item -LiteralPath $stagedWar -Destination $targetWar -Force
# Merge built assets without deleting existing files or any device data.
foreach ($item in Get-ChildItem -LiteralPath $stagedWeb -Force) {
    Copy-Item -LiteralPath $item.FullName -Destination $targetWeb -Recurse -Force
}
& (Join-Path $native 'start.ps1') -SkipBuild
if ($LASTEXITCODE -ne 0) { throw 'Service startup failed; inspect deploy/native/logs.' }
foreach ($id in $active) {
    Invoke-RestMethod "http://127.0.0.1:$($settings['API_PORT'])/api/device-bridges/$id/start" -Method Post | Out-Null
}
foreach ($url in @("http://127.0.0.1:$($settings['API_PORT'])/api/command/me",
                   "http://127.0.0.1:$($settings['API_PORT'])/api/device-bridges",
                   "http://127.0.0.1:$($settings['DETECTOR_PORT'])/api/me")) {
    Invoke-RestMethod $url | Out-Null
}
Write-Output 'Open-access services are ready. Reconnect any previously stopped cameras from the device page.'
