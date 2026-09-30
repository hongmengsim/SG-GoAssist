"""Stage 4 helper: perception with STUB detectors on the real camera.

Run from the repository root on the Pi:  python3 docs/runbooks/hardware-bringup-tools/perception_check.py   (add --fake to test without a camera)
Each scene grabs a few real frames, runs them through the repo's own pipeline (health check,
detector, safe/unsafe policy, ramp-zone overlap) and then through the safety gate, and prints
words only. No detector here looks at the picture: the stubs return fixed detections, so this
proves the plumbing, not any model. The beam is a FIXED "BEAM_CLEAR" input, not the real ToF.
Nothing is saved, written or sent.
"""
import sys
import time

import numpy as np

for path in ("pi/bus-agent", "pi/perception", "pi/safety-gate", "pi/tof-link"):
    sys.path.insert(0, path)
from bus_agent.adapters import camera_input  # noqa: E402
from bus_agent.sensors_real import ModelDetector, RealCamera  # noqa: E402
from perception import RawDetection, StubDetector, analyse  # noqa: E402
from safety_gate import BeamInput, BusContext, decide  # noqa: E402

FAKE = "--fake" in sys.argv
POLYGON = [(0.25, 0.25), (0.75, 0.25), (0.75, 0.75), (0.25, 0.75)]  # the example config's placeholder zone
BEAM = BeamInput("BEAM_CLEAR", 259, False)  # fixed for this test, NOT the real ToF
CONTEXT = BusContext("POSITIONED_AT_STOP", True)


def open_camera() -> RealCamera:
    if FAKE:
        frame = np.random.default_rng(0).integers(40, 200, (640, 640, 3), dtype=np.uint8)
        return RealCamera(lambda: frame)
    from bus_agent.real_mode import _default_camera  # noqa: PLC0415

    return RealCamera(_default_camera(0))


def run(camera: RealCamera, label: str, detector) -> None:
    capture = camera.capture()
    result = analyse(capture.frame, detector, POLYGON)
    decision = decide(camera_input(result, 0.0, False), BEAM, CONTEXT)
    objects = "unavailable (None)" if result.objects is None else [
        f"{o.class_name} {o.safety} in_zone={o.in_zone} conf={o.confidence:.2f}" for o in result.objects
    ]
    print(f"{label}\n   image_ok={result.image_ok} degraded={result.degraded_reason} objects={objects}\n"
          f"   gate: permission={decision.permission} zone={decision.zone_state} reasons={list(decision.reasons)}",
          flush=True)


def broken_runner(frame):
    raise RuntimeError("model could not run")


camera = open_camera()
try:
    print("=== Scene 1: lens UNCOVERED, normal lit scene ===")
    run(camera, "1a. stub returns nothing", StubDetector(()))
    run(camera, "1b. stub returns a person INSIDE the zone", StubDetector([RawDetection("person", 0.9, (0.5, 0.5, 0.2, 0.2))]))
    run(camera, "1c. stub returns a person OUTSIDE the zone", StubDetector([RawDetection("person", 0.9, (0.1, 0.1, 0.1, 0.1))]))
    run(camera, "1d. stub returns a leaf at 0.95 inside the zone", StubDetector([RawDetection("leaf", 0.95, (0.5, 0.5, 0.1, 0.1))]))
    run(camera, "1e. stub returns a leaf at 0.60 inside the zone", StubDetector([RawDetection("leaf", 0.60, (0.5, 0.5, 0.1, 0.1))]))
    run(camera, "1f. model plug-in with a FAKE runner (suitcase, mapped to bag_or_box)",
        ModelDetector(lambda frame: [("suitcase", 0.8, (0.4, 0.4, 0.6, 0.6))]))
    run(camera, "1g. model plug-in with a runner that raises", ModelDetector(broken_runner))
    input("\nCOVER the lens completely FIRST, then press Enter: ")
    time.sleep(1.0)
    print("=== Scene 2: lens COVERED ===")
    run(camera, "2a. stub returns nothing", StubDetector(()))
    run(camera, "2b. stub returns a person INSIDE the zone", StubDetector([RawDetection("person", 0.9, (0.5, 0.5, 0.2, 0.2))]))
    print("done")
finally:
    camera.close()
