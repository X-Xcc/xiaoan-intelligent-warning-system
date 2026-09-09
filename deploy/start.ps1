$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker was not found. Install and open Docker Desktop, then retry.'
    }
    & docker info --format '{{.OSType}}' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Docker is not running. Open Docker Desktop and wait until it is ready.' }
    & docker compose version
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose v2 is required. Update Docker Desktop.' }
    $mount = "type=bind,source=$PSScriptRoot,target=/setup"
    & docker run --rm --mount $mount python:3.11-slim-bookworm python /setup/configure.py
    if ($LASTEXITCODE -ne 0) { throw 'Configuration failed. Existing credentials have not been replaced.' }
    & docker compose --env-file deploy/.env up -d --build --wait --wait-timeout 180
    if ($LASTEXITCODE -ne 0) { throw 'Startup failed. See the error above and the README troubleshooting section.' }
    $settings = ConvertFrom-StringData (Get-Content -LiteralPath "$PSScriptRoot\.env" -Raw)
    Write-Host ''
    Write-Host "READY: http://127.0.0.1:$($settings.WEB_PORT)"
    Write-Host 'Admin token: CICSIC_ADMIN_TOKEN in deploy\.env (keep it private).'
    Write-Host 'You can close this window. Keep Docker Desktop running.'
} finally {
    Pop-Location
}
