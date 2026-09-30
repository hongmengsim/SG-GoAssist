"""P-M3 and P-M8: start-up rules for a real bus."""

import io
import queue
import threading
import unittest
from unittest import mock

from bus_agent.__main__ import _read_commands
from bus_agent.real_security import real_mode_findings


class StdinTests(unittest.TestCase):
    def test_end_of_input_does_not_stop_the_agent_but_quit_does(self) -> None:
        commands: "queue.Queue[str]" = queue.Queue()
        stop = threading.Event()
        with mock.patch("sys.stdin", io.StringIO("clear\n")):
            _read_commands(commands, stop)  # a service with no terminal reaches end of input at once
        self.assertFalse(stop.is_set())
        self.assertEqual("clear", commands.get_nowait())
        with mock.patch("sys.stdin", io.StringIO("quit\n")):
            _read_commands(commands, stop)
        self.assertTrue(stop.is_set())


class RealModeSecurityTests(unittest.TestCase):
    def test_a_real_bus_without_a_device_secret_is_refused(self) -> None:
        errors, _ = real_mode_findings("https://backend.example", None)
        self.assertTrue(errors)

    def test_a_secret_over_https_is_clean(self) -> None:
        self.assertEqual(([], []), real_mode_findings("https://backend.example", "s"))

    def test_plain_http_off_this_machine_is_a_warning_not_a_refusal(self) -> None:
        errors, warnings = real_mode_findings("http://192.168.1.20:3000", "s")
        self.assertEqual([], errors)
        self.assertTrue(warnings)

    def test_plain_http_to_this_machine_is_fine(self) -> None:
        self.assertEqual(([], []), real_mode_findings("http://localhost:3000", "s"))


if __name__ == "__main__":
    unittest.main()
