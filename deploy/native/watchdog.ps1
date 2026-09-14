<#
.SYNOPSIS
Keeps the project-owned native services available after an unexpected stop.

The watchdog is deliberately quiet: recovery details are written to the native
log and never surfaced in the dashboard.
#>
[CmdletBinding()]
param([switch]$RequireRealCamera)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $PSScriptRoot 'services.ps1')

$script:WatchdogLog = Join-Path (Get-NativeDirectory) 'logs/watchdog.log'
$script:RecoveryCooldownSeconds = 60
$script:PollSeconds = 15

function Write-NativeWatchdogLog {
    param([string]$Message)
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $script:WatchdogLog) | Out-Null
    Add-Content -LiteralPath $script:WatchdogLog -Value "$([DateTime]::Now.ToString('s')) $Message"
}

function Get-NativeHealthSnapshot {
    $context = Get-NativeServiceContext
    $errors = [ordered]@{}
    $web = $false
    $api = $false
    $detector = $false
    $postgres = $false

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $context.WebUrl -TimeoutSec 3
        $web = $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    } catch {
        $errors['web'] = $_.Exception.Message
    }

    try {
        Get-NativeJson "$($context.ApiBase)/api/health/ready" | Out-Null
        $api = $true
    } catch {
        $errors['api'] = $_.Exception.Message
    }

    try {
        Get-NativeJson "$($context.DetectorBase)/api/detection/status" | Out-Null
        $detector = $true
    } catch {
        $errors['detector'] = $_.Exception.Message
    }

    try {
        $env:PGPASSWORD = $context.Settings['POSTGRES_PASSWORD']
        $postgres = Test-NativePostgresConnection (Get-NativePostgresBin) $context.Settings['POSTGRES_PORT']
        if (-not $postgres) { $errors['postgres'] = 'PostgreSQL did not accept a local health query.' }
    } catch {
        $errors['postgres'] = $_.Exception.Message
    }

    return [pscustomobject]@{
        Context = $context
        web = $web
        api = $api
        detector = $detector
        postgres = $postgres
        errors = $errors
        checkedAt = [DateTime]::UtcNow
    }
}

function Get-NativePropertyValue {
    param([object]$Object, [string]$Name, [object]$Default = $null)
    if ($null -eq $Object) { return $Default }
    if ($Object -is [System.Collections.IDictionary] -and $Object.Contains($Name)) {
        return $Object[$Name]
    }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -ne $property) { return $property.Value }
    return $Default
}

function Test-NativeRealCameraSnapshot {
    param([Parameter(Mandatory)][hashtable]$Context)
    try {
        $bridge = Get-NativeJson "$($Context.ApiBase)/api/device-bridges/readiness"
        $detectorResponse = Get-NativeJson "$($Context.DetectorBase)/api/detection/status"
        $data = Get-NativePropertyValue $detectorResponse 'data' $detectorResponse
        $bindingValues = @(Get-NativePropertyValue $bridge 'requiredBindings' @())
        $requiredBindings = @($bindingValues | Where-Object {
            -not [string]::IsNullOrWhiteSpace([string]$_)
        })
        $cameras = @(Get-NativePropertyValue (Get-NativePropertyValue $data 'frames' $null) 'cameras' @())
        $missing = @()
        foreach ($binding in $requiredBindings) {
            $found = $false
            foreach ($camera in $cameras) {
                foreach ($property in @('id', 'cameraId', 'deviceId', 'sourceId')) {
                    if ([string](Get-NativePropertyValue $camera $property '') -eq [string]$binding) {
                        $online = [bool](Get-NativePropertyValue $camera 'online' $false)
                        $frameCount = [int64](Get-NativePropertyValue $camera 'frameCount' 0)
                        $lastFrameAt = Get-NativePropertyValue $camera 'lastFrameAt' $null
                        $fresh = $false
                        if ($online -and $frameCount -gt 0 -and $lastFrameAt) {
                            try {
                                $age = ([DateTime]::UtcNow - ([DateTime]::Parse([string]$lastFrameAt)).ToUniversalTime()).TotalSeconds
                                $fresh = $age -ge 0 -and $age -le 10
                            } catch { $fresh = $false }
                        }
                        $found = $fresh
                        break
                    }
                }
                if ($found) { break }
            }
            if (-not $found) { $missing += [string]$binding }
        }
        return [pscustomobject]@{
            Healthy = $bridge.ready -eq $true -and
                [bool](Get-NativePropertyValue $data 'running' $false) -and
                $requiredBindings.Count -gt 0 -and $missing.Count -eq 0
            DetectorRunning = [bool](Get-NativePropertyValue $data 'running' $false)
            BridgeReady = [bool](Get-NativePropertyValue $bridge 'ready' $false)
            MissingBindings = $missing
            Error = $null
        }
    } catch {
        return [pscustomobject]@{
            Healthy = $false
            DetectorRunning = $false
            BridgeReady = $false
            MissingBindings = @()
            Error = $_.Exception.Message
        }
    }
}

function Get-NativeRecoveryAction {
    param(
        [Parameter(Mandatory)][pscustomobject]$Snapshot,
        [object]$CameraSnapshot = $null
    )
    if (-not $Snapshot.postgres) { return 'postgres' }
    if (-not $Snapshot.api) { return 'api' }
    if (-not $Snapshot.web) { return 'web' }
    if (-not $Snapshot.detector) { return 'detector' }

    # A single unavailable camera is isolated to the video layer. Keeping the
    # API and dashboard alive is more stable than restarting the whole stack.
    if ($RequireRealCamera -and $null -ne $CameraSnapshot -and
        -not $CameraSnapshot.Healthy -and $CameraSnapshot.DetectorRunning) {
        return 'none'
    }
    return 'none'
}

function New-NativeRecoveryContext {
    param([Parameter(Mandatory)][hashtable]$Context)
    $recovery = [ordered]@{}
    foreach ($entry in $Context.GetEnumerator()) { $recovery[$entry.Key] = $entry.Value }
    $recovery['RequireRealCamera'] = $false
    return $recovery
}

function Invoke-NativeRecoveryAction {
    param(
        [Parameter(Mandatory)][ValidateSet('postgres', 'api', 'detector', 'web', 'none')]
        [string]$Action,
        [Parameter(Mandatory)][hashtable]$Context
    )
    if ($Action -eq 'none') { return }
    Write-NativeWatchdogLog "recovering $Action"
    switch ($Action) {
        'postgres' {
            Initialize-NativeDatabase $Context.Settings
        }
        'api' {
            if (Test-NativeChildOwnership 'api') { Stop-NativeServiceLayer 'api' }
            Start-NativeApiService $Context
        }
        'detector' {
            if (Test-NativeChildOwnership 'detector') { Stop-NativeServiceLayer 'detector' }
            Start-NativeDetectorService (New-NativeRecoveryContext $Context) -WaitSeconds 12
        }
        'web' {
            if (Test-NativeChildOwnership 'web') { Stop-NativeServiceLayer 'web' }
            Start-NativeWebService $Context
        }
    }
    Start-Sleep -Seconds 2
    Write-NativeWatchdogLog "$Action recovery finished"
}

$mutexInput = [Text.Encoding]::UTF8.GetBytes([IO.Path]::GetFullPath((Get-NativeProjectRoot)).ToLowerInvariant())
$mutexHash = [Security.Cryptography.SHA256]::Create().ComputeHash($mutexInput)
$mutexSuffix = ([BitConverter]::ToString($mutexHash) -replace '-', '').Substring(0, 24)
$mutexName = "Local\XiaoAn.Native.Watchdog.$mutexSuffix"
$mutex = [Threading.Mutex]::new($false, $mutexName)
try {
    if (-not $mutex.WaitOne(0)) { exit 0 }
    Write-NativeWatchdogLog 'started'
    while ($true) {
        try {
            $snapshot = Get-NativeHealthSnapshot
            $cameraSnapshot = $null
            if ($RequireRealCamera -and $snapshot.api -and $snapshot.detector) {
                $cameraSnapshot = Test-NativeRealCameraSnapshot $snapshot.Context
            }
            $action = Get-NativeRecoveryAction $snapshot $cameraSnapshot
            if ($action -ne 'none') {
                Invoke-NativeRecoveryAction $action $snapshot.Context
            }
        } catch {
            Write-NativeWatchdogLog "health loop failed: $($_.Exception.Message)"
        }
        Start-Sleep -Seconds $script:PollSeconds
    }
} finally {
    try { if ($mutex.SafeWaitHandle -and -not $mutex.SafeWaitHandle.IsClosed) { $mutex.ReleaseMutex() } } catch { }
    $mutex.Dispose()
}
