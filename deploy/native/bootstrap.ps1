<#
.SYNOPSIS
Checks or installs the Windows-native prerequisites for XiaoAn.
#>
[CmdletBinding()]
param([switch]$InstallMissing)

. (Join-Path $PSScriptRoot 'common.ps1')

function Install-WithWinget {
    param([string]$Id, [string]$Name)
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) { $winget = Get-Command winget -ErrorAction SilentlyContinue }
    if (-not $winget) { throw "$Name is missing and Windows App Installer (winget) is unavailable." }
    Write-Host "Installing $Name..."
    & $winget.Source install --id $Id --exact --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) { throw "$Name installation did not finish." }
}

function Install-Node22 {
    $native = Get-NativeDirectory
    $target = Join-Path $native '.runtime/node'
    if (Test-Path -LiteralPath (Join-Path $target 'node.exe')) { return }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    $archive = Join-Path $native '.runtime/node-v22.22.0-win-x64.zip'
    Write-Host 'Downloading the verified Node.js 22 runtime...'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://nodejs.org/dist/v22.22.0/node-v22.22.0-win-x64.zip' -OutFile $archive
    Expand-Archive -LiteralPath $archive -DestinationPath (Split-Path -Parent $target)
    Move-Item -LiteralPath (Join-Path (Split-Path -Parent $target) 'node-v22.22.0-win-x64') -Destination $target
    Remove-Item -LiteralPath $archive -Force
}

try {
    $python = $null
    try { $python = Get-NativePython -RequirePrivateAcl } catch { if (-not $InstallMissing) { throw } }
    if (-not $python -and $InstallMissing) {
        Install-WithWinget 'Python.Python.3.12' 'Python 3.12'
    }

    $java = $null
    try { $java = Get-NativeJava } catch { if (-not $InstallMissing) { throw } }
    if (-not $java -and $InstallMissing) {
        Install-WithWinget 'EclipseAdoptium.Temurin.21.JDK' 'Eclipse Temurin JDK 21'
    }

    $postgres = $null
    try { $postgres = Get-NativePostgresBin } catch { if (-not $InstallMissing) { throw } }
    if (-not $postgres -and $InstallMissing) {
        Install-WithWinget 'PostgreSQL.PostgreSQL.18' 'PostgreSQL 18'
    }

    try { Get-NativeNodeDirectory | Out-Null } catch {
        if (-not $InstallMissing) { throw }
        Install-Node22
    }

    if ($InstallMissing) {
        Write-Host 'Prerequisite installers were started or completed. Close this window, open a new PowerShell window, then run start.cmd or restore.cmd again.'
        exit 0
    }

    $node = Join-Path (Get-NativeNodeDirectory) 'node.exe'
    Write-Host "READY: Python $(& (Get-NativePython -RequirePrivateAcl) --version); Node $(& $node --version); Java and PostgreSQL 18 were found."
} catch {
    Write-Host "Prerequisite check stopped: $($_.Exception.Message)"
    exit 1
}
