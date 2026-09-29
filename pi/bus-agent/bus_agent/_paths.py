"""Makes the sibling Pi modules importable when the repository is laid out as checked in.

pi/tof-link, pi/perception and pi/safety-gate are separate modules with their own tests, so
the agent reaches them by path rather than by installing them. On a Pi the repository is
deployed intact, so the same layout holds.
"""

from __future__ import annotations

import sys
from pathlib import Path

_PI = Path(__file__).resolve().parents[2]
SIBLINGS = ("tof-link", "perception", "safety-gate")


def add_sibling_paths() -> None:
    # Appended, not prepended: the siblings each have a tests package that must not shadow ours.
    for name in SIBLINGS:
        path = str(_PI / name)
        if path not in sys.path:
            sys.path.append(path)


add_sibling_paths()
