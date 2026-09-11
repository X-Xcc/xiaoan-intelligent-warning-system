<#
.SYNOPSIS
Restores one encrypted XiaoAn private bundle into a new Windows-native project.
#>
[CmdletBinding()]
param([string]$Bundle, [string]$KeyFile)

. (Join-Path $PSScriptRoot 'common.ps1')

function Select-NativeRestoreFile {
    param([string]$Title, [string]$Filter)
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object Windows.Forms.OpenFileDialog
    try {
        $dialog.Title = $Title
        $dialog.Filter = $Filter
        if ($dialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { throw 'File selection was cancelled.' }
        return $dialog.FileName
    } finally { $dialog.Dispose() }
}

function Assert-NativeRestoreInput {
    param([string]$Path, [string]$Extension)
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Restore inputs must be ordinary local files.'
    }
    if ($Extension -and $item.Extension -ne $Extension) { throw "Select a $Extension file." }
    return $item.FullName
}

function New-NativeRestoreConfiguration {
    param([string]$Python, [string]$Native)
    & $Python (Join-Path (Get-NativeProjectRoot) 'deploy/configure.py') --directory $Native
    if ($LASTEXITCODE -ne 0) { throw 'Native private configuration could not be created.' }
    foreach ($item in @(
        @('API_PORT', '8010'), @('DETECTOR_PORT', '5000'), @('POSTGRES_PORT', '5433'),
        @('CICSIC_BRIDGE_AUTOSTART', 'false'), @('DETECTOR_AUTOSTART', 'false'),
        @('GO2RTC_AUTOSTART', 'false'), @('DETECTOR_RETENTION_DAYS', '0')
    )) { Add-NativeSetting (Join-Path $Native '.env') $item[0] $item[1] }
}

function Ensure-NativeRestoreTools {
    param([string]$Python, [string]$Native)
    $toolPython = Join-Path $Native '.runtime/api-venv/Scripts/python.exe'
    Set-NativePipSource
    if (-not (Test-Path -LiteralPath $toolPython) -or -not (Test-NativePythonModules $toolPython @('cryptography', 'psycopg', 'sqlalchemy'))) {
        & $Python -m venv (Join-Path $Native '.runtime/api-venv') | Out-Null
        & $toolPython -m pip install --upgrade pip | Out-Null
        & $toolPython -m pip install -r (Join-Path (Get-NativeProjectRoot) 'server/requirements.txt') -c (Join-Path (Get-NativeProjectRoot) 'server/requirements-deploy.lock') | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Private restore tools could not be installed.' }
    }
    return $toolPython
}

try {
    $root = Get-NativeProjectRoot
    $native = Get-NativeDirectory
    if (Test-Path -LiteralPath (Join-Path $native '.env')) { throw 'Use a NEW extracted project folder. Existing native deployment settings cannot be overwritten.' }
    foreach ($relative in @('data/postgres', 'logs', 'run')) { Test-NativeEmptyDirectory (Join-Path $native $relative) }
    Test-NativeRestoreRuntimeDirectory (Join-Path $native '.runtime')
    foreach ($relative in @('server/data/event-evidence', 'server/.secrets/device-bridges', 'server/security-data',
            'integrations/detector/server/data', 'integrations/detector/runtime', 'integrations/detector/models',
            'integrations/detector/detection/datasets', 'integrations/detector/runs', 'integrations/detector/results')) {
        Test-NativeEmptyDirectory (Join-Path $root $relative)
    }
    & (Join-Path $PSScriptRoot 'bootstrap.ps1') -InstallMissing
    if ($LASTEXITCODE -ne 0) { throw 'Prerequisite check did not pass.' }
    if (-not $Bundle) { $Bundle = Select-NativeRestoreFile 'Select the encrypted XiaoAn backup' 'XiaoAn backup (*.xiaoan)|*.xiaoan' }
    if (-not $KeyFile) { $KeyFile = Select-NativeRestoreFile 'Select the separate XiaoAn backup key' 'Key files (*.transfer-key)|*.transfer-key|All files (*.*)|*.*' }
    $Bundle = Assert-NativeRestoreInput $Bundle '.xiaoan'
    $KeyFile = Assert-NativeRestoreInput $KeyFile ''
    if ($Bundle -eq $KeyFile) { throw 'The encrypted backup and its separate key must be different files.' }

    $python = Get-NativePython -RequirePrivateAcl
    Write-Host 'Restore stage: preparing private restore tools...'
    $tools = Ensure-NativeRestoreTools $python $native
    $private = New-NativePrivateDirectory $env:LOCALAPPDATA ('XiaoAn-Restore-' + [guid]::NewGuid().ToString('N'))
    $payload = Join-Path $private 'payload'
    Write-Host 'Restore stage: authenticating and extracting the encrypted backup...'
    & $tools (Join-Path $root 'deploy/private_bundle.py') unpack --bundle $Bundle --key-file $KeyFile --destination $payload
    if ($LASTEXITCODE -ne 0) { throw 'Encrypted backup authentication or extraction failed.' }
    $snapshot = Get-Content -LiteralPath (Join-Path $payload 'snapshot.json') -Raw | ConvertFrom-Json
    if ($snapshot.version -ne 1 -or -not (Test-Path -LiteralPath (Join-Path $payload 'database.dump'))) { throw 'Backup contents are incomplete.' }
    if ([int][math]::Floor([long]$snapshot.postgresVersion / 10000) -gt 18) { throw 'This backup requires a newer PostgreSQL major version.' }

    New-NativeRestoreConfiguration $python $native
    $settings = Read-NativeEnv (Join-Path $native '.env')
    Write-Host 'Restore stage: creating the private PostgreSQL target...'
    Initialize-NativeDatabase $settings
    $bin = Get-NativePostgresBin
    $env:PGPASSWORD = $settings['POSTGRES_PASSWORD']
    $tableCount = & (Join-Path $bin 'psql.exe') -h 127.0.0.1 -p $settings['POSTGRES_PORT'] -U xiaoan -d xiaoan -Atqc "select count(*) from pg_tables where schemaname='public'"
    if ($tableCount.Trim() -ne '0') { throw 'Target PostgreSQL database is not empty. Restore refused.' }
    Write-Host 'Restore stage: restoring the PostgreSQL backup...'
    & (Join-Path $bin 'pg_restore.exe') --single-transaction --exit-on-error --no-owner --no-acl --host 127.0.0.1 --port $settings['POSTGRES_PORT'] --username xiaoan --dbname xiaoan (Join-Path $payload 'database.dump')
    if ($LASTEXITCODE -ne 0) { throw 'Database restore failed; the new target was retained for recovery.' }

    Write-Host 'Restore stage: restoring private files...'
    & $tools (Join-Path $root 'deploy/restore_payload.py') files --payload $payload --setup $native --server (Join-Path $root 'server') --detector (Join-Path $root 'integrations/detector')
    if ($LASTEXITCODE -ne 0) { throw 'Private file restore failed.' }
    Write-Host 'Restore stage: verifying every restored file...'
    & $tools (Join-Path $root 'deploy/restore_payload.py') verify-files --payload $payload --server (Join-Path $root 'server') --detector (Join-Path $root 'integrations/detector')
    if ($LASTEXITCODE -ne 0) { throw 'Private file checksum verification failed.' }
    Set-NativeEnvironment $settings
    Set-NativeEnvironment (Read-NativeEnv (Join-Path $native 'runtime.env'))
    $env:DATABASE_URL = "postgresql://xiaoan:$($settings['POSTGRES_PASSWORD'])@127.0.0.1:$($settings['POSTGRES_PORT'])/xiaoan"
    Write-Host 'Restore stage: verifying database tables and rows...'
    & $tools (Join-Path $root 'deploy/restore_payload.py') verify-db --payload $payload
    if ($LASTEXITCODE -ne 0) { throw 'Database contents did not match the backup.' }
    $accountsParent = Join-Path $root 'server/.secrets'
    $accountsDirectory = Join-Path $accountsParent 'deployment-accounts'
    New-NativePrivateDirectory $accountsParent 'deployment-accounts' | Out-Null
    $env:PYTHONPATH = Join-Path $root 'server'
    $env:XIAOAN_API_BASE_URL = "http://127.0.0.1:$($settings['API_PORT'])"
    $env:XIAOAN_DEPLOYMENT_ACCOUNTS_DIR = $accountsDirectory
    Write-Host 'Restore stage: initializing private local accounts...'
    & $tools (Join-Path $root 'deploy/restore_payload.py') accounts --setup $native
    if ($LASTEXITCODE -ne 0) { throw 'Private business accounts could not be initialized.' }
    Write-Host 'Restore stage: connecting detector reporting to the local API...'
    & $tools (Join-Path $root 'deploy/restore_payload.py') connect-detector --setup $native --server (Join-Path $root 'server')
    if ($LASTEXITCODE -ne 0) { throw 'Detector/API linkage could not be configured.' }
    Copy-Item -LiteralPath (Join-Path $accountsDirectory 'accounts.json') -Destination (Join-Path $private 'accounts.json') -ErrorAction Stop
    Write-Host 'Restore verification passed: database rows and all private files match the encrypted backup.'
    Write-Host "Private account report: $private"
    & (Join-Path $PSScriptRoot 'start.ps1')
} catch {
    Write-Host "Restore stopped safely: $($_.Exception.Message)"
    Write-Host 'Do not reuse this project folder or delete its data to retry. Extract a new project folder for the next restore attempt.'
    exit 1
}
