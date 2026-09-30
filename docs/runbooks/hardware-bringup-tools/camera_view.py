"""Stage 3 helper: a LIVE camera view for the operator, never recorded.

Run from the repository root on the Pi:  python3 docs/runbooks/hardware-bringup-tools/camera_view.py
Then, on your computer:  ssh -L 8780:127.0.0.1:8780 pi@goassist-pi1.local
and open http://127.0.0.1:8780/ in a browser.

Frames live only in memory (the newest one). Nothing is written to disk. The server listens on
the Pi's own loopback address only, so it is not reachable from the network without the tunnel.
The page shows the health verdict in words with a shape mark and a border style, never colour alone.
"""
import io
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

sys.path.insert(0, "pi/bus-agent")
sys.path.insert(0, "pi/perception")
from bus_agent.sensors_real import RealCamera  # noqa: E402
from perception.health import check_image_health  # noqa: E402

PORT = 8780
FAKE = "--fake" in sys.argv  # test only: a synthetic gradient instead of the camera

_lock = threading.Lock()
_latest = {"jpeg": None, "stats": {"verdict": "no frame yet", "healthy": False}}
_stop = threading.Event()


def _encoder():
    try:
        from PIL import Image  # noqa: PLC0415

        def encode(frame):
            buffer = io.BytesIO()
            Image.fromarray(np.ascontiguousarray(frame[:, :, ::-1])).save(buffer, "JPEG", quality=70)
            return buffer.getvalue()

        return encode
    except ImportError:
        import cv2  # noqa: PLC0415

        return lambda frame: cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])[1].tobytes()


def _fake_grabber():
    ramp = np.tile(np.linspace(0, 255, 640, dtype=np.uint8), (640, 1))
    return lambda: np.stack([ramp, ramp[::-1], ramp], axis=2)


def _grab_loop(camera, encode):
    while not _stop.is_set():
        capture = camera.capture()
        frame = capture.frame
        ok, reason = check_image_health(frame)
        stats = {"healthy": ok, "verdict": "healthy" if ok else reason, "at": time.time()}
        jpeg = None
        if frame is not None:
            stats.update(mean=round(float(frame.mean()), 1), std=round(float(frame.std()), 1),
                         p95=round(float(np.percentile(frame, 95)), 0))
            jpeg = encode(frame)
        with _lock:
            _latest["jpeg"], _latest["stats"] = jpeg, stats
        time.sleep(0.1)


PAGE = b"""<!doctype html><meta charset=utf-8><title>Camera live view</title>
<style>body{font:16px system-ui;margin:16px}#box{display:inline-block;padding:8px 12px;margin:8px 0;
border:4px solid #000}.ok{border-style:solid}.bad{border-style:dashed}img{display:block;max-width:100%;
border:1px solid #000}</style>
<h1>Camera live view (not recorded)</h1><div id=box class=bad>waiting...</div>
<img src=/stream alt="live camera view">
<script>async function t(){try{const s=await(await fetch('/stats')).json();const b=document.getElementById('box');
b.className=s.healthy?'ok':'bad';b.textContent=(s.healthy?'\\u25A0 HEALTHY':'\\u25B2 NOT HEALTHY: '+s.verdict)+
(s.mean===undefined?'':'   mean '+s.mean+'  std '+s.std+'  p95 '+s.p95)}catch(e){}setTimeout(t,500)}t()</script>"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # keep the console quiet
        pass

    def do_GET(self):
        if self.path == "/":
            self._send(200, "text/html; charset=utf-8", PAGE)
        elif self.path == "/stats":
            with _lock:
                body = json.dumps(_latest["stats"]).encode()
            self._send(200, "application/json", body)
        elif self.path == "/stream":
            self._stream()
        else:
            self._send(404, "text/plain", b"not found")

    def _send(self, code, kind, body):
        self.send_response(code)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _stream(self):
        self.send_response(200)
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            while not _stop.is_set():
                with _lock:
                    jpeg = _latest["jpeg"]
                if jpeg:
                    self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
                                     + str(len(jpeg)).encode() + b"\r\n\r\n" + jpeg + b"\r\n")
                time.sleep(0.12)
        except (BrokenPipeError, ConnectionResetError):
            return


def main():
    if FAKE:
        camera = RealCamera(_fake_grabber())
    else:
        from bus_agent.real_mode import _default_camera  # noqa: PLC0415

        camera = RealCamera(_default_camera(0))
    threading.Thread(target=_grab_loop, args=(camera, _encoder()), daemon=True).start()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Live view on 127.0.0.1:{PORT} (Pi only). Not recorded. Ctrl+C to stop.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        _stop.set()
        server.server_close()
        camera.close()


main()
