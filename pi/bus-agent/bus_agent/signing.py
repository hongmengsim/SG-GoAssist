"""Signed device requests, matching backend/src/routes/auth.ts (verifyDeviceRequest).

The signature is HMAC-SHA256 over ``<deviceId>.<timestamp>.`` followed by the exact request
body bytes. The backend accepts timestamps within 60 seconds of its own clock. When no shared
secret is configured, no headers are added (development mode), as on the backend.
"""

from __future__ import annotations

import hashlib
import hmac
import time
from typing import Optional


def sign_body(secret: str, device_id: str, timestamp: str, body: bytes) -> str:
    mac = hmac.new(secret.encode("utf-8"), digestmod=hashlib.sha256)
    mac.update(f"{device_id}.{timestamp}.".encode("utf-8"))
    mac.update(body)
    return mac.hexdigest()


def signed_headers(
    secret: Optional[str],
    device_id: str,
    body: bytes,
    now_ms: Optional[int] = None,
) -> dict:
    if not secret:
        return {}
    timestamp = str(int(time.time() * 1000) if now_ms is None else now_ms)
    return {
        "x-device-id": device_id,
        "x-timestamp": timestamp,
        "x-signature": sign_body(secret, device_id, timestamp, body),
    }
