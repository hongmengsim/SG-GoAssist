"""Does a detection box overlap the ramp polygon? Normalised 0-1 image coordinates."""

from __future__ import annotations

import math
from typing import Sequence

Point = tuple[float, float]
Box = tuple[float, float, float, float]  # centre x, centre y, width, height

MIN_POLYGON_VERTICES = 3


def point_in_polygon(px: float, py: float, polygon: Sequence[Point]) -> bool:
    """Ray-casting point-in-polygon test."""
    inside = False
    j = len(polygon) - 1
    for i, (xi, yi) in enumerate(polygon):
        xj, yj = polygon[j]
        if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _orient(a: Point, b: Point, c: Point) -> float:
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _on_segment(a: Point, b: Point, p: Point) -> bool:
    return min(a[0], b[0]) <= p[0] <= max(a[0], b[0]) and min(a[1], b[1]) <= p[1] <= max(a[1], b[1])


def _segments_intersect(p1: Point, p2: Point, p3: Point, p4: Point) -> bool:
    d1 = _orient(p3, p4, p1)
    d2 = _orient(p3, p4, p2)
    d3 = _orient(p1, p2, p3)
    d4 = _orient(p1, p2, p4)
    if ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0)) and 0 not in (d1, d2, d3, d4):
        return True
    return (
        (d1 == 0 and _on_segment(p3, p4, p1))
        or (d2 == 0 and _on_segment(p3, p4, p2))
        or (d3 == 0 and _on_segment(p1, p2, p3))
        or (d4 == 0 and _on_segment(p1, p2, p4))
    )


def is_valid_box(box: Box) -> bool:
    cx, cy, width, height = box
    return all(math.isfinite(v) for v in box) and width >= 0 and height >= 0


def box_overlaps_polygon(box: Box, polygon: Sequence[Point]) -> bool:
    """True if the axis-aligned box (centre, size) overlaps the polygon.

    Fails safe: a polygon with fewer than 3 vertices, or a box with non-finite or negative
    numbers, is reported as overlapping so the caller blocks instead of passing.
    """
    if len(polygon) < MIN_POLYGON_VERTICES or not is_valid_box(box):
        return True

    cx, cy, width, height = box
    x1, y1, x2, y2 = cx - width / 2, cy - height / 2, cx + width / 2, cy + height / 2
    corners: list[Point] = [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]

    if any(point_in_polygon(px, py, polygon) for px, py in corners):
        return True
    if any(x1 <= vx <= x2 and y1 <= vy <= y2 for vx, vy in polygon):
        return True

    box_edges = list(zip(corners, corners[1:] + corners[:1]))
    polygon_edges = list(zip(polygon, list(polygon[1:]) + list(polygon[:1])))
    return any(_segments_intersect(a, b, c, d) for a, b in box_edges for c, d in polygon_edges)
