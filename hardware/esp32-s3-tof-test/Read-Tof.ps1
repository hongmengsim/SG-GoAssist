param([string]$Port = 'COM6', [int]$Seconds = 15, [switch]$Reset)

# Close Arduino Serial Monitor before running this capture.
$tofSerial = [System.IO.Ports.SerialPort]::new($Port, 115200)
$tofSerial.DtrEnable = $false
$tofSerial.RtsEnable = $false
$tofSerial.ReadTimeout = 500
try {
    $tofSerial.Open()
    if ($Reset) {
        $tofSerial.RtsEnable = $true
        Start-Sleep -Milliseconds 100
        $tofSerial.RtsEnable = $false
    }
    $tofDeadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    while ([DateTime]::UtcNow -lt $tofDeadline) {
        try { $tofSerial.ReadLine() } catch [System.TimeoutException] { }
    }
} finally {
    if ($tofSerial.IsOpen) { $tofSerial.Close() }
    $tofSerial.Dispose()
}
