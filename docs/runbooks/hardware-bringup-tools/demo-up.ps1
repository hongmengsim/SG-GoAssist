# demo-up.ps1 - one command to bring the whole demonstration up. Run from the repository root:
#   powershell -ExecutionPolicy Bypass -File docs\runbooks\hardware-bringup-tools\demo-up.ps1 [-SimulateBus1] [-DryRun] [-Headless] [-Pi user@host]
# Default: Bus 1 is the REAL Pi (an SSH tunnel plus a short guided step on the Pi). -SimulateBus1: Bus 1 is a
# simulated agent on this PC (the fallback), and nothing is needed from the Pi.
# Secrets and the agents' start-up code are made in memory, handed to the windows through the environment, and
# never written to a file or printed. -DryRun prints what would happen and starts nothing. -Headless runs every
# program in a hidden window (used by the automated check) instead of Windows Terminal tabs.
param([switch]$SimulateBus1, [switch]$DryRun, [switch]$Headless, [string]$Pi = 'pi@goassist-pi1.local')

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
Set-Location $repo

function New-Secret {
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    ([BitConverter]::ToString($bytes)).Replace('-', '').ToLower()
}

function Get-Fingerprint([string]$value) {
    ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($value)))).Replace('-', '').Substring(0, 8).ToLower()
}

function Get-Encoded([string]$script) {
    [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
}

# The address of this PC on the network that has the default route (the one the Pi shares).
function Get-PcAddress {
    try {
        $found = @(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' })
        if ($found.Count -eq 0) { return $null }
        $found[0].IPv4Address.IPAddress
    } catch { $null }
}

function Get-PortOwners([int[]]$ports) {
    $rows = @()
    foreach ($row in @(Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction SilentlyContinue)) {
        $name = try { (Get-Process -Id $row.OwningProcess).ProcessName } catch { '?' }
        $rows += [pscustomobject]@{ Port = $row.LocalPort; Id = $row.OwningProcess; Name = $name }
    }
    $rows | Sort-Object Port, Id -Unique
}

$ports = @(3000, 5173, 5190, 8771)
if ($SimulateBus1) { $ports += 8782 } else { $ports += 8770, 8780 }

$mode = if ($SimulateBus1) { 'FALLBACK: Bus 1 is a SIMULATED agent on this PC' } else { 'REAL Bus 1 on the Pi' }
Write-Host ('Mode: ' + $mode)

$busy = @(Get-PortOwners $ports)
if ($busy.Count -gt 0) {
    Write-Host 'These ports are already in use, so nothing was started:' -ForegroundColor Yellow
    $busy | Format-Table | Out-String | Write-Host
    Write-Host 'Run demo-down.ps1 to stop the demonstration programs, or close what holds them.'
    if (-not $DryRun) { exit 1 }
}

# In memory only. One start-up code serves every agent in this launch (each has its own port).
$env:DEVICE_SHARED_SECRET = New-Secret
$env:OPERATOR_API_TOKEN = New-Secret
$code = New-Secret
$env:GOASSIST_AUTO_ACK = 'off'
$env:GOASSIST_DATA_DIR = '.runtime\demo'
$env:BUS_AGENT_STATUS_CODE = $code
$fingerprint = Get-Fingerprint $env:DEVICE_SHARED_SECRET

$pcIp = Get-PcAddress
if (-not $pcIp) { $pcIp = '<this PC address>' }
$bus1Port = if ($SimulateBus1) { 8782 } else { 8770 }
$agents = '[{"busId":"AV-095-01","url":"http://127.0.0.1:' + $bus1Port + '","code":"' + $code + '"},{"busId":"AV-095-02","url":"http://127.0.0.1:8771","code":"' + $code + '"}]'
$env:DEMO_DIRECTOR = 'on'
$env:DEMO_STOP = '18331'
$env:DEMO_AGENTS = $agents

$simulated = 'python -m bus_agent --simulate --bus-id {0} --backend http://localhost:3000 --status-port {1} --deployment-timeout 30 --link-loss-halt 10'
$tabs = @(
    @{ Title = 'BACKEND (this PC)'; Dir = $repo; Script = "npm.cmd start --workspace '@buspass/backend'" },
    @{ Title = 'CONSOLE SERVER (this PC)'; Dir = $repo; Script = 'npm.cmd run console' },
    @{ Title = 'BUS 2 (simulated)'; Dir = "$repo\pi\bus-agent"; Script = ($simulated -f 'AV-095-02', 8771) }
)
if ($SimulateBus1) {
    $tabs += @{ Title = 'BUS 1 (SIMULATED fallback)'; Dir = "$repo\pi\bus-agent"; Script = ($simulated -f 'AV-095-01', 8782) }
} else {
    $tabs += @{ Title = 'TUNNEL to the Pi'; Dir = $repo; Script = "Write-Host 'Type the Pi password. A Pi prompt means the tunnel is up. Keep this tab open.'; ssh -L 8770:127.0.0.1:8770 -L 8780:127.0.0.1:8780 $Pi" }
}
$tabs += @{ Title = 'DIRECTOR (presenters)'; Dir = "$repo\demo-director"; Script = 'node serve.mjs' }

# The one command the Pi needs. It carries no secret: the secret and the code arrive as one hidden line.
$piCommand = 'cd ~/SG-GoAssist/pi/bus-agent && read -rs L && echo && export DEVICE_SHARED_SECRET="${L%%:*}" BUS_AGENT_STATUS_CODE="${L##*:}" && unset L && printf "fingerprint %s\n" "$(printf %s "$DEVICE_SHARED_SECRET" | sha256sum | cut -c1-8)" && python3 -m bus_agent --real --config agent.json --backend http://' + $pcIp + ':3000 --status-port 8770 --live-view-port 8780 --demo-movement'

if ($DryRun) {
    Write-Host ('Dry run: nothing was started. Ports that must be free: ' + ($ports -join ', '))
    Write-Host ('This PC address for the agents: ' + $pcIp)
    foreach ($tab in $tabs) { Write-Host ('Tab: ' + $tab.Title + '  |  ' + $tab.Script) }
    if (-not $SimulateBus1) {
        Write-Host 'Pi A command (carries no secret; the secret and code are pasted as one hidden line):'
        Write-Host $piCommand
    }
    Write-Host ('Device secret fingerprint (for comparing with the Pi): ' + $fingerprint)
    return
}

# --- start everything ----------------------------------------------------------------------------------------
$started = @()
if ($Headless) {
    foreach ($tab in $tabs | Where-Object { $_.Title -notlike 'TUNNEL*' }) {
        $p = Start-Process powershell -WindowStyle Hidden -WorkingDirectory $tab.Dir -PassThru -ArgumentList '-NoProfile', '-EncodedCommand', (Get-Encoded $tab.Script)
        $started += $p.Id
    }
} else {
    $wtArgs = New-Object System.Collections.Generic.List[string]
    $wtArgs.AddRange([string[]]@('-w', 'new'))
    foreach ($tab in $tabs) {
        if ($wtArgs.Count -gt 2) { $wtArgs.Add(';') }
        $wtArgs.AddRange([string[]]@('new-tab', '--suppressApplicationTitle', '--title', ('"' + $tab.Title + '"'), '-d', ('"' + $tab.Dir + '"'),
            'powershell.exe', '-NoExit', '-NoProfile', '-EncodedCommand', (Get-Encoded $tab.Script)))
    }
    Start-Process wt -ArgumentList $wtArgs
}

function Wait-Until([scriptblock]$test, [int]$seconds) {
    $end = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $end) { if (& $test) { return $true }; Start-Sleep -Seconds 2 }
    $false
}

Write-Host 'Waiting for the backend...'
$backendUp = Wait-Until { try { Invoke-RestMethod http://localhost:3000/ready -TimeoutSec 2 | Out-Null; $true } catch { $false } } 90
if (-not $backendUp) { Write-Host 'The backend did not answer in 90 seconds: look at the BACKEND tab.' -ForegroundColor Yellow; if ($Headless) { Write-Host ('HEADLESS PIDS: ' + ($started -join ',')) }; exit 2 }
python docs\runbooks\hardware-bringup-tools\check_secret.py http://localhost:3000
Write-Host ('Device secret fingerprint: ' + $fingerprint)

if (-not $SimulateBus1 -and -not $Headless) {
    Write-Host ''
    Write-Host 'REAL Bus 1: three short steps on the Pi.'
    Write-Host '  1. The TUNNEL tab asks for the Pi password. Type it there.'
    Write-Host '  2. Open a NEW, separate PowerShell window (not this one, and NOT the TUNNEL tab) and run:  ssh pi@goassist-pi1.local'
    Write-Host '     Its prompt must start with PS before you run it. After the password it shows pi@goassist-pi1:~ $ - that window is "Pi A". If the window you typed ssh in already showed pi@goassist-pi1:~ $, you are on the Pi twice: type exit.'
    Set-Clipboard $piCommand
    Read-Host '  3. The Pi command is on the clipboard (no secret in it). Paste it into Pi A, then press Enter HERE'
    Set-Clipboard ($env:DEVICE_SHARED_SECRET + ':' + $code)
    Read-Host '     Now the hidden secret line is on the clipboard. Paste it into Pi A (nothing shows) and press Enter there, then press Enter HERE'
    Set-Clipboard $null
    Write-Host ('     Pi A must print: fingerprint ' + $fingerprint + '. Then type calibrate in Pi A with the doorway empty.')
}

# --- the director's view -------------------------------------------------------------------------------------
$expect = if ($SimulateBus1) { 2 } else { 1 }
$ready = Wait-Until { try { @((Invoke-RestMethod http://127.0.0.1:5190/api/state).buses.PSObject.Properties.Value | Where-Object { $_.agentOk }).Count -ge $expect } catch { $false } } 90
try { (Invoke-RestMethod http://127.0.0.1:5190/api/state).buses.PSObject.Properties.Value | Select-Object label, kind, controlLevel, agentOk | Format-Table | Out-String | Write-Host } catch { Write-Host 'The director did not answer: look at the DIRECTOR tab.' -ForegroundColor Yellow }
if ($ready) { Write-Host 'READY: the buses the director can reach are listed above.' } else { Write-Host 'NOT READY: a bus is not reachable yet (the table above says which).' -ForegroundColor Yellow }
if ($Headless) { Write-Host ('HEADLESS PIDS: ' + ($started -join ',')) }
if (-not $Headless) {
    Start-Process 'http://127.0.0.1:5190/'
    Write-Host 'Director: http://127.0.0.1:5190/   Operator console: copy the token with  Set-Clipboard $env:OPERATOR_API_TOKEN  then open http://localhost:5173/?mode=live&backend=http://localhost:3000  (clear it after:  Set-Clipboard $null)'
    Write-Host 'Keep THIS window open: the secrets live only here. Stop everything with demo-down.ps1.'
}
if (-not $ready) { exit 3 }
