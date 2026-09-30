# bringup.ps1 - opens the whole bring-up set as named tabs in ONE Windows Terminal window.
# Secrets are generated in memory, handed to the tabs through the environment,
# and never written to a file. Run:  powershell -ExecutionPolicy Bypass -File docs\runbooks\hardware-bringup-tools\bringup.ps1 [-DryRun] [-NoPi] [-Pi user@host]
param([switch]$DryRun, [switch]$NoPi, [string]$Pi = 'pi@goassist-pi1.local')

# The repository root is three folders above this script, so nothing here is specific to one PC.
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$pi = $Pi
$consoleUrl = 'http://localhost:5173/?mode=live&backend=http://localhost:3000'

function New-Secret {
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    ([BitConverter]::ToString($bytes)).Replace('-', '').ToLower()
}

# In memory only. The tabs inherit these; if a tab reports they are missing, close every Windows
# Terminal window and run this script again.
$env:DEVICE_SHARED_SECRET = New-Secret
$env:OPERATOR_API_TOKEN = New-Secret
$env:GOASSIST_AUTO_ACK = 'off'
$env:GOASSIST_DATA_DIR = '.runtime\hw'

# Each tab runs an encoded command, so no quoting or semicolons can confuse Windows Terminal.
function Get-Encoded([string]$script) {
    [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
}

$secretCheck = @'
if (-not $env:DEVICE_SHARED_SECRET -or -not $env:OPERATOR_API_TOKEN) {
  Write-Host 'SECRETS MISSING in this tab: close every Windows Terminal window and run bringup.ps1 again.' -ForegroundColor Yellow
}
'@

$tabs = @(
    @{ Title = 'BACKEND (this PC)'; Script = @"
$secretCheck
npm.cmd start --workspace '@buspass/backend'
"@ },
    @{ Title = 'CONSOLE SERVER (this PC)'; Script = "npm.cmd run console" },
    @{ Title = 'TUNNEL to Pi'; Script = "Write-Host 'Tunnel: status page on 8770, camera live view on 8780 (only with the agent stopped). Ctrl+C to close.'; ssh -N -L 8770:127.0.0.1:8770 -L 8780:127.0.0.1:8780 $pi" },
    @{ Title = 'SCRATCH (this PC)'; Script = @"
$secretCheck
Write-Host 'SCRATCH: one-off commands only (scp, git).'
Write-Host 'Secrets are copied from HERE, on demand, like this (then clear the clipboard with: Set-Clipboard `$null):'
Write-Host '  Operator token, for the console page:   Set-Clipboard `$env:OPERATOR_API_TOKEN'
Write-Host '  Device secret, for the PI AGENT tab:    Set-Clipboard `$env:DEVICE_SHARED_SECRET'
"@ }
)
if (-not $NoPi) {
    $tabs += @{ Title = 'PI AGENT'; Script = "Write-Host 'PI AGENT: first copy the device secret in the SCRATCH tab (Set-Clipboard `$env:DEVICE_SHARED_SECRET), then paste it below when asked.'; ssh -t $pi 'echo Paste the device secret, then press Enter; read -rs DEVICE_SHARED_SECRET; export DEVICE_SHARED_SECRET; cd ~/SG-GoAssist/pi/bus-agent && python3 -m bus_agent --real --config agent.json --status-port 8770'" }
    $tabs += @{ Title = 'PI CHECKS'; Script = "ssh $pi" }
}

$wtArgs = New-Object System.Collections.Generic.List[string]
$wtArgs.AddRange([string[]]@('-w', 'new'))
foreach ($tab in $tabs) {
    if ($wtArgs.Count -gt 2) { $wtArgs.Add(';') }
    $wtArgs.AddRange([string[]]@('new-tab', '--suppressApplicationTitle', '--title', ('"' + $tab.Title + '"'), '-d', ('"' + $repo + '"'),
        'powershell.exe', '-NoExit', '-NoProfile', '-EncodedCommand', (Get-Encoded $tab.Script)))
}

if ($DryRun) {
    Write-Host "Dry run. Secrets set in this process only: device $($env:DEVICE_SHARED_SECRET.Length) chars, operator $($env:OPERATOR_API_TOKEN.Length) chars."
    foreach ($tab in $tabs) { Write-Host ("Tab: " + $tab.Title) }
    Write-Host "wt argument count: $($wtArgs.Count); encoded commands are decoded below (secrets are read from the environment, never shown)."
    foreach ($tab in $tabs) { Write-Host ("--- " + $tab.Title); Write-Host $tab.Script }
    return
}

Start-Process wt -ArgumentList $wtArgs
Start-Sleep 6
Start-Process $consoleUrl
Write-Host 'Opened. Copy secrets from the SCRATCH tab when asked: Set-Clipboard $env:OPERATOR_API_TOKEN (console page) and Set-Clipboard $env:DEVICE_SHARED_SECRET (PI AGENT tab).'
