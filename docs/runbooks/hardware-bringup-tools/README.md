# Hardware bring-up tools

Small tools used during the Pi #1 bring-up (30 Sep 2026). They are helpers, not part of the shipped system, and each one was only run in the way described in `docs/status.md`. None of them saves, writes or sends a camera frame. None holds a secret.

Run the Pi tools **from the repository root on the Pi**. The Pi has no `.git`; copy a tool over with `scp`, or copy the whole `pi/` folder plus these files. They add `pi/bus-agent`, `pi/perception`, `pi/safety-gate` and `pi/tof-link` to the import path relative to the current folder.

| Tool | Runs on | What it does |
| --- | --- | --- |
| `bringup.ps1` | Windows PC | Opens the whole set as named Windows Terminal tabs (BACKEND, CONSOLE SERVER, TUNNEL, SCRATCH, PI AGENT, PI CHECKS) and the console page. It generates both secrets in memory and never writes them to a file. Try `-DryRun` first. Pass `-Pi user@host` for another Pi. `-PiOnly` opens just the PI AGENT and PI CHECKS tabs; run it from the SCRATCH tab of a running launch so it reuses that session's secrets (a fresh set would not match the running backend). `-Record run-02` starts the agent with `--record recordings/run-02`. The launcher works out this PC's current address and starts the agent with `--backend http://<that address>:3000`, which wins over `backendUrl` in the Pi's `agent.json`. The address depends on the network (a hotspot hands out new ones), so it is found at launch and not kept in a file. Before this, real mode always used the file, and a stale address made the agent talk to another machine's backend and get `401 Invalid device signature`. Untested on a machine other than CE2's |
| `tof_check.py` | Pi | Drives the repo's `BeamReader` on the real ESP32 and steps through calibration, path empty, hand in, hand out and backstop removed. Sends nothing to the ESP32. Stop the agent first: it holds the serial port |
| `camera_check.py` | Pi | Opens the camera the way the agent does and prints only counts, rates, brightness statistics and the image-health verdict for a normal scene, a covered lens and darkness |
| `camera_view.py` | Pi | A live browser view of the camera, for the operator. Keeps only the newest frame in memory, listens on the Pi's loopback address only (reach it through an SSH tunnel), and shows the health verdict in words with a shape mark. Stop the agent first: one process per camera |
| `check_secret.py` | this PC | Sends one signed read-only request to the running backend with this session's `DEVICE_SHARED_SECRET` and prints MATCH or MISMATCH, never the secret. The launcher's SCRATCH tab runs it for you. The Pi's copy of the agent must be the same version as the backend: the signature scheme changed on 30 Sep 2026 (commit `ae97730`, it now binds the method and path), so rebuild the backend and update the Pi's `pi/` folder together |
| `perception_check.py` | Pi | Runs real camera frames through the perception pipeline and the safety gate using stub detectors and a fake model runner. Proves the plumbing, not any model. Add `--fake` to try it without a camera |
| `window-map.html` | any browser | A one-page map of every window and tab used, and what each is for. It contains example paths from CE2's PC |

Secrets are copied on demand from the SCRATCH tab and the clipboard is cleared afterwards:

```
Set-Clipboard $env:DEVICE_SHARED_SECRET   # to paste into the PI AGENT tab
Set-Clipboard $env:OPERATOR_API_TOKEN      # to paste into the console page
Set-Clipboard $null
```
