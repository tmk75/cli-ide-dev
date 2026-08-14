$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Test-DevopenPort {
    param([int]$Port)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $client.Connect('127.0.0.1', $Port)
        return $true
    }
    catch {
        return $false
    }
    finally {
        $client.Close()
    }
}

$port = 8787

if ($env:DEVOPEN_WEB_PORT) {
    $port = [int]$env:DEVOPEN_WEB_PORT
}
elseif (Test-Path (Join-Path $root 'config.json')) {
    try {
        $config = Get-Content (Join-Path $root 'config.json') -Raw | ConvertFrom-Json
        if ($config.webPort) {
            $port = [int]$config.webPort
        }
    }
    catch {
        # Fall back to the default port if config.json is malformed.
    }
}

$startCmd = Join-Path $root 'start-web.cmd'

if (-not (Test-DevopenPort -Port $port)) {
    if (-not (Test-Path $startCmd)) {
        throw "start-web.cmd was not found at $startCmd"
    }

    $env:DEVOPEN_AUTO_CLOSE = '1'
    Start-Process -FilePath $startCmd -WorkingDirectory $root -WindowStyle Hidden

    $deadline = (Get-Date).AddSeconds(12)
    while (-not (Test-DevopenPort -Port $port) -and (Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 250
    }
}

if (-not (Test-DevopenPort -Port $port)) {
    throw "IntelliDev did not become ready at 127.0.0.1:$port"
}

Start-Process "http://127.0.0.1:$port"
