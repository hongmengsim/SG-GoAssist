"""The agent's local status page: a snapshot, a small guarded HTTP server, and controls."""

import json
import queue
import unittest
import urllib.error
import urllib.request

from bus_agent.status_page import StatusBoard, StatusServer, parse_control, snapshot
from tests.test_agent import STOP, World

TOKEN = "0123456789abcdef0123456789abcdef"


def ready_world():
    world = World()
    world.positioned_with_request()
    return world


class SnapshotTests(unittest.TestCase):
    def test_it_reports_movement_ramp_decision_beam_and_camera_in_words(self) -> None:
        world = ready_world()
        data = snapshot(world.agent, world.beam.poll(), controls=True)
        self.assertEqual("AV-095-01", data["busId"])
        self.assertTrue(data["simulated"])
        self.assertEqual("POSITIONED_AT_STOP", data["movement"]["code"])
        self.assertEqual("Positioned at stop", data["movement"]["text"])
        self.assertEqual("STOWED", data["ramp"]["state"])
        self.assertEqual("CONTINUE", data["decision"]["permission"])
        self.assertEqual([], data["decision"]["reasons"])
        self.assertEqual("BEAM_CLEAR", data["beam"]["state"])
        self.assertTrue(data["camera"]["imageOk"])
        self.assertEqual(1, data["acceptedRequests"])
        self.assertTrue(data["controls"])

    def test_halt_reasons_come_with_words(self) -> None:
        world = ready_world()
        world.camera.place("person")
        world.tick()
        data = snapshot(world.agent, world.beam.poll(), controls=False)
        self.assertEqual("HALT", data["decision"]["permission"])
        reasons = {item["code"]: item["text"] for item in data["decision"]["reasons"]}
        self.assertEqual("Object in the ramp zone", reasons["OBJECT_IN_ZONE"])
        self.assertEqual("person", data["decision"]["objectsInZone"][0]["className"])
        self.assertFalse(data["controls"])

    def test_before_the_first_tick_there_is_no_decision_yet(self) -> None:
        world = ready_world()
        world.agent.last_decision = None
        data = snapshot(world.agent, None, controls=False)
        self.assertIsNone(data["decision"])
        self.assertIsNone(data["beam"])

    def test_it_says_whether_the_backend_link_is_working(self) -> None:
        world = ready_world()
        self.assertTrue(snapshot(world.agent, None, controls=False)["link"]["ok"])
        world.backend.fail_all = True
        world.camera.place("person")
        world.tick(2)
        link = snapshot(world.agent, None, controls=False)["link"]
        self.assertFalse(link["ok"])
        self.assertIn("unreachable", link["error"])

    def test_it_never_carries_image_data(self) -> None:
        text = json.dumps(snapshot(ready_world().agent, None, controls=True)).lower()
        for word in ("frame", "jpeg", "png", "base64", "pixels"):
            self.assertNotIn(word, text)


class ControlParsingTests(unittest.TestCase):
    def test_valid_controls_become_console_commands(self) -> None:
        cases = [
            ({"command": "arrive", "value": STOP}, f"arrive {STOP}"),
            ({"command": "depart"}, "depart"),
            ({"command": "place", "value": "person"}, "place person 0.9"),
            ({"command": "clear"}, "clear"),
            ({"command": "block", "value": "on"}, "block on"),
            ({"command": "dropout", "value": "off"}, "dropout off"),
            ({"command": "cover", "value": "on"}, "cover on"),
            ({"command": "halt", "value": "on"}, "halt on"),
        ]
        for body, line in cases:
            with self.subTest(body=body):
                self.assertEqual(line, parse_control(body))

    def test_anything_else_is_refused(self) -> None:
        bad = [
            None, [], "arrive 1", {}, {"command": 5},
            {"command": "shell"}, {"command": "place", "value": "person; rm"},
            {"command": "place", "value": "x" * 100}, {"command": "block", "value": "maybe"},
            {"command": "arrive"}, {"command": "arrive", "value": "1 2"}, {"command": "arrive", "value": "x" * 100},
            {"command": "place", "value": "person\ndepart"},
        ]
        for body in bad:
            with self.subTest(body=body):
                with self.assertRaises(ValueError):
                    parse_control(body)


def call(url, method="GET", token=None, body=None):
    headers = {"Content-Type": "application/json"}
    if token is not None:
        headers["X-Status-Token"] = token
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            return response.status, response.read(), dict(response.headers)
    except urllib.error.HTTPError as error:
        return error.code, error.read(), dict(error.headers)


class ServerTests(unittest.TestCase):
    def start(self, controls=True):
        world = ready_world()
        self.board = StatusBoard()
        self.board.publish(snapshot(world.agent, world.beam.poll(), controls=controls))
        self.commands: "queue.Queue[str]" = queue.Queue()
        self.server = StatusServer(self.board, self.commands, TOKEN, "127.0.0.1", 0, controls=controls)
        self.server.start()
        self.base = f"http://127.0.0.1:{self.server.port}"
        return world

    def tearDown(self) -> None:
        if getattr(self, "server", None):
            self.server.stop()

    def test_the_page_itself_needs_no_code_but_the_data_does(self) -> None:
        self.start()
        status, body, _ = call(self.base + "/")
        self.assertEqual(200, status)
        self.assertIn(b"<title>", body)
        self.assertEqual(403, call(self.base + "/api/state")[0])
        self.assertEqual(403, call(self.base + "/api/state", token="wrong")[0])

    def test_with_the_code_the_state_is_served_and_the_code_is_never_echoed(self) -> None:
        self.start()
        status, body, headers = call(self.base + "/api/state", token=TOKEN)
        self.assertEqual(200, status)
        data = json.loads(body)
        self.assertEqual("AV-095-01", data["busId"])
        self.assertNotIn(TOKEN.encode(), body)
        self.assertEqual("nosniff", headers.get("X-Content-Type-Options"))
        self.assertEqual("DENY", headers.get("X-Frame-Options"))
        self.assertEqual("no-store", headers.get("Cache-Control"))
        self.assertIn("default-src 'self'", headers.get("Content-Security-Policy", ""))

    def test_a_control_is_queued_only_with_the_code_and_a_valid_body(self) -> None:
        self.start()
        url = self.base + "/api/control"
        self.assertEqual(403, call(url, "POST", body={"command": "clear"})[0])
        self.assertEqual(403, call(url, "POST", token="wrong", body={"command": "clear"})[0])
        self.assertEqual(400, call(url, "POST", token=TOKEN, body={"command": "shell"})[0])
        self.assertTrue(self.commands.empty())
        self.assertEqual(202, call(url, "POST", token=TOKEN, body={"command": "place", "value": "person"})[0])
        self.assertEqual("place person 0.9", self.commands.get_nowait())

    def test_a_status_only_page_refuses_controls(self) -> None:
        self.start(controls=False)
        self.assertEqual(403, call(self.base + "/api/control", "POST", token=TOKEN, body={"command": "clear"})[0])
        self.assertTrue(self.commands.empty())

    def test_unknown_paths_and_oversized_bodies_are_refused(self) -> None:
        self.start()
        self.assertEqual(404, call(self.base + "/nope", token=TOKEN)[0])
        self.assertEqual(404, call(self.base + "/api/other", "POST", token=TOKEN, body={})[0])
        big = {"command": "place", "value": "x" * 100_000}
        self.assertIn(call(self.base + "/api/control", "POST", token=TOKEN, body=big)[0], (400, 413))

    def test_it_listens_on_the_address_it_was_given(self) -> None:
        self.start()
        self.assertEqual("127.0.0.1", self.server.host)

    def test_the_board_serves_the_latest_snapshot(self) -> None:
        world = self.start()
        world.camera.place("person")
        world.tick()
        self.board.publish(snapshot(world.agent, world.beam.poll(), controls=True))
        data = json.loads(call(self.base + "/api/state", token=TOKEN)[1])
        self.assertEqual("HALT", data["decision"]["permission"])


if __name__ == "__main__":
    unittest.main()
