# Demo readiness test plan

**Status (6 Oct 2026): written, not run. Every step starts as "not verified".** A step becomes **verified on hardware** only after its output has been pasted back and shows what the step says to look for; the table in section 9 is where that is recorded, with a date. Nothing in this plan is run by Claude on the Pi: you run each step and paste the output back.

**What this gets you to:** a working demonstration of two buses at one stop with one boarding bay. Bus 1 (`AV-095-01`) is real hardware (Pi #1, the ESP32 beam, the camera, the marker lasers; the ramp is simulated). Bus 2 (`AV-095-02`) is simulated, with live signed traffic. A presenter drives both from the demo director while the operator console is open in a separate window.

**Ground rules.** The ramp is simulated only and never described as physically verified. Camera frames are never recorded, saved or sent. No secret goes into a file, a commit or this chat: secrets are named only (`DEVICE_SHARED_SECRET`, `OPERATOR_API_TOKEN`), and the agents' start-up codes are secrets too, so do not paste them back (replace them with `<code>`). Meaning is in words and shapes, never colour. If a step fails twice with the same symptom, stop and paste; do not keep retrying.

## How to read each step

Every step has the same fields: **Runs on** (which machine), the **command** (one per fenced block), **Expected** (words and shapes), **Paste back** (exactly what), **Pass if** (a binary rule; anything else is a fail), **On fail**, **Fallback on the day** (what to do if the hardware fails during the real demonstration), and **Depends on / Blocks**. "This PC" is the Windows laptop that runs the backend. "Pi #1" is the real Bus 1. Run PowerShell commands in PowerShell, from the repository root (`D:\D\Claude\SG-GoAssist`), and use `npm.cmd`, not `npm`.

**Names and addresses used throughout**

| Thing                   | Value                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| Secrets (names only)    | `DEVICE_SHARED_SECRET` (backend and every agent), `OPERATOR_API_TOKEN` (backend, demo director, console page) |
| Backend                 | port 3000 on this PC; reached from the Pis at `http://<PC address>:3000`                                      |
| Operator console        | port 5173 on this PC                                                                                          |
| Demo director           | port 5190 on this PC, loopback only                                                                           |
| Bus 1 agent status page | port 8770 on Pi #1's loopback, reached on this PC at `127.0.0.1:8770` through the SSH tunnel                  |
| Bus 1 camera live view  | port 8780 on Pi #1's loopback, through the same tunnel                                                        |
| Bus 2 agent status page | port 8771 (on this PC, or on Pi #2 through a second tunnel)                                                   |
| Bus ids                 | `AV-095-01` (Bus 1, real), `AV-095-02` (Bus 2, simulated); stop code `18331`                                  |
| Pi #1                   | `pi@goassist-pi1.local`; the repository copy is `~/SG-GoAssist` (no `.git`)                                   |

**Number of steps: 53 required, plus 1 optional** (setup 10, laptop-only 14, Pi #1 17 plus the optional P14b, both buses 9, rehearsal 3).

---

## 1. Setup before any test (steps S1 to S10)

### S1. Tool versions on this PC

**Runs on:** this PC.

```
node --version; python --version; git --version
```

**Expected:** three version lines.
**Paste back:** the three lines.
**Pass if:** Node is 22 or higher, Python is 3.11 or higher, Git prints a version.
**On fail:** install the missing tool, then repeat. Stop and paste if you are unsure which version to install.
**Fallback on the day:** none (this is preparation).
**Depends on:** nothing. **Blocks:** everything on this PC.
**Status:** not verified.

### S2. Dependencies are installed and the project type-checks

**Runs on:** this PC.

```
npm.cmd run typecheck
```

**Expected:** it finishes without error lines (it builds the contracts and type-checks every workspace).
**Paste back:** the last 10 lines.
**Pass if:** the command ends with exit code 0 (no `error TS` lines).
**On fail:** if packages are missing, run `npm.cmd install` from PowerShell (never Git Bash), then `git checkout -- package-lock.json`, then repeat. Stop and paste if it still fails.
**Fallback on the day:** none.
**Depends on:** S1. **Blocks:** S3, L1 to L14.
**Status:** not verified.

The Python packages the agent and the scenario need:

```
pip install jsonschema websockets pyserial pytest
```

```
python -c "import jsonschema, websockets, serial, pytest; print('PYTHON PACKAGES OK')"
```

**Pass if (both):** the second command prints `PYTHON PACKAGES OK`.

### S3. Build the backend

**Runs on:** this PC.

```
npm.cmd run build --workspace @buspass/backend
```

```
Test-Path backend\dist\server.js
```

**Expected:** the build ends without errors; the second command prints `True`.
**Paste back:** the last 5 lines of the build and the `True`.
**Pass if:** `True`.
**On fail:** stop and paste the build errors.
**Fallback on the day:** none (the built backend stays on disk).
**Depends on:** S2. **Blocks:** L2 to L14, P1.
**Status:** not verified.

### S4. The code state you are testing

**Runs on:** this PC.

```
git status -sb; git rev-parse --short HEAD; git rev-list --count origin/main..HEAD
```

**Expected:** branch `integration`, no modified tracked files, a short commit id, and a number of commits ahead of `origin/main` (22 at the time of writing; more if later commits were added).
**Paste back:** the three outputs.
**Pass if:** there are no lines starting with `M` or `D` (an untracked line is fine).
**On fail:** commit or stash your changes, then repeat, so what you test is what you copy to the Pi in S8.
**Fallback on the day:** none.
**Depends on:** nothing. **Blocks:** S8 (the Pi must get this exact commit).
**Status:** not verified.

### S5. Secrets exist in this PowerShell session (names only)

**Runs on:** this PC. Do this in the PowerShell window that you will launch everything from. Both secrets live only in this session; never write them to a file.

```
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); $env:DEVICE_SHARED_SECRET = ([BitConverter]::ToString($b)).Replace('-','').ToLower()
```

```
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); $env:OPERATOR_API_TOKEN = ([BitConverter]::ToString($b)).Replace('-','').ToLower()
```

Then print only a fingerprint of the device secret (you compare it with the Pi's in P6):

```
$fp = ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($env:DEVICE_SHARED_SECRET)))).Replace('-','').Substring(0,8).ToLower(); "device secret fingerprint: $fp"
```

**Expected:** one line, `device secret fingerprint:` and 8 hex characters.
**Paste back:** that one line (the fingerprint is not the secret).
**Pass if:** the line prints 8 characters.
**On fail:** repeat the first block.
**Fallback on the day:** if a PowerShell window is closed, its secrets are gone: generate new ones here and restart the backend and every agent together (a mismatch gives `401`).
**Depends on:** nothing. **Blocks:** L4 onward, P1 onward.
**Status:** not verified.

### S6. This PC's network address, and the ports are free

**Runs on:** this PC.

```
(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1).IPv4Address.IPAddress
```

```
Get-NetTCPConnection -LocalPort 3000,5173,5190,8770,8771,8780 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort, OwningProcess
```

**Expected:** the first prints one address such as `172.20.10.3` (the address on the network the Pi shares; it changes when the hotspot hands out a new one). The second prints nothing (no program is already listening on those ports).
**Paste back:** the address and the (empty or not) port list.
**Pass if:** an address is printed and the port list is empty.
**On fail:** if a port is taken, stop the program that holds it (the `OwningProcess` id) and repeat. If no address is printed, join the network the Pi uses and repeat.
**Fallback on the day:** the address can change if the network changes. Re-run this block and restart each agent with the new `--backend` address.
**Depends on:** nothing. **Blocks:** S7, P2, P6.
**Status:** not verified.

### S7. Pi #1 is reachable, and the clocks agree within 60 seconds

**Runs on:** this PC, then Pi #1 (the second block is typed in the SSH session). Do the two clock commands within a few seconds of each other.

```
ssh pi@goassist-pi1.local "hostname; uname -m; python3 --version; date -u +%Y-%m-%dT%H:%M:%S.%3NZ; timedatectl | grep -i synchronized"
```

```
[DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
```

**Expected:** the Pi prints its host name, architecture (`aarch64`), Python version (3.11 or higher), its UTC time and whether the system clock is synchronized. This PC prints its UTC time.
**Paste back:** all of it.
**Pass if:** the two UTC times differ by **less than 5 seconds** (a difference of 5 to 59 seconds is a warning: continue, but expect `STALE` reports; 60 seconds or more is a fail, because signatures are refused).
**On fail:** if the Pi cannot be reached, check it is powered and on the same network, then repeat. If the clock is off, set it on the Pi (`sudo timedatectl set-ntp true`, or `sudo date -s ...`; this is a system setting on the Pi, so confirm you want to change it) and repeat.
**Fallback on the day:** the Pi's clock is wrong after a power cut with no network. Reconnect it to the network and wait for synchronisation, or set the time by hand.
**Depends on:** S6 (network). **Blocks:** S8, every Pi step.
**Status:** not verified.

### S8. Copy the 22 local commits to Pi #1

The commits since the last push (including the audit fixes and the demonstration controls) exist only on this PC, so the Pi gets them as a copy of this exact checkout, the same way the bring-up did (a tarball, no `.git`). **Runs on:** this PC for the first three blocks, Pi #1 for the last two.

```
git archive --format=tar.gz -o $env:TEMP\goassist-pi.tar.gz HEAD pi docs/runbooks/hardware-bringup-tools
```

```
scp $env:TEMP\goassist-pi.tar.gz pi@goassist-pi1.local:/home/pi/
```

```
git rev-parse --short HEAD
```

On Pi #1 (replace `<commit>` with the short id printed just above), unpack over the existing copy; this keeps `pi/bus-agent/agent.json`, which is not in the archive:

```
cd ~/SG-GoAssist && tar xzf ~/goassist-pi.tar.gz && echo <commit> > ~/SG-GoAssist/DEPLOYED_COMMIT.txt && echo UNPACKED
```

**Expected:** `UNPACKED`.
**Paste back:** the `git rev-parse` output and the Pi's last line.
**Pass if:** the Pi prints `UNPACKED`.
**On fail:** stop and paste the error (a full disk or a permission error is the usual cause).
**Fallback on the day:** if the Pi's code is ever in doubt, redo this step; `DEPLOYED_COMMIT.txt` says which commit it holds.
**Depends on:** S4, S7. **Blocks:** S9, P6.
**Status:** not verified.

### S9. The new code is on the Pi

**Runs on:** Pi #1.

```
cd ~/SG-GoAssist/pi/bus-agent && python3 -m bus_agent --help | grep -cE "demo-movement|deployment-timeout|link-loss-halt" && python3 -c "from bus_agent.link_switch import LinkSwitch; print('NEW CODE PRESENT')" && cat ~/SG-GoAssist/DEPLOYED_COMMIT.txt
```

**Expected:** `3`, then `NEW CODE PRESENT`, then the commit id.
**Paste back:** the three lines.
**Pass if:** the count is `3` and `NEW CODE PRESENT` is printed.
**On fail:** repeat S8; if it fails again, stop and paste.
**Fallback on the day:** none.
**Depends on:** S8. **Blocks:** P6 and everything after it on the Pi.
**Status:** not verified.

### S10. The agent's configuration on Pi #1

**Runs on:** Pi #1. The file holds no secrets.

```
grep -E "busId|backendUrl|deploymentTimeoutSeconds|linkLossHaltSeconds|serialPort|modelPath" ~/SG-GoAssist/pi/bus-agent/agent.json
```

**Expected:** `busId` `AV-095-01`; `deploymentTimeoutSeconds` 30; `linkLossHaltSeconds` 10; the serial port (`/dev/ttyACM0` at the last bring-up) and the model folder (`/home/pi/yolo11n_ncnn_model`, the stock 80-class model).
**Paste back:** the matching lines.
**Pass if:** the two timeouts are present with the values 30 and 10, and `busId` is `AV-095-01`.
**On fail:** edit the file on the Pi to add the missing lines (they are CE2's chosen values), then repeat.
**Fallback on the day:** without the two timeouts the agent will not time out or halt on link loss; do not start the demonstration without them.
**Depends on:** S8. **Blocks:** P6, P12.
**Status:** not verified.

---

## 2. Laptop-only tests, no hardware (steps L1 to L14)

### L1. The whole automated suite

**Runs on:** this PC.

```
npm.cmd run verify
```

**Expected:** a list of 14 checks, each `PASS`, ending `14 of 14 checks passed.` (it takes about four minutes).
**Paste back:** the last 20 lines.
**Pass if:** the last line is `14 of 14 checks passed.`
**On fail:** stop and paste the whole failing check's output. A single failure of a passenger-app test that passes when rerun is a known intermittent; paste it anyway.
**Fallback on the day:** none (this is a pre-demo check).
**Depends on:** S2, S3. **Blocks:** nothing directly, but a failure means the code is not ready.
**Status:** not verified.

### L2. The end-to-end scenario on its own

**Runs on:** this PC.

```
python scripts/e2e_scenario.py
```

**Expected:** about 19 lines starting `PASS`, ending `RESULT: every step held (all sensors and the ramp simulated)`.
**Paste back:** the last 25 lines.
**Pass if:** the last line is the `RESULT:` line and no line starts with `FAIL`.
**On fail:** stop and paste the whole output.
**Fallback on the day:** none.
**Depends on:** S3. **Blocks:** nothing directly.
**Status:** not verified.

### L3. The demo director's own tests

**Runs on:** this PC.

```
cd demo-director; npm.cmd test; cd ..
```

**Expected:** `# tests 35`, `# pass 35`, `# fail 0` (this includes the end-to-end test that starts a real backend and two simulated agents).
**Paste back:** the last 12 lines.
**Pass if:** `# fail 0`.
**On fail:** stop and paste the failing test's output.
**Fallback on the day:** none.
**Depends on:** S3. **Blocks:** L4.
**Status:** not verified.

### L4. Start the rehearsal stack: a backend and two simulated agents

This is the laptop rehearsal of the real demonstration, with **both buses simulated**. The windows inherit the secrets from your session (S5). **Runs on:** this PC.

Start the backend in a new window (auto-acknowledge is off, so only a bus can confirm a request):

```
$env:GOASSIST_AUTO_ACK='off'; $env:GOASSIST_DATA_DIR='.runtime\rehearsal'; Start-Process powershell -ArgumentList '-NoExit','-Command','npm.cmd start --workspace @buspass/backend' -WorkingDirectory $PWD
```

Wait about 15 seconds, then:

```
Invoke-RestMethod http://localhost:3000/ready
```

Start Bus 1 as a simulated agent for the rehearsal:

```
Start-Process powershell -ArgumentList '-NoExit','-Command','python -m bus_agent --simulate --bus-id AV-095-01 --backend http://localhost:3000 --status-port 8780 --deployment-timeout 30 --link-loss-halt 10' -WorkingDirectory "$PWD\pi\bus-agent"
```

Start Bus 2 as a simulated agent:

```
Start-Process powershell -ArgumentList '-NoExit','-Command','python -m bus_agent --simulate --bus-id AV-095-02 --backend http://localhost:3000 --status-port 8781 --deployment-timeout 30 --link-loss-halt 10' -WorkingDirectory "$PWD\pi\bus-agent"
```

**Expected:** the first window ends with a line like `Backend server running on http://localhost:3000`; `/ready` answers with a status of ok; each agent window prints `Status page: http://localhost:8780/#<code>` (and `...8781/#<code>`). **Do not paste the codes.**
**Paste back:** the `/ready` output, and the agent windows' lines with `<code>` in place of the code.
**Pass if:** `/ready` answers and both agent windows printed their `Status page:` line.
**On fail:** stop and paste the window that failed. A `401` or "signature" message means the windows did not inherit the secrets: close all three windows, repeat S5 in this session, and start again.
**Fallback on the day:** none (this is the rehearsal stack).
**Depends on:** S3, S5, L3. **Blocks:** L5 to L14.
**Status:** not verified.

### L5. Start the demo director

**Runs on:** this PC. Type each code into the variables (they stay in this window only), then start the director in a new window:

```
$c1 = '<Bus 1 code>'; $c2 = '<Bus 2 code>'
```

```
$env:DEMO_DIRECTOR='on'; $env:DEMO_STOP='18331'; $env:DEMO_AGENTS = ConvertTo-Json -Compress @(@{busId='AV-095-01';url='http://127.0.0.1:8780';code=$c1}, @{busId='AV-095-02';url='http://127.0.0.1:8781';code=$c2}); Start-Process powershell -ArgumentList '-NoExit','-Command','node serve.mjs' -WorkingDirectory "$PWD\demo-director"; $c1 = $null; $c2 = $null
```

```
Start-Process http://127.0.0.1:5190/
```

**Expected:** the new window prints `DEMO CONTROL (not the operator console): http://127.0.0.1:5190/`; the browser shows a page titled "DEMO CONTROL (not the operator console)" with a hatched banner reading "DEMO CONTROL, NOT THE OPERATOR CONSOLE" and a heavy dashed frame.
**Paste back:** the director window's first lines and a description (or screenshot) of the page header.
**Pass if:** the page opens with that banner, and the director window did not print `will not start`.
**On fail:** if it says `DEMO_AGENTS` is invalid, redo the second block (quotes). Stop and paste if it still fails.
**Fallback on the day:** if the director will not start, use each agent's own console commands (`arrive 18331`, `depart`, ...) in the agent windows, and `Invoke-RestMethod` for the operator actions (see the runbook).
**Depends on:** L4. **Blocks:** L6 to L14.
**Status:** not verified.

### L6. The page labels every bus and input

**Runs on:** this PC (the browser page).

```
(Invoke-RestMethod http://127.0.0.1:5190/api/state).buses.PSObject.Properties.Value | Select-Object label, kind, controlLevel, agentOk | Format-Table
```

**Expected:** two rows, `BUS 1` and `BUS 2`; both `kind` `SIMULATED` (this is the laptop rehearsal), `controlLevel` `scene`, `agentOk` `True`. On the page each bus card has a **◇ SIMULATED** tag with a dashed border, and an "Inject a state" group of buttons.
**Paste back:** the table.
**Pass if:** both rows show `agentOk` `True` and `kind` `SIMULATED`.
**On fail:** a bus showing `agentOk` `False` means the director cannot reach its agent: check the port and code in L5.
**Fallback on the day:** not applicable.
**Depends on:** L5. **Blocks:** L7.
**Status:** not verified.

### L7. Sequence steps 1 to 3

**Runs on:** this PC (browser). On the page's sequence panel press **DO THIS STEP** for step 1, wait for **● DONE**, then step 2, then step 3.

```
(Invoke-RestMethod http://127.0.0.1:5190/api/state).steps | Select-Object id, done, detail | Format-Table -AutoSize
```

**Expected:** steps 1, 2 and 3 show `done` `True`: the bay occupant is `AV-095-01`; Bus 2 is `WAITING_FOR_BAY` and queued; Bus 2's request is `ACKNOWLEDGED` (the **bus** confirmed it) with its ramp `STOWED` and held by the gate. The stop display shows Bus 1 in the bay and Bus 2 in the waiting lane.
**Paste back:** the table.
**Pass if:** steps 1 to 3 are `True` within about 30 seconds each.
**On fail:** stop and paste the table and the timeline text (the page's bottom panel).
**Fallback on the day:** if a step does not complete, narrate it as simulated and use the agent's own console command for that step.
**Depends on:** L6. **Blocks:** L8.
**Status:** not verified.

### L8. Cancel, then ask again: the request is not swallowed

This is the check for the bug found on hardware (a new request merged into a dead one). **Runs on:** this PC (browser): on Bus 2's row press **Cancel its request**, wait for the timeline line `request cancelled by the operator`, then press **Create a request** for Bus 2 again.

```
(Invoke-RestMethod http://127.0.0.1:5190/api/state).backend.requests | Select-Object busId, status, requestId | Format-Table
```

**Expected:** the first request shows `CANCELLED` (or is gone from the active list); a **new** request id appears for `AV-095-02` and reaches `ACKNOWLEDGED` again within about 10 seconds. The timeline does **not** say "merged into an active one".
**Paste back:** the table and the timeline lines for this step.
**Pass if:** a second, different request id for `AV-095-02` reaches `ACKNOWLEDGED`.
**On fail:** stop and paste (a request that stays `SENDING` for 30 seconds is the bug).
**Fallback on the day:** if a new request is ever not confirmed, complete or cancel the case from the operator console, then create a new request.
**Depends on:** L7. **Blocks:** L9.
**Status:** not verified.

### L9. Sequence steps 4 to 7

**Runs on:** this PC (browser): press **DO THIS STEP** for steps 4 and 5; steps 6 and 7 have no button (they happen by themselves).

```
(Invoke-RestMethod http://127.0.0.1:5190/api/state).steps | Select-Object id, done, detail | Format-Table -AutoSize
```

**Expected:** after step 4, the bay is free **and not granted**, and Bus 2's ramp is still `STOWED` ("leaving does not deploy for the next bus"). After step 5, the bay is granted to Bus 2. Then Bus 2 enters (`POSITIONED_AT_STOP`) and its simulated ramp reaches `DEPLOYED` (a **simulated** completion). All seven rows show `done` `True`.
**Paste back:** the table and the last 15 timeline lines.
**Pass if:** all seven steps are `True`.
**On fail:** stop and paste. If Bus 2 does not enter after the grant, wait 10 seconds first (it asks for the bay again every 5 seconds).
**Fallback on the day:** if Bus 2 does not enter, press **GRANT THE BAY** again only if the bay is shown free; otherwise restart Bus 2's agent and arrive again.
**Depends on:** L8. **Blocks:** L10.
**Status:** not verified.

### L10. Scene injections on the simulated Bus 2

**Runs on:** this PC (browser, Bus 2's card). After each button, run the command and compare. All are **◇ SIMULATED** inputs.

```
(Invoke-RestMethod http://127.0.0.1:5190/api/state).buses.'AV-095-02'.agent.decision | ConvertTo-Json -Depth 4
```

| Press (Bus 2)                       | Expected in the decision                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| Person in the ramp zone             | permission `HALT`, reasons include `OBJECT_IN_ZONE`                                     |
| Empty the zone                      | `OBJECT_IN_ZONE` is gone                                                                |
| Leaf in the zone (safe object)      | `OBJECT_IN_ZONE` is **not** in the reasons (a leaf at 0.95 confidence is a safe object) |
| Empty the zone                      | (reset)                                                                                 |
| Beam blocked, then Beam clear again | `TOF_BLOCKED` appears, then goes                                                        |
| Sensor drops out, then Sensor back  | `TOF_UNAVAILABLE` appears, then goes                                                    |
| Camera covered, then uncovered      | `CAMERA_DEGRADED` appears, then goes                                                    |
| Cut the backend link                | within about 10 seconds `BACKEND_LINK_LOST` appears; **Restore the link** clears it     |

**Paste back:** for each row, the `permission` and `reasons` line.
**Pass if:** every row matches. (The leaf row is new behaviour never checked before: if `OBJECT_IN_ZONE` appears for a leaf, that row fails; paste it.)
**On fail:** stop and paste the failing row's decision.
**Fallback on the day:** if an injection does nothing, press **Empty the zone** and skip that demonstration step; do not claim the state was shown.
**Depends on:** L9. **Blocks:** L11.
**Status:** not verified.

### L11. Operator halt and release

**Runs on:** this PC (browser). On Bus 2 press **Operator halt**, check, then **Release halt**, check. This is a **■ REAL** operator route acting on a simulated bus.

```
(Invoke-RestMethod http://127.0.0.1:5190/api/state).buses.'AV-095-02' | Select-Object operatorHalt, @{n='reasons';e={($_.agent.decision.reasons | ForEach-Object code) -join ', '}}
```

**Expected:** after the halt, `operatorHalt` `True` and the reasons include `OPERATOR_HALT`; after the release, `False` and `OPERATOR_HALT` gone within about 6 seconds.
**Paste back:** both outputs.
**Pass if:** the halt appears, then clears.
**On fail:** stop and paste.
**Fallback on the day:** if a release does not clear, press **Release halt** once more and wait 10 seconds; the bus must read the backend, not just a pushed message.
**Depends on:** L9. **Blocks:** L12.
**Status:** not verified.

### L12. Only a bus confirmed anything (audit proof)

**Runs on:** this PC.

```
(Invoke-RestMethod "http://localhost:3000/api/operations/audit?limit=200" -Headers @{Authorization="Bearer $env:OPERATOR_API_TOKEN"}).events | Where-Object { $_.eventType -in 'REQUEST_ACKNOWLEDGED','REQUEST_MERGED' } | Select-Object eventType, actor, busId | Format-Table
```

**Expected:** `REQUEST_ACKNOWLEDGED` rows (one per request you made) all with actor `VEHICLE`.
**Paste back:** the table.
**Pass if:** there is at least one `REQUEST_ACKNOWLEDGED` row and **every** one has actor `VEHICLE` (an `AUTO_ACK` or `SIMULATOR` row is a fail).
**On fail:** stop. This means something other than a bus confirmed a request (the backend was not started with auto-acknowledge off).
**Fallback on the day:** restart the backend with `GOASSIST_AUTO_ACK` set to `off`.
**Depends on:** L9. **Blocks:** L13.
**Status:** not verified.

### L13. The operator console open in a separate window

**Runs on:** this PC. This is a different program from the director, for interchange staff.

```
Start-Process powershell -ArgumentList '-NoExit','-Command','npm.cmd run console' -WorkingDirectory $PWD
```

```
Set-Clipboard $env:OPERATOR_API_TOKEN
```

Open `http://localhost:5173/?mode=live&backend=http://localhost:3000` in a **separate browser window**, paste the token into the form that appears, then clear the clipboard:

```
Set-Clipboard $null
```

**Expected:** the console shows "Live" and "Connected", both buses, the bay with Bus 2 as occupant, the request, and the audit log. It shows decision times in your local zone beside the clock. It does **not** have the director's banner or frame. Its Safety clearance panel says "Reported by the bus agent; interlocks are simulated". **Devices online** shows 2.
**Paste back:** a description (or screenshot) of the Overview and one bus page, and the Devices online number.
**Pass if:** the console is Connected, shows both buses, and Devices online is 2.
**On fail:** stop and paste. "Operator token needed" means the paste did not work: paste it again.
**Fallback on the day:** the console is optional for the demonstration. If it fails, say so and continue with the director.
**Depends on:** L9. **Blocks:** B4.
**Status:** not verified.

### L14. Tear down the rehearsal

**Runs on:** this PC. Close the director, agent, console and backend windows (Ctrl+C in each), then:

```
Get-NetTCPConnection -LocalPort 3000,5173,5190,8780,8781 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort
```

**Expected:** nothing listening.
**Paste back:** the (empty) output.
**Pass if:** the list is empty.
**On fail:** stop the process that is still listening.
**Fallback on the day:** not applicable.
**Depends on:** L13. **Blocks:** P1 (the real backend needs port 3000).
**Status:** not verified.

---

## 3. Pi #1 checks (steps P1 to P17)

Everything from here uses the real Bus 1. Open two SSH windows to the Pi: "Pi A" runs the agent (it stays busy), "Pi B" is for other commands.

### P1. Start the backend for the hardware session

**Runs on:** this PC, from the PowerShell session where you did S5 (the launcher reuses its secrets). The launcher opens the BACKEND, CONSOLE SERVER, TUNNEL and SCRATCH tabs; `-NoPi` leaves out its Pi tabs, because the demonstration starts the real agent by hand with an extra option.

```
powershell -ExecutionPolicy Bypass -File docs\runbooks\hardware-bringup-tools\bringup.ps1 -NoPi
```

**Expected:** a Windows Terminal window with those tabs. The SCRATCH tab prints this PC's address and then `MATCH` (the secret check). The BACKEND tab shows `Backend server running`. The TUNNEL tab asks for the Pi's password, then prints `TUNNEL IS UP`.
**Paste back:** what the SCRATCH and TUNNEL tabs print (not the password).
**Pass if:** `MATCH` and `TUNNEL IS UP` both appear.
**On fail:** `MISMATCH` or `401`: close every Windows Terminal window, repeat S5, and launch once. Stop and paste if it repeats.
**Fallback on the day:** start the backend by hand as in L4 and the tunnel with `ssh -L 8770:127.0.0.1:8770 -L 8780:127.0.0.1:8780 pi@goassist-pi1.local`.
**Depends on:** S5, S9, L14. **Blocks:** P2 and everything after it.
**Status:** not verified.

### P2. The Pi can reach the backend

**Runs on:** Pi B. Replace `<PC address>` with the address from S6.

```
curl -s -o /dev/null -w "%{http_code}\n" http://<PC address>:3000/ready
```

**Expected:** `200`.
**Paste back:** the number.
**Pass if:** `200`.
**On fail:** a timeout usually means the PC's firewall blocks port 3000 from the Pi. Allowing an inbound rule is a system setting on this PC: confirm you want it, or move to a network where the PC and Pi can reach each other. Stop and paste if unsure.
**Fallback on the day:** use a phone hotspot that both the PC and the Pi join, then re-run S6 and use the new address.
**Depends on:** P1, S6. **Blocks:** P6.
**Status:** not verified.

### P3. The ESP32 stream and the beam (agent stopped)

The agent holds the serial port, so make sure it is not running. **Runs on:** Pi B. This is interactive: follow what it prints (path empty, a hand in, a hand out, the backstop removed).

```
cd ~/SG-GoAssist && python3 docs/runbooks/hardware-bringup-tools/tof_check.py
```

**Expected:** blocks of lines `--- <label> (n s) ---` with `BEAM` states: after calibration it prints `CALIBRATED reference = <number> mm`; with a hand in the beam the state is `BLOCKED`; with the path empty `BEAM_CLEAR`; it ends with `done`.
**Paste back:** the whole output.
**Pass if:** `CALIBRATED` appears, a `BLOCKED` state appears while the hand is in, a clear state appears when it is out, and the last line is `done` with no `NOT CALIBRATED`.
**On fail:** if `/dev/ttyACM0` is missing, check the USB cable and the ESP32; stop and paste.
**Fallback on the day:** if the beam cannot be made to read, run Bus 1 as a simulated agent (see section 8) and say so aloud.
**Depends on:** S9. **Blocks:** P6.
**Status:** not verified.

### P4. The camera is healthy (agent stopped)

**Runs on:** Pi B.

```
cd ~/SG-GoAssist && python3 docs/runbooks/hardware-bringup-tools/camera_check.py
```

**Expected:** blocks printing frame counts, a rate near 9 per second, brightness statistics and `verdicts=` lines: a healthy scene reads healthy, a covered lens reads `too_dark`. It prints counts and statistics only, never an image.
**Paste back:** the whole output.
**Pass if:** frames are counted, the normal scene verdict is healthy, and the covered lens is reported as `too_dark`.
**On fail:** stop and paste (a `frames=0 last_error=` line names the problem).
**Fallback on the day:** the gate halts on a degraded camera, which is correct; if the camera cannot be recovered, use the simulated Bus 1.
**Depends on:** S9. **Blocks:** P6.
**Status:** not verified.

### P5. The Pi has what real mode needs

**Runs on:** Pi B.

```
python3 -c "import picamera2, serial, numpy; print('PI PACKAGES OK')" && ls -d /home/pi/yolo11n_ncnn_model && ls -l /dev/ttyACM0
```

**Expected:** `PI PACKAGES OK`, the model folder path, and the serial device listed.
**Paste back:** the three outputs.
**Pass if:** all three print without an error.
**On fail:** a missing package or device is a bring-up regression: stop and paste (do not install packages without asking).
**Fallback on the day:** if the camera or serial device is missing, run Bus 1 as a simulated agent (section 8).
**Depends on:** S9. **Blocks:** P6.
**Status:** not verified.

### P6. Start the real agent for Bus 1 with the demonstration option

**Runs on:** this PC for the clipboard, then Pi A. The agent asks for the device secret with a hidden prompt. Copy it from this PC:

```
Set-Clipboard $env:DEVICE_SHARED_SECRET
```

On Pi A (replace `<PC address>`), paste the secret when it waits (nothing is shown as you paste), press Enter:

```
cd ~/SG-GoAssist/pi/bus-agent && read -rs DEVICE_SHARED_SECRET && echo && printf "fingerprint %s\n" "$(printf %s "$DEVICE_SHARED_SECRET" | sha256sum | cut -c1-8)" && export DEVICE_SHARED_SECRET && python3 -m bus_agent --real --config agent.json --backend http://<PC address>:3000 --status-port 8770 --live-view-port 8780 --demo-movement
```

Then on this PC clear the clipboard:

```
Set-Clipboard $null
```

**Expected:** a `fingerprint` line equal to the one from S5; then the agent's start-up lines, ending with `Status page: http://localhost:8770/#<code>` and `Live view: port 8780 ...`; a warning that the beam is **not calibrated** (correct); no warning that a timeout is not set.
**Paste back:** the fingerprint line and the start-up lines (replace `<code>` for the codes).
**Pass if:** the fingerprint equals S5's, the agent printed its `Status page:` line, and it is still running after 10 seconds with no traceback.
**On fail:** a different fingerprint means the secret was not pasted correctly: stop the agent and repeat. A refusal to start with real sensors lists its reasons: paste them.
**Fallback on the day:** if the agent will not start, run Bus 1 as a simulated agent (section 8).
**Depends on:** P1, P2, P3, P4, S10. **Blocks:** P7 onward.
**Status:** not verified.

### P7. The status page is real (and the SIMULATED badge is hidden)

**Runs on:** this PC, through the tunnel. Type Bus 1's code into the variable, then clear it:

```
$c1 = '<Bus 1 code>'; Invoke-RestMethod http://127.0.0.1:8770/api/state -Headers @{'X-Status-Token'=$c1} | Select-Object busId, simulated, controlLevel, movement, @{n='ramp';e={$_.ramp.state}}; $c1 = $null
```

Then open `http://127.0.0.1:8770/#<Bus 1 code>` in a browser and look at the header.

**Expected:** `busId` `AV-095-01`, `simulated` `False`, `controlLevel` `movement`. The page header does **not** show a "◇ Simulated" badge. The decision shows `HALT` with `TOF_NOT_CALIBRATED`.
**Paste back:** the output, and whether the badge is hidden.
**Pass if:** `simulated` is `False`, `controlLevel` is `movement`, and the badge is hidden.
**On fail:** stop and paste (a visible badge means the page file on the Pi is the old one: repeat S8).
**Fallback on the day:** not applicable.
**Depends on:** P6. **Blocks:** P8.
**Status:** not verified.

### P8. Calibration (runbook check 2)

Nothing in the doorway, the ramp stowed. **Runs on:** Pi A (type into the agent window).

```
calibrate
```

**Expected:** `beam reference taken at <number> mm (path must be empty)` with a number from 150 to 1000. The gate stays `HALT` for now (`NO_ACCEPTED_REQUEST`, `BUS_NOT_AT_BOARDING_POSITION`); `TOF_NOT_CALIBRATED` is gone.
**Paste back:** the reply, and the decision from the P7 command re-run.
**Pass if:** the reference line prints with a number from 150 to 1000, and `TOF_NOT_CALIBRATED` is no longer among the reasons.
**On fail:** a refusal with `too spread out` or `no fresh readings` means the path was not empty or steady: clear the doorway and repeat once; stop and paste if it repeats.
**Fallback on the day:** calibrate again after any bump to the ESP32 or the sensor mount. The reference is lost on every agent restart.
**Depends on:** P7. **Blocks:** P9.
**Status:** not verified.

### P9. Start the director for Bus 1 only, and arrive

**Runs on:** this PC. Bus 1 only for now (the sequence steps will read "waiting for both buses").

```
$c1 = '<Bus 1 code>'; $env:DEMO_DIRECTOR='on'; $env:DEMO_STOP='18331'; $env:DEMO_AGENTS = '[{"busId":"AV-095-01","url":"http://127.0.0.1:8770","code":"' + $c1 + '"}]'; Start-Process powershell -ArgumentList '-NoExit','-Command','node serve.mjs' -WorkingDirectory "$PWD\demo-director"; $c1 = $null
```

```
Start-Process http://127.0.0.1:5190/
```

On the page press **ARRIVE** for Bus 1.

```
(Invoke-RestMethod http://127.0.0.1:5190/api/state).buses.PSObject.Properties.Value | Select-Object label, kind, controlLevel, agentOk, @{n='movement';e={$_.agent.movement.code}} | Format-Table
```

**Expected:** one row: `BUS 1`, `kind` `REAL` (with a **■ REAL** tag and a solid border on the page), `controlLevel` `movement`, `agentOk` `True`, `movement` `POSITIONED_AT_STOP`. The Bus 1 card has **no** scene buttons: it shows "Do it physically" instead. The stop display shows Bus 1 in the bay.
**Paste back:** the row and a description of Bus 1's card.
**Pass if:** `kind` is `REAL`, `movement` is `POSITIONED_AT_STOP`, and the card has no scene button.
**On fail:** stop and paste.
**Fallback on the day:** type `arrive 18331` into Pi A instead of pressing the button.
**Depends on:** P8. **Blocks:** P10 onward.
**Status:** not verified.

### P10. A real request is confirmed by the bus, and a real obstruction halts the gate (runbook checks 5 and 3)

Put a hand (or an object) in the beam path, and keep it there. On the page press **Create a request** for Bus 1 (a **◇ SIMULATED** passenger; the confirmation must come from the **real agent**).

```
(Invoke-RestMethod http://127.0.0.1:5190/api/state).buses.'AV-095-01'.agent | Select-Object @{n='beam';e={$_.beam.state}}, @{n='gate';e={$_.decision.permission}}, @{n='reasons';e={($_.decision.reasons | ForEach-Object code) -join ', '}}, @{n='ramp';e={$_.ramp.state}}
```

```
(Invoke-RestMethod "http://localhost:3000/api/operations/audit?limit=60" -Headers @{Authorization="Bearer $env:OPERATOR_API_TOKEN"}).events | Where-Object { $_.eventType -eq 'REQUEST_ACKNOWLEDGED' } | Select-Object eventType, actor, busId | Format-Table
```

**Expected:** the beam reads `BLOCKED`; the gate is `HALT` with `TOF_BLOCKED` (and `SENSORS_DISAGREE` if the camera sees an empty zone); the ramp stays `STOWED` (no deployment while blocked). The audit shows `REQUEST_ACKNOWLEDGED`, actor `VEHICLE`, bus `AV-095-01`.
**Paste back:** both outputs.
**Pass if:** the gate is `HALT` with `TOF_BLOCKED`, the ramp is `STOWED`, **and** an acknowledgement row with actor `VEHICLE` exists for `AV-095-01`.
**On fail:** an actor of `AUTO_ACK` or `SIMULATOR` means the backend auto-acknowledge was not off: stop and paste. A beam that never reads `BLOCKED` means the object is not in the beam: move it and repeat once.
**Fallback on the day:** show the same with the simulated bus's "Beam blocked" button, and say it is simulated.
**Depends on:** P9. **Blocks:** P11.
**Status:** not verified.

### P11. Take the hand away: the gate continues and the simulated ramp deploys; the lasers are commanded (switch OFF)

**Eye safety first: the laser master switch must be OFF.** The agent still sends the commands; you read them in the log without any light. Take the hand away. Watch Pi A.

```
(Invoke-RestMethod http://127.0.0.1:5190/api/state).buses.'AV-095-01'.agent | Select-Object @{n='gate';e={$_.decision.permission}}, @{n='ramp';e={$_.ramp.state}}
```

**Expected:** within about 10 seconds the beam reads clear, the gate is `CONTINUE`, and the **simulated** ramp goes `DEPLOYING` then `DEPLOYED`. Pi A logs `Marker lasers ON (ramp DEPLOYING)` (or the ramp state at that moment) around the start of the deployment.
**Paste back:** the command output and the Pi A lines containing `Marker lasers`.
**Pass if:** the gate reaches `CONTINUE`, the ramp reaches `DEPLOYED`, **and** `Marker lasers ON` appears in the log. (This proves the agent commands the lasers; it does **not** prove light was produced.)
**On fail:** a gate that stays `HALT` after the hand is gone: paste the reasons.
**Fallback on the day:** the lasers are a marker only and nothing in the gate depends on them. If there is any doubt about eye safety, keep the switch OFF and rely on the log line.
**Depends on:** P10. **Blocks:** P12.
**Status:** not verified.

### P12. Cancel: the ramp retracts, and the lasers go off after their hold

On the page press **Cancel its request** for Bus 1.

```
(Invoke-RestMethod http://127.0.0.1:5190/api/state).buses.'AV-095-01'.agent | Select-Object @{n='ramp';e={$_.ramp.state}}
```

**Expected:** within about 30 seconds the simulated ramp returns to `STOWED`. After the hold time Pi A logs `Marker lasers OFF (ramp STOWED, hold over)`. (The lasers deliberately have **no maximum on-time** while the ramp is out.)
**Paste back:** the output and the Pi A `Marker lasers OFF` line.
**Pass if:** the ramp is `STOWED` and the `Marker lasers OFF` line appears.
**On fail:** if the ramp does not stow within 60 seconds, stop and paste the timeline and the audit's last 10 events. Bus 1 cannot depart with its ramp out (so the sequence cannot continue).
**Fallback on the day:** restart Bus 1's agent (the ramp is memory only and returns to `STOWED`), calibrate again, and arrive again.
**Depends on:** P11. **Blocks:** P13 and every step that needs Bus 1 to depart.
**Status:** not verified.

### P13. Devices online counts the real Pi

**Runs on:** this PC.

```
(Invoke-RestMethod http://localhost:3000/api/operations/devices -Headers @{Authorization="Bearer $env:OPERATOR_API_TOKEN"}).devices | Select-Object deviceId, networkOnline, observedAt | Format-Table
```

**Expected:** a row `AV-095-01`, `networkOnline` `True`, `observedAt` within the last 15 seconds (the agent posts its own health every few seconds). The operator console, if open, shows Devices online 1 or more.
**Paste back:** the table.
**Pass if:** the row exists with `networkOnline` `True` and a time within 15 seconds of now (compare with this PC's UTC clock).
**On fail:** stop and paste (no row means the agent did not post its health).
**Fallback on the day:** not needed for the demonstration; skip and say so.
**Depends on:** P6. **Blocks:** nothing.
**Status:** not verified.

### P14. Link loss, method A: the backend stops (runbook check 7, method A)

Two kinds of lost link matter, and the safety loop must survive both. **Method A** (this step) is a stopped backend: the Pi's connection is refused at once. **Method B** (P14b, optional) is a silently dropped link: connections hang until they time out, which is the case that once stalled the safety loop. Unplugging the Pi's network is **not** used, because it also cuts your SSH view and the tunnel; both documents now describe the same two methods.

**Runs on:** this PC. In the BACKEND tab press Ctrl+C. Wait about 15 seconds, then run the command below twice, about 3 seconds apart:

```
$c1 = '<Bus 1 code>'; Invoke-RestMethod http://127.0.0.1:8770/api/state -Headers @{'X-Status-Token'=$c1} | Select-Object @{n='gate';e={$_.decision.permission}}, @{n='reasons';e={($_.decision.reasons | ForEach-Object code) -join ', '}}, @{n='link';e={$_.link.ok}}, ageSeconds; $c1 = $null
```

Restart the backend in the same tab (`npm.cmd start --workspace '@buspass/backend'`), wait 20 seconds, and run the same command once more.

**Expected:** with the backend down: `link` `False`, gate `HALT` with `BACKEND_LINK_LOST` (within about 10 seconds of the stop); `ageSeconds` stays small (under 2) in both readings, which shows the safety loop keeps running and deciding locally. After the backend is back: `BACKEND_LINK_LOST` is gone and `link` is `True`.
**Paste back:** the three outputs and the Pi A last 15 lines.
**Pass if:** `BACKEND_LINK_LOST` appears within 20 seconds of stopping the backend, `ageSeconds` is under 2 in both readings during the outage, and `BACKEND_LINK_LOST` is gone within 30 seconds of restarting it.
**On fail:** stop and paste. Without `linkLossHaltSeconds` in `agent.json` (S10) it never fires. An `ageSeconds` of 2 or more during the outage means the loop is being delayed by the network: that is a safety finding, not a tuning issue.
**Fallback on the day:** if a real outage is not practical, demonstrate it on the simulated bus with the **Cut the backend link** button and say it is simulated.
**Depends on:** P12. **Blocks:** P15.
**Status:** not verified.

### P14b. Link loss, method B (optional): traffic from the Pi to the backend is silently dropped

**Optional.** Do this only if you accept a temporary change to this PC's Windows firewall. **I will not run or change any firewall setting; this step is yours to run, and it needs your explicit yes first.** The rule blocks **only** inbound connections to port 3000 **from the Pi's address**, so your SSH session (a connection from this PC to the Pi) and the tunnel are not affected. A blocked inbound connection is dropped without an answer, so the agent's requests hang until they time out instead of being refused: this is the realistic lost-link case.

First find the Pi's address (**runs on:** this PC):

```
ssh pi@goassist-pi1.local hostname -I
```

Then, in an **administrator** PowerShell window on this PC (replace `<Pi address>` with the first address printed, the one on the network you share with this PC):

```
New-NetFirewallRule -DisplayName "demo-block-pi-to-backend" -Direction Inbound -Protocol TCP -LocalPort 3000 -RemoteAddress <Pi address> -Action Block
```

Wait about 20 seconds, then run the status command from P14 three times, a few seconds apart. Then **remove the rule**:

```
Remove-NetFirewallRule -DisplayName "demo-block-pi-to-backend"
```

and run the status command once more after 30 seconds.

**Expected:** while the rule is on: `link` `False`, gate `HALT` with `BACKEND_LINK_LOST` within about 20 seconds (a little later than method A, because the first requests must time out), and `ageSeconds` stays under 2 in every reading: the loop is not stalled by hanging connections. After the rule is removed: `BACKEND_LINK_LOST` clears.
**Paste back:** the four status outputs, the `Get-NetFirewallRule -DisplayName "demo-block-pi-to-backend"` result **after** the removal (it must report that no rule is found), and the Pi A last 15 lines.
**Pass if:** `BACKEND_LINK_LOST` appears within 30 seconds of adding the rule, `ageSeconds` is under 2 in every reading, it clears within 40 seconds of removing the rule, and the rule no longer exists.
**On fail:** **remove the rule first** (the command above), then stop and paste. If `ageSeconds` is 2 or more while the rule is on, the safety loop is waiting on the network: that is a code finding, to be fixed test first, not tuned away.
**Fallback on the day:** do not use a firewall rule on the day; method A or the simulated **Cut the backend link** button covers the demonstration.
**Depends on:** P14. **Blocks:** nothing (optional).
**Status:** not verified.

### P15. The live view shows frames only while watched, and nothing is saved

**Runs on:** this PC, then Pi B. Open the live view in the operator console's bus page or at `http://127.0.0.1:8780/` (the tunnel forwards it; use the code the agent printed). Look at it for a few seconds, then close it. Then on Pi B:

```
find ~/SG-GoAssist ~ -maxdepth 4 -newer ~/SG-GoAssist/DEPLOYED_COMMIT.txt \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" -o -name "*.bmp" -o -name "*.mp4" \) 2>/dev/null | head
```

**Expected:** the view shows a labelled picture of the ramp zone while it is open; when closed, the agent log does not keep a frame. The `find` prints nothing.
**Paste back:** the `find` output (empty is the pass) and a note on what the view showed.
**Pass if:** the `find` lists **no image or video files** newer than the deployment.
**On fail:** if any image file is listed, stop immediately and paste its path. Camera frames must never be saved.
**Fallback on the day:** do not open the live view; the demonstration does not need it.
**Depends on:** P6. **Blocks:** nothing.
**Status:** not verified.

### P16. Unplug the ESP32: UNKNOWN, a halt, no crash (runbook check 1)

Do this last on the real bus, because after a replug the beam stays unknown until the agent is restarted. Watch Pi A. Physically pull the ESP32's USB cable.

```
$c1 = '<Bus 1 code>'; Invoke-RestMethod http://127.0.0.1:8770/api/state -Headers @{'X-Status-Token'=$c1} | Select-Object @{n='beam';e={$_.beam.state}}, @{n='gate';e={$_.decision.permission}}, @{n='reasons';e={($_.decision.reasons | ForEach-Object code) -join ', '}}; $c1 = $null
```

**Expected:** within a few seconds the beam is `UNKNOWN` with no distance, the gate is `HALT` with `TOF_UNAVAILABLE`, and **the agent keeps running** (no traceback, no exit). The page shows Bus 1's beam as UNKNOWN. Plug the cable back: the beam **stays** `UNKNOWN` until you restart the agent (known and safe).
**Paste back:** the output and the Pi A last 30 lines.
**Pass if:** the beam reads `UNKNOWN`, the gate halts with `TOF_UNAVAILABLE`, and the agent process is still running.
**On fail:** a traceback or an exited agent is a bug: stop and paste.
**Fallback on the day:** pulling the cable on stage is risky (it needs an agent restart and a recalibration). Show it on the simulated bus with **Sensor drops out** instead.
**Depends on:** P14. **Blocks:** P17.
**Status:** not verified.

### P17. Stop the Bus 1 agent cleanly, then restart and recalibrate it

Stop with Ctrl+C in Pi A, then start it again exactly as in P6 and run `calibrate` again (P8).

**Expected:** a clean exit with no traceback; after the restart and `calibrate`, the beam reads clear and the ESP32 is back (this proves recovery by restart).
**Paste back:** the Pi A lines at shutdown and the calibrate reply.
**Pass if:** it exits cleanly and the second `calibrate` succeeds.
**On fail:** stop and paste.
**Fallback on the day:** the restart is also the on-the-day recovery for a lost ESP32.
**Depends on:** P16. **Blocks:** B1.
**Status:** not verified.

_Optional, never run: overexposure._ Shining a torch into the lens to see the camera read `overexposed` has never been tested on hardware; do it only if you choose to, and paste the output.

---

## 4. Both buses together (steps B1 to B9)

Pi #1 is real; Bus 2 is simulated, with live signed traffic to the backend. The demo director drives both. The operator console stays open in a separate window.

### B1. Start Bus 2 (simulated)

**Runs on:** this PC (the simpler and fallback choice), in a new PowerShell window started from the S5 session so it has the secret. If you use a second Pi as Pi #2, run the same command there (with `python3` and `--backend http://<PC address>:3000`) and add a tunnel for port 8771.

```
Start-Process powershell -ArgumentList '-NoExit','-Command','python -m bus_agent --simulate --bus-id AV-095-02 --backend http://localhost:3000 --status-port 8771 --deployment-timeout 30 --link-loss-halt 10' -WorkingDirectory "$PWD\pi\bus-agent"
```

**Expected:** the window prints `Status page: http://localhost:8771/#<code>` and stays running.
**Paste back:** its first lines with `<code>` in place of the code.
**Pass if:** the `Status page:` line is printed and the agent is still running after 10 seconds.
**On fail:** `401` or a signature error means this window did not inherit the secret: close it and start it from the S5 session.
**Fallback on the day:** if Pi #2 fails, use this PC (that is what this step recommends anyway).
**Depends on:** P17. **Blocks:** B2.
**Status:** not verified.

### B2. Restart the director with both buses

**Runs on:** this PC. Close the director window from P9, then:

```
$c1 = '<Bus 1 code>'; $c2 = '<Bus 2 code>'
```

```
$env:DEMO_DIRECTOR='on'; $env:DEMO_STOP='18331'; $env:DEMO_AGENTS = ConvertTo-Json -Compress @(@{busId='AV-095-01';url='http://127.0.0.1:8770';code=$c1}, @{busId='AV-095-02';url='http://127.0.0.1:8771';code=$c2}); Start-Process powershell -ArgumentList '-NoExit','-Command','node serve.mjs' -WorkingDirectory "$PWD\demo-director"; $c1 = $null; $c2 = $null
```

```
Start-Process http://127.0.0.1:5190/
```

**Expected:** the page lists both buses.
**Paste back:** the director's first line.
**Pass if:** it prints its `DEMO CONTROL (not the operator console)` line and the page opens.
**On fail:** stop and paste.
**Fallback on the day:** as L5.
**Depends on:** B1. **Blocks:** B3.
**Status:** not verified.

### B3. Bus 1 is REAL, Bus 2 is SIMULATED, and the real bus refuses scene changes

**Runs on:** this PC.

```
(Invoke-RestMethod http://127.0.0.1:5190/api/state).buses.PSObject.Properties.Value | Select-Object label, kind, controlLevel, agentOk | Format-Table
```

Then try to inject a scene state into the **real** bus through the director's own API (it must be refused):

```
try { Invoke-RestMethod http://127.0.0.1:5190/api/agents/AV-095-01/control -Method Post -Headers @{'X-Demo-Director'='1'} -ContentType 'application/json' -Body '{"command":"block","value":"on"}' } catch { "REFUSED: " + $_.Exception.Response.StatusCode.value__ }
```

**Expected:** `BUS 1` `REAL` `movement`; `BUS 2` `SIMULATED` `scene`; both reachable. The second command prints `REFUSED: 403`. On the page Bus 1 is tagged **■ REAL** (solid border) and Bus 2 **◇ SIMULATED** (dashed border).
**Paste back:** the table and the REFUSED line.
**Pass if:** the kinds are `REAL` and `SIMULATED` and the scene command is refused with 403.
**On fail:** stop and paste. If Bus 1 shows `SIMULATED`, the agent was started without `--real`: stop it.
**Fallback on the day:** not applicable.
**Depends on:** B2. **Blocks:** B5.
**Status:** not verified.

### B4. The operator console in a separate window

**Runs on:** this PC. Open `http://localhost:5173/?mode=live&backend=http://localhost:3000` in a **separate browser window** (use `Set-Clipboard $env:OPERATOR_API_TOKEN` to paste the token, then `Set-Clipboard $null`). The console server comes from the launcher's CONSOLE SERVER tab (P1).

**Expected:** "Live" and "Connected"; both buses; **Devices online 2**; it does **not** carry the director's banner or frame.
**Paste back:** a description (or screenshot) of the Overview.
**Pass if:** Connected, both buses visible, Devices online 2.
**On fail:** stop and paste. The console is optional on the day.
**Fallback on the day:** continue with the director only and say the console is not shown.
**Depends on:** B2. **Blocks:** B5.
**Status:** not verified.

### B5. The full two-bus sequence, driven from the director

Both buses start fresh: Bus 1 stowed and not in the bay (it is `TRAVELLING` after the restart), Bus 2 `TRAVELLING`. **Runs on:** this PC (browser, the director page). Press **DO THIS STEP** for steps 1 to 5 in order, waiting for **● DONE** each time; steps 6 and 7 happen by themselves.

```
(Invoke-RestMethod http://127.0.0.1:5190/api/state).steps | Select-Object id, done, detail | Format-Table -AutoSize
```

**Expected:** all seven rows `True`: Bus 1 (**■ REAL**) occupies the bay; Bus 2 (**◇ SIMULATED**) waits; its request is `ACKNOWLEDGED` by the bus with its ramp `STOWED`; Bus 1 leaves and the bay is free and **not** granted; the grant goes to Bus 2; Bus 2 enters (`POSITIONED_AT_STOP`); its simulated ramp reaches `DEPLOYED`. In the operator console the same sequence appears.
**Paste back:** the table and the last 20 timeline lines.
**Pass if:** all seven steps are `True`.
**On fail:** stop and paste. If Bus 1 refuses to depart ("the ramp is not stowed"), it still has a ramp out from P11: restart its agent (P17) and arrive again.
**Fallback on the day:** if Bus 1 misbehaves, replace it with a simulated Bus 1 (section 8) and say so; the sequence is otherwise unchanged.
**Depends on:** B3, P12. **Blocks:** B6.
**Status:** not verified.

### B6. Only buses confirmed requests, and Bus 1's real sensor shows through

**Runs on:** this PC.

```
(Invoke-RestMethod "http://localhost:3000/api/operations/audit?limit=200" -Headers @{Authorization="Bearer $env:OPERATOR_API_TOKEN"}).events | Where-Object { $_.eventType -in 'REQUEST_ACKNOWLEDGED','REQUEST_MERGED' } | Select-Object eventType, actor, busId | Format-Table
```

```
(Invoke-RestMethod http://127.0.0.1:5190/api/state).buses.'AV-095-01'.agent | Select-Object @{n='beamIsSimulated';e={$_.beam.simulated}}, @{n='camera';e={$_.camera.imageOk}}
```

**Expected:** every `REQUEST_ACKNOWLEDGED` row has actor `VEHICLE`. Bus 1's beam reports `beamIsSimulated` `False`.
**Paste back:** both outputs.
**Pass if:** all acknowledgements are `VEHICLE` and Bus 1's beam is not simulated.
**On fail:** stop and paste.
**Fallback on the day:** not applicable.
**Depends on:** B5. **Blocks:** B7.
**Status:** not verified.

### B7. A real obstruction on Bus 1 while Bus 2 is on screen

With Bus 1 positioned (press **ARRIVE** for Bus 1 again if needed), put a hand in Bus 1's beam, then take it away. **Runs on:** this PC (watch the page).

**Expected:** Bus 1's gate shows `HALT` with `TOF_BLOCKED`, then clears. The timeline line is tagged `BUS 1 · REAL`. Bus 2's own state is not affected.
**Paste back:** the Bus 1 decision output (as in P10) while blocked and after, and the timeline lines.
**Pass if:** `TOF_BLOCKED` appears and clears, and the timeline attributes it to `BUS 1 · REAL`.
**On fail:** stop and paste.
**Fallback on the day:** use the simulated bus's **Beam blocked** button and say so.
**Depends on:** B5. **Blocks:** B8.
**Status:** not verified.

### B8. Injections and a lost link on the simulated Bus 2, and an operator halt on each bus

**Runs on:** this PC (browser). Repeat the rows of L10 on Bus 2 (person, leaf, beam, sensor, camera, cut link), then **Operator halt** and **Release halt** on **each** bus (L11).

**Expected:** as in L10 and L11, on both buses. The operator halt on the real Bus 1 adds `OPERATOR_HALT` to its gate and clears on release.
**Paste back:** the decision line for each row, and Bus 1's halt and release lines.
**Pass if:** every row matches L10 and L11 for both buses.
**On fail:** stop and paste the failing row.
**Fallback on the day:** skip the failing demonstration step and do not claim it.
**Depends on:** B7. **Blocks:** R1.
**Status:** not verified.

### B9. A request through the real operator path while both buses are on screen

On the page press **Create a request** for Bus 1, then **Cancel its request**.

**Expected:** the request is confirmed by Bus 1 (audit actor `VEHICLE`) and cancelled by the operator route; Bus 1's ramp stows if it had deployed.
**Paste back:** the audit acknowledgement rows for `AV-095-01` and Bus 1's ramp state afterwards.
**Pass if:** a `VEHICLE` acknowledgement for `AV-095-01` and the ramp ends `STOWED`.
**On fail:** stop and paste.
**Fallback on the day:** restart Bus 1's agent (P17).
**Depends on:** B8. **Blocks:** R1.
**Status:** not verified.

---

## 5. Final full dress rehearsal (steps R1 to R3)

### R1. The demonstration script, start to finish, as a presenter

**Runs on:** this PC (the presenter at the director page, the technician at the terminals). Follow `docs/runbooks/demo-day.md` section 5 (the 11-step labelled script) with the real Bus 1 and the simulated Bus 2, the operator console open in a separate window. Time it.

**Expected:** every script step happens as written; the presenter says "simulated" at every simulated step.
**Paste back:** the total time, the director's final steps table (as in B5), and a list of any step that needed a workaround.
**Pass if:** the whole script completes with no step skipped, no unexplained halt, and no step described as real that was simulated.
**On fail:** list every step that failed and stop; do not repeat the same failing step more than twice.
**Fallback on the day:** section 8 below, per step.
**Depends on:** B9. **Blocks:** R2.
**Status:** not verified.

### R2. A rehearsal of the fallback: Bus 1 as a simulated agent

**Runs on:** this PC. Stop Pi #1's agent. Start Bus 1 as a simulated agent on this PC:

```
Start-Process powershell -ArgumentList '-NoExit','-Command','python -m bus_agent --simulate --bus-id AV-095-01 --backend http://localhost:3000 --status-port 8782 --deployment-timeout 30 --link-loss-halt 10' -WorkingDirectory "$PWD\pi\bus-agent"
```

Port 8782 avoids the tunnel's own ports (8770 and 8780). Note its start-up code, then restart the director as in B2 with Bus 1's URL set to `http://127.0.0.1:8782` and its code.

**Expected:** the director now shows Bus 1 as **◇ SIMULATED** with scene buttons, and the sequence runs the same.
**Paste back:** the director's bus table and the sequence table.
**Pass if:** both buses show `SIMULATED` and all seven steps complete.
**On fail:** stop and paste.
**Fallback on the day:** this step is the fallback.
**Depends on:** R1. **Blocks:** R3.
**Status:** not verified.

### R3. Shut down and clean up

**Runs on:** this PC, then Pi #1. Stop the director, both agents and the backend (Ctrl+C). Close the terminal windows (the secrets exist only there) and clear the clipboard:

```
Set-Clipboard $null
```

On Pi #1, confirm nothing is still running and the frames check is clean:

```
pgrep -fa bus_agent || echo "NO AGENT RUNNING"
```

**Expected:** `NO AGENT RUNNING`; no listener on this PC's ports (as L14).
**Paste back:** the Pi line and the L14 command output.
**Pass if:** no agent is running and the ports are free.
**On fail:** stop the leftover process.
**Fallback on the day:** not applicable.
**Depends on:** R2. **Blocks:** nothing.
**Status:** not verified.

---

## 6. Decisions that are yours (not decided here)

1. **Push or not.** The last 22 commits (the audit fixes, the demonstration controls, the runbooks) exist only on this PC's `integration` branch. Pushing them to `origin/main` is your decision; until you do, the other session and the teammate do not have them, and the Pi gets them only through S8.
2. **Telling the teammate** (`hongmengsim`): sending `docs/review-guide-for-teammate.md`, and what they should review. The backend refactors, the signing change and the new operator-only routes have not been seen by them.
3. **The safe-object size limit** (R6): the policy treats only `leaf` and `plastic_bag` as safe at 0.92 confidence or more; no size limit has been agreed. The stock 80-class model cannot emit those two classes at all, so on the real bus nothing is ever classified safe.
4. **The final ToF sensor.**
5. **Where the backend is hosted** long term (today: this PC).
6. **Whether to turn the laser master switch ON** for any check (this plan keeps it OFF).
7. **Whether Pi #2 is a real Pi** or Bus 2 stays a PC process.
8. **Adding a `-Demo` switch to the launcher**, so the real agent starts with `--demo-movement` without a hand-typed command.
9. **The timeout values** (30 s deployment, 10 s link loss): you chose them; confirmation with the team is open.
10. **The deferred security items** (individual operator tokens, a replay cache shared across processes, a per-request passenger secret, signed WebSocket pushes) and the items that need a `contracts/` change (a simulated flag on telemetry, schemas for actuator status and device health, a "case over" request status).
11. **Alighting and destination scope in the app**, and the backend's role (open since the handoff).
12. **The ML scope** (shelved by you on 5 Oct): the stock detector, and any reference-difference check.

## 7. Everything that has never run anywhere (the risk)

| Part                                                                                   | Never run                                                                                                               | Risk if it fails on the day                                                                                |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| The 22 local commits **on the Pi**                                                     | Pi #1 has never run this version (only this PC has)                                                                     | High: a bug found only on the Pi. S9 and P6 to P17 are the first run.                                      |
| `--demo-movement` on a real bus                                                        | Never started with real sensors                                                                                         | Medium: Bus 1 cannot be moved from the page; fallback is typing `arrive` and `depart` into the agent.      |
| The marker **lasers**                                                                  | Never switched on by anyone on this project; only commands logged against fakes. The agent never reads laser state back | High for safety, low for the gate. Keep the master switch OFF; the demonstration does not depend on light. |
| **Pi #2 as a real Pi**                                                                 | Never started; Bus 2 has only ever been a process on this PC                                                            | Low: use this PC. A second Pi adds clock, network and tunnel risk.                                         |
| `deploy/` (Dockerfile and compose file)                                                | Never built or run (no Docker here)                                                                                     | None for the demonstration: it is not used.                                                                |
| Signed responses and the signed halt path against the **real Pi**                      | Verified only with simulated agents and fakes                                                                           | Medium: a signature mismatch looks like a link loss.                                                       |
| The agent's device-health post on the real Pi (Devices online)                         | Never run on hardware                                                                                                   | Low: only the Devices online number.                                                                       |
| Real-mode bay entry, retry and lost-answer handling                                    | Simulated agents only                                                                                                   | Medium: Bus 1 could wait for the bay unexpectedly; restart and arrive again.                               |
| The ESP32 re-plug (port re-enumeration)                                                | Known limit: the beam stays unknown until the agent restarts                                                            | Medium: needs a restart and a recalibration on stage.                                                      |
| Camera freshness (a buffered old frame stamped as fresh)                               | Never measured on the real camera                                                                                       | Low to medium: a stale frame could read as fresh.                                                          |
| The model: stock 80-class YOLO11n                                                      | Cannot detect a wheelchair, a stroller or a box; the beam is the only guard against anything it does not know           | A limit to state if asked. Low confidence detections (under 0.25) are dropped, including a person.         |
| The status page and live view over the SSH tunnel                                      | Run once at bring-up                                                                                                    | Low.                                                                                                       |
| Two buses together with a real Bus 1 and the director                                  | Never run (only the simulated end-to-end test)                                                                          | Medium: this plan's section 4.                                                                             |
| More than two backend processes, a second machine, Postgres/Redis in the demonstration | Not used in the demonstration                                                                                           | None: the demonstration uses one backend with SQLite.                                                      |
| The passenger app against this backend                                                 | Not part of this plan; the app was not changed, but it was not run against the 5 Oct changes                            | Unknown: the app's own test suite passes, but a phone has not been tried.                                  |

## 8. Fallback for each part, if the hardware fails on the day

Always say aloud which part is now simulated. Never present a simulated reading as real.

**Blocks the demonstration?** is a word, not a colour. **BLOCKS** means the demonstration cannot go on until it is fixed (there is no fallback that still shows the system working). **Does not block** means a fallback exists and the demonstration goes on, sometimes with less that is real (the column says what is lost).

| Part that fails                        | Blocks the demonstration?                            | Do this                                                                                                                                                     | Steps affected      |
| -------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| This PC or the backend                 | **BLOCKS** (nothing else works without the backend)  | Restart the backend from its tab (agents keep deciding locally and reconnect). If the PC itself is lost, show the simulated end-to-end test output instead. | P1, B2              |
| The network or hotspot                 | **BLOCKS** until it is fixed                         | Move everything to one network or tether the PC; re-run S6; restart each agent with the new `--backend` address.                                            | S6, P2, P6          |
| Clock drift or a `401`                 | **BLOCKS** until it is fixed                         | Close every terminal window, regenerate the secrets (S5), restart the backend and both agents together; fix the Pi's clock (S7).                            | S5, S7, P6          |
| Pi #1 will not boot or the agent fails | Does not block; **loses the real-hardware part**     | Run Bus 1 as a simulated agent on this PC (R2). Tell the audience Bus 1 is simulated.                                                                       | P6 to P17, B3 to B9 |
| The ESP32 or the beam                  | Does not block; loses the real beam                  | Restart the agent and recalibrate. If it will not read, run Bus 1 simulated (R2).                                                                           | P3, P8, P10, P16    |
| The camera                             | Does not block; loses the real camera                | The gate halts on a degraded camera (correct). If it cannot be recovered, run Bus 1 simulated.                                                              | P4                  |
| The lasers                             | Does not block                                       | Keep the master switch OFF. They are a marker only; nothing in the gate depends on them.                                                                    | P11, P12            |
| The SSH tunnel                         | Does not block; the director loses its view of Bus 1 | Reopen the tunnel tab; if the Pi is unreachable, run Bus 1 simulated (R2) or type commands into the agent.                                                  | P1, P7              |
| The demo director                      | Does not block                                       | Use the agents' own console commands and `Invoke-RestMethod` for operator actions (the backend and agents do not depend on the director).                   | L5, B2              |
| The operator console                   | Does not block (optional)                            | Skip it. Say it is not shown.                                                                                                                               | L13, B4             |
| Pi #2                                  | Does not block                                       | Run Bus 2 as a PC window (B1).                                                                                                                              | B1                  |
| A real link-loss test (P14, P14b)      | Does not block                                       | Demonstrate link loss on the simulated bus with **Cut the backend link**, and say it is simulated.                                                          | P14, P14b           |

## 9. Record of what has been verified

Filled in only from pasted output. Date every entry.

| Step      | Status           | Evidence (what was pasted) | Date |
| --------- | ---------------- | -------------------------- | ---- |
| S1 to S10 | **not verified** |                            |      |
| L1 to L14 | **not verified** |                            |      |
| P1 to P17 | **not verified** |                            |      |
| B1 to B9  | **not verified** |                            |      |
| R1 to R3  | **not verified** |                            |      |

(In use, split this table to one row per step.)
