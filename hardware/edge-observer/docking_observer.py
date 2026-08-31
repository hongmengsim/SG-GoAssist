"""ArUco + ToF precision-docking observer for the tabletop bus.

Camera frames are processed in memory only. The backend receives numeric pose,
distance, confidence, marker identity, and timestamp data—never an image.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib import request

from edge_observer import signed_headers


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def yaw_degrees_from_rotation(rotation: list[list[float]]) -> float:
    """Return marker yaw around the camera's vertical axis."""
    return math.degrees(math.atan2(rotation[0][2], rotation[2][2]))


def read_tof(path: Path | None, maximum_age_seconds: float = 1.5) -> tuple[bool, int | None]:
    if path is None or not path.is_file():
        return False, None
    if time.time() - path.stat().st_mtime > maximum_age_seconds:
        return False, None
    try:
        value = int(path.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return False, None
    return (True, value) if 20 <= value <= 10_000 else (False, None)


def post_observation(
    backend: str,
    bus_id: str,
    device_id: str,
    secret: str | None,
    payload: dict[str, object],
) -> None:
    encoded = json.dumps(payload, separators=(",", ":")).encode()
    url = backend.rstrip("/") + f"/api/operations/vehicles/{bus_id}/autonomy/docking"
    response = request.urlopen(
        request.Request(url, data=encoded, headers=signed_headers(encoded, device_id, secret)),
        timeout=2,
    )
    if not 200 <= response.status < 300:
        raise OSError(f"Backend returned {response.status}")


def run_camera(args: argparse.Namespace) -> None:
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
    except ImportError as exc:
        raise SystemExit("Install opencv-contrib-python and numpy for docking detection") from exc

    calibration = json.loads(args.calibration.read_text(encoding="utf-8"))
    camera_matrix = np.array(calibration["cameraMatrix"], dtype=np.float64)
    distortion = np.array(calibration["distortionCoefficients"], dtype=np.float64)
    half = args.marker_size_mm / 2000.0
    object_points = np.array(
        [[-half, half, 0], [half, half, 0], [half, -half, 0], [-half, -half, 0]],
        dtype=np.float32,
    )
    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_1000)
    parameters = cv2.aruco.DetectorParameters()
    detector = cv2.aruco.ArucoDetector(dictionary, parameters) if hasattr(cv2.aruco, "ArucoDetector") else None
    capture = cv2.VideoCapture(args.camera)
    last_sent = 0.0

    try:
        while capture.isOpened():
            ok, frame = capture.read()
            if not ok:
                time.sleep(0.05)
                continue
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            if detector:
                corners, ids, _ = detector.detectMarkers(gray)
            else:
                corners, ids, _ = cv2.aruco.detectMarkers(gray, dictionary, parameters=parameters)
            marker_index = None
            if ids is not None:
                flattened = [int(value) for value in ids.flatten()]
                if args.marker_id in flattened:
                    marker_index = flattened.index(args.marker_id)

            if time.monotonic() - last_sent < args.interval:
                continue
            tof_healthy, tof_distance = read_tof(args.tof_file)
            payload: dict[str, object] = {
                "stopCode": args.stop,
                "markerId": args.marker_id,
                "markerDetected": False,
                "tofHealthy": tof_healthy,
                "confidence": 0.0,
                "observedAt": iso_now(),
            }
            if tof_distance is not None:
                payload["tofDistanceMm"] = tof_distance

            if marker_index is not None:
                image_points = np.asarray(corners[marker_index], dtype=np.float32).reshape(4, 2)
                solved, rotation_vector, translation = cv2.solvePnP(
                    object_points,
                    image_points,
                    camera_matrix,
                    distortion,
                    flags=cv2.SOLVEPNP_IPPE_SQUARE,
                )
                if solved:
                    rotation_matrix, _ = cv2.Rodrigues(rotation_vector)
                    range_mm = float(np.linalg.norm(translation) * 1000.0)
                    lateral_mm = float(translation.reshape(3)[0] * 1000.0)
                    area = abs(float(cv2.contourArea(image_points)))
                    frame_area = float(frame.shape[0] * frame.shape[1])
                    confidence = min(0.99, 0.82 + 3.0 * area / max(frame_area, 1.0))
                    payload.update(
                        {
                            "markerDetected": True,
                            "markerRangeMm": round(range_mm, 1),
                            "lateralOffsetMm": round(lateral_mm, 1),
                            "headingErrorDegrees": round(
                                yaw_degrees_from_rotation(rotation_matrix.tolist()), 2
                            ),
                            "confidence": round(confidence, 3),
                        }
                    )

            try:
                post_observation(
                    args.backend,
                    args.bus,
                    args.device_id,
                    os.environ.get("GOASSIST_DEVICE_SHARED_SECRET"),
                    payload,
                )
            except OSError:
                pass
            last_sent = time.monotonic()
    finally:
        capture.release()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", default="http://localhost:3000")
    parser.add_argument("--bus", default="AV-DEMO")
    parser.add_argument("--stop", default="18331")
    parser.add_argument("--device-id", default="DOCKING-OBSERVER-01")
    parser.add_argument("--marker-id", type=int, default=18331)
    parser.add_argument("--marker-size-mm", type=float, default=120.0)
    parser.add_argument("--camera", type=int, default=0)
    parser.add_argument("--calibration", type=Path, default=Path("camera-calibration.json"))
    parser.add_argument("--tof-file", type=Path)
    parser.add_argument("--interval", type=float, default=0.2)
    parser.add_argument("--demo", action="store_true")
    args = parser.parse_args()

    if args.demo:
        payload = {
            "stopCode": args.stop,
            "markerId": args.marker_id,
            "markerDetected": True,
            "markerRangeMm": 610,
            "lateralOffsetMm": 20,
            "headingErrorDegrees": 1,
            "tofDistanceMm": 600,
            "tofHealthy": True,
            "confidence": 0.97,
            "observedAt": iso_now(),
        }
        post_observation(
            args.backend,
            args.bus,
            args.device_id,
            os.environ.get("GOASSIST_DEVICE_SHARED_SECRET"),
            payload,
        )
        return
    if not args.calibration.is_file():
        raise SystemExit(f"Camera calibration not found: {args.calibration}")
    run_camera(args)


if __name__ == "__main__":
    main()
