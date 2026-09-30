# Hardware bring-up tools

Small tools used during the Pi #1 bring-up (30 Sep 2026). They are helpers, not part of the shipped system, and each one was only run in the way described in `docs/status.md`. None of them saves, writes or sends a camera frame. None holds a secret.

Run the Pi tools **from the repository root on the Pi**. The Pi has no `.git`; copy a tool over with `scp`, or copy the whole `pi/` folder plus these files. They add `pi/bus-agent`, `pi/perception`, `pi/safety-gate` and `pi/tof-link` to the import path relative to the current folder.

| Tool | Runs on | What it does |
| --- | --- | --- |
| `bringup.ps1` | Windows PC | Opens the whole set as named Windows Terminal tabs (BACKEND, CONSOLE SERVER, TUNNEL, SCRATCH, PI AGENT, PI CHECKS) and the console page. It generates both secrets in memory and never writes them to a file. Try `-DryRun` first. Pass `-Pi user@host` for another Pi. Untested on a machine other than CE2's |
| `tof_check.py` | Pi | Drives the repo's `BeamReader` on the real ESP32 and steps through calibration, path empty, hand in, hand out and backstop removed. Sends nothing to the ESP32. Stop the agent first: it holds the serial port |
| `camera_check.py` | Pi | Opens the camera the way the agent does and prints only counts, rates, brightness statistics and the image-health verdict for a normal scene, a covered lens and darkness |
| `camera_view.py` | Pi | A live browser view of the camera, for the operator. Keeps only the newest frame in memory, listens on the Pi's loopback address only (reach it through an SSH tunnel), and shows the health verdict in words with a shape mark. Stop the agent first: one process per camera |
| `perception_check.py` | Pi | Runs real camera frames through the perception pipeline and the safety gate using stub detectors and a fake model runner. Proves the plumbing, not any model. Add `--fake` to try it without a camera |
| `window-map.html` | any browser | A one-page map of every window and tab used, and what each is for. It contains example paths from CE2's PC |

Secrets are copied on demand from the SCRATCH tab and the clipboard is cleared afterwards:

```
Set-Clipboard $env:DEVICE_SHARED_SECRET   # to paste into the PI AGENT tab
Set-Clipboard $env:OPERATOR_API_TOKEN      # to paste into the console page
Set-Clipboard $null
```
