# Demo day runbook

**Status (6 Oct 2026): run once end to end.** Every check in section 4 was run on the real Bus 1 with the output pasted back, and the whole script (section 5) was rehearsed once; section 7 records the evidence and `docs/runbooks/demo-readiness-test-plan.md` has every step with its output. **Still not verified:** any light from the marker lasers (the master switch stayed OFF, so only the commands were seen in the log), the physical ramp (it is simulated), the total time of the script (not measured), and the silent-drop link test (method B in check 7). **The Pi lost power four times during the run on a power bank**; section 2 says what to use instead.

**Ground rules (from CE2, unchanged):** the ramp is simulated only and is never described as physically verified. Camera frames are never recorded, saved or sent (the live view shows frames on screen only while someone watches). No secret goes into a file, a commit, a document or a chat message: secrets are the environment variables `DEVICE_SHARED_SECRET` and `OPERATOR_API_TOKEN`, and the agents' start-up codes. Meaning is never carried by colour alone.

**What the demonstration is:** two buses at one stop with one boarding bay. **Bus 1 (`AV-095-01`) is real hardware** (Pi #1, ESP32 beam, camera, marker lasers; the ramp is simulated). **Bus 2 (`AV-095-02`) is simulated** (a Pi #2 or a laptop process, with live signed traffic to the backend). Bus movement is represented, not driven. Every step below says REAL or SIMULATED.

## 1. What runs where

| Machine           | Runs                                                                           | Port or note                             |
| ----------------- | ------------------------------------------------------------------------------ | ---------------------------------------- |
| This PC           | the backend                                                                    | 3000; auto-acknowledge OFF               |
| This PC           | the **demo director** (presenters' control page)                               | 5190, loopback                           |
| This PC           | the operator console (optional, for the audience view of what staff would see) | 5173                                     |
| This PC           | an SSH tunnel to Pi #1                                                         | status page 8770, live view 8780         |
| Pi #1             | the real agent for Bus 1 (`--real`), with `--demo-movement`                    | status page on its own loopback          |
| Pi #2 or a PC tab | the simulated agent for Bus 2 (`--simulate`)                                   | status page 8771 (tunnelled, or this PC) |

**Who runs what.** One person (the **presenter**) uses only the demo director page and the physical bus. One person (the **technician**) runs the commands in sections 3 and 4 and watches the terminal tabs. The presenter never needs a terminal.

The existing launcher (`docs/runbooks/hardware-bringup-tools/bringup.ps1`, with its `window-map.html`) opens the backend, console server, tunnel, scratch and Pi tabs and generates both secrets in memory. The steps below use its tabs.

## 2. Before the day

Do these once, a day ahead if possible. The bus in the photo of 6 Oct 2026 shows three laser modules on the roof frame, a camera on a bracket held with tape above the door opening, a ToF breakout board at the sill, an exposed breadboard and a loose USB-C cable. These are observations from a photo, not checks.

1. **Physical check (technician, by eye).** The camera bracket has not moved since the last calibration. The ToF board at the sill is fixed and its beam crosses the doorway. The USB-C cable to the ESP32 is strain-relieved: pulling it is the "unplug" test, so it must not come out by accident. No wire touches a moving part. The laser modules point at the doorway floor and nothing at head height. **Eye safety:** the lasers are line lasers; keep them off eyes and cameras, and keep the master switch OFF until section 4, check 4.
2. **Put the current code on Pi #1 and Pi #2.** The agent has new options (`--demo-movement`, `--deployment-timeout`, `--link-loss-halt`, `link on|off`) and fixes from the 5 Oct integration audit (halt handling, link loss, signed answers, bay entry). The Pi's copy must be the same version as the backend, because the signature scheme must match. The repository on the Pi is a copy without `.git`. On this PC, from the repository root, in the SCRATCH tab:

   ```
   git archive --format=tar.gz -o ..\goassist-pi.tar.gz HEAD pi contracts docs/runbooks/hardware-bringup-tools
   ```

   Then copy it and unpack it (you will be asked for the Pi's password):

   ```
   scp ..\goassist-pi.tar.gz pi@goassist-pi1.local:/home/pi/
   ```

   On Pi #1 (through the PI CHECKS tab or `ssh pi@goassist-pi1.local`):

   ```
   cd ~/SG-GoAssist && tar xzf ~/goassist-pi.tar.gz && python3 -c "import bus_agent" && echo UNPACKED
   ```

   Note: the commits that add the demonstration controls are on branch `integration` and **have not been pushed**. Make the archive from the checkout that contains them.

3. **Agent configuration on Pi #1** (`pi/bus-agent/agent.json`, no secrets in it): `deploymentTimeoutSeconds` 30 and `linkLossHaltSeconds` 10 (the values CE2 chose; both are off in code unless the file sets them). The start-up output warns if either is missing.
4. **Network.** The PC and both Pis must be on one network and their clocks within a few seconds (signatures allow 60 seconds). The PC's address changes on a hotspot. **Measure it yourself** (`Get-NetIPConfiguration`, the Wi-Fi line) and use that in `--backend`: the launcher's SCRATCH tab once printed a stale address from another adapter.
5. **Power for Pi #1 (the biggest risk).** Use the official Raspberry Pi 27 W supply (5 V 5 A) and a short, thick cable, plugged into a wall socket. A 5 V 3 A power bank gave repeated `Undervoltage detected!` lines under the agent's load and three power losses, and a second source also dropped the Pi. After the agent has run for ten minutes, `ssh pi@goassist-pi1.local "vcgencmd get_throttled"` should read `throttled=0x0`; `0x50000` or `0xd0000` means it dipped. Never judge a supply by its idle reading.
6. **Fix the backstop.** The ToF beam reads the backstop, 250 to 300 mm from the sensor. Every beam fault we saw was the backstop moving or leaving the beam. Tape it down. Calibration is lost on every agent restart, so recalibrate after any restart.
7. **Keep the doorway empty for the camera.** The stock model calls laptops, books, people and even an "airplane" unsafe objects. The gate halts on them (correct) and the ramp will not deploy while one is in view.

## 3. Start-up order

Always in this order. Each step says which machine and what a good result looks like.

**Step 1. Backend (this PC).** Use the BACKEND tab of the launcher (it sets `GOASSIST_AUTO_ACK=off` and generates the secrets). A good result: the SCRATCH tab prints MATCH for the secret check. If it does not, close every terminal window and run the launcher again. **Keep one PowerShell window open for the whole session: the secrets exist only in it. If it is closed by accident, generate new secrets, close every window that holds a port, and start again.**

**Step 2. Tunnel to Pi #1 (this PC).** The TUNNEL tab. A good result: it prints `TUNNEL IS UP`. If the launcher's tunnel tab closes at once, open a plain window and run `ssh -L 8770:127.0.0.1:8770 -L 8780:127.0.0.1:8780 pi@goassist-pi1.local`; a Pi prompt means the tunnel is up. The tunnel dies whenever the Pi drops off the network or loses power.

**Step 3. Real agent for Bus 1 (Pi #1).** In the PI AGENT tab, paste the device secret when asked (from the SCRATCH tab: `Set-Clipboard $env:DEVICE_SHARED_SECRET`, then clear the clipboard). The launcher starts the agent without the demonstration flag, so for the demonstration start it by hand on Pi #1 with the flag added:

```
cd ~/SG-GoAssist/pi/bus-agent && read -rs DEVICE_SHARED_SECRET && export DEVICE_SHARED_SECRET && python3 -m bus_agent --real --config agent.json --backend http://<PC address>:3000 --status-port 8770 --live-view-port 8780 --demo-movement
```

A good result: the line `Status page: http://localhost:8770/#<code>` (write down the part after `#`: it is Bus 1's code), and the agent's warning about the beam: **it is not calibrated until you run `calibrate` with the path empty** (section 4, check 2). With the beam uncalibrated the gate halts with `TOF_NOT_CALIBRATED`; that is correct. **Compare the `fingerprint` line the agent prints with the PC's (S5): they must be identical.** The `Status page:` and `Live view:` lines contain the agent's code: never copy them into a chat, a ticket or a file (they were pasted by mistake twice during the run, and the agent had to be restarted to get a new code each time). Then type `calibrate` in the same window.

**Step 4. Simulated agent for Bus 2.** Either on Pi #2 (same copy of the code, started with `--simulate`) or in a PC tab (simpler, and the fallback). On the machine that runs it, from `pi/bus-agent`, with `DEVICE_SHARED_SECRET` set:

```
python -m bus_agent --simulate --bus-id AV-095-02 --backend http://localhost:3000 --status-port 8771 --deployment-timeout 30 --link-loss-halt 10
```

(on Pi #2 use `python3` and the PC's address in `--backend`). A good result: its own `Status page: http://localhost:8771/#<code>` line (Bus 2's code). If it runs on Pi #2, forward its port to this PC with a second tunnel tab: `ssh -L 8771:127.0.0.1:8771 pi@<pi2 host>`.

**Step 5. Demo director (this PC).** In a new PowerShell tab, with the two codes from steps 3 and 4 (replace the placeholders; the token comes from `$env:OPERATOR_API_TOKEN` in the SCRATCH session):

```
cd demo-director; $env:DEMO_DIRECTOR='on'; $env:DEMO_AGENTS='[{"busId":"AV-095-01","url":"http://127.0.0.1:8770","code":"<Bus 1 code>"},{"busId":"AV-095-02","url":"http://127.0.0.1:8771","code":"<Bus 2 code>"}]'; $env:DEMO_STOP='18331'; node serve.mjs
```

A good result: it prints `DEMO CONTROL (not the operator console): http://127.0.0.1:5190/`. Open that page. Bus 1 must show **■ REAL** and Bus 2 **◇ SIMULATED**. If a bus shows "not reachable", the tunnel or the code is wrong; the page says which.

**Step 6 (optional). Operator console (this PC).** `npm run console`, then the live page. It is for showing what interchange staff would see; it is a different program and never controlled from the director.

**After any restart, the order is:** tunnel, then the Bus 1 agent, then `calibrate`, then restart the director with the new code (the director holds the code of the agent it started with). A code is valid only for the agent run that printed it.

**Reset between runs of the script:** cancel Bus 2's request (its ramp must be stowed), **DEPART** and **TRAVEL** each bus, then press **Start the sequence again**. A half-finished run leaves a bus in the bay. Check with the director state that both ramps read `STOWED`, the bay has no occupant, and no step is done.

**Shutting down:** stop the director, then the agents (Ctrl+C), then the backend. Close the terminal windows (the secrets exist only in them), and clear the clipboard.

## 4. Hardware checks (Pi #1 end to end)

Run these in order before the day, with the technician. Each says what to run, what a pass looks like in words, and **what to paste back**. All are **not verified** until pasted output proves them. If a check fails twice in the same way, stop and write down what was tried; do not loop.

### Check 1. Unplug the ESP32: UNKNOWN, a halt, no crash

Precondition: the agent from step 3 is running and the beam is calibrated (check 2 first if not). On Pi #1, watch the PI AGENT tab. Physically pull the ESP32's USB cable.

Pass: within about a second the beam reads **UNKNOWN**, the gate shows **HALT** with `TOF_UNAVAILABLE`, and the agent **keeps running** (no traceback, no exit). On the demo page Bus 1's beam reads UNKNOWN. Plug the cable back: the port is a new device, so the beam **stays UNKNOWN until the agent is restarted**; this is known and safe (it halts), not a failure of the check.

Paste back: the PI AGENT tab's last 30 lines, and the text of Bus 1's card on the demo page.

### Check 2. Calibration

With the path empty, nothing in the doorway and the ramp stowed, type in the PI AGENT tab:

```
calibrate
```

Pass: it prints `beam reference taken at <number> mm (path must be empty)`. The number must be between 150 and 1000 mm. With the ramp out it refuses (`refused: the ramp must be stowed ...`). After calibration, with the path empty and the camera healthy, the gate shows CONTINUE (once a request is accepted and the bus is positioned; before that `NO_ACCEPTED_REQUEST` or `BUS_NOT_AT_BOARDING_POSITION` is correct).

Paste back: the `calibrate` reply and Bus 1's card.

### Check 3. A real obstruction halts the gate

Press ARRIVE for Bus 1 on the demo page (its state moves into the bay), then create a request for it (check 5 does the full path). Put a hand or an object in the beam.

Pass: the beam reads **BLOCKED** and the gate shows **HALT** (`TOF_BLOCKED`; `SENSORS_DISAGREE` as well if the camera sees an empty zone). Remove it: after a few readings the beam reads clear again. This is **REAL** input on the real bus.

Paste back: this PC, in a PowerShell tab, while the object is in the beam:

```
Invoke-RestMethod http://localhost:3000/api/operations/safety-decisions -Headers @{Authorization="Bearer $env:OPERATOR_API_TOKEN"} | ConvertTo-Json -Depth 6
```

### Check 4. The marker lasers follow the ramp (master switch OFF first)

**Eye safety first.** Keep the laser master switch **OFF**. With it off, the agent still sends the commands; you can see them in the log without any light. Start a deployment for Bus 1 (check 5). Pass (switch OFF): the PI AGENT tab logs `Marker lasers ON (ramp ...)` when the deployment starts and `Marker lasers OFF (ramp ..., hold over)` after the ramp is stowed. The lasers have **no maximum on-time** by decision (they mark where people must stay out): they stay on while the ramp is out, moving or halted.

Only if CE2 chooses, then switch the master ON with nobody's eyes or any camera in the beam path, and repeat. Not verified on hardware until pasted. Never claim the lasers were seen working from the log alone.

Paste back: the log lines above (and, if the switch was turned on, say what was seen).

### Check 5. A request through to the bus's own confirmation

On the demo page press CREATE A REQUEST for Bus 1. This is a **simulated passenger** (no phone); the confirmation must come from the **real agent**. Pass: the page's timeline shows the request moving to ACKNOWLEDGED, and the backend's audit shows who confirmed it. Paste back, this PC:

```
$ids = @((Invoke-RestMethod http://127.0.0.1:5190/api/state).backend.requests | Where-Object { $_.busId -eq 'AV-095-01' } | ForEach-Object { $_.caseId } | Where-Object { $_ } | Sort-Object -Unique); "cases for Bus 1: $($ids.Count)"; $ids | ForEach-Object { (Invoke-RestMethod "http://localhost:3000/api/operations/audit?limit=500&caseId=$_" -Headers @{Authorization="Bearer $env:OPERATOR_API_TOKEN"}).events } | Where-Object { $_.eventType -eq 'REQUEST_ACKNOWLEDGED' } | Select-Object eventType, actor, busId | Format-Table
```

Telemetry heartbeats fill the newest audit events within minutes, so a plain read of the latest events can miss every acknowledgement; this command reads the audit one case at a time. Pass: a `REQUEST_ACKNOWLEDGED` row with actor `VEHICLE` for `AV-095-01`. An actor of `AUTO_ACK` or `SIMULATOR` means the backend was not started with `GOASSIST_AUTO_ACK=off`: stop and fix it.

### Check 6. Bus 2: simulated agent with live signed traffic

Press ARRIVE for Bus 2 while Bus 1 is in the bay. Pass: Bus 2 reports waiting; the page shows it in the waiting lane; the audit shows its signed reports (`BUS_STATUS_CHANGED` for `AV-095-02`); its readings on the page are tagged **SIMULATED**. Paste back: the audit command from check 5 filtered to `AV-095-02`, and Bus 2's card.

### Check 7. Link loss halts the real bus after the configured time

There are two methods, and the safety loop must survive both. Do **not** unplug the Pi's network: that also cuts the SSH session and the tunnel, so you could not see the result.

**Method A, a stopped backend (refused at once).** With Bus 1 positioned, stop the backend (Ctrl+C in the BACKEND tab) for about 25 seconds. Pass: within about 10 seconds (`linkLossHaltSeconds`) the gate shows **HALT** with `BACKEND_LINK_LOST`, and the status page's `ageSeconds` stays under 2 (the loop keeps deciding locally); after the backend is restarted the halt clears.

**Method B (optional), a silently dropped link (timeouts).** A temporary Windows firewall rule blocks inbound port 3000 **from the Pi's address only**, so connections hang instead of being refused. This changes a system setting on the PC, so it needs the owner's explicit yes and is done by the owner, not by Claude. Pass: the same halt within about 30 seconds, `ageSeconds` under 2 throughout, the halt clears after the rule is removed, and the rule no longer exists. This is the case that once stalled the safety loop. The exact commands are in `docs/runbooks/demo-readiness-test-plan.md`, step P14b.

For the **simulated** Bus 2, press CUT THE BACKEND LINK on the demo page instead (a simulated outage); it behaves the same way. Paste back: the status output and the PI AGENT tab's lines around the halt.

## 5. The demonstration script

Every step is labelled. "Presenter" is the person at the demo page.

| #   | Say / do                                                                                                                                  | REAL or SIMULATED                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | "Bus 1 occupies the only boarding bay." Press ARRIVE for Bus 1.                                                                           | Bus 1 is REAL hardware; its movement is represented (state only)    |
| 2   | Point at the beam and camera readings on the Bus 1 card: "These are Bus 1's own sensors."                                                 | REAL readings                                                       |
| 3   | "Bus 2 arrives and finds the bay taken." Press ARRIVE for Bus 2. It waits.                                                                | SIMULATED bus, real signed traffic                                  |
| 4   | "A passenger asks for the ramp on Bus 2." Press CREATE A REQUEST for Bus 2. Show that Bus 2 confirms it itself and its ramp stays stowed. | SIMULATED passenger; the bus's own confirmation; simulated ramp     |
| 5   | "Bus 1 leaves." Press DEPART for Bus 1. Show that Bus 2's ramp does **not** move.                                                         | movement represented                                                |
| 6   | "The controller sends Bus 2 in." Press GRANT THE BAY.                                                                                     | REAL operator route                                                 |
| 7   | Bus 2 enters, confirms it is stopped, and its simulated ramp deploys.                                                                     | SIMULATED bus and ramp (a simulated completion, not a physical one) |
| 8   | "Now something goes wrong." On Bus 1, put a hand in the beam: the gate halts. Take it away: it continues.                                 | REAL sensor, REAL gate                                              |
| 9   | On Bus 2 press PERSON IN THE RAMP ZONE: it halts. Press LEAF IN THE ZONE: a leaf is a safe object, so it does not halt.                   | SIMULATED input                                                     |
| 10  | On Bus 2 press CUT THE BACKEND LINK: after about ten seconds it halts on its own. Restore it.                                             | SIMULATED outage; the bus's own decision                            |
| 11  | Press OPERATOR HALT on a bus: it stops; RELEASE HALT: it can continue.                                                                    | REAL operator route, the bus's own gate                             |

Always say aloud when an input is simulated. Do not describe the ramp as having moved physically. Do not say a camera or model detected anything unless it was Bus 1's own camera and the readings are on screen.

## 6. If hardware fails: fallbacks

Say which part is now simulated. Never present a simulated reading as real.

| What fails                                          | Do this                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bus 1's ESP32 or beam (UNKNOWN)                     | Restart the agent (a replugged ESP32 needs it), run `calibrate`. If it still fails, run **Bus 1 as a simulated agent** on this PC (`--simulate --bus-id AV-095-01`) and update `DEMO_AGENTS`; the page then labels it SIMULATED and offers the scene buttons. Narrate it as simulated.                                                                                                                           |
| Bus 1's camera                                      | The gate halts on a degraded camera, which is correct. Cover and uncover the lens is itself a demonstration. If the camera cannot be recovered, use the simulated Bus 1 above.                                                                                                                                                                                                                                   |
| The lasers (any doubt about safety)                 | Keep the master switch OFF. They are a marker only; nothing depends on them for the gate. The log line still shows the command.                                                                                                                                                                                                                                                                                  |
| The network or hotspot                              | Move the PC and both Pis to another network, or tether the PC. If a Pi cannot reach the backend, its link-loss halt will fire (that is itself demonstrable). Restart each agent with the new `--backend` address.                                                                                                                                                                                                |
| Pi #2                                               | Run Bus 2 as a PC tab (step 4); nothing else changes.                                                                                                                                                                                                                                                                                                                                                            |
| A signature error (401) after a relaunch            | The secrets differ between the backend and an agent. Close every terminal window, run the launcher again, and restart both agents. (An earlier 401 had no determined cause; a full restart cleared it.)                                                                                                                                                                                                          |
| The demo director                                   | Use each agent's own console (type `arrive 18331`, `depart`, and so on) and `Invoke-RestMethod` for the operator actions; the backend and agents do not depend on the director.                                                                                                                                                                                                                                  |
| The Pi loses power or the network                   | The tunnel and the agent die with it. Check `vcgencmd get_throttled` once it is back, then: reopen the tunnel, restart the Bus 1 agent, `calibrate`, restart the director with the new code. If it keeps dropping, run Bus 1 as a simulated agent on this PC (`--simulate --bus-id AV-095-01 --status-port 8782`), point `DEMO_AGENTS` at `http://127.0.0.1:8782`, and say Bus 1 is simulated (rehearsed in R2). |
| The ESP32 is replugged and the agent will not start | It came back as `/dev/ttyACM1`. With the agent stopped, unplug the ESP32 for 5 seconds and plug it into the same port: `ls -l /dev/ttyACM*` over SSH should show `ttyACM0`.                                                                                                                                                                                                                                      |
| A cancel does not stow the ramp                     | The backend holds the retract while something is in the ramp path (`Passenger or object remains in the ramp path`). Clear the doorway and check the backstop; the ramp then stows by itself.                                                                                                                                                                                                                     |
| The backend                                         | Restart it from the launcher tab; agents keep deciding locally and reconnect.                                                                                                                                                                                                                                                                                                                                    |

## 7. Record of what has been verified on hardware

Filled in only from pasted output. Dated 5 to 6 October 2026. The full step-by-step record is section 9 of `docs/runbooks/demo-readiness-test-plan.md`.

| Check                                                  | Status                                     | Evidence (what was pasted)                                                                                                                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 ESP32 unplug: UNKNOWN, halt, no crash                | **verified on hardware**                   | beam `UNKNOWN` with no distance, gate `HALT` with `TOF_UNAVAILABLE`, the status page kept answering; the agent logged the I/O error and stayed up. After a replug the agent had to be restarted (and the device number may change) |
| 2 Calibration                                          | **verified on hardware**                   | `beam reference taken at 222.5 mm`, then 294.5, 274.5 and 274.0 mm across restarts; `TOF_NOT_CALIBRATED` gone afterwards                                                                                                           |
| 3 Real obstruction halts the gate                      | **verified on hardware**                   | object in the beam: beam `BLOCKED`, gate `HALT` with `TOF_BLOCKED` (and `SENSORS_DISAGREE`), ramp `STOWED`; removed: `BEAM_CLEAR`. The `safety-decisions` route in the check was not run; the director's state was used instead    |
| 4 Marker lasers follow the ramp (switch OFF; log only) | **verified (log only; no light was seen)** | `Marker lasers ON (ramp DEPLOYING)` at deployment and `Marker lasers OFF (ramp STOWED, hold over)` after the stow; the master switch stayed OFF                                                                                    |
| 5 Request through to the bus's own confirmation        | **verified on hardware**                   | `REQUEST_ACKNOWLEDGED`, actor `VEHICLE`, bus `AV-095-01` (twice), read per case from the audit                                                                                                                                     |
| 6 Bus 2 simulated, signed live traffic                 | **verified**                               | Bus 2 `SIMULATED` and reachable; its request acknowledged by `VEHICLE` while it waited for the bay; the full two-bus sequence completed with all seven steps `True`                                                                |
| 7 Link loss halts after about 10 s                     | **verified (method A); B not run**         | backend stopped: `HALT` with `BACKEND_LINK_LOST`, `ageSeconds` 0.09 and 0.18, recovered after the restart. On the simulated Bus 2 the halt came 7 seconds after the link was seen down. The time from the stop was not measured    |

## 8. What this runbook does not cover

The model: Bus 1 uses the stock 80-class YOLO11n as a stand-in. It cannot be shown to detect any object that is not one of those classes; the beam is the only guard against anything else. That is a limit to state if asked, not a claim to hide. Final ToF sensor choice, where the backend is hosted long term, and the physical ramp are open and out of scope.

**Known limits seen in the rehearsal (not failures):** the stock model gives false detections of unsafe objects, so the doorway must be empty; the beam margin is thin (clear readings sat 15 to 30 mm from the reference against a 30 mm margin) and the real sensor drops out now and then, which halts the gate; the camera flicker can post audit rows once or twice a second; old requests stay `ACKNOWLEDGED` after their case ends; and the script's total time has not been measured.
