"""Checks that this session's DEVICE_SHARED_SECRET is the one the running backend accepts.

Run from the repository root:  python docs/runbooks/hardware-bringup-tools/check_secret.py [backend-url]
Prints MATCH or MISMATCH only, never the secret. It sends one signed read-only request
(the bus's pending-command list), so it changes nothing on the backend.
"""
import os
import sys

sys.path[:0] = ["pi/bus-agent", "pi/tof-link", "pi/perception", "pi/safety-gate"]
from bus_agent.backend import BackendError  # noqa: E402
from bus_agent.http_backend import HttpBackend  # noqa: E402

url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
secret = os.environ.get("DEVICE_SHARED_SECRET")
if not secret:
    print("NO SECRET in this session: launch with bringup.ps1 first.")
    sys.exit(2)
try:
    HttpBackend(url, "AV-095-01", secret=secret).pending_actuator_commands()
except BackendError as error:
    if "401" in str(error):
        print("SECRETS DO NOT MATCH the running backend (401). More than one launch is probably open: "
              "close every Windows Terminal window and launch once.")
        sys.exit(1)
    print("Could not use the backend:", str(error)[:120])
    sys.exit(3)
print("SECRETS MATCH the running backend.")
