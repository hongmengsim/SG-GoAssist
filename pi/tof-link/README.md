# pi/tof-link

## Purpose

The Raspberry Pi side of the time-of-flight (ToF) sensor. It reads the ESP32-S3 over USB serial, decides whether the monitored beam is clear, and drives a demo screen with a **simulated** ramp. The code is your teammate's implementation, moved here unchanged on 30 Sep 2026; per the ownership ruling it is followed as-is.

Limits stated by the demo itself: one narrow beam, so `BEAM CLEAR` describes only that beam's direction and never proves the whole area is clear. There is no camera use, no backend integration and no physical ramp.

## Interface

- **Serial input** (115200 baud): lines `time_ms,sensor,distance_mm,status` where sensor is `VL53L0X` or `VL53L1X` and status `VALID`; handshake `DEMO,APAS_3_LASER_V1`; commands `LASERS ON`, `LASERS OFF`, `KEEPALIVE`, `STATUS`; the firmware turns the lasers off after about 2 s without a keepalive.
- **`demo_state.BeamState`**: `accept(line, now)`, `calibrate(now)`, `check(now, margin=30)`, `invalidate()`. States: `BEAM CLEAR` (three consecutive reference-like readings), `BLOCKED` (reading closer than the reference by more than the margin), `CHECKING`, `UNCALIBRATED`, `UNKNOWN` (stale over 1 s, invalid or off-reference). Calibration needs 10 fresh valid readings and an empty path.
- **`beam_reading.py`** (added for integration; the demo code above is unchanged): `BeamReader(source, clock, simulated).poll()` returns an immutable `BeamReading(state, distance_mm, simulated)` with the state named as in `contracts/` (`BEAM CLEAR` becomes `BEAM_CLEAR`); missing, stale, invalid or unrecognised data is `UNKNOWN` with no distance. Sources: `SerialLineSource(port)` for a pyserial-like port (reads; the only thing it can send is the two marker-laser commands `LASERS ON` and `LASERS OFF`, through `send`, and anything else is refused), `FakeLineSource` for tests, and `SimulatedBeamSource` (blockable, with a dropout switch) for the agent's simulate mode, whose readings must be labelled simulated.
- **`pi_web_demo.py`**: browser control screen (default port 8765, guarded by a start-up control code). `GET /api/state`, `POST /api/{heartbeat,on,off,cancel,request,reference}`.
- **`pi_demo.py`**: desktop version (needs Tk and a display).

## Run it alone

Needs the ESP32 sketch in `firmware/apas-tof-lasers/` flashed and plugged into the Pi. No backend, camera or other module:

```bash
python3 -m pip install -r requirements.txt
python3 pi_web_demo.py --port /dev/ttyUSB0
```

Full wiring, flashing and demo instructions: `firmware/apas-tof-lasers/README.md`.

## Test

```bash
python3 -m unittest        # from this folder; uses a fake serial port, no hardware
```

Verified 30 Sep 2026: the 10 original tests pass, before and after the move. 18 more tests cover `beam_reading.py` (28 in total); they use fake and simulated sources, so no hardware is involved.

## Depends on

Runtime: `pyserial`; `tkinter` only for `pi_demo.py`. No other repo module. `pi/bus-agent` consumes `BeamReading` through `beam_reading.py` rather than reaching into the demo scripts. `beam_reading.py` imports `demo_state` only.
