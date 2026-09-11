<#
.SYNOPSIS
Starts the complete Windows-native XiaoAn deployment on loopback ports.
#>
[CmdletBinding()]
param([switch]$SkipBuild, [switch]$EnableCameras)

. (Join-Path $PSScriptRoot 'common.ps1')

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
    if (-not (Test-Path -LiteralPath (Join-Path $Root 'apps/dashboard/dist/index.html'))) {
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
            & .\mvnw.cmd -q -DskipTests package
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

try {
    $root = Get-NativeProjectRoot
    $native = Get-NativeDirectory
    & (Join-Path $PSScriptRoot 'bootstrap.ps1') -InstallMissing
    if ($LASTEXITCODE -ne 0) { throw 'Prerequisite check did not pass.' }
    $python = Get-NativePython -RequirePrivateAcl
    Ensure-NativeConfiguration $python $native
    if (-not $SkipBuild) { Ensure-NativeBuild $python $root $native }
    $settings = Read-NativeEnv (Join-Path $native '.env')
    if ($EnableCameras) {
        foreach ($name in @('CICSIC_BRIDGE_AUTOSTART', 'DETECTOR_AUTOSTART', 'GO2RTC_AUTOSTART')) {
            Set-NativeSettingValue (Join-Path $native '.env') $name 'true'
        }
        $settings = Read-NativeEnv (Join-Path $native '.env')
    }
    Initialize-NativeDatabase $settings
    Set-NativeEnvironment $settings
    Set-NativeEnvironment (Read-NativeEnv (Join-Path $native 'runtime.env'))
    $env:APP_ENV = 'production'
    $env:CICSIC_ADMIN_AUTH_ENABLED = 'true'
    $env:DATABASE_URL = "postgresql://xiaoan:$($settings['POSTGRES_PASSWORD'])@127.0.0.1:$($settings['POSTGRES_PORT'])/xiaoan"
    $env:CICSIC_BRIDGE_DATA_DIR = Join-Path $root 'server/.secrets/device-bridges'
    $env:CICSIC_EVIDENCE_DIR = Join-Path $root 'server/data/event-evidence'
    $env:SECURITY_MODEL_PATH = Join-Path $root 'server/models/yolov8n-pose.pt'
    $env:SECURITY_VIDEO_BASE_URL = "http://127.0.0.1:$($settings['DETECTOR_PORT'])"
    $apiPython = Join-Path $native '.runtime/api-venv/Scripts/python.exe'
    Start-NativeChild 'api' $apiPython @('-m', 'uvicorn', 'app.main:app', '--app-dir', 'server', '--host', '127.0.0.1', '--port', $settings['API_PORT']) $root | Out-Null
    Wait-NativeHttp "http://127.0.0.1:$($settings['API_PORT'])/api/health/ready"

    Set-NativeEnvironment (Read-NativeEnv (Join-Path $native 'detector.env'))
    $detector = Join-Path $root 'integrations/detector'
    $runtimeDir = Join-Path $detector 'runtime'
    $env:DATA_DIR = Join-Path $detector 'server/data'
    $env:RESULT_DIR = Join-Path $detector 'results'
    $env:CAMERAS_CONFIG_PATH = Join-Path $runtimeDir 'cameras.json'
    $env:YOLOV8_MODEL_PATH = Join-Path $detector 'models/yolov8n-pose.pt'
    $env:DETECTOR_PYTHON = Join-Path $native '.runtime/detector-venv/Scripts/python.exe'
    $env:DETECTOR_SCRIPT_PATH = Join-Path $detector 'detection/yolov8_security.py'
    $env:GO2RTC_BINARY = Join-Path $runtimeDir 'go2rtc.exe'
    $env:GO2RTC_API = 'http://127.0.0.1:1984'
    $env:GO2RTC_RTSP_HOST = 'rtsp://127.0.0.1:8554'
    $env:WEB_SERVER_URL = "http://127.0.0.1:$($settings['DETECTOR_PORT'])"
    $env:CICSIC_REVIEW_URL = "http://127.0.0.1:$($settings['API_PORT'])/api/security-ai/yolo-reviews"
    $env:DETECTOR_AUTOSTART = $settings['DETECTOR_AUTOSTART']
    $env:GO2RTC_AUTOSTART = $settings['GO2RTC_AUTOSTART']
    $env:DETECTOR_RETENTION_DAYS = $settings['DETECTOR_RETENTION_DAYS']
    $javaArgs = @('-Xmx512m')
    foreach ($name in @('API_KEY', 'CAM_PASSWORD', 'DATA_DIR', 'RESULT_DIR', 'CAMERAS_CONFIG_PATH', 'YOLOV8_MODEL_PATH', 'DETECTOR_PYTHON', 'DETECTOR_SCRIPT_PATH', 'GO2RTC_BINARY', 'GO2RTC_API', 'GO2RTC_RTSP_HOST', 'WEB_SERVER_URL', 'CICSIC_REVIEW_URL', 'CICSIC_REVIEW_API_KEY', 'CICSIC_REVIEW_ENABLED', 'DETECTOR_AUTOSTART', 'GO2RTC_AUTOSTART', 'DETECTOR_RETENTION_DAYS', 'JWT_SECRET', 'ADMIN_USERNAME', 'ADMIN_PASSWORD')) {
        if (Test-Path "Env:$name") { $javaArgs += "-D$name=$((Get-Item "Env:$name").Value)" }
    }
    $javaArgs += @('-jar', (Join-Path $detector 'server/target/yolov8-security.war'), "--server.port=$($settings['DETECTOR_PORT'])")
    Start-NativeChild 'detector' (Get-NativeJava) $javaArgs (Join-Path $detector 'server') | Out-Null
    Wait-NativeHttp "http://127.0.0.1:$($settings['DETECTOR_PORT'])/api/detection/status"
    Start-NativeChild 'web' $apiPython @((Join-Path $PSScriptRoot 'static_server.py'), '--directory', (Join-Path $root 'apps/dashboard/dist'), '--port', $settings['WEB_PORT']) $root | Out-Null
    Wait-NativeHttp "http://127.0.0.1:$($settings['WEB_PORT'])/"
    Write-Host "READY: http://127.0.0.1:$($settings['WEB_PORT'])"
    Write-Host "Detector: http://127.0.0.1:$($settings['DETECTOR_PORT'])"
    if (-not $EnableCameras) { Write-Host 'Cameras are restored but not connected. Double-click enable-cameras.cmd after checking the target computer network.' }
} catch {
    Write-Host "Startup stopped: $($_.Exception.Message)"
    if ($_.InvocationInfo.ScriptLineNumber) {
        Write-Host "Location: $($_.InvocationInfo.ScriptName):$($_.InvocationInfo.ScriptLineNumber)"
    }
    exit 1
}
