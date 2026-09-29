import unittest
from demo_state import BeamState


class BeamTests(unittest.TestCase):
    def reference(self):
        b = BeamState()
        for i in range(10):
            b.accept(f'{i},VL53L0X,500,VALID', i * .2)
        self.assertEqual(b.calibrate(1.9), 500)
        return b

    def test_obstacle_blocks_immediately_and_clear_needs_three(self):
        b = self.reference()
        self.assertEqual(b.check(1.9), 'BEAM CLEAR')
        b.accept('1,VL53L0X,200,VALID', 2)
        self.assertEqual(b.check(2), 'BLOCKED')
        for i in range(3):
            b.accept('1,VL53L0X,500,VALID', 2.2 + i * .2)
            self.assertEqual(b.check(2.2 + i * .2), 'BEAM CLEAR' if i == 2 else 'CHECKING')

    def test_invalid_and_stale_are_unknown(self):
        b = self.reference()
        self.assertEqual(b.check(3), 'UNKNOWN')
        b.accept('1,VL53L0X,NA,INVALID_status_2', 3.1)
        self.assertEqual(b.check(3.1), 'UNKNOWN')
        self.assertFalse(b.samples)

    def test_missing_backstop_is_unknown(self):
        b = self.reference()
        b.accept('1,VL53L0X,900,VALID', 2)
        self.assertEqual(b.check(2), 'UNKNOWN')

    def test_calibration_rejects_noisy_or_stale_data(self):
        b = self.reference()
        with self.assertRaises(ValueError):
            b.calibrate(4)
        b.accept('1,VL53L0X,200,VALID', 2)
        with self.assertRaises(ValueError):
            b.calibrate(2)

    def test_nonmeasurement_does_not_refresh_distance(self):
        b = self.reference()
        b.accept('LASERS,1', 5)
        self.assertEqual(b.check(5), 'UNKNOWN')


if __name__ == '__main__':
    unittest.main()
