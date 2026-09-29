#!/usr/bin/env python3
"""Headless APAS control screen. Browser UI; no DISPLAY/Tk dependency."""
import argparse
import hmac
import json
from pathlib import Path
import secrets
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from demo_state import BeamState


class Controller:
    def __init__(self, port, clock=time.monotonic):
        self.port = port
        self.clock = clock
        self.lock = threading.RLock()
        self.beam = BeamState()
        self.buffer = b''
        self.ready = False
        self.wanted = False
        self.confirmed = False
        self.requested = False
        self.fraction = 0.0
        self.last_web = self.last_ping = self.last_status = -100.0
        self.last_tick = clock()
        self.info = 'Waiting for ESP32 firmware. Keep laser power off until aimed.'

    def send(self, command):
        try:
            self.port.write((command + '\n').encode('ascii'))
        except Exception:
            self.ready = self.wanted = self.confirmed = self.requested = False
            self.fraction = 0
            self.beam.invalidate()
            self.beam.reference = None
            raise

    def command(self, action):
        with self.lock:
            now = self.clock()
            if action == 'heartbeat':
                self.last_web = now
                return
            if action in ('off', 'cancel'):
                self.wanted = self.requested = False
                self.fraction = 0
                self.send('LASERS OFF')
                self.info = 'OFF requested. Ramp graphic reset; no physical ramp moved.'
                return
            if action not in ('on', 'request', 'reference'):
                raise ValueError('Unknown command.')
            if not self.ready:
                raise ValueError('Waiting for three-laser firmware. Check the USB port and close other serial apps.')
            if action == 'reference':
                if self.requested:
                    raise ValueError('Cancel the request before setting a reference.')
                value = self.beam.calibrate(now)
                self.fraction = 0
                self.info = f'Empty-path reference set: {value:.0f} mm.'
            else:
                if action == 'request' and self.beam.reference is None:
                    raise ValueError('Set the empty-path reference first.')
                self.last_web = now
                self.send('LASERS ON')
                self.wanted = True
                if action == 'request':
                    self.requested = True
                    self.info = 'Request active. Only the on-screen ramp can move.'
                else:
                    self.info = 'Manual laser ON requested. Watch the physical line outputs.'

    def service(self):
        with self.lock:
            now = self.clock()
            dt = max(0, min(now - self.last_tick, .1))
            self.last_tick = now
            self.buffer += self.port.read(4096)
            if len(self.buffer) > 8192:
                self.buffer = b''
                self.beam.invalidate()
            while b'\n' in self.buffer:
                raw, self.buffer = self.buffer.split(b'\n', 1)
                line = raw.decode('ascii', errors='replace').strip()
                if line == 'DEMO,APAS_3_LASER_V1':
                    self.ready = True
                elif line.startswith('LASERS,'):
                    self.confirmed = line == 'LASERS,1'
                elif line.startswith('LASER_TIMEOUT:'):
                    self.wanted = self.confirmed = False
                elif line.startswith('APAS demo'):
                    self.ready = self.wanted = self.confirmed = self.requested = False
                    self.fraction = 0
                    self.beam.reference = None
                self.beam.accept(line, now)
            if self.wanted and now - self.last_web > 2:
                self.wanted = self.requested = False
                self.send('LASERS OFF')
                self.info = 'Browser heartbeat lost: OFF requested; simulation paused.'
            if not self.ready and now - self.last_status > 1:
                self.send('STATUS')
                self.last_status = now
            if self.wanted and now - self.last_ping > .5:
                self.send('KEEPALIVE')
                self.last_ping = now
            if self.requested and self.beam.check(now) == 'BEAM CLEAR':
                self.fraction = min(1.0, self.fraction + dt / 4)

    def state(self):
        with self.lock:
            now = self.clock()
            status = self.beam.check(now)
            fresh = self.beam.updated is not None and now - self.beam.updated <= 1
            return dict(ready=self.ready, status=status, mm=self.beam.mm if fresh else None,
                        reference=self.beam.reference, lasers=self.confirmed,
                        requested=self.requested, fraction=self.fraction, info=self.info)

    def fail(self, error):
        with self.lock:
            self.ready = self.wanted = self.confirmed = self.requested = False
            self.beam.invalidate()
            self.beam.reference = None
            self.info = f'Serial error: {error}. Stop this program, check USB, then restart.'

    def close(self):
        with self.lock:
            self.wanted = self.requested = False
            try:
                self.send('LASERS OFF')
            finally:
                self.port.close()


def make_handler(controller, token):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def reply(self, status, data, content_type='application/json'):
            body = data if isinstance(data, bytes) else json.dumps(data).encode()
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('X-Frame-Options', 'DENY')
            self.end_headers()
            self.wfile.write(body)

        def authorized(self):
            supplied = self.headers.get('X-Demo-Token', '')
            return hmac.compare_digest(supplied.encode(), token.encode())

        def do_GET(self):
            if self.path == '/':
                self.reply(200, Path(__file__).with_name('web_demo.html').read_bytes(), 'text/html; charset=utf-8')
            elif self.path == '/api/state':
                if not self.authorized():
                    self.reply(403, {'error': 'Open the complete link printed by the Pi, including # and its code.'})
                else:
                    self.reply(200, controller.state())
            else:
                self.reply(404, {'error': 'Not found'})

        def do_POST(self):
            if not self.authorized():
                self.reply(403, {'error': 'Missing/incorrect control code. Use the full startup link.'})
                return
            action = self.path.removeprefix('/api/')
            if self.path != '/api/' + action or action not in ('heartbeat','on','off','cancel','request','reference'):
                self.reply(404, {'error': 'Not found'})
                return
            try:
                controller.command(action)
                self.reply(200, controller.state())
            except ValueError as exc:
                self.reply(409, {'error': str(exc)})
            except Exception as exc:
                controller.fail(exc)
                self.reply(503, {'error': 'Serial communication failed; check USB and restart the server.'})
    return Handler


def main():
    import serial
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--port', required=True, help='ESP32 serial port, e.g. /dev/ttyUSB0')
    ap.add_argument('--listen', default='0.0.0.0', help='LAN by default; use 127.0.0.1 with an SSH tunnel')
    ap.add_argument('--http-port', type=int, default=8765)
    args = ap.parse_args()
    device = serial.Serial()
    device.port = args.port
    device.baudrate = 115200
    device.timeout = 0
    device.write_timeout = .2
    device.dtr = device.rts = False
    try:
        device.open()
    except serial.SerialException as exc:
        ap.exit(1, f'Cannot open {args.port}: {exc}\nClose Serial Monitor/other demo apps and check serial permissions.\n')
    controller = Controller(device)
    stop = threading.Event()
    token = secrets.token_hex(16)
    try:
        server = ThreadingHTTPServer((args.listen, args.http_port), make_handler(controller, token))
    except OSError as exc:
        controller.close()
        ap.exit(1, f'Cannot start web server: {exc}\n')

    def worker():
        while not stop.wait(.05):
            try:
                controller.service()
            except Exception as exc:
                controller.fail(exc)
                break

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    print('\nAPAS browser control screen (no desktop/display required).', flush=True)
    print(f'On this machine: http://localhost:{args.http_port}/#{token}', flush=True)
    print(f'From another computer: http://{socket.gethostname()}.local:{args.http_port}/#{token}', flush=True)
    print('If the hostname does not resolve, use the Pi IP from: hostname -I', flush=True)
    print('Keep the #code in the URL. Use your trusted local network; do not expose this port to the internet.', flush=True)
    print('Keep this terminal running. Ctrl+C stops the demo and requests lasers OFF.\n', flush=True)
    try:
        server.serve_forever(poll_interval=.2)
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        thread.join(timeout=2)
        server.server_close()
        try:
            controller.close()
        except Exception:
            pass


if __name__ == '__main__':
    main()
