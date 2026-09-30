"""P-M8: the Pi accepts only answers the backend signed, so a forged 'halted: false' cannot
release an operator halt."""

import hashlib
import hmac
import json
import unittest

from bus_agent.backend import BackendError
from bus_agent.http_backend import HttpBackend
from bus_agent.signing import response_signature

BUS = "AV-095-01"
NOW_MS = 1_800_000_000_000
SECRET = "s3cret"


def signed_reply(status, payload, secret=SECRET, request_signature=None):
    """A transport that answers as the real backend does (signature over the request's own)."""

    def transport(method, url, headers, body, timeout):
        raw = json.dumps(payload).encode()
        signature = request_signature or headers["x-signature"]
        reply_headers = {}
        if secret is not None:
            reply_headers["x-response-signature"] = response_signature(secret, signature, status, raw)
        return status, raw, reply_headers

    return transport


def backend(transport):
    return HttpBackend("http://backend.test:3000", BUS, secret=SECRET, transport=transport, now_ms=lambda: NOW_MS)


class ResponseSigningTests(unittest.TestCase):
    def test_a_correctly_signed_answer_is_accepted(self) -> None:
        result = backend(signed_reply(200, {"busId": BUS, "halted": False})).pending_operator_halt()
        self.assertEqual(False, result["halted"])

    def test_the_known_answer(self) -> None:
        expected = hmac.new(b"k", b"REQ.200.{}", hashlib.sha256).hexdigest()
        self.assertEqual(expected, response_signature("k", "REQ", 200, b"{}"))

    def test_an_unsigned_answer_is_refused_when_a_secret_is_set(self) -> None:
        with self.assertRaises(BackendError):
            backend(signed_reply(200, {"halted": False}, secret=None)).pending_operator_halt()

    def test_an_answer_signed_with_the_wrong_secret_is_refused(self) -> None:
        with self.assertRaises(BackendError):
            backend(signed_reply(200, {"halted": False}, secret="other")).pending_operator_halt()

    def test_an_answer_made_for_a_different_request_is_refused(self) -> None:
        with self.assertRaises(BackendError):
            backend(signed_reply(200, {"halted": False}, request_signature="old")).pending_operator_halt()

    def test_a_tampered_body_is_refused(self) -> None:
        def transport(method, url, headers, body, timeout):
            genuine = json.dumps({"halted": True}).encode()
            forged = json.dumps({"halted": False}).encode()
            signature = response_signature(SECRET, headers["x-signature"], 200, genuine)
            return 200, forged, {"x-response-signature": signature}

        with self.assertRaises(BackendError):
            backend(transport).pending_operator_halt()

    def test_without_a_secret_nothing_is_checked(self) -> None:
        def transport(method, url, headers, body, timeout):
            return 200, json.dumps({"halted": False}).encode(), {}

        plain = HttpBackend("http://x", BUS, secret=None, transport=transport, now_ms=lambda: NOW_MS)
        self.assertEqual(False, plain.pending_operator_halt()["halted"])


if __name__ == "__main__":
    unittest.main()
