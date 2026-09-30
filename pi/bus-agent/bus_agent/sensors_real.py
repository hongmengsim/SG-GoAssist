"""Adapters for the real camera, the real detector and the real ESP32 serial port.

The logic here (fail-safe capture, box conversion, class mapping, opening the port) is tested with
fakes. The parts that touch hardware or heavy libraries (``Picamera2Grabber``, ``OpenCvGrabber``,
``ultralytics_runner``) are deliberately thin, import their libraries only when used, and are
UNVERIFIED until run on a Pi with a camera and a model. Frames stay in memory: nothing here
writes an image anywhere.
"""

from __future__ import annotations

import logging
import time
from typing import Callable, Optional, Sequence

from beam_reading import SerialLineSource
from perception import RawDetection

from .sim_sensors import Capture

log = logging.getLogger(__name__)

DEFAULT_BAUD = 115200

# The pretrained COCO model has no ramp-zone classes; these two are kept under the ramp names.
# Every other name passes through and is judged by the policy (unsafe unless explicitly safe).
_NAME_MAP = {"handbag": "bag_or_box", "suitcase": "bag_or_box"}


class SensorUnavailable(Exception):
    """A sensor could not be opened; in real mode the agent refuses to start."""


def map_class_name(name: str) -> str:
    return _NAME_MAP.get(name, name)


# ---- camera -----------------------------------------------------------------------------------


class RealCamera:
    """Capture source over a ``grab()`` callable. A failed or empty grab is "no frame"."""

    simulated = False

    def __init__(self, grab: Callable[[], object], clock: Callable[[], float] = time.monotonic) -> None:
        self._grab = grab
        self._clock = clock
        self.last_error: Optional[str] = None

    def capture(self) -> Capture:
        try:
            frame = self._grab()
        except Exception as error:  # noqa: BLE001 - any grab failure means "no frame", never a stale one
            message = str(error) or type(error).__name__
            if message != self.last_error:
                log.warning("Camera grab failed: %s", message)
            self.last_error = message
            return Capture(None, self._clock())
        self.last_error = None
        return Capture(frame, self._clock())

    def close(self) -> None:
        close = getattr(self._grab, "close", None)
        if close is not None:
            close()


class Picamera2Grabber:  # pragma: no cover - needs a Pi camera
    """Raspberry Pi camera through picamera2. UNVERIFIED without hardware."""

    def __init__(self, size: tuple = (640, 640)) -> None:
        try:
            from picamera2 import Picamera2  # noqa: PLC0415
        except ImportError as error:
            raise SensorUnavailable("picamera2 is not installed (pip install picamera2 on the Pi)") from error
        self._camera = Picamera2()
        self._camera.configure(self._camera.create_preview_configuration(main={"size": size, "format": "RGB888"}))
        self._camera.start()
        time.sleep(1.0)  # let the sensor settle before the first frame

    def __call__(self) -> object:
        return self._camera.capture_array()

    def close(self) -> None:
        self._camera.stop()


class OpenCvGrabber:  # pragma: no cover - needs a camera
    """A USB or laptop webcam through OpenCV. UNVERIFIED without a camera."""

    def __init__(self, index: int = 0) -> None:
        try:
            import cv2  # noqa: PLC0415
        except ImportError as error:
            raise SensorUnavailable("opencv-python is not installed") from error
        self._capture = cv2.VideoCapture(index)
        if not self._capture.isOpened():
            raise SensorUnavailable(f"camera {index} could not be opened")

    def __call__(self) -> object:
        ok, frame = self._capture.read()
        return frame if ok else None

    def close(self) -> None:
        self._capture.release()


# ---- detector ---------------------------------------------------------------------------------

RunnerOutput = Sequence[tuple]  # (class name, confidence, (x1, y1, x2, y2) in 0..1)


class ModelDetector:
    """Turns a model runner's output into RawDetection. Implements the perception Detector."""

    def __init__(self, runner: Callable[[object], RunnerOutput], min_confidence: float = 0.25) -> None:
        self._runner = runner
        self._min_confidence = min_confidence

    def detect(self, frame: object) -> Sequence[RawDetection]:
        found = []
        for name, confidence, corners in self._runner(frame):
            # A NaN compares false with everything, so it is kept: a broken score must reach the
            # pipeline (which treats it as unsafe), not vanish as if nothing was seen.
            if confidence < self._min_confidence:
                continue
            found.append(RawDetection(map_class_name(str(name)), float(confidence), _centre_box(corners)))
        return found


def _clamp(value: float) -> float:
    # NaN compares false with everything, so it is passed through unchanged: a broken number must
    # stay visibly broken so the pipeline treats the detection as unsafe and in the zone.
    return min(1.0, max(0.0, value)) if value == value else value


def _centre_box(corners: Sequence[float]) -> tuple:
    x1, y1, x2, y2 = (_clamp(float(value)) for value in corners)
    return ((x1 + x2) / 2, (y1 + y2) / 2, x2 - x1, y2 - y1)


def ultralytics_runner(model_path: str, imgsz: int = 640, conf: float = 0.25):  # pragma: no cover
    """A runner over an ultralytics YOLO model (NCNN export on the Pi). UNVERIFIED without a model."""
    try:
        from ultralytics import YOLO  # noqa: PLC0415
    except ImportError as error:
        raise SensorUnavailable("ultralytics is not installed") from error
    model = YOLO(model_path, task="detect")

    def run(frame: object) -> RunnerOutput:
        results = model.predict(frame, imgsz=imgsz, conf=conf, verbose=False)
        if not results or not len(results[0].boxes):
            return []
        boxes = results[0].boxes
        names = getattr(results[0], "names", {})
        return [
            (names.get(int(cls), f"class_{int(cls)}"), float(score), tuple(box))
            for cls, score, box in zip(boxes.cls.tolist(), boxes.conf.tolist(), boxes.xyxyn.tolist())
        ]

    return run


# ---- ESP32 serial -------------------------------------------------------------------------------


def _pyserial_opener(port: str, baud: int, timeout: float):  # pragma: no cover - needs pyserial
    try:
        import serial  # noqa: PLC0415
    except ImportError as error:
        raise SensorUnavailable("pyserial is not installed") from error
    # A write that cannot finish (a stuck cable) gives up quickly instead of holding up the safety loop.
    return serial.Serial(port, baud, timeout=timeout, write_timeout=0.2)


def open_serial_line_source(port: str, baud: int = DEFAULT_BAUD, opener: Callable = _pyserial_opener) -> SerialLineSource:
    """Opens the ESP32's serial port. Reads never block. The only thing ever written is one of the two
    marker-laser commands, through ``SerialLineSource.send``."""
    try:
        connection = opener(port, baud, 0)
    except SensorUnavailable:
        raise
    except Exception as error:  # noqa: BLE001 - report any open failure with the port name
        raise SensorUnavailable(f"cannot open serial port {port}: {error}") from error
    return SerialLineSource(connection)
