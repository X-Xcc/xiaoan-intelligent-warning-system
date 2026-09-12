$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$native = Join-Path $root 'deploy/native'
$watchdogPath = Join-Path $native 'watchdog.ps1'
$commonPath = Join-Path $native 'common.ps1'

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Assert-Equal {
    param($Expected, $Actual, [string]$Message)
    $expectedText = (@($Expected) -join ',')
    $actualText = (@($Actual) -join ',')
    if ($expectedText -ne $actualText) {
        throw "$Message. Expected [$expectedText], got [$actualText]."
    }
}

Assert-True (Test-Path -LiteralPath $commonPath) "Missing common.ps1: $commonPath"
Assert-True (Test-Path -LiteralPath $watchdogPath) "Missing watchdog.ps1: $watchdogPath"

function Test-NativeChildOwnershipContractMock {
    param(
        [bool]$RecordPresent,
        [string]$CommandLine,
        [string]$RecordedArgument = '--owned'
    )
    if (-not $RecordPresent -or [string]::IsNullOrWhiteSpace($CommandLine)) {
        return $false
    }
    return $CommandLine.Contains($RecordedArgument)
}

Assert-True (-not (Test-NativeChildOwnershipContractMock $false '')) `
    'Ownership mock must reject a missing JSON record.'
Assert-True (Test-NativeChildOwnershipContractMock $true 'python.exe --owned --port 8010') `
    'Ownership mock must accept a matching recorded command.'
Assert-True (-not (Test-NativeChildOwnershipContractMock $true 'python.exe --other --port 8010')) `
    'Ownership mock must reject an unrelated PID command.'

# Load only the function definitions. A production watchdog must not enter its
# service loop merely because this contract script dot-sourced it.
. $commonPath
. $watchdogPath

foreach ($name in @(
    'Get-NativeHealthSnapshot',
    'Test-NativeRealCameraSnapshot',
    'Get-NativeRecoveryAction',
    'Invoke-NativeRecoveryAction'
)) {
    Assert-True ($null -ne (Get-Command $name -ErrorAction SilentlyContinue)) `
        "Missing watchdog contract function: $name"
}

$script:mockState = $null
$script:actions = @()
$script:mockNow = [DateTime]::Parse('2026-09-12T12:00:00Z').ToUniversalTime()
$script:frameCounts = @{}

function Get-NativeJson {
    param([string]$Url, [hashtable]$Headers = @{})
    switch -Regex ($Url) {
        ':8080/' { return @{ status = $script:mockState.Web } }
        ':8010/api/health/ready' { return @{ ready = $script:mockState.Api } }
        ':5000/api/detection/status' {
            $script:frameCounts['camera-1'] = 1 + [int]$script:frameCounts['camera-1']
            $lastFrame = if ($script:mockState.Camera) {
                $script:mockNow.ToString('o')
            } else {
                $script:mockNow.AddSeconds(-30).ToString('o')
            }
            return @{
                running = $script:mockState.Detector
                frames = @{
                    cameras = @(@{
                        online = $script:mockState.Camera
                        frameCount = $script:frameCounts['camera-1']
                        lastFrameAt = $lastFrame
                    })
                }
            }
        }
        ':8010/api/device-bridges/readiness' {
            return @{
                ready = $script:mockState.Camera
                requiredBindings = @('camera-1')
                reasons = @()
            }
        }
        default { throw "Unexpected mocked URL: $Url" }
    }
}

function Start-NativeService {
    param([string]$Name)
    $script:actions += $Name
}

function Stop-NativeChild {
    param([string]$Name)
    $script:actions += "stop:$Name"
}

function Start-Sleep {
    param([int]$Seconds)
}

function Get-Date {
    return $script:mockNow
}

$cases = @(
    @{ Name = 'healthy'; Web = $true; Api = $true; Detector = $true; Camera = $true; BridgeReady = $true; Expected = @() },
    @{ Name = 'web down'; Web = $false; Api = $true; Detector = $true; Camera = $true; BridgeReady = $true; Expected = @('web') },
    @{ Name = 'api down'; Web = $true; Api = $false; Detector = $true; Camera = $true; BridgeReady = $true; Expected = @('api') },
    @{ Name = 'detector down'; Web = $true; Api = $true; Detector = $false; Camera = $true; BridgeReady = $true; Expected = @('detector') },
    @{ Name = 'real frames stale'; Web = $true; Api = $true; Detector = $true; Camera = $false; BridgeReady = $false; Expected = @('detector') }
)

foreach ($case in $cases) {
    $script:mockState = $case
    $script:actions = @()
    $script:frameCounts = @{}
    $snapshot = Get-NativeHealthSnapshot `
        -WebUrl 'http://127.0.0.1:8080/' `
        -ApiBase 'http://127.0.0.1:8010' `
        -DetectorBase 'http://127.0.0.1:5000'
    $firstFrameCount = [int]$snapshot.FrameCount
    $secondSnapshot = Get-NativeHealthSnapshot `
        -WebUrl 'http://127.0.0.1:8080/' `
        -ApiBase 'http://127.0.0.1:8010' `
        -DetectorBase 'http://127.0.0.1:5000'
    Assert-True ([int]$secondSnapshot.FrameCount -gt $firstFrameCount) `
        "frameCount must increase across snapshot rounds for $($case.Name)"
    Assert-Equal $case.BridgeReady ([bool]$snapshot.BridgeReady) `
        "bridge.ready mismatch for $($case.Name)"
    Assert-Equal $case.Camera ([bool]$snapshot.RealFrameFresh) `
        "real-frame freshness mismatch for $($case.Name)"
    $expectedLastFrameAt = if ($case.Camera) {
        $script:mockNow.ToString('o')
    } else {
        $script:mockNow.AddSeconds(-30).ToString('o')
    }
    Assert-Equal $expectedLastFrameAt ([DateTime]$snapshot.LastFrameAt).ToUniversalTime().ToString('o') `
        "lastFrameAt mismatch for $($case.Name)"
    $actions = @(Get-NativeRecoveryAction -Snapshot $snapshot)
    Assert-Equal $case.Expected $actions "Recovery action mismatch for $($case.Name)"
}

Write-Output 'PASS: native watchdog health and recovery contracts.'
