import unittest

from beam_reading import (
    BeamReader,
    FakeLineSource,
    SerialLineSource,
    SimulatedBeamSource,
)


class Clock:
    def __init__(self, start: float = 0.0) -> None:
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def calibrated_reader(reference_mm: int = 500):
    clock = Clock()
    source = FakeLineSource()
    reader = BeamReader(source, clock=clock)
    for index in range(10):
        source.push(f"{index},VL53L0X,{reference_mm},VALID")
        reader.poll()
        clock.advance(0.2)
    reader.calibrate()
    return reader, source, clock


class ReadingTests(unittest.TestCase):
    def test_before_any_data_the_beam_is_unknown_with_no_distance(self) -> None:
        reader = BeamReader(FakeLineSource(), clock=Clock())
        reading = reader.poll()
        self.assertEqual("UNKNOWN", reading.state)
        self.assertIsNone(reading.distance_mm)
        self.assertFalse(reading.simulated)

    def test_readings_without_a_reference_are_uncalibrated(self) -> None:
        clock = Clock()
        source = FakeLineSource(["1,VL53L0X,500,VALID"])
        reading = BeamReader(source, clock=clock).poll()
        self.assertEqual("UNCALIBRATED", reading.state)

    def test_the_teammates_spelling_is_mapped_to_the_contract_name(self) -> None:
        reader, source, clock = calibrated_reader()
        source.push("11,VL53L0X,500,VALID")
        reading = reader.poll()
        self.assertEqual("BEAM_CLEAR", reading.state)
        self.assertEqual(500, reading.distance_mm)

    def test_an_obstacle_is_blocked_at_once_and_clear_needs_three_readings(self) -> None:
        reader, source, clock = calibrated_reader()
        source.push("1,VL53L0X,200,VALID")
        self.assertEqual("BLOCKED", reader.poll().state)
        self.assertEqual(200, reader.poll().distance_mm)
        states = []
        for _ in range(3):
            clock.advance(0.2)
            source.push("1,VL53L0X,500,VALID")
            states.append(reader.poll().state)
        self.assertEqual(["CHECKING", "CHECKING", "BEAM_CLEAR"], states)

    def test_stale_data_is_unknown_and_carries_no_distance(self) -> None:
        reader, source, clock = calibrated_reader()
        clock.advance(3.0)
        reading = reader.poll()
        self.assertEqual("UNKNOWN", reading.state)
        self.assertIsNone(reading.distance_mm)

    def test_invalid_lines_make_the_beam_unknown(self) -> None:
        reader, source, clock = calibrated_reader()
        source.push("1,VL53L0X,NA,INVALID_status_2")
        self.assertEqual("UNKNOWN", reader.poll().state)

    def test_firmware_error_lines_make_the_beam_unknown_at_once(self) -> None:
        for line in ("ERROR: sensor", "NOT_READY: warming up", "NO_FRESH_DATA:"):
            with self.subTest(line=line):
                reader, source, clock = calibrated_reader()
                source.push(line)
                self.assertEqual("UNKNOWN", reader.poll().state)

    def test_garbage_lines_are_ignored_and_never_keep_a_stale_beam_clear(self) -> None:
        for line in ("", "hello", "1,VL53L0X,500", "\x00\xff"):
            with self.subTest(line=line):
                reader, source, clock = calibrated_reader()
                clock.advance(3.0)
                source.push(line)
                self.assertEqual("UNKNOWN", reader.poll().state)

    def test_a_missing_backstop_is_unknown(self) -> None:
        reader, source, clock = calibrated_reader()
        source.push("1,VL53L0X,900,VALID")
        self.assertEqual("UNKNOWN", reader.poll().state)

    def test_calibration_fails_loudly_without_enough_readings(self) -> None:
        reader = BeamReader(FakeLineSource(["1,VL53L0X,500,VALID"]), clock=Clock())
        reader.poll()
        with self.assertRaises(ValueError):
            reader.calibrate()

    def test_calibrate_returns_the_reference(self) -> None:
        clock = Clock()
        source = FakeLineSource()
        reader = BeamReader(source, clock=clock)
        for index in range(10):
            source.push(f"{index},VL53L0X,500,VALID")
            reader.poll()
            clock.advance(0.2)
        self.assertEqual(500, reader.calibrate())


class FlakySource(FakeLineSource):
    """A line source whose port can vanish, as an unplugged ESP32 does (OSError: Input/output error)."""

    def __init__(self) -> None:
        super().__init__()
        self.failing = False

    def read_lines(self) -> list:
        if self.failing:
            raise OSError(5, "Input/output error")
        return super().read_lines()


class SourceFailureTests(unittest.TestCase):
    def flaky_calibrated(self):
        clock = Clock()
        source = FlakySource()
        reader = BeamReader(source, clock=clock)
        for index in range(10):
            source.push(f"{index},VL53L0X,500,VALID")
            reader.poll()
            clock.advance(0.2)
        reader.calibrate()
        return reader, source, clock

    def test_a_vanished_port_is_unknown_not_an_exception(self) -> None:
        reader, source, clock = self.flaky_calibrated()
        source.failing = True
        reading = reader.poll()
        self.assertEqual("UNKNOWN", reading.state)
        self.assertIsNone(reading.distance_mm)

    def test_a_failed_read_never_keeps_the_last_clear_beam(self) -> None:
        reader, source, clock = self.flaky_calibrated()
        source.push("11,VL53L0X,500,VALID")
        self.assertEqual("BEAM_CLEAR", reader.poll().state)
        source.failing = True  # no time passes: the old clear reading is still fresh
        self.assertEqual("UNKNOWN", reader.poll().state)

    def test_the_beam_recovers_when_the_source_works_again(self) -> None:
        reader, source, clock = self.flaky_calibrated()
        source.failing = True
        self.assertEqual("UNKNOWN", reader.poll().state)
        source.failing = False
        states = []
        for _ in range(3):
            clock.advance(0.2)
            source.push("1,VL53L0X,500,VALID")
            states.append(reader.poll().state)
        self.assertEqual("BEAM_CLEAR", states[-1])


class SimulatedSourceTests(unittest.TestCase):
    def build(self):
        clock = Clock()
        source = SimulatedBeamSource(reference_mm=500)
        reader = BeamReader(source, clock=clock, simulated=True)
        return reader, source, clock

    def step(self, reader, clock, times=1):
        reading = None
        for _ in range(times):
            clock.advance(0.2)
            reading = reader.poll()
        return reading

    def test_every_reading_is_labelled_simulated(self) -> None:
        reader, _, clock = self.build()
        self.assertTrue(self.step(reader, clock).simulated)

    def test_it_calibrates_then_reports_clear(self) -> None:
        reader, _, clock = self.build()
        self.step(reader, clock, 10)
        self.assertEqual(500, reader.calibrate())
        self.assertEqual("BEAM_CLEAR", self.step(reader, clock, 3).state)

    def test_blocking_and_unblocking_follow_the_switch(self) -> None:
        reader, source, clock = self.build()
        self.step(reader, clock, 10)
        reader.calibrate()
        source.set_blocked(True)
        self.assertEqual("BLOCKED", self.step(reader, clock).state)
        source.set_blocked(False)
        self.assertEqual("BEAM_CLEAR", self.step(reader, clock, 3).state)

    def test_a_sensor_dropout_is_unknown(self) -> None:
        reader, source, clock = self.build()
        self.step(reader, clock, 10)
        reader.calibrate()
        source.set_dropout(True)
        self.assertEqual("UNKNOWN", self.step(reader, clock, 6).state)


class FakeSerial:
    def __init__(self, chunks) -> None:
        self.chunks = list(chunks)
        self.written: list = []

    def write(self, data: bytes) -> int:
        self.written.append(data)
        return len(data)

    @property
    def in_waiting(self) -> int:
        return len(self.chunks[0]) if self.chunks else 0

    def read(self, size: int = 1) -> bytes:
        return self.chunks.pop(0) if self.chunks else b""


class LaserLinesTests(unittest.TestCase):
    """The ESP32 answers laser commands with its own lines; they must not disturb the beam."""

    def test_laser_confirmations_and_the_timeout_notice_do_not_blank_a_clear_beam(self) -> None:
        for line in ("LASERS,1", "LASERS,0", "LASER_TIMEOUT: heartbeat lost; outputs OFF", "DEMO,APAS_3_LASER_V1"):
            with self.subTest(line=line):
                reader, source, clock = calibrated_reader()
                source.push("11,VL53L0X,500,VALID")
                self.assertEqual("BEAM_CLEAR", reader.poll().state)
                source.push(line)
                self.assertEqual("BEAM_CLEAR", reader.poll().state)


class SerialSendTests(unittest.TestCase):
    """The reader is read-only except for the two commands that switch the marker lasers."""

    def test_the_two_laser_commands_are_written_with_a_newline(self) -> None:
        port = FakeSerial([])
        source = SerialLineSource(port)
        source.send("LASERS ON")
        source.send("LASERS OFF")
        self.assertEqual([b"LASERS ON\n", b"LASERS OFF\n"], port.written)

    def test_anything_else_is_refused_and_nothing_is_written(self) -> None:
        port = FakeSerial([])
        source = SerialLineSource(port)
        for command in ("KEEPALIVE", "STATUS", "lasers on", "LASERS ON\nLASERS OFF", "", "RESET"):
            with self.subTest(command=command):
                with self.assertRaises(ValueError):
                    source.send(command)
        self.assertEqual([], port.written)

    def test_a_write_error_reaches_the_caller(self) -> None:
        class Dead(FakeSerial):
            def write(self, data: bytes) -> int:
                raise OSError(5, "Input/output error")

        with self.assertRaises(OSError):
            SerialLineSource(Dead([])).send("LASERS ON")


class SerialLineSourceTests(unittest.TestCase):
    def test_lines_split_across_reads_are_reassembled(self) -> None:
        source = SerialLineSource(FakeSerial([b"1,VL53L0X,50", b"0,VALID\n2,VL5", b"3L0X,500,VALID\n"]))
        lines = source.read_lines() + source.read_lines() + source.read_lines()
        self.assertEqual(["1,VL53L0X,500,VALID", "2,VL53L0X,500,VALID"], lines)

    def test_undecodable_bytes_become_a_line_that_is_rejected_not_a_crash(self) -> None:
        source = SerialLineSource(FakeSerial([b"\xff\xfe\n"]))
        self.assertEqual(1, len(source.read_lines()))

    def test_an_unbounded_line_without_a_newline_is_discarded(self) -> None:
        source = SerialLineSource(FakeSerial([b"x" * 5000]), max_line_bytes=1024)
        self.assertEqual([], source.read_lines())
        self.assertEqual([], source.read_lines())


if __name__ == "__main__":
    unittest.main()
