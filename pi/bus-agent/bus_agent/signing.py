"""Signed device requests, matching backend/src/routes/auth.ts (verifyDeviceRequest).

The signature is HMAC-SHA256 over ``<deviceId>.<timestamp>.<METHOD>.<path and query>.``
followed by the exact request body bytes, so a signature cannot be replayed on another method
or path. (The WebSocket subscription signs ``<deviceId>.<timestamp>.`` and a fixed body.) The
backend accepts timestamps within 60 seconds of its own clock and refuses to see the same
signature twice. When no secret is configured, no headers are added (development mode), as on
the backend.
"""

from __future__ import annotations

import hashlib
import hmac
import time
from typing import Optional


def sign_body(
    secret: str,
    device_id: str,
    timestamp: str,
    body: bytes,
    method: Optional[str] = None,
    path: Optional[str] = None,
) -> str:
    """The signature. ``method`` and ``path`` are bound in for HTTP requests (both or neither)."""
    mac = hmac.new(secret.encode("utf-8"), digestmod=hashlib.sha256)
    context = "" if method is None else f"{method.upper()}.{path or ''}."
    mac.update(f"{device_id}.{timestamp}.{context}".encode("utf-8"))
    mac.update(body)
    return mac.hexdigest()


def signed_headers(
    secret: Optional[str],
    device_id: str,
    body: bytes,
    now_ms: Optional[int] = None,
    method: Optional[str] = None,
    path: Optional[str] = None,
) -> dict:
    if not secret:
        return {}
    timestamp = str(int(time.time() * 1000) if now_ms is None else now_ms)
    return {
        "x-device-id": device_id,
        "x-timestamp": timestamp,
        "x-signature": sign_body(secret, device_id, timestamp, body, method, path),
    }


def response_signature(secret: str, request_signature: str, status: int, body: bytes) -> str:
    """The signature the backend puts on its answer: HMAC-SHA256 over ``<request signature>.<status>.``
    and the exact body. Bound to the request's own (single-use) signature, so an answer cannot be
    replayed for another request."""
    mac = hmac.new(secret.encode("utf-8"), digestmod=hashlib.sha256)
    mac.update(f"{request_signature}.{status}.".encode("utf-8"))
    mac.update(body)
    return mac.hexdigest()


def response_is_genuine(
    secret: str, request_signature: str, status: int, body: bytes, supplied: Optional[str]
) -> bool:
    if not supplied:
        return False
    return hmac.compare_digest(supplied, response_signature(secret, request_signature, status, body))
