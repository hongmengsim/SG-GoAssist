# Hardware bring-up (Pi #1, ESP32, ToF, camera)

**Nothing in this runbook has been run on hardware yet.** It is the order in which to bring the real parts in, one at a time, with a check and a fallback at each step. Everything before step 1 already runs on a laptop (`docs/runbooks/run-everything-on-one-laptop.md`).

Rules that hold throughout: the ramp stays simulated; camera frames are never stored; secrets go in the environment (`DEVICE_SHARED_SECRET`, `OPERATOR_API_TOKEN`), never in a file; the Pi's clock must be right (signatures allow 60 seconds); if a step fails, go back to `--simulate`.

## 0. Before you touch the Pi

- Backend host chosen and reachable from the Pi's network (a laptop is fine). Start it with `GOASSIST_AUTO_ACK=off` and `DEVICE_SHARED_SECRET` set.
- Decisions made by CE2 on 1 Oct 2026: the backend runs on a separate computer that installs it from GitHub (`npm install`, `npm run build`, start; see `backend/README.md`); Pi #1 is Bus 1 (`AV-095-01`) with the real sensors; Pi #2 is Bus 2 (`AV-095-02`) and stays simulated (`--simulate`) but sends live, signed traffic to the backend over the network; the timeouts in `agent.example.json` are 30 s (deployment) and 10 s (link loss).
- Time synchronised on both machines (`timedatectl` on the Pi).
- Copy the repository to the Pi intact (the agent finds `pi/tof-link`, `pi/perception` and `pi/safety-gate` by path). `pip install -r pi/bus-agent/requirements.txt`; on the Pi also `pyserial`, `picamera2`, `ultralytics` (or `opencv-python` for a USB camera).
- Copy `pi/bus-agent/agent.example.json` to `agent.json` and set `busId`, `busService`, `backendUrl`. Leave `serialPort`, `cameraIndex` and `modelPath` for later steps.

## 1. The agent on the Pi, still simulated

```
export DEVICE_SHARED_SECRET=...            # same value as the backend
python -m bus_agent --simulate --bus-id AV-095-01 --backend http://<backend>:3000 --status-port 8770
```

Check: the console (`?mode=live`) shows the bus; the status page link (with its `#code`) opens; `arrive 18331` and a request from the app behave as in the laptop runbook. This proves the Pi, the network, the secret and the clock. Fallback: none needed, nothing real is involved.

## 2. The ESP32 and ToF beam (real distance, simulated camera)

1. Flash the sketch from `firmware/apas-tof-lasers/` (see its README) and plug the ESP32 into the Pi. Note the port (`ls /dev/serial/by-id/`), and add your user to the `dialout` group if it cannot be opened.
2. With the teammate's demo first (`pi/tof-link/pi_web_demo.py --port ...`), confirm readings and how the lasers and keepalive work. **Open question to settle here:** whether distance readings need the handshake and keepalive (the agent's `SerialLineSource` is read-only and sends nothing). If they do, a small writer is needed.
3. Set `serialPort` in `agent.json`. The agent refuses to start with any configured sensor it cannot open, and prints every problem at once.
4. Start with the path empty and the backstop in place, then run **`calibrate`** on the agent's console. The beam is never calibrated automatically: an operator confirms the path is empty. Until then the gate halts with "ToF not calibrated".

Checks (write down what you see): hand in the beam gives `BLOCKED` and the gate halts; hand out gives `CHECKING` then `BEAM_CLEAR`; unplugging the ESP32 gives `UNKNOWN` within about a second and halts; a reading far from the reference (backstop missing) is `UNKNOWN`.

Record what you saw for reuse: add `--record recordings/tof-01` (real mode) to keep the ESP32 lines and perception results, never frames. Later `--replay recordings/tof-01` replays them with no hardware, and every report from a replay says it is not live.

## 3. The camera, health only

Set `cameraIndex`. Confirm frames arrive and the image-health check reads sensibly on real frames: a normal scene is healthy; a covered lens reads `low_contrast_or_blocked`; darkness reads `too_dark`; glare reads `overexposed`. The health thresholds in `pi/perception/perception/health.py` are placeholders from phone footage and must be re-tuned here. Note the values you settle on.

Without a model the detector cannot run, so `objects` is unavailable and the gate correctly halts (camera degraded). That is expected until step 4.

## 4. The model

1. Put the exported model on the Pi and set `modelPath` and `minDetectionConfidence`. The pretrained COCO model cannot see wheelchairs, strollers or boxes; only the beam guards against those until a fine-tuned model exists.
2. Measure frames per second and latency on the Pi (the loop reads the newest result from a worker thread, so a slow model shows up as an ageing result and a halt, not a stall).
3. Measure the ramp polygon on the real camera view and set `rampPolygon`. Aim the beam at the same ground.

## 5. Real Bus 1, end to end

```
python -m bus_agent --real --config agent.json --status-port 8770 --record recordings/run-01
```

With the backend and console running, walk the same scenario as `npm run e2e:scenario` by hand, for real: request from the app, bus acknowledges, hand in the beam (halts), object in the zone (halts), unplug the ESP32 (halts), cover the camera (halts), clear each and confirm the ramp resumes. Note the time from an object appearing to the halt showing in the console, and from a request to the bus's acknowledgement.

Keep for the report: what was real and what was simulated in each run (the reports already say), the numbers above, and the recordings.

## If something is wrong

- **Refuses to start:** read the listed problems; it names each sensor and why.
- **Gate halts and you don't know why:** the status page lists each reason in words.
- **Console shows "Backend unreachable":** check the URL, the secret, the clock.
- **Anything unsafe-looking:** stop the agent; the ramp is simulated, but treat the habits as if it were not.
