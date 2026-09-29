import json
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from http.server import ThreadingHTTPServer
from pi_web_demo import Controller, make_handler


class FakeSerial:
    def __init__(self):
        self.writes = []
        self.incoming = b''
        self.closed = False
    def write(self, data):
        self.writes.append(data)
    def read(self, count):
        data, self.incoming = self.incoming[:count], self.incoming[count:]
        return data
    def close(self):
        self.closed = True


class WebTests(unittest.TestCase):
    def setUp(self):
        self.now = 10.0
        self.serial = FakeSerial()
        self.c = Controller(self.serial, lambda: self.now)

    def test_on_requires_firmware_handshake(self):
        with self.assertRaises(ValueError):
            self.c.command('on')
        self.assertNotIn(b'LASERS ON\n', self.serial.writes)
        self.serial.incoming = b'DEMO,APAS_3_LASER_V1\nLASERS,0\n'
        self.c.service()
        self.c.command('on')
        self.assertEqual(self.serial.writes[-1], b'LASERS ON\n')

    def test_browser_loss_stops_keepalive_and_requests_off(self):
        self.c.ready = True
        self.c.command('on')
        self.c.service()
        self.assertIn(b'KEEPALIVE\n', self.serial.writes)
        self.now += 2.1
        self.c.service()
        self.assertEqual(self.serial.writes[-1], b'LASERS OFF\n')
        self.assertFalse(self.c.wanted)
        self.c.command('heartbeat')
        self.c.service()
        self.assertEqual(self.serial.writes[-1], b'LASERS OFF\n')

    def test_cancel_and_close_request_off(self):
        self.c.ready = True
        self.c.command('on')
        self.c.command('cancel')
        self.assertFalse(self.c.requested)
        self.assertEqual(self.serial.writes[-1], b'LASERS OFF\n')
        self.c.close()
        self.assertTrue(self.serial.closed)

    def test_unknown_does_not_extend_simulated_ramp(self):
        self.c.ready = True
        self.c.beam.reference = 500
        self.c.command('request')
        self.now += .1
        self.c.service()
        self.assertEqual(self.c.fraction, 0)
        self.assertEqual(self.c.state()['status'], 'UNKNOWN')

    def test_api_requires_token_and_delivers_page(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(self.c, 'test-token'))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = 'http://127.0.0.1:' + str(server.server_port)
        try:
            with urlopen(base + '/') as r:
                self.assertIn(b'Boarding-zone control', r.read())
            with self.assertRaises(HTTPError) as ctx:
                urlopen(Request(base + '/api/on', method='POST'))
            self.assertEqual(ctx.exception.code, 403)
            self.assertNotIn(b'LASERS ON\n', self.serial.writes)
            with urlopen(Request(base + '/api/state', headers={'X-Demo-Token':'test-token'})) as r:
                self.assertEqual(json.load(r)['status'], 'UNKNOWN')
            with urlopen(Request(base + '/api/off', headers={'X-Demo-Token':'test-token'}, method='POST')) as r:
                self.assertEqual(r.status, 200)
            self.assertEqual(self.serial.writes[-1], b'LASERS OFF\n')
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == '__main__':
    unittest.main()
