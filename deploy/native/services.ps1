Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'common.ps1')

function Get-NativeServiceContext {
    param([switch]$RequireRealCamera)
    $root = Get-NativeProjectRoot
    $native = Get-NativeDirectory
    $settings = Read-NativeEnv (Join-Path $native '.env')
    $runtime = Read-NativeEnv (Join-Path $native 'runtime.env')
    $detectorEnv = Read-NativeEnv (Join-Path $native 'detector.env')
    $detector = Join-Path $root 'integrations/detector'
    $apiPython = Join-Path $native '.runtime/api-venv/Scripts/python.exe'
    $detectorRuntime = Join-Path $detector 'runtime'
    $context = [ordered]@{
        Root = $root
        Native = $native
        Settings = $settings
        Runtime = $runtime
        DetectorEnv = $detectorEnv
        ApiBase = "http://127.0.0.1:$($settings['API_PORT'])"
        DetectorBase = "http://127.0.0.1:$($settings['DETECTOR_PORT'])"
        WebUrl = "http://127.0.0.1:$($settings['WEB_PORT'])/"
        ApiPython = $apiPython
        Detector = $detector
        DetectorRuntime = $detectorRuntime
        RequireRealCamera = [bool]$RequireRealCamera
    }
    return $context
}

function Start-NativeApiService {
    param([hashtable]$Context)
    Set-NativeEnvironment $Context.Settings
    Set-NativeEnvironment $Context.Runtime
    $env:APP_ENV = 'production'
    $env:CICSIC_ADMIN_AUTH_ENABLED = 'true'
    $env:DATABASE_URL = "postgresql://xiaoan:$($Context.Settings['POSTGRES_PASSWORD'])@127.0.0.1:$($Context.Settings['POSTGRES_PORT'])/xiaoan"
    $env:CICSIC_BRIDGE_DATA_DIR = Join-Path $Context.Root 'server/.secrets/device-bridges'
    $env:CICSIC_EVIDENCE_DIR = Join-Path $Context.Root 'server/data/event-evidence'
    $env:SECURITY_MODEL_PATH = Join-Path $Context.Root 'server/models/yolov8-pose.pt'
    $env:SECURITY_VIDEO_BASE_URL = $Context.DetectorBase
    $serverPath = [IO.Path]::GetFullPath((Join-Path $Context.Root 'server'))
    Start-NativeChild 'api' $Context.ApiPython @('-m', 'uvicorn', 'app.main:app', '--app-dir', $serverPath, '--host', '127.0.0.1', '--port', $Context.Settings['API_PORT']) $Context.Root | Out-Null
    Wait-NativeHttp "$($Context.ApiBase)/api/health/ready"
}

function Start-NativeDetectorService {
    param([hashtable]$Context)
    Set-NativeEnvironment $Context.DetectorEnv
    $env:DATA_DIR = Join-Path $Context.Detector 'server/data'
    $env:RESULT_DIR = Join-Path $Context.Detector 'results'
    $env:CAMERAS_CONFIG_PATH = Join-Path $Context.DetectorRuntime 'cameras.json'
    $env:YOLOV8_MODEL_PATH = Join-Path $Context.Detector 'models/yolov8n-pose.pt'
    $env:DETECTOR_PYTHON = Join-Path $Context.Native '.runtime/detector-venv/Scripts/python.exe'
    $env:DETECTOR_SCRIPT_PATH = Join-Path $Context.Detector 'detection/yolov8_security.py'
    $env:GO2RTC_BINARY = Join-Path $Context.DetectorRuntime 'go2rtc.exe'
    $env:GO2RTC_API = 'http://127.0.0.1:1984'
    $env:GO2RTC_RTSP_HOST = 'rtsp://127.0.0.1:8554'
    $env:WEB_SERVER_URL = $Context.DetectorBase
    $env:CICSIC_REVIEW_URL = "$($Context.ApiBase)/api/security-ai/yolo-reviews"
    $env:DETECTOR_AUTOSTART = $Context.Settings['DETECTOR_AUTOSTART']
    $env:GO2RTC_AUTOSTART = $Context.Settings['GO2RTC_AUTOSTART']
    $env:DETECTOR_RETENTION_DAYS = $Context.Settings['DETECTOR_RETENTION_DAYS']
    $javaArgs = @('-Xmx512m')
    foreach ($name in @('DATA_DIR','RESULT_DIR','CAMERAS_CONFIG_PATH','YOLOV8_MODEL_PATH','DETECTOR_PYTHON','DETECTOR_SCRIPT_PATH','GO2RTC_BINARY','GO2RTC_API','GO2RTC_RTSP_HOST','WEB_SERVER_URL','CICSIC_REVIEW_URL','CICSIC_REVIEW_ENABLED','CICSIC_REVIEW_TIMEOUT','THRESHOLDS_PATH','DETECTOR_AUTOSTART','GO2RTC_AUTOSTART','DETECTOR_RETENTION_DAYS')) {
        if (Test-Path "Env:$name") { $javaArgs += "-D$name=$((Get-Item "Env:$name").Value)" }
    }
    $javaArgs += @('-jar', (Join-Path $Context.Detector 'server/target/yolov8-security.war'), "--server.port=$($Context.Settings['DETECTOR_PORT'])")
    Start-NativeChild 'detector' (Get-NativeJava) $javaArgs (Join-Path $Context.Detector 'server') | Out-Null
    Wait-NativeHttp "$($Context.DetectorBase)/api/detection/status"
    if ($Context.RequireRealCamera) {
        Wait-NativeRealCameraReadiness $Context.ApiBase $Context.DetectorBase
    }
}

function Start-NativeWebService {
    param([hashtable]$Context)
    $dashboardDist = [IO.Path]::GetFullPath((Join-Path $Context.Root 'apps/dashboard/dist'))
    $staticServer = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'static_server.py'))
    Start-NativeChild 'web' $Context.ApiPython @($staticServer, '--directory', $dashboardDist, '--port', $Context.Settings['WEB_PORT']) $Context.Root | Out-Null
    Wait-NativeHttp $Context.WebUrl
}

function Stop-NativeServiceLayer {
    param([string]$Name)
    Stop-NativeChild $Name
}

function Start-NativeServiceStack {
    param([hashtable]$Context, [switch]$RequireRealCamera)
    $mustHaveRealCamera = $RequireRealCamera -or [bool]$Context.RequireRealCamera
    Initialize-NativeDatabase $Context.Settings
    Start-NativeApiService $Context
    if ($mustHaveRealCamera) {
        $Context.RequireRealCamera = $true
    }
    Start-NativeDetectorService $Context
    Start-NativeWebService $Context
    if ($mustHaveRealCamera) { Wait-NativeRealCameraReadiness $Context.ApiBase $Context.DetectorBase }
}
