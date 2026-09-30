"""Stage 3 helper: camera capture health on the real camera.

Run from the repository root on the Pi:  python3 docs/runbooks/hardware-bringup-tools/camera_check.py
Opens the camera the same way the agent does, grabs frames for a few seconds per scene and prints
only summary numbers (frame count, rate, shape, mean, std, health verdict). It never saves,
writes or sends an image.
"""
import sys
import time

import numpy as np

sys.path.insert(0, "pi/bus-agent")
sys.path.insert(0, "pi/perception")
from bus_agent.real_mode import _default_camera  # noqa: E402
from bus_agent.sensors_real import RealCamera  # noqa: E402
from perception.health import check_image_health  # noqa: E402

camera = RealCamera(_default_camera(0))


def scene(label: str, seconds: float = 4.0) -> None:
    print(f"--- {label} ({seconds:.0f} s) ---", flush=True)
    start = time.monotonic()
    frames = 0
    verdicts: dict = {}
    last = None
    means: list = []
    stds: list = []
    p95s: list = []
    brights: list = []
    while time.monotonic() - start < seconds:
        capture = camera.capture()
        frame = capture.frame if hasattr(capture, "frame") else capture[0]
        ok, reason = check_image_health(frame)
        key = "healthy" if ok else reason
        verdicts[key] = verdicts.get(key, 0) + 1
        if frame is not None:
            frames += 1
            last = frame
            means.append(float(frame.mean()))
            stds.append(float(frame.std()))
            p95s.append(float(np.percentile(frame, 95)))
            brights.append(float((frame > 128).mean()))
        time.sleep(0.1)
    elapsed = time.monotonic() - start
    if last is not None:
        print(f"frames={frames} rate={frames / elapsed:.1f}/s shape={tuple(last.shape)} "
              f"mean min/max={min(means):.1f}/{max(means):.1f} std min/max={min(stds):.1f}/{max(stds):.1f}", flush=True)
        print(f"p95 brightness min/max={min(p95s):.0f}/{max(p95s):.0f} "
              f"fraction of pixels above 128 min/max={min(brights):.3f}/{max(brights):.3f}", flush=True)
    else:
        print(f"frames=0 last_error={camera.last_error}", flush=True)
    print(f"verdicts={verdicts}", flush=True)


try:
    scene("A. normal scene, lens uncovered")
    input("COVER the lens completely with an opaque cap or thick tape FIRST, then press Enter: ")
    scene("B. lens covered")
    input("UNCOVER the lens and point it at a normal lit scene FIRST, then press Enter: ")
    scene("C. uncovered again")
    input("Make it DARK first (lights off AND the lens covered), then press Enter: ")
    scene("D. dark")
    print("done. Not tested here: overexposure (shine a torch into the lens only if you choose to).")
finally:
    camera.close()
