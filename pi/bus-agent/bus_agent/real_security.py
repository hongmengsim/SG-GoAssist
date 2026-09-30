"""Start-up checks for a bus running real sensors."""

from __future__ import annotations

from typing import Optional
from urllib.parse import urlsplit

_LOOPBACK = {"localhost", "127.0.0.1", "::1"}


def real_mode_findings(backend_url: str, secret: Optional[str]) -> tuple[list[str], list[str]]:
    """Returns (errors, warnings) for a real-sensor start.

    Without the device secret every request goes out unsigned, so anyone who can reach the
    backend could speak for this bus: that is refused. Plain http off this machine lets someone on
    the network read or alter the traffic (the responses are not signed), which is a warning
    only, because a bench network is often http; the operator should know.
    """
    errors: list[str] = []
    warnings: list[str] = []
    if not secret:
        errors.append("DEVICE_SHARED_SECRET is not set; requests would go out unsigned")
    parts = urlsplit(backend_url)
    if parts.scheme == "http" and (parts.hostname or "") not in _LOOPBACK:
        warnings.append(
            f"the backend at {parts.hostname} is reached over plain http; use https outside a trusted bench network"
        )
    return errors, warnings
