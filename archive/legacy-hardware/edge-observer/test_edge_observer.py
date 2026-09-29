import hashlib
import hmac
import unittest

from edge_observer import signed_headers


class SignedHeadersTests(unittest.TestCase):
    def test_signature_covers_exact_body_bytes(self) -> None:
        body = b'{"confidence":1.00}'
        headers = signed_headers(body, "EDGE-01", "secret", 1_725_000_000_000)
        expected = hmac.new(
            b"secret",
            b"EDGE-01.1725000000000." + body,
            hashlib.sha256,
        ).hexdigest()
        self.assertEqual(headers["x-signature"], expected)

        changed_body = b'{"confidence":1}'
        changed = signed_headers(changed_body, "EDGE-01", "secret", 1_725_000_000_000)
        self.assertNotEqual(headers["x-signature"], changed["x-signature"])

    def test_secret_is_optional_for_local_development(self) -> None:
        self.assertEqual(
            signed_headers(b"{}", "EDGE-01", None),
            {"Content-Type": "application/json"},
        )


if __name__ == "__main__":
    unittest.main()
