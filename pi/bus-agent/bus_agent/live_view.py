"""A live view of the Pi camera for the operator (bench version).

The bus agent serves the picture on its own loopback address, behind the start-up code, and only while
somebody is connected. Each frame is drawn with the ramp zone and every detection marked in words and line
styles (never in colour alone) and sent as a multipart JPEG stream. The newest frame is held in memory by
the perception worker only while a viewer is watching. This module has no way to write a file.

This is the bench version: the operator's browser reaches the Pi directly, for example through an SSH
tunnel or on the same network. It is not meant for buses on cellular networks, which a browser cannot
connect to. The intended future path is an on-demand relay through the backend: the operator switches the
view on, the backend authorises it and tells the bus, and the bus connects outward to a relay while
somebody watches. That relay is designed but not built.

A browser image cannot send a header, so the start-up code is a query parameter here (the status page uses
a header). It is never logged.
"""

from __future__ import annotations

import hmac
import io
import json
import logging
import math
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable, Optional, Sequence
from urllib.parse import parse_qs, urlsplit

log = logging.getLogger(__name__)

CAPTION = "LIVE VIEW - NOT RECORDED"
ZONE_LABEL = "RAMP ZONE"
MAX_DRAWN_OBJECTS = 20
MAX_VIEWERS = 2
MAX_SESSION_SECONDS = 600.0  # a view ends by itself after ten minutes; the operator switches it on again
FRAME_INTERVAL_SECONDS = 0.15
SOCKET_TIMEOUT_SECONDS = 10.0
JPEG_QUALITY = 70
DEFAULT_SIZE = (640, 640)
BOUNDARY = "frame"


# ---- what to draw (pure, no imaging library) --------------------------------------------------------


def _finite(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _percent(confidence: object) -> str:
    return f"{round(confidence * 100)}%" if _finite(confidence) else "?%"


def _rect(box: object, width: int, height: int) -> Optional[tuple]:
    """A (centre x, centre y, width, height) box in 0..1 units as a pixel rectangle inside the picture."""
    try:
        cx, cy, w, h = box  # type: ignore[misc]
    except (TypeError, ValueError):
        return None
    if not all(_finite(value) for value in (cx, cy, w, h)) or w <= 0 or h <= 0:
        return None
    x1 = max(0, round((cx - w / 2) * width))
    y1 = max(0, round((cy - h / 2) * height))
    x2 = min(width, round((cx + w / 2) * width))
    y2 = min(height, round((cy + h / 2) * height))
    return (x1, y1, x2, y2) if x2 > x1 and y2 > y1 else None


def overlay_plan(result: object, polygon: Sequence[tuple], width: int, height: int) -> dict:
    """What to draw on one frame, as data. Meaning is carried by words and line styles, not by colour:
    an unsafe or unknown object has a thick box, a safe one a dashed box, and every one has a text label."""
    objects = getattr(result, "objects", None)
    drawn = []
    for item in (objects or ())[:MAX_DRAWN_OBJECTS]:
        safe = getattr(item, "safety", None) == "SAFE"
        where = "IN ZONE" if getattr(item, "in_zone", False) else "outside zone"
        drawn.append(
            {
                "rect": _rect(getattr(item, "box_norm", None), width, height),
                "style": "dashed" if safe else "thick",
                "label": f"{'SAFE' if safe else 'UNSAFE'} {getattr(item, 'class_name', '?')} "
                f"{_percent(getattr(item, 'confidence', None))} - {where}",
            }
        )
    if objects is None:
        reason = getattr(result, "degraded_reason", None) or "unknown"
        notice: Optional[str] = f"NO DETECTIONS AVAILABLE - camera degraded: {reason}"
    elif not objects:
        notice = "nothing detected"
    else:
        notice = None
    extra = len(objects or ()) - MAX_DRAWN_OBJECTS
    return {
        "caption": CAPTION,
        "notice": notice,
        "zone": {
            "points": [(round(x * width), round(y * height)) for x, y in polygon],
            "label": ZONE_LABEL,
            "style": "dashed",
        },
        "objects": drawn,
        "more": f"+{extra} more objects not drawn" if extra > 0 else None,
    }


def frame_size(frame: object) -> tuple:
    shape = getattr(frame, "shape", None)
    if shape is not None and len(shape) >= 2:
        return int(shape[1]), int(shape[0])
    return DEFAULT_SIZE


# ---- drawing (needs Pillow and numpy, which are imported only here) -----------------------------------


def rendering_available() -> bool:
    try:
        import numpy  # noqa: F401, PLC0415
        from PIL import Image, ImageDraw  # noqa: F401, PLC0415
    except ImportError:
        return False
    return True


def _dashed(draw, points, closed: bool, width: int, dash: int = 12, gap: int = 8) -> None:
    corners = list(points) + ([points[0]] if closed and points else [])
    for (x1, y1), (x2, y2) in zip(corners, corners[1:]):
        length = math.hypot(x2 - x1, y2 - y1)
        if length == 0:
            continue
        ux, uy = (x2 - x1) / length, (y2 - y1) / length
        position = 0.0
        while position < length:
            end = min(position + dash, length)
            draw.line([(x1 + ux * position, y1 + uy * position), (x1 + ux * end, y1 + uy * end)], fill="white", width=width)
            position += dash + gap


def fit_x(x: int, text_width: int, picture_width: int) -> int:
    """Where a label starts so that it stays inside the picture instead of being cut off at an edge."""
    return max(0, min(x, picture_width - text_width - 4))


def _text(draw, xy: tuple, text: str, font, picture_width: Optional[int] = None) -> None:
    x, y = xy
    if picture_width is not None:
        x = fit_x(x, round(draw.textlength(text, font=font)) + 4, picture_width)
    draw.text((x, y), text, fill="white", font=font, stroke_width=2, stroke_fill="black")


def render_jpeg(frame: object, plan: dict) -> bytes:
    """The frame with the plan drawn on it, as JPEG bytes in memory. White lines with a black edge and
    outlined white text stay readable on any picture and do not depend on telling colours apart."""
    import numpy  # noqa: PLC0415
    from PIL import Image, ImageDraw, ImageFont  # noqa: PLC0415

    # The Pi camera's RGB888 is stored blue-first, so the channels are flipped for display.
    image = Image.fromarray(numpy.ascontiguousarray(frame[:, :, ::-1]))
    draw = ImageDraw.Draw(image)
    try:
        font = ImageFont.load_default(size=16)
    except TypeError:  # an older Pillow has only its one small font
        font = ImageFont.load_default()

    zone = plan["zone"]
    if zone["points"]:
        _dashed(draw, zone["points"], True, 5)
        x, y = zone["points"][0]
        _text(draw, (x + 6, y + 6), zone["label"], font, image.width)

    for item in plan["objects"]:
        if item["rect"] is None:
            continue
        x1, y1, x2, y2 = item["rect"]
        if item["style"] == "thick":
            draw.rectangle((x1, y1, x2, y2), outline="black", width=9)
            draw.rectangle((x1, y1, x2, y2), outline="white", width=5)
        else:
            _dashed(draw, [(x1, y1), (x2, y1), (x2, y2), (x1, y2)], True, 3)
        _text(draw, (x1 + 4, max(0, y1 - 20)), item["label"], font, image.width)

    lines = [plan["caption"]]
    if plan["notice"]:
        lines.append(plan["notice"])
    lines += [item["label"] for item in plan["objects"] if item["rect"] is None]
    if plan["more"]:
        lines.append(plan["more"])
    for number, line in enumerate(lines):
        _text(draw, (8, 6 + number * 20), line, font)

    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=JPEG_QUALITY)
    return buffer.getvalue()


# ---- the server -------------------------------------------------------------------------------------


class LiveViewServer:
    def __init__(
        self,
        source: object,
        polygon: Sequence[tuple],
        token: str,
        host: str = "127.0.0.1",
        port: int = 8780,
        renderer: Optional[Callable[[object, dict], bytes]] = None,
        frame_interval: float = FRAME_INTERVAL_SECONDS,
        max_viewers: int = MAX_VIEWERS,
        max_session_seconds: float = MAX_SESSION_SECONDS,
    ) -> None:
        self.host = host
        self._source = source
        self._polygon = polygon
        self._token = token
        self._renderer = renderer or render_jpeg
        self._interval = frame_interval
        self._max_viewers = max_viewers
        self._max_session = max_session_seconds
        self._lock = threading.Lock()
        self._viewers = 0
        self._stopping = threading.Event()
        self._httpd = ThreadingHTTPServer((host, port), self._handler())
        self._httpd.daemon_threads = True
        self.port = self._httpd.server_address[1]
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._httpd.serve_forever, name="live-view", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stopping.set()
        self._httpd.shutdown()
        self._httpd.server_close()

    def _admit(self) -> bool:
        with self._lock:
            if self._viewers >= self._max_viewers:
                return False
            self._viewers += 1
        self._source.watch(+1)  # type: ignore[attr-defined]
        log.info("Live view started (%d watching)", self._viewers)
        return True

    def _leave(self) -> None:
        with self._lock:
            self._viewers -= 1
            remaining = self._viewers
        self._source.watch(-1)  # type: ignore[attr-defined]
        log.info("Live view stopped (%d watching)", remaining)

    def _handler(self):
        server = self

        class Handler(BaseHTTPRequestHandler):
            timeout = SOCKET_TIMEOUT_SECONDS  # also drops a viewer that stops reading

            def log_message(self, *args) -> None:  # the code is in the address and must never reach a log
                pass

            def reply(self, status: int, data: dict) -> None:
                body = json.dumps(data).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self) -> None:
                self.close_connection = True
                parts = urlsplit(self.path)
                if parts.path != "/stream":
                    self.reply(404, {"error": "Not found"})
                    return
                supplied = parse_qs(parts.query).get("code", [""])[0]
                if not hmac.compare_digest(supplied.encode(), server._token.encode()):
                    self.reply(403, {"error": "The start-up code is needed."})
                    return
                if not server._admit():
                    self.reply(503, {"error": "Too many viewers; close another live view first."})
                    return
                try:
                    self._stream()
                finally:
                    server._leave()

            def _stream(self) -> None:
                self.send_response(200)
                self.send_header("Content-Type", f"multipart/x-mixed-replace; boundary={BOUNDARY}")
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.send_header("Referrer-Policy", "no-referrer")
                self.end_headers()
                deadline = time.monotonic() + server._max_session
                complained = False
                while time.monotonic() < deadline and not server._stopping.is_set():
                    view = server._source.latest_view()  # type: ignore[attr-defined]
                    if view is not None:
                        frame, result, _ = view
                        try:
                            jpeg = server._renderer(frame, overlay_plan(result, server._polygon, *frame_size(frame)))
                        except Exception as error:  # noqa: BLE001 - one bad frame must not end the view
                            if not complained:
                                log.warning("A live-view frame could not be drawn (%s); skipping it", error)
                                complained = True
                            jpeg = None
                        if jpeg:
                            try:
                                self.wfile.write(
                                    f"--{BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: {len(jpeg)}\r\n\r\n".encode()
                                    + jpeg
                                    + b"\r\n"
                                )
                                self.wfile.flush()
                            except OSError:  # the viewer closed the picture or the connection dropped
                                return
                    time.sleep(server._interval)

        return Handler
