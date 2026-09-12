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

Assert-True ($null -ne (Get-Command Test-NativeChildOwnership -ErrorAction SilentlyContinue)) `
    'Missing ownership helper contract: Test-NativeChildOwnership'

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
$script:ownershipRecordPresent = $true
$script:ownershipCommandLine = 'python.exe --owned --port 8010'

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
                ready = $script:mockState.BridgeReady
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

function Start-NativeServiceLayer {
    param([string]$Name)
    $script:actions += $Name
}

function Stop-NativeChild {
    param([string]$Name)
    $script:actions += "stop:$Name"
}

function Stop-NativeServiceLayer {
    param([string]$Name)
    $script:actions += "stop:$Name"
}

function Start-Sleep {
    param([int]$Seconds)
}

function Get-Date {
    return $script:mockNow
}

function Get-NativeDirectory {
    return 'C:\native-watchdog-contract'
}

function Test-Path {
    param([string]$LiteralPath)
    if ($LiteralPath -like '*api.pid' -or $LiteralPath -like '*api.json') {
        return $script:ownershipRecordPresent
    }
    return $false
}

function Get-Content {
    param([string]$LiteralPath, [int]$TotalCount)
    if ($LiteralPath -like '*api.pid') { return '4242' }
    if ($LiteralPath -like '*api.json') {
        return '{"pid":4242,"file":"python.exe","arguments":["--owned"]}'
    }
    throw "Unexpected ownership content path: $LiteralPath"
}

function Get-Process {
    param([int]$Id)
    if ($Id -eq 4242) { return [pscustomobject]@{ Id = 4242 } }
    return $null
}

function Get-CimInstance {
    param([string]$ClassName, [string]$Filter)
    return [pscustomobject]@{ CommandLine = $script:ownershipCommandLine }
}

function Invoke-NativeOwnershipProductionContract {
    $command = Get-Command Test-NativeChildOwnership
    $arguments = @{}
    if ($command.Parameters.ContainsKey('Name')) {
        $arguments.Name = 'api'
    } else {
        throw 'Test-NativeChildOwnership must expose a -Name contract for this test.'
    }
    return [bool](& $command.Name @arguments)
}

$script:ownershipRecordPresent = $false
Assert-True (-not (Invoke-NativeOwnershipProductionContract)) `
    'Production ownership helper must reject a missing PID/JSON record.'
$script:ownershipRecordPresent = $true
$script:ownershipCommandLine = 'python.exe --owned --port 8010'
Assert-True (Invoke-NativeOwnershipProductionContract) `
    'Production ownership helper must accept matching PID/JSON command ownership.'
$script:ownershipCommandLine = 'python.exe --other --port 8010'
Assert-True (-not (Invoke-NativeOwnershipProductionContract)) `
    'Production ownership helper must reject an unrelated process command.'

$cases = @(
    @{ Name = 'healthy'; Web = $true; Api = $true; Detector = $true; Camera = $true; BridgeReady = $true; Expected = @() },
    @{ Name = 'web down'; Web = $false; Api = $true; Detector = $true; Camera = $true; BridgeReady = $true; Expected = @('web') },
    @{ Name = 'api down'; Web = $true; Api = $false; Detector = $true; Camera = $true; BridgeReady = $true; Expected = @('api') },
    @{ Name = 'detector down'; Web = $true; Api = $true; Detector = $false; Camera = $true; BridgeReady = $true; Expected = @('detector') },
    @{ Name = 'bridge down with fresh camera'; Web = $true; Api = $true; Detector = $true; Camera = $true; BridgeReady = $false; Expected = @('detector') },
    @{ Name = 'bridge ready with stale camera'; Web = $true; Api = $true; Detector = $true; Camera = $false; BridgeReady = $true; Expected = @('detector') }
)

foreach ($case in $cases) {
    $script:mockState = $case
    $script:actions = @()
    $script:frameCounts = @{}
    $snapshot = Get-NativeHealthSnapshot `
        -WebUrl 'http://127.0.0.1:8080/' `
        -ApiBase 'http://127.0.0.1:8010' `
        -DetectorBase 'http://127.0.0.1:5000'
    $realFrameFresh = Test-NativeRealCameraSnapshot `
        -Snapshot $snapshot `
        -Now $script:mockNow `
        -FreshnessSeconds 10
    Assert-Equal $case.Camera ([bool]$realFrameFresh) `
        "Test-NativeRealCameraSnapshot freshness mismatch for $($case.Name)"
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
    if ($actions.Count -gt 0) {
        $script:actions = @()
        Invoke-NativeRecoveryAction -Action $actions[0] -Context @{} | Out-Null
        Assert-True ($script:actions -contains $actions[0]) `
            "Invoke-NativeRecoveryAction did not execute $($actions[0]) for $($case.Name)"
    }
}

Write-Output 'PASS: native watchdog health and recovery contracts.'
