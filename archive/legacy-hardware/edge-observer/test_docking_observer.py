import math
import tempfile
import time
import unittest
from pathlib import Path

from docking_observer import read_tof, yaw_degrees_from_rotation


class DockingObserverTests(unittest.TestCase):
    def test_rotation_matrix_yaw_is_reported_in_degrees(self) -> None:
        angle = math.radians(5)
        rotation = [
            [math.cos(angle), 0.0, math.sin(angle)],
            [0.0, 1.0, 0.0],
            [-math.sin(angle), 0.0, math.cos(angle)],
        ]
        self.assertAlmostEqual(yaw_degrees_from_rotation(rotation), 5.0, places=5)

    def test_tof_file_must_be_recent_and_in_range(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "tof-mm.txt"
            path.write_text("600", encoding="utf-8")
            self.assertEqual(read_tof(path), (True, 600))
            path.write_text("invalid", encoding="utf-8")
            self.assertEqual(read_tof(path), (False, None))
            path.write_text("600", encoding="utf-8")
            old = time.time() - 3
            import os

            os.utime(path, (old, old))
            self.assertEqual(read_tof(path), (False, None))


if __name__ == "__main__":
    unittest.main()
