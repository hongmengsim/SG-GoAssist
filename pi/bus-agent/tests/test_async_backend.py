"""The non-blocking backend wrapper: the safety loop must never wait on the network."""

import threading
import time
import unittest

from bus_agent.async_backend import AsyncBackend
from bus_agent.backend import BackendError, BackendRefused, FakeBackend


class BlockingBackend(FakeBackend):
    """A backend whose calls take a long time until released, like a black-holed network."""

    def __init__(self) -> None:
        super().__init__()
        self.gate = threading.Event()
        self.entered = threading.Event()

    def post(self, kind, body):
        self.entered.set()
        self.gate.wait(5)
        return super().post(kind, body)


def wait_for(condition, seconds=3.0) -> bool:
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if condition():
            return True
        time.sleep(0.01)
    return False


class AsyncBackendTests(unittest.TestCase):
    def make(self, inner):
        backend = AsyncBackend(inner, retry_seconds=0.05)
        self.addCleanup(backend.stop)
        return backend

    def test_a_post_returns_at_once_even_when_the_network_is_stuck(self) -> None:
        inner = BlockingBackend()
        backend = self.make(inner)
        started = time.monotonic()
        backend.post("telemetry", {"a": 1})
        backend.post("telemetry", {"a": 2})
        backend.ack_request("REQ-1")
        backend.pending_requests()
        backend.pending_actuator_commands()
        backend.report_actuator("C1", {"state": "ACCEPTED"})
        self.assertLess(time.monotonic() - started, 0.2)
        inner.gate.set()

    def test_the_latest_report_of_each_kind_wins_while_one_is_stuck(self) -> None:
        inner = BlockingBackend()
        backend = self.make(inner)
        backend.post("telemetry", {"n": 1})
        self.assertTrue(inner.entered.wait(2))
        backend.post("telemetry", {"n": 2})
        backend.post("telemetry", {"n": 3})
        inner.gate.set()
        self.assertTrue(wait_for(lambda: len(inner.posted("telemetry")) >= 2))
        time.sleep(0.2)
        self.assertEqual([1, 3], [body["n"] for body in inner.posted("telemetry")])

    def test_different_kinds_are_each_delivered(self) -> None:
        inner = FakeBackend()
        backend = self.make(inner)
        for kind in ("bus-status", "ramp-simulation", "safety-decision", "telemetry"):
            backend.post(kind, {"kind": kind})
        self.assertTrue(wait_for(lambda: len(inner.posts) == 4))

    def test_a_failed_delivery_is_reported_on_the_next_post_and_retried(self) -> None:
        inner = FakeBackend()
        inner.fail_all = True
        backend = self.make(inner)
        backend.post("telemetry", {"n": 1})
        self.assertTrue(wait_for(lambda: backend.last_error is not None))
        with self.assertRaises(BackendError):
            backend.post("telemetry", {"n": 2})
        inner.fail_all = False
        self.assertTrue(wait_for(lambda: len(inner.posted("telemetry")) >= 1))
        self.assertEqual(2, inner.posted("telemetry")[-1]["n"])
        self.assertTrue(wait_for(lambda: backend.last_error is None))
        backend.post("telemetry", {"n": 3})

    def test_acknowledgements_are_delivered_in_order_once_and_retried_until_they_work(self) -> None:
        inner = FakeBackend()
        inner.fail_all = True
        backend = self.make(inner)
        backend.ack_request("REQ-1")
        backend.ack_request("REQ-2")
        time.sleep(0.2)
        self.assertEqual([], inner.acks)
        inner.fail_all = False
        self.assertTrue(wait_for(lambda: len(inner.acks) == 2))
        time.sleep(0.2)
        self.assertEqual(["REQ-1", "REQ-2"], inner.acks)

    def test_an_acknowledgement_the_backend_refuses_is_dropped_not_retried_forever(self) -> None:
        class Refusing(FakeBackend):
            def ack_request(self, request_id):
                self.acks.append(request_id)
                raise BackendRefused("Request belongs to a different bus")

        inner = Refusing()
        backend = self.make(inner)
        backend.ack_request("REQ-9")
        self.assertTrue(wait_for(lambda: inner.acks == ["REQ-9"]))
        time.sleep(0.3)
        self.assertEqual(["REQ-9"], inner.acks)

    def test_actuator_reports_keep_only_the_latest_per_command(self) -> None:
        inner = FakeBackend()
        inner.fail_all = True
        backend = self.make(inner)
        backend.report_actuator("C1", {"state": "ACCEPTED"})
        backend.report_actuator("C1", {"state": "COMPLETED"})
        inner.fail_all = False
        self.assertTrue(wait_for(lambda: inner.actuator_reports))
        time.sleep(0.2)
        self.assertEqual(["COMPLETED"], [body["state"] for _, body in inner.actuator_reports])

    def test_polls_return_the_last_answer_and_refresh_in_the_background(self) -> None:
        inner = FakeBackend()
        inner.requests = [{"requestId": "R1"}]
        inner.commands = [{"commandId": "C1"}]
        backend = self.make(inner)
        self.assertEqual([], backend.pending_requests())
        self.assertTrue(wait_for(lambda: backend.pending_requests() == [{"requestId": "R1"}]))
        self.assertTrue(wait_for(lambda: backend.pending_actuator_commands() == [{"commandId": "C1"}]))

    def test_the_operator_halt_is_cached_and_refreshed_in_the_background(self) -> None:
        inner = FakeBackend()
        inner.operator_halt = {"halted": True}
        backend = self.make(inner)
        self.assertIsNone(backend.pending_operator_halt())
        self.assertTrue(wait_for(lambda: backend.pending_operator_halt() == {"halted": True}))
        inner.fail_all = True
        inner.operator_halt = {"halted": False}
        backend.pending_operator_halt()
        time.sleep(0.2)
        self.assertEqual({"halted": True}, backend.pending_operator_halt(), "a failed poll keeps what was known")

    def test_a_failed_poll_keeps_the_previous_answer(self) -> None:
        inner = FakeBackend()
        inner.commands = [{"commandId": "C1"}]
        backend = self.make(inner)
        backend.pending_actuator_commands()
        self.assertTrue(wait_for(lambda: backend.pending_actuator_commands() == [{"commandId": "C1"}]))
        inner.fail_all = True
        inner.commands = []
        backend.pending_actuator_commands()
        time.sleep(0.2)
        self.assertEqual([{"commandId": "C1"}], backend.pending_actuator_commands())

    def test_post_now_waits_for_the_answer_but_only_up_to_its_timeout(self) -> None:
        inner = FakeBackend()
        backend = self.make(inner)
        self.assertEqual("CHANGED", backend.post_now("bus-status", {"m": 1}, timeout=2.0))
        inner.refuse_positioned = True
        with self.assertRaises(BackendRefused):
            backend.post_now("bus-status", {"movement": "POSITIONED_AT_STOP"}, timeout=2.0)
        stuck = BlockingBackend()
        slow = self.make(stuck)
        started = time.monotonic()
        with self.assertRaises(BackendError):
            slow.post_now("bus-status", {"m": 1}, timeout=0.2)
        self.assertLess(time.monotonic() - started, 1.0)
        stuck.gate.set()

    def test_the_capability_is_registered_in_the_background(self) -> None:
        class WithCapability(FakeBackend):
            def register_capability(self, capability):
                self.registered = capability

        inner = WithCapability()
        backend = self.make(inner)
        backend.register_capability({"ramp": True})
        self.assertTrue(wait_for(lambda: getattr(inner, "registered", None) == {"ramp": True}))

    def test_stop_ends_the_worker(self) -> None:
        backend = AsyncBackend(FakeBackend(), retry_seconds=0.05)
        backend.stop()
        self.assertFalse(backend.running)


if __name__ == "__main__":
    unittest.main()
