"""Record and replay: real serial lines and perception results, never frames."""

import json
import tempfile
import unittest
from pathlib import Path

from beam_reading import BeamReader, FakeLineSource
from perception import PerceptionObject, PerceptionResult

from bus_agent.recording import (
    RecordingLineSource,
    RecordingPerception,
    ReplayError,
    ReplayLineSource,
    ReplayPerception,
)


class Clock:
    def __init__(self) -> None:
        self.now = 50.0

    def __call__(self) -> float:
        return self.now


class LineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "beam.jsonl"

    def test_a_laser_command_passes_through_and_is_not_recorded(self) -> None:
        class Sending(FakeLineSource):
            def __init__(self) -> None:
                super().__init__()
                self.sent: list = []

            def send(self, command: str) -> None:
                self.sent.append(command)

        clock = Clock()
        inner = Sending()
        recorder = RecordingLineSource(inner, self.path, clock)
        recorder.send("LASERS ON")
        recorder.close()
        self.assertEqual(["LASERS ON"], inner.sent)
        self.assertEqual("", self.path.read_text(encoding="utf-8"), "only what the ESP32 sent is recorded")

    def test_recorded_lines_replay_at_the_same_offsets(self) -> None:
        clock = Clock()
        inner = FakeLineSource()
        recorder = RecordingLineSource(inner, self.path, clock)
        recorder.read_lines()
        inner.push("1,VL53L0X,500,VALID")
        clock.now += 0.2
        self.assertEqual(["1,VL53L0X,500,VALID"], recorder.read_lines())
        inner.push("2,VL53L0X,200,VALID")
        clock.now += 0.4
        recorder.read_lines()
        recorder.close()

        replay_clock = Clock()
        replay = ReplayLineSource(self.path, replay_clock)
        self.assertEqual([], replay.read_lines())
        replay_clock.now += 0.25
        self.assertEqual(["1,VL53L0X,500,VALID"], replay.read_lines())
        self.assertEqual([], replay.read_lines())
        replay_clock.now += 0.4
        self.assertEqual(["2,VL53L0X,200,VALID"], replay.read_lines())
        replay_clock.now += 10
        self.assertEqual([], replay.read_lines(), "after the end there is nothing, so the beam goes stale")

    def test_a_replay_drives_a_beam_reader_to_the_same_states(self) -> None:
        clock = Clock()
        inner = FakeLineSource()
        recorder = RecordingLineSource(inner, self.path, clock)
        states = []
        live = BeamReader(recorder, clock=clock)
        for index in range(10):
            inner.push(f"{index},VL53L0X,500,VALID")
            clock.now += 0.2
            live.poll()
        live.calibrate()
        for index in range(3):
            inner.push(f"{index},VL53L0X,500,VALID")
            clock.now += 0.2
            states.append(live.poll().state)
        recorder.close()

        replay_clock = Clock()
        replayed = BeamReader(ReplayLineSource(self.path, replay_clock), clock=replay_clock)
        for _ in range(10):
            replay_clock.now += 0.2
            replayed.poll()
        replayed.calibrate()
        again = []
        for _ in range(3):
            replay_clock.now += 0.2
            again.append(replayed.poll().state)
        self.assertEqual(states, again)

    def test_a_corrupt_recording_is_refused_up_front(self) -> None:
        self.path.write_text('{"t": 0.1, "line": "ok"}\nnot json\n', encoding="utf-8")
        with self.assertRaisesRegex(ReplayError, "beam.jsonl"):
            ReplayLineSource(self.path, Clock())
        self.path.write_text('{"t": "soon", "line": "x"}\n', encoding="utf-8")
        with self.assertRaises(ReplayError):
            ReplayLineSource(self.path, Clock())
        with self.assertRaises(ReplayError):
            ReplayLineSource(Path(self.directory.name) / "missing.jsonl", Clock())


class PerceptionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "perception.jsonl"

    class Source:
        def __init__(self) -> None:
            self.value = None

        def latest_perception(self):
            return self.value

    def result(self, *objects, ok=True, reason=None):
        return PerceptionResult(tuple(objects) if ok else None, ok, reason, "2026-09-30T00:00:00.000Z")

    def test_results_are_recorded_once_each_and_replayed(self) -> None:
        clock = Clock()
        source = self.Source()
        recorder = RecordingPerception(source, self.path, clock)
        person = PerceptionObject("person", "UNSAFE", 0.9, True, (0.5, 0.5, 0.2, 0.4))
        source.value = (self.result(), 50.0)
        recorder.latest_perception()
        recorder.latest_perception()  # the same capture again: not written twice
        clock.now += 0.5
        source.value = (self.result(person), 50.5)
        recorder.latest_perception()
        clock.now += 0.5
        source.value = (self.result(ok=False, reason="too_dark"), 51.0)
        recorder.latest_perception()
        recorder.close()
        self.assertEqual(3, len(self.path.read_text(encoding="utf-8").strip().splitlines()))

        replay_clock = Clock()
        replay = ReplayPerception(self.path, replay_clock)
        first, _ = replay.latest_perception()  # the first record was taken at offset zero
        self.assertEqual((), first.objects)
        replay_clock.now += 0.5
        second, _ = replay.latest_perception()
        self.assertEqual("person", second.objects[0].class_name)
        self.assertEqual("UNSAFE", second.objects[0].safety)
        replay_clock.now += 0.5
        third, _ = replay.latest_perception()
        self.assertFalse(third.image_ok)
        self.assertIsNone(third.objects)
        self.assertEqual("too_dark", third.degraded_reason)

    def test_the_replayed_capture_time_is_the_replay_clock_so_age_works(self) -> None:
        clock = Clock()
        source = self.Source()
        recorder = RecordingPerception(source, self.path, clock)
        source.value = (self.result(), 50.0)
        recorder.latest_perception()
        recorder.close()
        replay_clock = Clock()
        replay = ReplayPerception(self.path, replay_clock)
        replay_clock.now += 0.1
        _, captured_at = replay.latest_perception()
        self.assertAlmostEqual(replay_clock.now - 0.1, captured_at, delta=0.11)

    def test_nothing_that_looks_like_an_image_is_ever_written(self) -> None:
        clock = Clock()
        source = self.Source()
        recorder = RecordingPerception(source, self.path, clock)
        source.value = (self.result(PerceptionObject("leaf", "SAFE", 0.95, False, (0.1, 0.1, 0.05, 0.05))), 50.0)
        recorder.latest_perception()
        recorder.close()
        text = self.path.read_text(encoding="utf-8")
        for word in ("pixel", "jpeg", "png", "base64", "frame"):
            self.assertNotIn(word, text.lower())
        record = json.loads(text.splitlines()[0])
        self.assertEqual({"t", "imageOk", "degradedReason", "objects"}, set(record))


if __name__ == "__main__":
    unittest.main()
