"""Stage 2 helper: reads the real ToF through pi/tof-link's BeamReader.

Run from the repository root on the Pi:  python3 docs/runbooks/hardware-bringup-tools/tof_check.py /dev/ttyACM0
Prints one line per 0.3 s: elapsed, state, distance. Never sends anything to the ESP32, stores nothing.
"""
import sys
import time

sys.path.insert(0, "pi/tof-link")
sys.path.insert(0, "pi/bus-agent")
from beam_reading import BeamReader  # noqa: E402
from bus_agent.sensors_real import open_serial_line_source  # noqa: E402

PORT = sys.argv[1] if len(sys.argv) > 1 else "/dev/ttyACM0"
reader = BeamReader(open_serial_line_source(PORT))


def watch(label: str, seconds: float) -> None:
    print(f"--- {label} ({seconds:.0f} s) ---", flush=True)
    start = time.monotonic()
    while time.monotonic() - start < seconds:
        reading = reader.poll()
        print(f"{time.monotonic() - start:4.1f}s  {reading.state:10s} {reading.distance_mm}", flush=True)
        time.sleep(0.3)


watch("A. before calibration: backstop in place, path EMPTY", 4)
input("Path empty and backstop in place? Press Enter to calibrate: ")
for attempt in range(1, 9):
    try:
        print(f"CALIBRATED reference = {reader.calibrate()} mm (attempt {attempt})", flush=True)
        break
    except ValueError as error:
        print(f"calibration refused (attempt {attempt}): {error}", flush=True)
        watch("waiting for readings", 1.5)
else:
    print("NOT CALIBRATED after 8 attempts", flush=True)
    sys.exit(1)
watch("B. path EMPTY", 5)
input("Press Enter, then put your hand IN the beam at once: ")
watch("C. hand IN the beam", 6)
input("Press Enter, then take your hand OUT at once: ")
watch("D. hand OUT", 6)
input("Press Enter, then REMOVE the backstop (aim at open space) at once: ")
watch("E. backstop removed", 6)
print("done", flush=True)
