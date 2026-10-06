# demo-down.ps1 - stops what demo-up.ps1 started. Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File docs\runbooks\hardware-bringup-tools\demo-down.ps1 [-Yes] [-DryRun]
# It lists who holds the demonstration ports (backend 3000, console 5173, director 5190, the agents 8771 and
# 8782, the Pi tunnel 8770 and 8780) and stops exactly those process ids. It asks first unless -Yes is given,
# because another program could be using one of those ports. It also clears the clipboard.
param([switch]$Yes, [switch]$DryRun)

$ports = @(3000, 5173, 5190, 8770, 8771, 8780, 8781, 8782)
$owners = @()
foreach ($row in @(Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction SilentlyContinue)) {
    $name = try { (Get-Process -Id $row.OwningProcess).ProcessName } catch { '?' }
    $owners += [pscustomobject]@{ Port = $row.LocalPort; Id = $row.OwningProcess; Name = $name }
}
$owners = @($owners | Sort-Object Port, Id)

if ($owners.Count -eq 0) {
    Write-Host 'Nothing is listening on the demonstration ports.'
    if (-not $DryRun) { Set-Clipboard $null }
    exit 0
}

$owners | Format-Table | Out-String | Write-Host
$ids = @($owners | ForEach-Object { $_.Id } | Sort-Object -Unique)
if ($DryRun) { Write-Host ('Dry run: would stop process ids ' + ($ids -join ', ')); exit 0 }

if (-not $Yes) {
    $answer = Read-Host ('Stop these process ids (' + ($ids -join ', ') + ')? Type yes')
    if ($answer -ne 'yes') { Write-Host 'Nothing was stopped.'; exit 1 }
}
foreach ($id in $ids) { try { Stop-Process -Id $id -Force -ErrorAction Stop } catch { Write-Host ('Could not stop ' + $id + ': ' + $_.Exception.Message) -ForegroundColor Yellow } }
Start-Sleep -Seconds 2
Set-Clipboard $null
$left = @(Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction SilentlyContinue)
if ($left.Count -eq 0) { Write-Host 'Stopped. Nothing is listening on the demonstration ports; the clipboard is cleared.' } else { Write-Host 'Some ports are still held; run this again or close the window that holds them.' -ForegroundColor Yellow; exit 2 }
