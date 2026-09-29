"""The HTTP backend client, against a fake transport (no network)."""

import json
import unittest

from bus_agent.backend import BackendError, BackendRefused
from bus_agent.http_backend import HttpBackend
from bus_agent.signing import sign_body

BASE = "http://backend.test:3000"
BUS = "AV-095-01"
NOW_MS = 1_800_000_000_000


class FakeTransport:
    def __init__(self, status=200, payload=None, error=None) -> None:
        self.status = status
        self.payload = {} if payload is None else payload
        self.error = error
        self.calls = []

    def __call__(self, method, url, headers, body, timeout):
        self.calls.append({"method": method, "url": url, "headers": headers, "body": body})
        if self.error is not None:
            raise self.error
        raw = self.payload if isinstance(self.payload, bytes) else json.dumps(self.payload).encode()
        return self.status, raw


def backend(transport, secret=None):
    return HttpBackend(BASE, BUS, secret=secret, transport=transport, now_ms=lambda: NOW_MS)


class PostTests(unittest.TestCase):
    def test_each_report_kind_goes_to_its_own_endpoint(self) -> None:
        expected = {
            "bus-status": "status",
            "ramp-simulation": "ramp-simulation",
            "safety-decision": "safety-decision",
            "help-required": "help-required",
            "telemetry": "telemetry",
        }
        for kind, suffix in expected.items():
            with self.subTest(kind=kind):
                transport = FakeTransport(202, {"outcome": "CHANGED"})
                self.assertEqual("CHANGED", backend(transport).post(kind, {"a": 1}))
                call = transport.calls[0]
                self.assertEqual("POST", call["method"])
                self.assertEqual(f"{BASE}/api/operations/vehicles/{BUS}/{suffix}", call["url"])
                self.assertEqual({"a": 1}, json.loads(call["body"]))
                self.assertEqual("application/json", call["headers"]["Content-Type"])

    def test_an_unknown_kind_is_a_programming_error(self) -> None:
        with self.assertRaises(ValueError):
            backend(FakeTransport()).post("nonsense", {})

    def test_the_signature_covers_the_exact_bytes_sent(self) -> None:
        transport = FakeTransport(202, {"outcome": "CHANGED"})
        backend(transport, secret="s3cret").post("bus-status", {"movement": "DEPARTING"})
        call = transport.calls[0]
        self.assertEqual(BUS, call["headers"]["x-device-id"])
        self.assertEqual(str(NOW_MS), call["headers"]["x-timestamp"])
        self.assertEqual(
            sign_body("s3cret", BUS, str(NOW_MS), call["body"]), call["headers"]["x-signature"]
        )

    def test_without_a_secret_no_signature_is_sent(self) -> None:
        transport = FakeTransport(202, {"outcome": "CHANGED"})
        backend(transport).post("bus-status", {})
        self.assertNotIn("x-signature", transport.calls[0]["headers"])

    def test_a_refusal_is_reported_as_refused(self) -> None:
        transport = FakeTransport(409, {"error": "Bay is occupied by AV-095-01; wait for a grant"})
        with self.assertRaisesRegex(BackendRefused, "occupied"):
            backend(transport).post("bus-status", {})

    def test_other_failures_are_backend_errors(self) -> None:
        cases = [
            FakeTransport(500, {"error": "boom"}),
            FakeTransport(400, {"error": "bad"}),
            FakeTransport(401, {"error": "auth"}),
            FakeTransport(202, b"not json"),
            FakeTransport(error=OSError("connection refused")),
            FakeTransport(error=TimeoutError("slow")),
        ]
        for transport in cases:
            with self.subTest(status=transport.status, error=transport.error):
                with self.assertRaises(BackendError) as caught:
                    backend(transport).post("bus-status", {})
                self.assertNotIsInstance(caught.exception, BackendRefused)


class OtherCallsTests(unittest.TestCase):
    def test_ack_posts_the_request_id_to_the_bus_endpoint(self) -> None:
        transport = FakeTransport(200, {"success": True})
        backend(transport).ack_request("REQ-1")
        call = transport.calls[0]
        self.assertEqual(f"{BASE}/api/operations/vehicles/{BUS}/assist-ack", call["url"])
        self.assertEqual({"requestId": "REQ-1"}, json.loads(call["body"]))

    def test_a_refused_acknowledgement_is_reported(self) -> None:
        with self.assertRaises(BackendRefused):
            backend(FakeTransport(409, {"error": "Request belongs to a different bus"})).ack_request("REQ-1")

    def test_pending_requests_are_read_from_the_bus_endpoint(self) -> None:
        transport = FakeTransport(200, {"count": 1, "requests": [{"requestId": "REQ-1"}]})
        self.assertEqual([{"requestId": "REQ-1"}], backend(transport).pending_requests())
        self.assertEqual(f"{BASE}/api/operations/vehicles/{BUS}/requests", transport.calls[0]["url"])
        self.assertEqual("GET", transport.calls[0]["method"])

    def test_actuator_commands_are_read_for_this_bus_only(self) -> None:
        transport = FakeTransport(200, {"count": 1, "commands": [{"commandId": "C1"}]})
        self.assertEqual([{"commandId": "C1"}], backend(transport).pending_actuator_commands())
        self.assertEqual(f"{BASE}/api/operations/actuators/pending?busId={BUS}", transport.calls[0]["url"])

    def test_a_signed_get_signs_an_empty_json_object_like_the_backend_expects(self) -> None:
        transport = FakeTransport(200, {"commands": []})
        backend(transport, secret="s3cret").pending_actuator_commands()
        headers = transport.calls[0]["headers"]
        self.assertEqual(sign_body("s3cret", BUS, str(NOW_MS), b"{}"), headers["x-signature"])
        self.assertIsNone(transport.calls[0]["body"])

    def test_an_unexpected_shape_is_a_backend_error_not_a_crash(self) -> None:
        with self.assertRaises(BackendError):
            backend(FakeTransport(200, {"requests": "nope"})).pending_requests()
        with self.assertRaises(BackendError):
            backend(FakeTransport(200, ["x"])).pending_actuator_commands()

    def test_actuator_status_goes_to_the_command_endpoint(self) -> None:
        transport = FakeTransport(202, {"case": {}})
        backend(transport).report_actuator("CMD-1", {"state": "ACCEPTED"})
        call = transport.calls[0]
        self.assertEqual(f"{BASE}/api/operations/actuators/CMD-1/status", call["url"])
        self.assertEqual({"state": "ACCEPTED"}, json.loads(call["body"]))

    def test_the_operator_halt_is_read_from_the_bus_endpoint(self) -> None:
        transport = FakeTransport(200, {"busId": BUS, "halted": True, "setAt": "t"})
        self.assertEqual(True, backend(transport).pending_operator_halt()["halted"])
        self.assertEqual(f"{BASE}/api/operations/vehicles/{BUS}/operator-halt", transport.calls[0]["url"])
        with self.assertRaises(BackendError):
            backend(FakeTransport(200, ["nope"])).pending_operator_halt()

    def test_ids_are_url_encoded(self) -> None:
        transport = FakeTransport(202, {"case": {}})
        backend(transport).report_actuator("CMD/../1", {"state": "ACCEPTED"})
        self.assertNotIn("/../", transport.calls[0]["url"])

    def test_the_capability_is_registered_with_a_put(self) -> None:
        transport = FakeTransport(200, {})
        backend(transport).register_capability({"ramp": True})
        call = transport.calls[0]
        self.assertEqual("PUT", call["method"])
        self.assertEqual(f"{BASE}/api/operations/vehicles/{BUS}/capabilities", call["url"])


if __name__ == "__main__":
    unittest.main()
