$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../deploy/native/common.ps1')

$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('native-hidden-' + [guid]::NewGuid().ToString('N'))
function Get-NativeDirectory { return $testRoot }
$script:launches = @()
function Start-Process {
    param($FilePath, $ArgumentList, $WorkingDirectory, [switch]$PassThru,
          $RedirectStandardOutput, $RedirectStandardError, $WindowStyle)
    $script:launches += @{
        WindowStyle = $WindowStyle
        Stdout = $RedirectStandardOutput
        Stderr = $RedirectStandardError
        PassThru = $PassThru
    }
    return Get-Process -Id $PID
}

try {
    foreach ($name in @('api', 'detector', 'web')) {
        $process = Start-NativeChild $name 'unused.exe' @('--test') $testRoot
        $launch = $script:launches[-1]
        if ($launch.WindowStyle -ne 'Hidden') { throw "$name must start with a hidden window." }
        if (-not $launch.PassThru) { throw "$name must return its process." }
        if ($launch.Stdout -ne (Join-Path $testRoot "logs/$name.out.log")) { throw 'Missing stdout log.' }
        if ($launch.Stderr -ne (Join-Path $testRoot "logs/$name.err.log")) { throw 'Missing stderr log.' }
        $saved = Get-Content -LiteralPath (Join-Path $testRoot "run/$name.pid") -Raw
        if ($saved -ne [string]$process.Id) { throw 'PID was not preserved.' }
        Start-NativeChild $name 'unused.exe' @('--test') $testRoot | Out-Null
    }
    if ($script:launches.Count -ne 3) { throw 'Existing services must not be relaunched.' }
    Write-Output 'PASS: API, detector and web hidden; logs, PID tracking and process reuse preserved.'
} finally {
    foreach ($name in @('api', 'detector', 'web')) {
        Remove-Item -LiteralPath (Join-Path $testRoot "run/$name.pid") -ErrorAction SilentlyContinue
    }
    foreach ($directory in @('run', 'logs')) {
        Remove-Item -LiteralPath (Join-Path $testRoot $directory) -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $testRoot -ErrorAction SilentlyContinue
}
