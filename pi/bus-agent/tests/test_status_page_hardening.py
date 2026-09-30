"""P-M7: the status page must not be made to wait, or shown stale as if it were live."""

import queue
import socket
import time
import unittest

from bus_agent.status_page import StatusBoard, StatusServer

TOKEN = "0123456789abcdef0123456789abcdef"


def raw_request(port: int, head: str, body: bytes = b"", wait: float = 2.0) -> bytes:
    with socket.create_connection(("127.0.0.1", port), timeout=wait) as connection:
        connection.sendall(head.encode() + body)
        connection.settimeout(wait)
        chunks = b""
        try:
            while True:
                data = connection.recv(4096)
                if not data:
                    break
                chunks += data
        except socket.timeout:
            pass
        return chunks


class StatusPageHardeningTests(unittest.TestCase):
    def setUp(self) -> None:
        self.board = StatusBoard()
        self.server = StatusServer(self.board, queue.Queue(), TOKEN, port=0, controls=True)
        self.server.start()
        self.addCleanup(self.server.stop)

    def test_an_unauthorised_post_is_refused_without_waiting_for_its_body(self) -> None:
        started = time.monotonic()
        answer = raw_request(
            self.server.port,
            "POST /api/control HTTP/1.1\r\nHost: x\r\nContent-Length: 900000\r\n\r\n",
        )
        self.assertIn(b" 403 ", answer.split(b"\r\n")[0])
        self.assertLess(time.monotonic() - started, 1.5)

    def test_deeply_nested_json_is_a_400_not_a_crashed_request(self) -> None:
        body = b"[" * 1000 + b"]" * 1000
        answer = raw_request(
            self.server.port,
            f"POST /api/control HTTP/1.1\r\nHost: x\r\nX-Status-Token: {TOKEN}\r\n"
            f"Content-Length: {len(body)}\r\nContent-Type: application/json\r\n\r\n",
            body,
        )
        self.assertIn(b" 400 ", answer.split(b"\r\n")[0])

    def test_a_connection_that_sends_nothing_is_dropped_after_a_timeout(self) -> None:
        self.assertEqual(5, self.server._httpd.RequestHandlerClass.timeout)

    def test_the_state_says_how_old_it_is(self) -> None:
        self.board.publish({"busId": "AV-1"})
        time.sleep(0.15)
        state = self.board.read()
        self.assertGreaterEqual(state["ageSeconds"], 0.1)
        self.assertEqual("AV-1", state["busId"])

    def test_an_empty_board_is_marked_as_never_published(self) -> None:
        self.assertIsNone(self.board.read()["ageSeconds"])


if __name__ == "__main__":
    unittest.main()
