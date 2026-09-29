<#
.SYNOPSIS
Runs the APAS three-laser ON / automatic-OFF test on a Windows serial port.
.EXAMPLE
& .\Test-Lasers.ps1 -Port COM6
.NOTES
Requires the already-uploaded esp32-s3-demo firmware. No firmware upload occurs.
Aim lasers at the matte base; AD3 V+ = +5 V, AD3 GND = ESP32 GND, V- unused.
Close Arduino Serial Monitor and other programs using the port before running.
#>
[CmdletBinding()]
param(
    [ValidatePattern('^COM[0-9]+$')]
    [string]$Port = 'COM6',
    [string]$LogDirectory = (Join-Path $PSScriptRoot 'logs')
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null
$testLogPath = Join-Path $LogDirectory ('laser-test-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.txt')
$testLog = [System.Text.StringBuilder]::new()
$testPort = [System.IO.Ports.SerialPort]::new($Port, 115200)
$testPort.DtrEnable = $false
$testPort.RtsEnable = $false
$testPort.ReadTimeout = 300
$testPort.WriteTimeout = 500
$testPassed = $false

function Receive-TestData {
    $chunk = $testPort.ReadExisting()
    if ($chunk) { [void]$testLog.Append($chunk) }
}

function Receive-For {
    param([double]$Seconds, [switch]$KeepAlive)
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    $lastPing = -1.0
    while ($timer.Elapsed.TotalSeconds -lt $Seconds) {
        if ($KeepAlive -and ($timer.Elapsed.TotalSeconds - $lastPing -ge 0.4)) {
            $testPort.Write("KEEPALIVE`n")
            $lastPing = $timer.Elapsed.TotalSeconds
        }
        Receive-TestData
        Start-Sleep -Milliseconds 50
    }
    Receive-TestData
}

function Write-TestStep {
    param([string]$Message)
    Write-Host $Message
    [void]$testLog.AppendLine("`nTEST: $Message")
}

try {
    Write-TestStep "Opening $Port at 115200 baud. Keep lasers aimed at the matte base."
    $testPort.Open()
    $handshakeTimer = [System.Diagnostics.Stopwatch]::StartNew()
    do {
        $testPort.Write("STATUS`n")
        Receive-For -Seconds 0.4
        if ($testLog.ToString().Contains('DEMO,APAS_3_LASER_V1')) { break }
    } while ($handshakeTimer.Elapsed.TotalSeconds -lt 6)
    if (-not $testLog.ToString().Contains('DEMO,APAS_3_LASER_V1')) {
        throw 'Three-laser firmware did not respond. No ON command was sent. Check port/firmware.'
    }

    Write-TestStep 'Firmware recognised. Turning all three lasers ON; heartbeat for 3 seconds.'
    $onStart = $testLog.Length
    $testPort.Write("LASERS ON`n")
    Receive-For -Seconds 3 -KeepAlive
    if ($testLog.ToString().Substring($onStart) -notmatch '(?m)^LASERS,1\r?$') {
        throw 'The ESP32 did not acknowledge ON. Sending OFF and ending the test.'
    }

    Write-TestStep 'ON acknowledged. Stopping heartbeat; expect automatic OFF after about 2 seconds.'
    $timeoutStart = $testLog.Length
    Receive-For -Seconds 3.3
    $timeoutOutput = $testLog.ToString().Substring($timeoutStart)
    if ($timeoutOutput -notmatch 'LASER_TIMEOUT: heartbeat lost; outputs OFF' -or
        $timeoutOutput -notmatch '(?m)^LASERS,0\r?$') {
        throw 'Automatic OFF was not acknowledged. Sending explicit OFF.'
    }

    Write-TestStep 'Automatic OFF acknowledged. Checking final output state.'
    $offStart = $testLog.Length
    $testPort.Write("LASERS OFF`nSTATUS`n")
    Receive-For -Seconds 0.8
    if ($testLog.ToString().Substring($offStart) -notmatch '(?m)^LASERS,0\r?$') {
        throw 'Final OFF state was not acknowledged; switch off the external laser supply.'
    }
    $testPassed = $true
} catch {
    [void]$testLog.AppendLine("`nERROR: $($_.Exception.Message)")
    throw
} finally {
    if ($testPort.IsOpen) {
        try { $testPort.Write("LASERS OFF`n") }
        catch { Write-Warning 'Could not send final OFF. Switch off the external laser supply.' }
        finally { $testPort.Close() }
    }
    $testPort.Dispose()
    $testLog.ToString() | Set-Content -LiteralPath $testLogPath -Encoding UTF8
    Write-Host "Log saved: $testLogPath"
}

if ($testPassed) {
    Write-Host 'PASS: ESP32 acknowledged ON, automatic OFF and final OFF.' -ForegroundColor Green
    Write-Host 'Confirm visually that all three lines illuminated for about 5 seconds, then went dark.'
    Write-Host 'The serial test verifies commands; it cannot measure emitted laser light.'
}
