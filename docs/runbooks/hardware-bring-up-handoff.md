# Hardware bring-up: handoff for the next session

Written 1 Oct 2026 (the work ran on 30 Sep 2026) on the branch `hardware-bringup`, which has since been merged into `main` and deleted. Read this first, then `docs/status.md` (section "Hardware bring-up log"), then `docs/runbooks/hardware-bring-up.md`, then `docs/reviews/2026-10-01-reviews.md`. This file assumes you have no memory of the earlier session. Everything you need is in this repository; nothing else is available to you.

## Who and what

The user is **CE2**. CE2 owns the ML and computer-vision stack and the Pi-side safety decision, and works with a teammate who owns the rest of this repository. The project is SG GoAssist: boarding assistance for autonomous buses. The job in this handoff is to guide CE2 through bringing real hardware up, stage by stage, and to record only what CE2's pasted output actually proves. CE2 runs the commands and pastes the output back; you cannot run anything on the Pi yourself unless you have been given a way to.

## Rules that hold throughout

These come from CE2's instructions. The first five are hard limits.

1. **Never claim hardware behaviour that was not run on hardware and shown in CE2's pasted output.** Say "not verified". Read what CE2 pastes and judge it; do not assume a stage passed.
2. **Never record, save, write or send camera frames.** Only summary statistics and detection results may be logged. A live view for a controller is allowed but must never be recorded.
3. **Never describe the ramp as physically verified.** It is simulated only.
4. **No secrets in files, commits, docs or chat.** Secrets live in environment variables: `DEVICE_SHARED_SECRET` (shared by the backend and each Pi) and `OPERATOR_API_TOKEN` (backend and console page only). Name the variables; never ask CE2 to paste a value to you.
5. **CE2 is colour deficient.** In any UI, log or table you design, encode meaning in words, shapes and border styles, never colour alone. Do not ask CE2 to tell colours apart.
6. The Pi is the **safety authority** for halt or continue; the backend records and relays and may only add stricter checks. Bus confirmation of a request must come from the bus, never from the backend or a simulator.
7. Fixes need a **failing test first**, one concern per commit, message format `type: description`. Do not add an attribution line to commits.
8. **Ask CE2 before:** pushing, opening a PR, touching `main`, adding a dependency, changing message contracts in `contracts/` (propose first), flashing firmware, deleting files, or changing system or security settings (for example the Pi's SSH server).
9. If a stage **fails twice with the same symptom**, stop, summarise what was tried, and ask CE2 instead of looping.
10. CE2 does the ML work (filming, labelling, training, evaluation, the model runner). Do not do it. Only say where a model plugs in and how to test the plug-in with a stub.
11. Only make changes that CE2 asked for or that a failing stage needs. No extra features, refactors or files.
12. Keep replies short: the current stage, one next action for CE2, what to paste back. One command per fenced block, saying which machine it runs on. After each stage print `✅ stage name: verified on hardware / not verified`. At the end give a table (words, not colour) of every stage with status, evidence and gaps.

Repository conventions you will hit: line endings are LF (`docs/decisions/0003-line-endings.md`); message-contract changes are proposed first; `StatusUpdateMessage` must not gain members (the app narrows it exhaustively), so operator-only messages use `OperatorStatusUpdateMessage`; new backend code follows the scale rules in `docs/architecture/scalability.md` (no operation touches everything stored, no domain state in module variables, idempotent writes, send on change plus a slow heartbeat, scoped operator subscriptions). A full `npm install` must run from PowerShell (`npm.cmd`); on this worktree only the backend workspace was installed (`npm install --workspace @buspass/shared --workspace @buspass/backend`, then `git checkout -- package-lock.json`).

## Fixed decisions

- **Pi #1** = Bus 1 `AV-095-01`: real ESP32 with a VL53L0X ToF sensor over serial, the real Pi camera, and later the real model.
- **Pi #2** = Bus 2 `AV-095-02`: `python -m bus_agent --simulate`, but with live signed network traffic to the backend (ramp logic and detection simulated).
- The backend runs on CE2's Windows PC (Node 22, `GOASSIST_AUTO_ACK=off`, SQLite under `backend/.runtime/hw`).
- Agent config: `deploymentTimeoutSeconds` 30, `linkLossHaltSeconds` 10.
- **Open, do not decide silently:** the final ToF sensor, and where the backend is hosted long term.

## The setup that was used

| Thing | Value |
| --- | --- |
| Pi #1 | Raspberry Pi 5, `ssh pi@goassist-pi1.local`, Debian Trixie style OS (libcamera 0.7.2, Python 3.13) |
| ESP32 serial | `/dev/ttyACM0` (no `/dev/serial/by-id` entry; USB id `1a86:55d3`, `cdc_acm` driver), 115200 baud |
| Camera | `imx708_wide` on CSI, opened through `Picamera2Grabber`, 640x640 RGB888, about 9 frames per second |
| Model on the Pi | `/home/pi/yolo11n_ncnn_model` (stock Ultralytics YOLO11n, 80 COCO classes). A stand-in only; it is not CE2's model. Set `modelPath` to the folder, not a `.param` file |
| Repo on the Pi | copied with `scp` (a tarball made with `git archive`), no `.git`; the GitHub repository is private, so `git clone` on the Pi failed on authentication |
| Backend PC | Windows 11, reached at `172.20.10.3:3000` on an iPhone hotspot (the address changes if the network changes; check `ipconfig`) |
| Ports | backend 3000, operator console 5173, agent status page 8770 (Pi loopback only, behind a start-up code, reached through an SSH tunnel), camera live view 8780 |
| Backend audit | `backend/.runtime/hw/audit.ndjson` on the PC, one JSON object per line, times in UTC (Singapore is UTC+8) |
| Agent config | `pi/bus-agent/agent.json` on the Pi (`agent.example.json` is the template; no secrets in it) |

Tools for every stage are in `docs/runbooks/hardware-bringup-tools/` (see its README): a one-shot Windows Terminal launcher, and small scripts for the ToF, camera health, a live camera view (in memory only) and perception with stub detectors.

## Where things stand

The evidence, with exact numbers and times, is in `docs/status.md`. In short (all on Pi #1, 30 Sep 2026):

- **Verified on hardware:** Stage 1 ESP32 serial link; Stage 2 ToF beam states (clean re-run, reference 259.0 mm); Stage 3 camera capture and image health (covered lens read `too_dark`, normal scene healthy); Stage 4 perception with stub detectors through the safety gate; Stage 5 the agent in `--real` mode against the real backend, including a real 30 s deployment timeout that raised help-required.
- **Partly:** Stage 6. Recording wrote two text files (ESP32 lines, perception results) and no images, and a replay starts and labels itself as replayed. A replay of the beam states failed because the recording began at 146 to 152 mm, below the 150 mm calibration floor, so the replay could not calibrate.
- **Not done:** Stage 7 (Pi #2 simulated agent with live traffic); Stage 8 (both buses end to end, an operator halt, a deployment timeout on demand, and a link-loss halt at 10 s by unplugging the network); unplugging the ESP32 to `UNKNOWN`; overexposure.
- **Bug found on hardware and fixed:** the agent posted its safety decision about 3.7 times a second with real sensors because the change check counted the beam distance and detection confidence as changes. Fixed in `pi/bus-agent/bus_agent/posting.py` with tests; measured on the Pi afterwards.

## Open issues, in priority order

1. **An unplugged or vanished ESP32 can raise out of the agent's tick** (`SerialLineSource.read_lines` in `pi/tof-link/beam_reading.py` has no handling; `BusAgent._decide` calls it unguarded). It is finding `P-M1` in `docs/reviews/2026-10-01-reviews.md` and was independently seen on hardware. Fix it test-first, then run the unplug check.
2. The reviews document lists other open Pi agent findings that overlap the tests still to run: `P-H1` (a stale halt poll can release an operator halt), `P-H2` and `P-M6` (the link-loss halt can fail to fire), `P-H3` (arrive before the backend answers), `P-M2` (halt state after a Pi restart), and console findings `C-H3` (the "Release halt" confirmation text) and `C-H4` (a re-render every 5 s wipes typed input, including the token field). Read them before Stage 8, and say which ones the hardware run confirms or contradicts.
3. The Pi status page shows a `SIMULATED` badge on real runs (`.mark { display: inline-block }` in `pi/bus-agent/bus_agent/status.html` overrides the `hidden` attribute).
4. The operator console labels the simulated interlocks (vehicle stopped, parking brake, door open) `FROM THE BUS` without saying they are simulated; it shows decision times in UTC beside a local clock; the backend counts "Devices online 0" while the Pi reports; and the audit log has no event for the bus's acknowledgement of a request. The last three are backend or console items for the teammate or the other session.
5. Recording never rotates and does not keep the calibration reference, so a replay only reproduces beam states if the recording starts with an empty path and a backstop 150 to 1000 mm away.
6. A `401 Invalid device signature` incident (after a relaunch, about five minutes long) had no determined cause; a full restart with fresh secrets cleared it. Suspects: a secret mismatch or a clock difference over 60 s.
7. The ToF reference margin is thin: with a fixed backstop the clear readings drifted 15 to 25 mm from the reference against a 30 mm margin.

## Decisions made

- **Live camera view for controllers: an on-demand relay, designed only, nothing built.** The controller turns it on and off in the operator console, from a bus page or from an escalated case. It is off by default; the Pi connects outward to a stateless relay only while someone is watching; nothing is stored on any disk, including the relay; each view is one audit entry; viewers are capped per operator and bus; the safety loop never waits on the encoder. Showing camera images to controllers at all is a privacy decision that CE2 owns.
- **Operator-side debugging is proposed, not approved:** one operator-only message, `AGENT_DIAGNOSTICS`, with a latest-state row per bus, sent on change plus a slow heartbeat, never on jittery readings. It carries: per-sensor real, simulated or replayed; ToF state, distance, reference and margin; reading and frame ages and rates; model result age and inference rate; link state, last success and last error text; the Pi's power flags (`vcgencmd get_throttled`), temperature and clock offset; the simulated interlocks, labelled; the last ~20 agent warnings, bounded and sanitised; and non-secret config. Also wanted in the console: a per-request timeline (request, acknowledgement, deploy, timeout). This is a contract change, so propose it to CE2 and wait for approval. Do not change `backend/` or `contracts/` until the other session's storage work settles.

## Coordination

- Another session works on backend storage (Postgres and multi-process, decision 0005). `main` was updated from `integration` on 1 Oct 2026; this branch has been merged up to that point and nothing here has been merged into `main`. Do not touch `main`.
- Work on a new branch from `main`. Do not push to `main`, open a PR or merge unless CE2 asks.

## Next steps

1. Tidy: stop any running agent or replay on the Pi; make sure ports 3000, 5173, 8770 and 8780 are free.
2. Finish Stage 6: put the backstop 250 to 300 mm from the ToF and fix it; record `recordings/run-02` with `--record` after a successful `calibrate`; replay it with `--backend http://127.0.0.1:9 --no-events` so nothing reaches the real backend.
3. Fix the serial-read guard (open issue 1), then unplug the ESP32 with the agent running and check `UNKNOWN` and a halt.
4. Stage 7: Pi #2 as `--simulate` with live signed traffic.
5. Stage 8: both buses, an operator halt (from the console), a deployment timeout, a link-loss halt. Note the review findings above as you go.
6. Wrap up: a full install and `npm run verify` (on the worktree used so far, `verify:fast` passed 10 of 11; the passenger-app typecheck failed only because that package was not installed), the final table, and ask CE2 about a PR.

Questions still waiting for CE2: fix the `SIMULATED` badge; copy the helper scripts somewhere else; use an SSH key or `AcceptEnv` (a change to the Pi's SSH server, so ask first) to remove the secret paste and password prompts.

## Things learned the hard way

- A phone plugged into the Pi's USB caused repeated over-current messages and made the ESP32 drop off USB. `vcgencmd get_throttled` should read `0x0` and the over-current count should stay flat.
- The agent and the camera live view cannot run together: one process per camera. The agent also holds the ESP32 serial port.
- The ToF reference must be 150 to 1000 mm and steady within 30 mm. `calibrate` may be refused two or three times before it takes; it never runs automatically in real mode.
- The COCO stand-in model sees any object as a class in the zone (for example an "airplane" or "person") and the policy treats every unrecognised class as unsafe, so the gate halts. That is fail-safe, not a fault.
- Environment variables only exist in the window that set them. The launcher copies neither secret automatically; both are copied from its SCRATCH tab on demand and the clipboard is cleared after.
- Windows Terminal may not pass the environment on if it was already running: close every Terminal window and launch again.
- `ssh -t` is needed for the `read -rs` secret prompt on the Pi. The Pi status page URL ends in a `#code` that changes each start; keep it out of chat.
