"""A switch in front of the backend link, for demonstrating a lost link on a SIMULATED bus.

While it is cut, every call to the backend fails as an unreachable backend does, so the agent's own
link-loss logic reacts exactly as it would to a real outage. It is built only for simulated runs; a
real bus has no such switch, and the demo controls refuse to cut a real bus's link.
"""

from __future__ import annotations

from .backend import BackendError


class LinkSwitch:
    def __init__(self, inner: object) -> None:
        self._inner = inner
        self.cut = False

    def __getattr__(self, name: str):
        attribute = getattr(self._inner, name)  # a missing method stays missing
        if not callable(attribute):
            return attribute

        def call(*args, **kwargs):
            if self.cut:
                raise BackendError("the backend link is cut (demo)")
            return attribute(*args, **kwargs)

        return call
