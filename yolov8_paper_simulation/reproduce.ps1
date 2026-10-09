$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskPython = Join-Path $taskRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) {
    py -3.11 -s -m venv (Join-Path $taskRoot '.venv')
    if ($LASTEXITCODE -ne 0) { throw 'Could not create Python 3.11 environment.' }
    & $taskPython -m pip install -r (Join-Path $taskRoot 'requirements.txt')
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
foreach ($scriptName in @('simulate.py', 'render.py', 'write_report.py', 'verify.py')) {
    & $taskPython (Join-Path $taskRoot "scripts\$scriptName")
    if ($LASTEXITCODE -ne 0) { throw "$scriptName failed." }
}
Write-Output 'Figures, data, tables and verification are complete.'
