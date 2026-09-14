<#
.SYNOPSIS
Starts the complete Windows-native XiaoAn deployment on loopback ports.
#>
[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [switch]$EnableCameras,
    [switch]$Force,
    [switch]$OpenBrowser,
    [switch]$NoWatchdog
)

. (Join-Path $PSScriptRoot 'common.ps1')
# services.ps1 owns the uvicorn, pg_ctl, go2rtc.exe, detector WAR, and static_server.py processes.

function Ensure-NativeConfiguration {
    param([string]$Python, [string]$Native)
    if (-not (Test-Path -LiteralPath (Join-Path $Native '.env'))) {
        & $Python (Join-Path (Get-NativeProjectRoot) 'deploy/configure.py') --directory $Native --detector
        if ($LASTEXITCODE -ne 0) { throw 'Native private configuration could not be created.' }
    }
    foreach ($item in @(
        @('API_PORT', '8010'), @('DETECTOR_PORT', '5000'), @('POSTGRES_PORT', '5433'),
        @('CICSIC_BRIDGE_AUTOSTART', 'false'), @('DETECTOR_AUTOSTART', 'false'),
        @('GO2RTC_AUTOSTART', 'false'), @('DETECTOR_RETENTION_DAYS', '0')
    )) { Add-NativeSetting (Join-Path $Native '.env') $item[0] $item[1] }
}

function Test-NativeDashboardBuild {
    param([string]$Root)
    $dist = Join-Path $Root 'apps/dashboard/dist'
    $index = Join-Path $dist 'index.html'
    $assets = Join-Path $dist 'assets'
    if (-not (Test-Path -LiteralPath $index) -or -not (Test-Path -LiteralPath $assets)) { return $false }
    foreach ($asset in @(Get-ChildItem -LiteralPath $assets -Filter '*.js' -File -ErrorAction SilentlyContinue)) {
        if (Select-String -LiteralPath $asset.FullName -SimpleMatch 'http://127.0.0.1:8010/api' -Quiet) { return $true }
    }
    return $false
}

function Ensure-NativeBuild {
    param([string]$Python, [string]$Root, [string]$Native)
    $runtime = Join-Path $Native '.runtime'
    $apiVenv = Join-Path $runtime 'api-venv/Scripts/python.exe'
    $detectorVenv = Join-Path $runtime 'detector-venv/Scripts/python.exe'
    Set-NativePipSource
    if (-not (Test-Path -LiteralPath $apiVenv) -or -not (Test-NativePythonModules $apiVenv @('fastapi', 'psycopg', 'sqlalchemy'))) {
        & $Python -m venv (Join-Path $runtime 'api-venv')
        & $apiVenv -m pip install --upgrade pip
        & $apiVenv -m pip install -r (Join-Path $Root 'server/requirements.txt') -c (Join-Path $Root 'server/requirements-deploy.lock')
        if ($LASTEXITCODE -ne 0) { throw 'API Python dependencies could not be installed.' }
    }
    if (-not (Test-Path -LiteralPath $detectorVenv) -or -not (Test-NativePythonModules $detectorVenv @('torch', 'ultralytics', 'cv2'))) {
        & $Python -m venv (Join-Path $runtime 'detector-venv')
        & $detectorVenv -m pip install --upgrade pip
        & $detectorVenv -m pip install -r (Join-Path $Root 'integrations/detector/detection/requirements-cpu.txt')
        if ($LASTEXITCODE -ne 0) { throw 'Detector Python dependencies could not be installed.' }
    }
    $npm = Get-NativeNpm
    $nodeDir = Get-NativeNodeDirectory
    $env:Path = "$nodeDir;$env:Path"
    if (-not (Test-NativeDashboardBuild $Root)) {
        Push-Location $Root
        try {
            & $npm ci --workspace apps/dashboard --include-workspace-root --no-audit --no-fund
            $env:VITE_API_BASE_URL = 'http://127.0.0.1:8010/api'
            & $npm run dashboard:build:native
            if ($LASTEXITCODE -ne 0) { throw 'Dashboard build failed.' }
        } finally { Pop-Location }
    }
    $detector = Join-Path $Root 'integrations/detector'
    if (-not (Test-Path -LiteralPath (Join-Path $detector 'web/dist/index.html'))) {
        Push-Location (Join-Path $detector 'web')
        try {
            & $npm ci --no-audit --no-fund
            & $npm run build
            if ($LASTEXITCODE -ne 0) { throw 'Detector web build failed.' }
        } finally { Pop-Location }
    }
    $war = Join-Path $detector 'server/target/yolov8-security.war'
    if (-not (Test-Path -LiteralPath $war)) {
        Push-Location (Join-Path $detector 'server')
        try {
            # Never reuse a workstation-wide Maven cache. It may be incomplete or use a private mirror.
            $env:MAVEN_USER_HOME = Join-Path $runtime 'maven'
            New-Item -ItemType Directory -Force -Path $env:MAVEN_USER_HOME | Out-Null
            & .\mvnw.cmd -q -DskipTests clean package spring-boot:repackage
            if ($LASTEXITCODE -ne 0) { throw 'Detector Java build failed.' }
        } finally { Pop-Location }
    }
    $runtimeDir = Join-Path $detector 'runtime'
    New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
    $models = Join-Path $detector 'models'
    New-Item -ItemType Directory -Force -Path $models | Out-Null
    if (-not (Test-Path -LiteralPath (Join-Path $models 'yolov8n-pose.pt'))) {
        Copy-Item -LiteralPath (Join-Path $Root 'server/models/yolov8n-pose.pt') -Destination (Join-Path $models 'yolov8n-pose.pt')
    }
    Copy-Item -LiteralPath (Join-Path $detector 'server/bin/go2rtc.exe') -Destination (Join-Path $runtimeDir 'go2rtc.exe') -Force
    if (-not (Test-Path -LiteralPath (Join-Path $runtimeDir 'go2rtc.yaml'))) {
        [IO.File]::WriteAllText((Join-Path $runtimeDir 'go2rtc.yaml'), "api:`n  listen: ':1984'`nrtsp:`n  listen: ':8554'`nwebrtc:`n  listen: ':8555'`nstreams: {}`n", [Text.UTF8Encoding]::new($false))
    }
}

$lock = $null
$exitCode = 0
$cleanupNames = @()
$preExistingOwned = @{}

function Test-NativeOwnedChild {
    param([Parameter(Mandatory)][string]$Name)
    try {
        return [bool](Test-NativeChildOwnership $Name)
    } catch {
        return $false
    }
}

function Stop-NativeOwnedChild {
    param([Parameter(Mandatory)][string]$Name)
    if (-not (Test-NativeOwnedChild $Name)) { return }
    try {
        if ($Name -eq 'watchdog') {
            Stop-NativeWatchdogProcess
        } else {
            Stop-NativeChild $Name
        }
    } catch {
        Write-Host "Cleanup could not stop the owned $Name process. Check native logs."
    }
}

try {
    $root = Get-NativeProjectRoot
    $native = Get-NativeDirectory
    $lock = Enter-NativeProjectLock

    foreach ($name in @('watchdog', 'api', 'detector', 'web')) {
        $preExistingOwned[$name] = Test-NativeOwnedChild $name
    }

    if ($Force) {
        foreach ($name in @('watchdog', 'web', 'detector', 'api')) {
            if ($preExistingOwned[$name]) {
                Stop-NativeOwnedChild $name
                $cleanupNames += $name
            }
        }
    } else {
        foreach ($name in @('api', 'detector', 'web')) {
            if (-not $preExistingOwned[$name]) { $cleanupNames += $name }
        }
    }

    Write-Host '[1/5] Checking prerequisites...'
    & (Join-Path $PSScriptRoot 'bootstrap.ps1') -InstallMissing
    if ($LASTEXITCODE -ne 0) { throw 'Prerequisite check did not pass.' }
    $python = Get-NativePython -RequirePrivateAcl
    Ensure-NativeConfiguration $python $native

    Write-Host '[2/5] Checking application dependencies and builds (first launch may take longer)...'
    if (-not $SkipBuild) { Ensure-NativeBuild $python $root $native }

    # Native startup is intentionally real-camera-only. The switch remains for
    # compatibility with existing launchers and is forwarded to the watchdog.
    foreach ($name in @('CICSIC_BRIDGE_AUTOSTART', 'DETECTOR_AUTOSTART', 'GO2RTC_AUTOSTART')) {
        Set-NativeSettingValue (Join-Path $native '.env') $name 'true'
    }

    . (Join-Path $PSScriptRoot 'services.ps1')
    $context = Get-NativeServiceContext -RequireRealCamera
    Write-Host '[3/5] Starting database, API, detector, and dashboard...'
    Start-NativeServiceStack -Context $context -RequireRealCamera
    Wait-NativeHttp $context.WebUrl
    Wait-NativeRealCameraReadiness $context.ApiBase $context.DetectorBase

    if (-not $NoWatchdog) {
        if (-not $preExistingOwned['watchdog'] -or $Force) {
            $cleanupNames += 'watchdog'
        }
        Write-Host '[4/5] Starting native watchdog...'
        Start-NativeWatchdogProcess -EnableCameras | Out-Null
        if (-not (Test-NativeOwnedChild 'watchdog')) {
            throw 'Native watchdog could not be confirmed as project-owned.'
        }
    } elseif ($OpenBrowser) {
        throw 'OpenBrowser requires the native watchdog unless NoWatchdog is removed.'
    }

    Write-Host '[5/5] Real camera readiness confirmed.'
    Write-Host "READY: native real camera stack http://127.0.0.1:$($context.Settings['WEB_PORT'])"
    Write-Host "Detector: $($context.DetectorBase)"
    if ($OpenBrowser) { Open-NativeDashboard $context.WebUrl }
} catch {
    $exitCode = 1
    foreach ($name in ($cleanupNames | Select-Object -Unique)) {
        Stop-NativeOwnedChild $name
    }
    Write-Host 'Startup stopped before the native real-camera stack became ready.'
    Write-Host "Logs: $(Join-Path (Get-NativeDirectory) 'logs')"
} finally {
    Exit-NativeProjectLock $lock
}

exit $exitCode
