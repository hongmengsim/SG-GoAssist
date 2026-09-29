import unittest

from perception.geometry import box_overlaps_polygon

POLYGON = [(0.25, 0.25), (0.75, 0.25), (0.75, 0.75), (0.25, 0.75)]


class BoxOverlapsPolygonTests(unittest.TestCase):
    def test_box_fully_inside(self) -> None:
        self.assertTrue(box_overlaps_polygon((0.5, 0.5, 0.1, 0.1), POLYGON))

    def test_box_fully_outside(self) -> None:
        self.assertFalse(box_overlaps_polygon((0.1, 0.1, 0.1, 0.1), POLYGON))

    def test_centre_outside_but_box_overlapping_an_edge(self) -> None:
        # A centre-point test would miss this: centre x is 0.2, the box spans 0.1 to 0.3.
        self.assertTrue(box_overlaps_polygon((0.2, 0.5, 0.2, 0.2), POLYGON))

    def test_box_containing_the_whole_polygon(self) -> None:
        self.assertTrue(box_overlaps_polygon((0.5, 0.5, 1.0, 1.0), POLYGON))

    def test_edges_cross_without_any_corner_inside(self) -> None:
        self.assertTrue(box_overlaps_polygon((0.5, 0.5, 0.05, 1.0), POLYGON))

    def test_box_close_but_not_touching(self) -> None:
        self.assertFalse(box_overlaps_polygon((0.15, 0.5, 0.1, 0.1), POLYGON))

    def test_a_degenerate_polygon_fails_safe_as_overlapping(self) -> None:
        self.assertTrue(box_overlaps_polygon((0.9, 0.9, 0.01, 0.01), [(0.0, 0.0), (1.0, 1.0)]))
        self.assertTrue(box_overlaps_polygon((0.9, 0.9, 0.01, 0.01), []))

    def test_a_box_with_invalid_numbers_fails_safe_as_overlapping(self) -> None:
        nan = float("nan")
        for box in ((nan, 0.5, 0.1, 0.1), (0.5, 0.5, -0.1, 0.1), (0.5, 0.5, float("inf"), 0.1)):
            with self.subTest(box=box):
                self.assertTrue(box_overlaps_polygon(box, POLYGON))

    def test_a_concave_polygon_is_respected(self) -> None:
        concave = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.6, 1.0), (0.6, 0.4), (0.4, 0.4), (0.4, 1.0), (0.0, 1.0)]
        # A small box in the notch (x 0.4-0.6, y 0.6-1.0) is outside the polygon.
        self.assertFalse(box_overlaps_polygon((0.5, 0.8, 0.05, 0.05), concave))
        self.assertTrue(box_overlaps_polygon((0.5, 0.2, 0.05, 0.05), concave))


if __name__ == "__main__":
    unittest.main()
