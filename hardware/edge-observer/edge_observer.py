"""Anonymous edge observer for the portable stop demonstrator.

Frames are processed in memory and never transmitted or written to disk. Only
object class, confidence, anonymous rotating token, stop, and time are sent.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import queue
import time
import uuid
from datetime import datetime, timezone
from urllib import request


LABEL_MAP = {
    "wheelchair": ("WHEELCHAIR_DETECTED", ["WHEELCHAIR_RAMP", "EXTENDED_DWELL_TIME"]),
    "walker": ("WALKING_AID_DETECTED", ["EXTENDED_DWELL_TIME"]),
    "walking_aid": ("WALKING_AID_DETECTED", ["EXTENDED_DWELL_TIME"]),
    "stroller": ("STROLLER_DETECTED", ["EXTENDED_DWELL_TIME"]),
    "suitcase": ("LUGGAGE_DETECTED", ["EXTENDED_DWELL_TIME"]),
    "luggage": ("LUGGAGE_DETECTED", ["EXTENDED_DWELL_TIME"]),
}
LIGHT_DEBRIS_LABELS = {"leaf", "leaves", "tissue", "paper_tissue"}


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def signed_headers(
    encoded: bytes,
    device_id: str,
    secret: str | None,
    timestamp_ms: int | None = None,
) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if not secret:
        return headers
    timestamp = str(timestamp_ms if timestamp_ms is not None else int(time.time() * 1000))
    message = device_id.encode() + b"." + timestamp.encode() + b"." + encoded
    headers.update(
        {
            "x-device-id": device_id,
            "x-timestamp": timestamp,
            "x-signature": hmac.new(secret.encode(), message, hashlib.sha256).hexdigest(),
        }
    )
    return headers


class ObservationSender:
    def __init__(
        self,
        backend: str,
        stop: str,
        bus: str | None,
        service: str | None,
        device_id: str,
        device_secret: str | None,
    ):
        self.url = backend.rstrip("/") + "/api/operations/signals"
        self.ramp_obstacle_url = (
            backend.rstrip("/")
            + f"/api/operations/vehicles/{bus}/ramp-obstacle/classification"
            if bus
            else None
        )
        self.stop = stop
        self.bus = bus
        self.service = service
        self.device_id = device_id
        self.device_secret = device_secret
        self.pending: queue.Queue[dict] = queue.Queue(maxsize=100)
        self.ramp_obstacle_pending: queue.Queue[dict] = queue.Queue(maxsize=20)
        self.session = uuid.uuid4().hex[:12]

    def observe(self, label: str, confidence: float) -> None:
        if label.lower() in LIGHT_DEBRIS_LABELS:
            self.observe_light_debris(confidence)
            return
        mapped = LABEL_MAP.get(label.lower())
        if not mapped:
            return
        kind, assistance = mapped
        signal_id = f"EDGE-{uuid.uuid4()}"
        payload = {
            "signalId": signal_id,
            "idempotencyKey": signal_id,
            "source": "CAMERA",
            "kind": kind,
            "stopCode": self.stop,
            "busCandidate": self.bus,
            "busService": self.service,
            "assistanceCandidates": assistance,
            "confidence": round(float(confidence), 4),
            "anonymousToken": f"edge-{self.session}-{int(time.time() // 300)}",
            "confirmed": False,
            "observedAt": iso_now(),
            "metadata": {"modelLabel": label},
        }
        try:
            self.pending.put_nowait(payload)
        except queue.Full:
            self.pending.get_nowait()
            self.pending.put_nowait(payload)

    def observe_light_debris(self, confidence: float) -> None:
        if not self.ramp_obstacle_url:
            return
        payload = {
            "classification": "LIGHT_DEBRIS",
            "confidence": round(float(confidence), 4),
            "observedAt": iso_now(),
        }
        try:
            self.ramp_obstacle_pending.put_nowait(payload)
        except queue.Full:
            self.ramp_obstacle_pending.get_nowait()
            self.ramp_obstacle_pending.put_nowait(payload)

    def flush(self) -> None:
        self._flush_queue(self.url, self.pending)
        if self.ramp_obstacle_url:
            self._flush_queue(self.ramp_obstacle_url, self.ramp_obstacle_pending)

    def _flush_queue(self, url: str, pending: queue.Queue[dict]) -> None:
        if pending.empty():
            return
        payload = pending.queue[0]
        encoded = json.dumps(payload, separators=(",", ":")).encode()
        try:
            response = request.urlopen(
                request.Request(
                    url,
                    data=encoded,
                    headers=signed_headers(
                        encoded,
                        self.device_id,
                        self.device_secret,
                    ),
                ),
                timeout=2,
            )
            if 200 <= response.status < 300:
                pending.get_nowait()
        except OSError:
            pass


def run_camera(args: argparse.Namespace, sender: ObservationSender) -> None:
    try:
        import cv2  # type: ignore
        from ultralytics import YOLO  # type: ignore
    except ImportError as exc:
        raise SystemExit("Install opencv-python and ultralytics, or use --demo-label.") from exc

    model = YOLO(args.model)
    capture = cv2.VideoCapture(args.camera)
    last_sent: dict[str, float] = {}
    try:
        while capture.isOpened():
            ok, frame = capture.read()
            if not ok:
                time.sleep(0.1)
                continue
            # The frame stays in memory for inference only and is immediately discarded.
            for result in model.predict(frame, verbose=False, conf=args.confidence):
                for detected in result.boxes:
                    label = str(model.names[int(detected.cls.item())])
                    confidence = float(detected.conf.item())
                    if (
                        label.lower() in LABEL_MAP or label.lower() in LIGHT_DEBRIS_LABELS
                    ) and time.monotonic() - last_sent.get(label, 0) > args.cooldown:
                        sender.observe(label, confidence)
                        last_sent[label] = time.monotonic()
            sender.flush()
    finally:
        capture.release()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", default="http://localhost:3000")
    parser.add_argument("--stop", default="18331")
    parser.add_argument("--bus", default="DEMO-BUS-01")
    parser.add_argument("--service", default="95")
    parser.add_argument("--device-id", default="EDGE-OBSERVER-01")
    parser.add_argument("--model", default="goassist-objects.pt")
    parser.add_argument("--camera", type=int, default=0)
    parser.add_argument("--confidence", type=float, default=0.65)
    parser.add_argument("--cooldown", type=float, default=15)
    parser.add_argument(
        "--demo-label", choices=sorted(set(LABEL_MAP) | LIGHT_DEBRIS_LABELS)
    )
    args = parser.parse_args()
    sender = ObservationSender(
        args.backend,
        args.stop,
        args.bus,
        args.service,
        args.device_id,
        os.environ.get("GOASSIST_DEVICE_SHARED_SECRET"),
    )
    if args.demo_label:
        sender.observe(args.demo_label, 0.95)
        for _ in range(5):
            sender.flush()
            if sender.pending.empty() and sender.ramp_obstacle_pending.empty():
                break
            time.sleep(0.5)
        return
    run_camera(args, sender)


if __name__ == "__main__":
    main()
