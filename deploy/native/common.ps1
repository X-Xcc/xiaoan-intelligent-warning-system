Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-NativeProjectRoot {
    return (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
}

function Get-NativeDirectory {
    return (Join-Path (Get-NativeProjectRoot) 'deploy/native')
}

function Read-NativeEnv {
    param([string]$Path)
    $values = [ordered]@{}
    if (-not (Test-Path -LiteralPath $Path)) { return $values }
    foreach ($line in [IO.File]::ReadAllLines($Path)) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        $parts = $trimmed.Split('=', 2)
        if ($parts.Count -ne 2 -or $values.Contains($parts[0])) { throw 'Invalid private configuration file.' }
        $value = $parts[1]
        if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
            try { $value = $value | ConvertFrom-Json } catch { throw 'Invalid quoted private configuration.' }
        }
        $values[$parts[0]] = $value.Replace('$$', '$')
    }
    return $values
}

function Set-NativeEnvironment {
    param([hashtable]$Values)
    foreach ($entry in $Values.GetEnumerator()) {
        Set-Item -Path "Env:$($entry.Key)" -Value ([string]$entry.Value)
    }
}

function Add-NativeSetting {
    param([string]$Path, [string]$Name, [string]$Value)
    $values = Read-NativeEnv $Path
    if ($values.Contains($Name)) {
        if ($values[$Name] -ne $Value) { throw "Existing private setting $Name cannot be replaced." }
        return
    }
    [IO.File]::AppendAllText($Path, "$Name=$Value`n", (New-Object Text.UTF8Encoding($false)))
}

function Set-NativeSettingValue {
    param([string]$Path, [string]$Name, [string]$Value)
    $lines = [IO.File]::ReadAllLines($Path)
    $found = $false
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -match "^$([regex]::Escape($Name))=") {
            $lines[$index] = "$Name=$Value"
            $found = $true
        }
    }
    if (-not $found) { throw "Private setting $Name was not found." }
    [IO.File]::WriteAllLines($Path, $lines, [Text.UTF8Encoding]::new($false))
}

function Set-NativePipSource {
    # Deployment must not inherit an unavailable or untrusted workstation mirror.
    $env:PIP_CONFIG_FILE = 'NUL'
    $env:PIP_INDEX_URL = 'https://pypi.org/simple'
    Remove-Item Env:PIP_EXTRA_INDEX_URL -ErrorAction SilentlyContinue
    Remove-Item Env:PIP_REQUIRE_HASHES -ErrorAction SilentlyContinue
}

function Test-NativePythonModules {
    param([string]$Python, [string[]]$Modules)
    & $Python -c ("import " + ($Modules -join ', ')) 2>$null
    return $LASTEXITCODE -eq 0
}

function Get-NativePython {
    param([switch]$RequirePrivateAcl)
    $candidates = @()
    if ($env:XIAOAN_PYTHON) { $candidates += $env:XIAOAN_PYTHON }
    $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
    if (-not $launcher) { $launcher = Get-Command py -ErrorAction SilentlyContinue }
    if ($launcher) {
        foreach ($selector in @('-3.12', '-3.11')) {
            try {
                $resolved = & $launcher.Source $selector -c 'import sys; print(sys.executable)' 2>$null
                if ($LASTEXITCODE -eq 0 -and $resolved) { $candidates += $resolved.Trim() }
            } catch { }
        }
    }
    foreach ($name in @('python.exe', 'python')) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command) { $candidates += $command.Source }
    }
    foreach ($candidate in $candidates | Select-Object -Unique) {
        try {
            $reported = [string]::Concat([object[]]@(& $candidate --version 2>$null)).Trim()
            $match = [regex]::Match($reported, '\d+\.\d+\.\d+')
            if ($LASTEXITCODE -ne 0 -or -not $match.Success) { continue }
            $version = [version]$match.Value
            $valid = $version -ge [version]'3.11.0' -and $version -lt [version]'3.13.0'
            $privateAcl = $version -ge [version]'3.12.4' -or $version -ge [version]'3.11.10'
            if ($valid -and (-not $RequirePrivateAcl -or $privateAcl)) {
                return (Resolve-Path -LiteralPath $candidate).Path
            }
        } catch { }
    }
    if ($RequirePrivateAcl) { throw 'Python 3.12.4+ or 3.11.10+ is required to protect encrypted-backup staging. Run deploy\\native\\bootstrap.ps1 -InstallMissing.' }
    throw 'Python 3.11 or 3.12 was not found. Run deploy\\native\\bootstrap.ps1 -InstallMissing, then open a new PowerShell window.'
}

function Get-NativePostgresBin {
    $candidates = @($env:XIAOAN_POSTGRES_BIN, 'C:\Program Files\PostgreSQL\18\bin', 'D:\PostgreSQL\18\bin')
    foreach ($registryPath in @(
        'HKLM:\SOFTWARE\PostgreSQL\Installations',
        'HKLM:\SOFTWARE\WOW6432Node\PostgreSQL\Installations'
    )) {
        try {
            foreach ($installation in Get-ChildItem -LiteralPath $registryPath -ErrorAction Stop) {
                $location = (Get-ItemProperty -LiteralPath $installation.PSPath -Name Base Directory -ErrorAction SilentlyContinue).'Base Directory'
                if ($location) { $candidates += (Join-Path $location 'bin') }
            }
        } catch { }
    }
    $candidates = $candidates | Where-Object { $_ }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath (Join-Path $candidate 'initdb.exe')) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    throw 'PostgreSQL 18 command-line tools were not found. Run deploy\\native\\bootstrap.ps1 -InstallMissing, then open a new PowerShell window.'
}

function Get-NativeJava {
    $candidates = @()
    foreach ($name in @('java.exe', 'java')) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command -and $command.Path) { return $command.Path }
    }
    if ($env:JAVA_HOME) { $candidates += (Join-Path $env:JAVA_HOME 'bin/java.exe') }
    $candidates += @(
        (Join-Path ${env:ProgramFiles} 'Java/*/bin/java.exe'),
        (Join-Path ${env:ProgramFiles} 'Eclipse Adoptium/*/bin/java.exe'),
        (Join-Path ${env:ProgramFiles} 'Microsoft/*/bin/java.exe'),
        (Join-Path ${env:USERPROFILE} '.jdks/*/bin/java.exe')
    )
    foreach ($candidate in ($candidates | Where-Object { $_ } | Select-Object -Unique)) {
        foreach ($resolved in @(Resolve-Path -Path $candidate -ErrorAction SilentlyContinue)) {
            try {
                $javaPath = $resolved.Path
                $reported = [string]::Concat([object[]]@(& $javaPath -version 2>&1)).Trim()
                if ($reported -match 'version\s+"21(\.|")') {
                    return $javaPath
                }
            } catch { }
        }
    }
    throw 'Java 21 JDK was not found. Run deploy\\native\\bootstrap.ps1 -InstallMissing, then open a new PowerShell window.'
}

function Get-NativeNodeDirectory {
    $bundled = Join-Path (Get-NativeDirectory) '.runtime/node'
    if (Test-Path -LiteralPath (Join-Path $bundled 'node.exe')) { return $bundled }
    $candidates = @()
    foreach ($name in @('node.exe', 'node')) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command) { $candidates += $command.Source }
    }
    $candidates += @(
        (Join-Path ${env:ProgramFiles} 'nodejs/node.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'nodejs/node.exe'),
        (Join-Path ${env:LOCALAPPDATA} 'Programs/nodejs/node.exe'),
        (Join-Path ${env:APPDATA} 'npm/node.exe'),
        'D:\Dev\DevTools\NodeJS\node-v22.11.0-win-x64\node.exe'
    )
    foreach ($registryPath in @(
        'HKLM:\SOFTWARE\Node.js',
        'HKLM:\SOFTWARE\WOW6432Node\Node.js',
        'HKCU:\Software\Node.js'
    )) {
        try {
            $installPath = (Get-ItemProperty -LiteralPath $registryPath -Name InstallPath -ErrorAction Stop).InstallPath
            if ($installPath) { $candidates += (Join-Path $installPath 'node.exe') }
        } catch { }
    }
    foreach ($candidate in $candidates | Where-Object { $_ } | Select-Object -Unique) {
        if (-not (Test-Path -LiteralPath $candidate)) { continue }
        try {
            $reported = [string]::Concat([object[]]@(& $candidate --version 2>$null)).Trim()
            $match = [regex]::Match($reported, 'v?(\d+)\.\d+\.\d+')
            if ($LASTEXITCODE -eq 0 -and $match.Success -and [int]$match.Groups[1].Value -eq 22) {
                return (Split-Path -Parent (Resolve-Path -LiteralPath $candidate).Path)
            }
        } catch { }
    }
    throw 'Node.js 22 was not found. Run deploy\\native\\bootstrap.ps1 -InstallMissing.'
}

function Get-NativeNpm {
    $nodeDir = Get-NativeNodeDirectory
    foreach ($name in @('npm.cmd', 'npm')) {
        $path = Join-Path $nodeDir $name
        if (Test-Path -LiteralPath $path) { return $path }
    }
    $command = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $command) { $command = Get-Command npm -ErrorAction SilentlyContinue }
    if ($command) { return $command.Source }
    throw 'npm was not found next to Node.js.'
}

function New-NativePrivateDirectory {
    param([string]$Parent, [string]$Name)
    if (-not (Test-Path -LiteralPath $Parent)) { New-Item -ItemType Directory -Path $Parent | Out-Null }
    $target = Join-Path $Parent $Name
    if (Test-Path -LiteralPath $target) { throw 'Private deployment directory already exists.' }
    New-Item -ItemType Directory -Path $target | Out-Null
    $ownerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls.exe $target '/inheritance:r' '/grant:r' "*$ownerSid`:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Private deployment directory permissions could not be set.' }
    return $target
}

function Test-NativeEmptyDirectory {
    param([string]$Path)
    if ((Test-Path -LiteralPath $Path) -and (Get-ChildItem -LiteralPath $Path -Force | Select-Object -First 1)) {
        throw 'Target directory already contains data. Use a new extracted project folder.'
    }
}

function Test-NativeRestoreRuntimeDirectory {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return }
    foreach ($item in @(Get-ChildItem -LiteralPath $Path -Force)) {
        if ($item.Name -ne 'node' -or -not $item.PSIsContainer -or
            -not (Test-Path -LiteralPath (Join-Path $item.FullName 'node.exe'))) {
            throw 'Target runtime directory contains deployment data. Use a new extracted project folder.'
        }
    }
}

function Wait-NativeHttp {
    param([string]$Url, [int]$Seconds = 90)
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    do {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return }
        } catch { }
        Start-Sleep -Seconds 1
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Service did not become ready: $Url"
}

function Start-NativeChild {
    param([string]$Name, [string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory)
    $native = Get-NativeDirectory
    New-Item -ItemType Directory -Force -Path (Join-Path $native 'logs') | Out-Null
    $logs = Join-Path $native 'logs'
    New-Item -ItemType Directory -Force -Path $logs | Out-Null
    $pidPath = Join-Path $native "run/$Name.pid"
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $pidPath) | Out-Null
    if (Test-Path -LiteralPath $pidPath) {
        $old = Get-Content -LiteralPath $pidPath -Raw
        $process = Get-Process -Id $old.Trim() -ErrorAction SilentlyContinue
        if ($process) { return $process }
        Remove-Item -LiteralPath $pidPath -Force
    }
    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logs "$Name.out.log") -RedirectStandardError (Join-Path $logs "$Name.err.log")
    [IO.File]::WriteAllText($pidPath, $process.Id, [Text.UTF8Encoding]::new($false))
    return $process
}

function Stop-NativeChild {
    param([string]$Name)
    $path = Join-Path (Get-NativeDirectory) "run/$Name.pid"
    if (-not (Test-Path -LiteralPath $path)) { return }
    $process = Get-Process -Id (Get-Content -LiteralPath $path -Raw).Trim() -ErrorAction SilentlyContinue
    if ($process) { Stop-Process -Id $process.Id -Force }
    Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
}

function Test-NativePostgresConnection {
    param([string]$Bin, [string]$Port)
    $previousPreference = $ErrorActionPreference
    try {
        # A refused connection is expected before the private cluster is started.
        $ErrorActionPreference = 'Continue'
        & (Join-Path $Bin 'psql.exe') -h 127.0.0.1 -p $Port -U xiaoan -d postgres -Atqc 'select 1' 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    } finally {
        $ErrorActionPreference = $previousPreference
    }
}

function Initialize-NativeDatabase {
    param([hashtable]$Settings)
    $bin = Get-NativePostgresBin
    $native = Get-NativeDirectory
    $data = Join-Path $native 'data/postgres'
    $storage = Split-Path -Parent $data
    $port = $Settings['POSTGRES_PORT']
    New-Item -ItemType Directory -Force -Path (Join-Path $native 'logs'), $storage | Out-Null
    if (-not (Test-Path -LiteralPath (Join-Path $data 'PG_VERSION'))) {
        Test-NativeEmptyDirectory $data
        $staging = Join-Path $storage ('.postgres-initializing-' + [guid]::NewGuid().ToString('N'))
        $passwordFile = Join-Path $native '.postgres-password'
        [IO.File]::WriteAllText($passwordFile, $Settings['POSTGRES_PASSWORD'] + "`n", [Text.UTF8Encoding]::new($false))
        try {
            & (Join-Path $bin 'initdb.exe') -D $staging -U xiaoan --encoding=UTF8 --locale=C --auth-host=scram-sha-256 --auth-local=trust --pwfile=$passwordFile | Out-Null
            if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL initialization failed.' }
            if (Test-Path -LiteralPath $data) { Remove-Item -LiteralPath $data -Force }
            Move-Item -LiteralPath $staging -Destination $data
        } finally { Remove-Item -LiteralPath $passwordFile -Force -ErrorAction SilentlyContinue }
    }
    $env:PGPASSWORD = $Settings['POSTGRES_PASSWORD']
    if (-not (Test-NativePostgresConnection $bin $port)) {
        $pidFile = Join-Path $data 'postmaster.pid'
        if (Test-Path -LiteralPath $pidFile) {
            $recordedPid = (Get-Content -LiteralPath $pidFile -TotalCount 1).Trim()
            $recordedProcess = if ($recordedPid -match '^[0-9]+$') {
                Get-Process -Id ([int]$recordedPid) -ErrorAction SilentlyContinue
            }
            if ($recordedProcess) {
                throw 'PostgreSQL data is locked by a running process, but it is not reachable on the configured loopback port.'
            }
            Remove-Item -LiteralPath $pidFile -Force
        }
        & (Join-Path $bin 'pg_ctl.exe') -D $data -l (Join-Path $native 'logs/postgres.log') -o "-p $port -h 127.0.0.1" start
        if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL start command did not finish successfully.' }
        $deadline = [DateTime]::UtcNow.AddSeconds(30)
        $ready = $false
        do {
            if (Test-NativePostgresConnection $bin $port) { $ready = $true; break }
            Start-Sleep -Seconds 1
        } while ([DateTime]::UtcNow -lt $deadline)
        if (-not $ready) { throw 'PostgreSQL did not become ready.' }
    }
    & (Join-Path $bin 'psql.exe') -h 127.0.0.1 -p $port -U xiaoan -d postgres -Atqc "select 1 from pg_database where datname='xiaoan'" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL connection failed.' }
    $exists = & (Join-Path $bin 'psql.exe') -h 127.0.0.1 -p $port -U xiaoan -d postgres -Atqc "select 1 from pg_database where datname='xiaoan'"
    $existsText = [string]::Concat([object[]]@($exists))
    if ($existsText.Trim() -ne '1') {
        & (Join-Path $bin 'createdb.exe') -h 127.0.0.1 -p $port -U xiaoan xiaoan
        if ($LASTEXITCODE -ne 0) { throw 'Application database creation failed.' }
    }
}
