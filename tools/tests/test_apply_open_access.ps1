$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot '../apply-open-access.ps1'
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
    (Resolve-Path -LiteralPath $source).Path, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Update script has syntax errors.' }
$definition = $ast.Find({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
    $node.Name -eq 'Stop-UpdateProcess'
}, $true)
if (-not $definition) { throw 'Missing race-safe Stop-UpdateProcess helper.' }
. ([scriptblock]::Create($definition.Extent.Text))

function Get-Process {
    param($Id, $ErrorAction)
    if ($script:scenario -eq 'missing') { return $null }
    return $script:process
}
function Stop-Process {
    param($InputObject, [switch]$Force, $ErrorAction)
    $script:stopCalls++
    if ($InputObject -ne $script:process) { throw 'Must use the captured process object.' }
    if ($script:scenario -eq 'denied') { throw 'Access denied' }
    if ($script:scenario -eq 'wait-timeout') { return }
    $InputObject.HasExited = $true
    if ($script:scenario -eq 'exit-race') { throw 'Process already exited' }
}
function Wait-Process {
    param($InputObject, $Timeout, $ErrorAction)
    $script:waitCalls++
    if ($InputObject -ne $script:process) { throw 'Must wait on the captured process object.' }
    if ($script:scenario -eq 'wait-timeout') { throw 'Process is still running' }
    if ($script:scenario -eq 'wait-race') { throw 'Process already exited' }
}

foreach ($scenario in @('missing', 'success', 'exit-race', 'wait-race', 'denied', 'wait-timeout')) {
    $script:scenario = $scenario
    $script:process = [pscustomobject]@{ Id = 44068; HasExited = $false }
    $script:stopCalls = 0
    $script:waitCalls = 0
    $failed = $false
    try { Stop-UpdateProcess -ProcessId 44068 } catch { $failed = $true }
    $shouldFail = $scenario -in @('denied', 'wait-timeout')
    if ($failed -ne $shouldFail) { throw "Unexpected outcome for $scenario" }
    if ($scenario -eq 'missing' -and $script:stopCalls -ne 0) { throw 'Stopped a missing process.' }
    if ($scenario -ne 'missing' -and $script:stopCalls -ne 1) { throw 'Expected one stop attempt.' }
    Write-Output "PASS: $scenario"
}
