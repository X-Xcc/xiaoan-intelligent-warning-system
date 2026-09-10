<# Stops only processes and PostgreSQL data owned by this native project. #>
. (Join-Path $PSScriptRoot 'common.ps1')

try {
    foreach ($name in @('web', 'detector', 'api')) { Stop-NativeChild $name }
    $data = Join-Path (Get-NativeDirectory) 'data/postgres'
    if (Test-Path -LiteralPath (Join-Path $data 'PG_VERSION')) {
        & (Join-Path (Get-NativePostgresBin) 'pg_ctl.exe') -D $data -m fast -w stop | Out-Null
    }
    Write-Host 'XiaoAn native services stopped. Private data remains in this project folder.'
} catch {
    Write-Host "Stop needs attention: $($_.Exception.Message)"
    exit 1
}
