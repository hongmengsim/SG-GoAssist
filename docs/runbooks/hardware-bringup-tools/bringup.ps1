# bringup.ps1 - opens the whole bring-up set as named tabs in ONE Windows Terminal window.
# Secrets are generated in memory, handed to the tabs through the environment,
# and never written to a file. Run:  powershell -ExecutionPolicy Bypass -File docs\runbooks\hardware-bringup-tools\bringup.ps1 [-DryRun] [-NoPi] [-PiOnly] [-Record name] [-Pi user@host]
# -PiOnly opens just the PI AGENT and PI CHECKS tabs. Run it from the SCRATCH tab of a running launch: it reuses the secrets
# already in that session (a fresh set would not match the running backend). -Record run-02 adds --record recordings/run-02.
param([switch]$DryRun, [switch]$NoPi, [switch]$PiOnly, [string]$Record = '', [string]$Pi = 'pi@goassist-pi1.local')

# The repository root is three folders above this script, so nothing here is specific to one PC.
# This PC's current address on the network the Pi shares. It can change when the hotspot hands out a new one.
$pcIp = try { (Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1).IPv4Address.IPAddress } catch { $null }
if (-not $pcIp) { $pcIp = '.' }   # not detected: the check on the Pi then always passes
# The agent is started with this address, which wins over backendUrl in agent.json, so the file needs no edit when the network changes.
$backendArg = if ($pcIp -ne '.') { ' --backend http://' + $pcIp + ':3000' } else { '' }
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
# Secrets already in this session are reused, so a second launch from the SCRATCH tab matches the running backend.
if (-not $env:DEVICE_SHARED_SECRET) { $env:DEVICE_SHARED_SECRET = New-Secret }
if (-not $env:OPERATOR_API_TOKEN) { $env:OPERATOR_API_TOKEN = New-Secret }
$env:GOASSIST_AUTO_ACK = 'off'
$env:GOASSIST_DATA_DIR = '.runtime\hw'

# Each tab runs an encoded command, so no quoting or semicolons can confuse Windows Terminal.
function Get-Encoded([string]$script) {
    [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
}

if ($Record -and $Record -notmatch '^[A-Za-z0-9_-]+$') { throw '-Record may contain only letters, digits, dash and underscore.' }
$recordArg = if ($Record) { " --record recordings/$Record" } else { '' }

$remoteAgent = @'
echo Paste the device secret, then press Enter; read -rs DEVICE_SHARED_SECRET; echo; if [ ${#DEVICE_SHARED_SECRET} -eq 0 ]; then echo NO SECRET RECEIVED - the agent was NOT started. Close this tab and open it again.; exit 1; fi; echo secret fingerprint on the Pi: $(printf %s $DEVICE_SHARED_SECRET | sha256sum | cut -c1-8) - it must equal the SCRATCH tab fingerprint; export DEVICE_SHARED_SECRET; cd ~/SG-GoAssist/pi/bus-agent; python3 -m bus_agent --real --config agent.json@@BACKENDARG@@ --status-port 8770
'@

$secretCheck = @'
if (-not $env:DEVICE_SHARED_SECRET -or -not $env:OPERATOR_API_TOKEN) {
  Write-Host 'SECRETS MISSING in this tab: close every Windows Terminal window and run bringup.ps1 again.' -ForegroundColor Yellow
}
'@

$fingerprintShow = @'
$fp = ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($env:DEVICE_SHARED_SECRET)))).Replace('-', '').Substring(0, 8).ToLower()
Write-Host ('Device secret fingerprint: ' + $fp + '   (the PI AGENT tab prints its own after you paste; the two must be identical)')
'@

$matchCheck = @'
Write-Host 'This PC address on the shared network: @@PCIP@@. The PI AGENT tab starts the agent with --backend http://@@PCIP@@:3000, so agent.json needs no edit when the address changes.'
Write-Host 'Checking that this session matches the running backend (waits up to 60 s for it to start)...'
$up = $false
for ($i = 0; $i -lt 30; $i++) { try { Invoke-RestMethod http://localhost:3000/ready -TimeoutSec 2 | Out-Null; $up = $true; break } catch { Start-Sleep 2 } }
if ($up) { python docs\runbooks\hardware-bringup-tools\check_secret.py http://localhost:3000 } else { Write-Host 'Backend not ready after 60 s: look at the BACKEND tab.' }
'@

$tabs = @(
    @{ Title = 'BACKEND (this PC)'; Script = @"
$secretCheck
npm.cmd start --workspace '@buspass/backend'
"@ },
    @{ Title = 'CONSOLE SERVER (this PC)'; Script = "npm.cmd run console" },
    @{ Title = 'TUNNEL to Pi'; Script = "Write-Host 'Tunnel to the Pi: status page on 8770, camera live view on 8780 (only with the agent stopped).'; Write-Host 'Type the Pi password when asked. Once you are in, this tab prints TUNNEL IS UP and then stays quiet. Ctrl+C closes it.'; ssh -L 8770:127.0.0.1:8770 -L 8780:127.0.0.1:8780 $pi 'echo TUNNEL IS UP - leave this tab open; sleep 2147483647'" },
    @{ Title = 'SCRATCH (this PC)'; Script = @"
$secretCheck
Write-Host 'SCRATCH: one-off commands only (scp, git).'
Write-Host 'Secrets are copied from HERE, on demand, like this (then clear the clipboard with: Set-Clipboard `$null):'
Write-Host '  Operator token, for the console page:   Set-Clipboard `$env:OPERATOR_API_TOKEN'
Write-Host '  Device secret, for the PI AGENT tab:    Set-Clipboard `$env:DEVICE_SHARED_SECRET'
$fingerprintShow
$($matchCheck.Replace('@@PCIP@@', $pcIp))
"@ }
)
if (-not $NoPi) {
    $tabs += @{ Title = 'PI AGENT'; Script = ("Write-Host 'PI AGENT: first copy the device secret in the SCRATCH tab (Set-Clipboard `$env:DEVICE_SHARED_SECRET), then paste it below when asked.'; ssh -t $pi '" + $remoteAgent.Trim().Replace('@@BACKENDARG@@', $backendArg) + $recordArg + "'") }
    $tabs += @{ Title = 'PI CHECKS'; Script = "ssh $pi" }
}

if ($PiOnly) { $tabs = @($tabs | Where-Object { $_.Title -in 'PI AGENT', 'PI CHECKS' }) }

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
if (-not $PiOnly) {
    Start-Sleep 6
    Start-Process $consoleUrl
}
Write-Host 'Opened. Copy secrets from the SCRATCH tab when asked: Set-Clipboard $env:OPERATOR_API_TOKEN (console page) and Set-Clipboard $env:DEVICE_SHARED_SECRET (PI AGENT tab).'
