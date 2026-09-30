"""The live camera view (bench version).

The picture goes to whoever holds the start-up code, only while they are connected, is never written to
disk, and marks the ramp zone and every detection in words and line styles, never in colour alone.
"""

import http.client
import threading
import time
import unittest
from pathlib import Path

from perception import PerceptionObject, PerceptionResult

from bus_agent import live_view
from bus_agent.live_view import LiveViewServer, overlay_plan

POLYGON = ((0.25, 0.25), (0.75, 0.25), (0.75, 0.75), (0.25, 0.75))
CODE = "start-up-code-for-tests"
STUB_JPEG = b"\xff\xd8STUB-JPEG\xff\xd9"


def thing(name="person", safety="UNSAFE", confidence=0.41, in_zone=True, box=(0.5, 0.5, 0.2, 0.2)):
    return PerceptionObject(name, safety, confidence, in_zone, box)


def result(objects, ok=True, reason=None):
    return PerceptionResult(
        objects=None if objects is None else tuple(objects),
        image_ok=ok,
        degraded_reason=reason,
        observed_at="2026-09-30T00:00:00.000Z",
    )


def wait_for(condition, seconds=3.0) -> bool:
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if condition():
            return True
        time.sleep(0.01)
    return False


class OverlayTests(unittest.TestCase):
    def test_the_frame_always_says_it_is_live_and_not_recorded(self) -> None:
        plan = overlay_plan(result([]), POLYGON, 640, 480)
        self.assertEqual("LIVE VIEW - NOT RECORDED", plan["caption"])

    def test_the_ramp_zone_is_a_dashed_outline_with_a_word_label(self) -> None:
        zone = overlay_plan(result([]), POLYGON, 640, 480)["zone"]
        self.assertEqual([(160, 120), (480, 120), (480, 360), (160, 360)], zone["points"])
        self.assertEqual("RAMP ZONE", zone["label"])
        self.assertEqual("dashed", zone["style"])

    def test_a_box_is_converted_from_centre_and_size_to_pixels(self) -> None:
        drawn = overlay_plan(result([thing(box=(0.5, 0.5, 0.2, 0.2))]), POLYGON, 640, 480)["objects"][0]
        self.assertEqual((256, 192, 384, 288), drawn["rect"])

    def test_a_box_is_kept_inside_the_picture(self) -> None:
        drawn = overlay_plan(result([thing(box=(0.95, 0.5, 0.3, 0.2))]), POLYGON, 640, 480)["objects"][0]
        x1, y1, x2, y2 = drawn["rect"]
        self.assertTrue(0 <= x1 < x2 <= 640 and 0 <= y1 < y2 <= 480)

    def test_an_unsafe_object_is_thick_and_labelled_in_words_with_class_confidence_and_zone(self) -> None:
        drawn = overlay_plan(result([thing("person", "UNSAFE", 0.41, True)]), POLYGON, 640, 480)["objects"][0]
        self.assertEqual("thick", drawn["style"])
        for word in ("UNSAFE", "person", "41%", "IN ZONE"):
            self.assertIn(word, drawn["label"])

    def test_a_safe_object_outside_the_zone_is_dashed_and_says_so(self) -> None:
        drawn = overlay_plan(result([thing("leaf", "SAFE", 0.95, False)]), POLYGON, 640, 480)["objects"][0]
        self.assertEqual("dashed", drawn["style"])
        for word in ("SAFE", "leaf", "95%", "outside zone"):
            self.assertIn(word, drawn["label"])

    def test_an_unknown_safety_verdict_is_drawn_as_unsafe(self) -> None:
        drawn = overlay_plan(result([thing("thing", None)]), POLYGON, 640, 480)["objects"][0]
        self.assertEqual("thick", drawn["style"])
        self.assertIn("UNSAFE", drawn["label"])

    def test_no_detections_because_the_frame_is_not_trusted_is_said_in_words(self) -> None:
        plan = overlay_plan(result(None, ok=False, reason="too_dark"), POLYGON, 640, 480)
        self.assertEqual([], plan["objects"])
        self.assertIn("NO DETECTIONS AVAILABLE", plan["notice"])
        self.assertIn("too_dark", plan["notice"])

    def test_a_healthy_frame_with_nothing_found_says_nothing_detected(self) -> None:
        plan = overlay_plan(result([]), POLYGON, 640, 480)
        self.assertIn("nothing detected", plan["notice"])

    def test_broken_numbers_never_crash_and_the_object_is_still_listed_in_words(self) -> None:
        nan = float("nan")
        plan = overlay_plan(result([thing("person", "UNSAFE", nan, True, (nan, 0.5, 0.2, 0.2))]), POLYGON, 640, 480)
        drawn = plan["objects"][0]
        self.assertIsNone(drawn["rect"])
        self.assertIn("person", drawn["label"])
        self.assertIn("UNSAFE", drawn["label"])

    def test_only_the_first_objects_are_drawn_and_the_rest_are_counted(self) -> None:
        plan = overlay_plan(result([thing() for _ in range(25)]), POLYGON, 640, 480)
        self.assertEqual(live_view.MAX_DRAWN_OBJECTS, len(plan["objects"]))
        self.assertIn("5 more", plan["more"])

    def test_a_label_is_moved_left_so_it_is_not_cut_off_at_the_right_edge(self) -> None:
        self.assertEqual(496, live_view.fit_x(600, 140, 640))  # 640 - 140 - 4
        self.assertEqual(10, live_view.fit_x(10, 140, 640), "a label that fits stays where it is")
        self.assertEqual(0, live_view.fit_x(-30, 140, 640), "and never goes off the left edge")
        self.assertEqual(0, live_view.fit_x(5, 700, 640), "a label wider than the picture starts at the edge")

    def test_the_plan_carries_no_colour_because_meaning_is_in_words_and_line_styles(self) -> None:
        plan = overlay_plan(result([thing()]), POLYGON, 640, 480)
        for item in (plan["zone"], *plan["objects"]):
            self.assertFalse({"colour", "color", "fill", "rgb"} & set(item))


@unittest.skipUnless(live_view.rendering_available(), "needs Pillow and numpy")
class RenderTests(unittest.TestCase):
    def test_a_frame_becomes_a_jpeg_of_the_same_size(self) -> None:
        import io

        import numpy
        from PIL import Image

        frame = numpy.zeros((120, 160, 3), dtype=numpy.uint8)
        plan = overlay_plan(result([thing()]), POLYGON, 160, 120)
        data = live_view.render_jpeg(frame, plan)
        self.assertTrue(data.startswith(b"\xff\xd8"))
        self.assertEqual((160, 120), Image.open(io.BytesIO(data)).size)


class Frame:
    shape = (480, 640, 3)


class FakeSource:
    """Stands in for the perception worker: a newest frame exists only while somebody watches."""

    def __init__(self) -> None:
        self.watchers = 0
        self.view = (Frame(), result([thing()]), 1.0)
        self._lock = threading.Lock()

    def watch(self, delta: int) -> None:
        with self._lock:
            self.watchers = max(0, self.watchers + delta)

    def latest_view(self):
        with self._lock:
            return self.view if self.watchers > 0 else None


class ServerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.source = FakeSource()
        self.renders = []

        def stub(frame, plan):
            self.renders.append(plan)
            return STUB_JPEG

        self.stub = stub

    def serve(self, **overrides) -> LiveViewServer:
        options = dict(renderer=self.stub, frame_interval=0.02, port=0)
        options.update(overrides)
        server = LiveViewServer(self.source, POLYGON, CODE, **options)
        server.start()
        self.addCleanup(server.stop)
        return server

    def get(self, server, path, timeout=3):
        connection = http.client.HTTPConnection("127.0.0.1", server.port, timeout=timeout)
        self.addCleanup(connection.close)
        connection.request("GET", path)
        return connection, connection.getresponse()

    def test_without_the_code_there_is_no_picture_and_nobody_is_counted_as_watching(self) -> None:
        server = self.serve()
        for path in ("/stream", "/stream?code=", "/stream?code=wrong", "/stream?other=" + CODE):
            with self.subTest(path=path):
                _, response = self.get(server, path)
                self.assertEqual(403, response.status)
        self.assertEqual(0, self.source.watchers)
        self.assertEqual([], self.renders)

    def test_with_the_code_it_streams_frames_as_a_multipart_image(self) -> None:
        server = self.serve()
        connection, response = self.get(server, f"/stream?code={CODE}")
        self.assertEqual(200, response.status)
        self.assertIn("multipart/x-mixed-replace", response.getheader("Content-Type"))
        self.assertEqual("no-store", response.getheader("Cache-Control"))
        data = response.read(300)
        self.assertIn(b"--frame", data)
        self.assertIn(STUB_JPEG, data)
        self.assertEqual(1, self.source.watchers)

    def test_nothing_is_drawn_or_encoded_while_nobody_is_connected(self) -> None:
        self.serve()
        time.sleep(0.3)
        self.assertEqual([], self.renders)
        self.assertEqual(0, self.source.watchers)

    def test_closing_the_stream_stops_the_watching_at_once(self) -> None:
        server = self.serve()
        connection, response = self.get(server, f"/stream?code={CODE}")
        response.read(100)
        self.assertEqual(1, self.source.watchers)
        response.close()  # a browser closes the whole connection when the picture is removed
        connection.close()
        self.assertTrue(wait_for(lambda: self.source.watchers == 0), "the last viewer left, so nothing is kept")

    def test_at_most_two_viewers_at_a_time(self) -> None:
        server = self.serve()
        first, one = self.get(server, f"/stream?code={CODE}")
        second, two = self.get(server, f"/stream?code={CODE}")
        one.read(50)
        two.read(50)
        _, third = self.get(server, f"/stream?code={CODE}")
        self.assertEqual(503, third.status)
        self.assertEqual(2, self.source.watchers)
        one.close()
        first.close()
        self.assertTrue(wait_for(lambda: self.source.watchers == 1))
        _, fourth = self.get(server, f"/stream?code={CODE}")
        self.assertEqual(200, fourth.status)

    def test_a_stream_ends_by_itself_after_the_session_limit(self) -> None:
        server = self.serve(max_session_seconds=0.4)
        _, response = self.get(server, f"/stream?code={CODE}")
        started = time.monotonic()
        response.read()  # returns when the server closes the stream
        self.assertLess(time.monotonic() - started, 2.5)
        self.assertTrue(wait_for(lambda: self.source.watchers == 0))

    def test_with_no_frame_yet_it_waits_without_drawing_and_starts_when_one_arrives(self) -> None:
        self.source.view = None
        server = self.serve()
        self.get(server, f"/stream?code={CODE}")
        time.sleep(0.2)
        self.assertEqual([], self.renders)
        self.assertEqual(1, self.source.watchers)
        self.source.view = (Frame(), result([]), 2.0)
        self.assertTrue(wait_for(lambda: bool(self.renders)))

    def test_a_frame_that_cannot_be_drawn_is_skipped_and_the_stream_carries_on(self) -> None:
        attempts = {"n": 0}

        def flaky(frame, plan):
            attempts["n"] += 1
            if attempts["n"] < 3:
                raise ValueError("cannot draw")
            return STUB_JPEG

        server = self.serve(renderer=flaky)
        with self.assertLogs("bus_agent.live_view", level="WARNING") as logs:
            _, response = self.get(server, f"/stream?code={CODE}")
            data = response.read(300)
        self.assertIn(STUB_JPEG, data)
        self.assertEqual(1, len(logs.records), "logged once, not on every failed frame")

    def test_other_paths_and_methods_are_refused(self) -> None:
        server = self.serve()
        _, response = self.get(server, "/")
        self.assertEqual(404, response.status)
        connection = http.client.HTTPConnection("127.0.0.1", server.port, timeout=3)
        self.addCleanup(connection.close)
        connection.request("POST", f"/stream?code={CODE}", body=b"x")
        self.assertIn(connection.getresponse().status, (404, 405, 501))

    def test_it_listens_only_on_the_loopback_address_by_default(self) -> None:
        server = self.serve()
        self.assertEqual("127.0.0.1", server.host)


class StartUpOptionTests(unittest.TestCase):
    """The option is refused, with a clear message, before anything is started."""

    def refused(self, *argv) -> str:
        import contextlib
        import io

        from bus_agent.__main__ import main

        captured = io.StringIO()
        with contextlib.redirect_stderr(captured), self.assertRaises(SystemExit) as raised:
            main(list(argv))
        self.assertEqual(2, raised.exception.code)
        return captured.getvalue()

    def test_the_live_view_is_only_for_real_sensors(self) -> None:
        for mode in (("--simulate",), ("--replay", "somewhere")):
            with self.subTest(mode=mode):
                message = self.refused(*mode, "--bus-id", "AV-095-01", "--live-view-port", "8780")
                self.assertIn("--live-view-port is only for --real", message)

    def test_a_bad_port_is_refused(self) -> None:
        for bad in ("70000", "-5"):
            with self.subTest(port=bad):
                message = self.refused("--simulate", "--bus-id", "AV-095-01", "--live-view-port", bad)
                self.assertIn("--live-view-port must be a port number", message)


class NeverWritesAFrameTests(unittest.TestCase):
    def test_the_module_has_no_way_to_write_a_file(self) -> None:
        source = Path(live_view.__file__).read_text(encoding="utf-8")
        for forbidden in ("open(", "write_bytes", "write_text", "tempfile", "os.rename", "shutil"):
            self.assertNotIn(forbidden, source)
        self.assertNotIn(".save(", source.replace("image.save(buffer", ""), "only an in-memory buffer may be saved to")


if __name__ == "__main__":
    unittest.main()
