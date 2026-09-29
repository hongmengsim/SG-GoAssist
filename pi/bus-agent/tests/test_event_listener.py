"""The WebSocket listener, against a local server on an ephemeral port."""

import json
import threading
import time
import unittest

from websockets.sync.server import serve

from bus_agent.event_listener import EventListener

BUS = "AV-095-01"


class Server:
    """Accepts connections, records what the client sends, and plays a script per connection."""

    def __init__(self, scripts) -> None:
        self.scripts = list(scripts)
        self.received = []
        self.connections = 0
        self._server = serve(self._handle, "127.0.0.1", 0)
        self.url = f"ws://127.0.0.1:{self._server.socket.getsockname()[1]}"
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    def _handle(self, connection) -> None:
        self.connections += 1
        script = self.scripts.pop(0) if self.scripts else []
        try:
            self.received.append(json.loads(connection.recv(timeout=5)))
            for message in script:
                connection.send(json.dumps(message))
            if script and script[-1] == "close":
                return
            time.sleep(0.5)
        except Exception:  # noqa: BLE001 - a client that goes away ends the handler
            return

    def close(self) -> None:
        self._server.shutdown()


def wait_for(condition, seconds=3.0) -> bool:
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if condition():
            return True
        time.sleep(0.02)
    return False


class ListenerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.events = []
        self.listener = None
        self.server = None

    def tearDown(self) -> None:
        if self.listener:
            self.listener.stop()
        if self.server:
            self.server.close()

    def start(self, scripts, token=None):
        self.server = Server(scripts)
        self.listener = EventListener(
            self.server.url, BUS, self.events.append, token=token, reconnect_seconds=0.05
        )
        self.listener.start()

    def test_it_subscribes_to_its_own_bus_only(self) -> None:
        self.start([[{"type": "SUBSCRIBED_OPERATIONS", "scoped": True}]])
        self.assertTrue(wait_for(lambda: self.server.received))
        self.assertEqual({"type": "SUBSCRIBE_OPERATIONS", "buses": [BUS]}, self.server.received[0])

    def test_the_operator_token_is_sent_when_configured(self) -> None:
        self.start([[{"type": "SUBSCRIBED_OPERATIONS"}]], token="op-token")
        self.assertTrue(wait_for(lambda: self.server.received))
        self.assertEqual("op-token", self.server.received[0]["token"])

    def test_requests_and_bay_changes_are_passed_on_and_nothing_else(self) -> None:
        request = {"type": "ASSIST_REQUESTED", "request": {"requestId": "R1", "busId": BUS}}
        bay = {"type": "BAY_STATUS", "bay": {"stopCode": "18331", "grantedBusId": BUS}}
        other = {"type": "BUS_STATUS", "status": {"busId": BUS}}
        self.start([[{"type": "SUBSCRIBED_OPERATIONS"}, other, request, bay]])
        self.assertTrue(wait_for(lambda: len(self.events) >= 2))
        self.assertEqual([request, bay], self.events)

    def test_messages_that_are_not_objects_are_ignored(self) -> None:
        bay = {"type": "BAY_STATUS", "bay": {"stopCode": "18331", "grantedBusId": BUS}}
        self.start([["plain text", 42, [1, 2], {"no_type": True}, bay]])
        self.assertTrue(wait_for(lambda: self.events))
        self.assertEqual([bay], self.events)

    def test_it_reconnects_and_subscribes_again_after_the_connection_drops(self) -> None:
        request = {"type": "ASSIST_REQUESTED", "request": {"requestId": "R2", "busId": BUS}}
        self.start([["close"], [request]])
        self.assertTrue(wait_for(lambda: self.events, seconds=5.0))
        self.assertGreaterEqual(self.server.connections, 2)
        self.assertEqual(2, len(self.server.received))

    def test_an_unreachable_server_does_not_raise_and_stop_ends_the_thread(self) -> None:
        listener = EventListener("ws://127.0.0.1:1", BUS, self.events.append, reconnect_seconds=0.05)
        listener.start()
        time.sleep(0.2)
        listener.stop()
        self.assertFalse(listener.running)

    def test_a_refused_subscription_is_recorded_not_hidden(self) -> None:
        self.start([[{"type": "AUTH_REQUIRED"}]])
        self.assertTrue(wait_for(lambda: self.listener.last_error is not None))
        self.assertIn("AUTH_REQUIRED", self.listener.last_error)


    def test_with_a_device_secret_it_subscribes_as_the_device_with_a_valid_signature(self) -> None:
        from bus_agent.signing import sign_body

        self.server = Server([[{"type": "SUBSCRIBED_DEVICE", "busId": BUS}]])
        self.listener = EventListener(self.server.url, BUS, self.events.append, secret="s3cret", reconnect_seconds=0.05)
        self.listener.start()
        self.assertTrue(wait_for(lambda: self.server.received))
        message = self.server.received[0]
        self.assertEqual("SUBSCRIBE_DEVICE", message["type"])
        self.assertEqual(BUS, message["busId"])
        self.assertEqual(BUS, message["deviceId"])
        self.assertEqual(
            sign_body("s3cret", BUS, message["timestamp"], b"SUBSCRIBE_DEVICE"), message["signature"]
        )
        self.assertNotIn("token", message)
        self.assertNotIn("s3cret", json.dumps(message))


if __name__ == "__main__":
    unittest.main()
