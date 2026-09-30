"""P-H2 and P-M6: link loss must be seen when the worker is stuck, dead or has never succeeded,
and when only one direction (posting) is failing."""

import http.client
import time
import unittest

from bus_agent.agent import AgentConfig
from bus_agent.async_backend import AsyncBackend
from bus_agent.backend import BackendError, FakeBackend
from bus_agent.http_backend import HttpBackend

from tests.test_agent import STOP, World
from tests.test_async_backend import BlockingBackend, wait_for


class RaisesHttpException(FakeBackend):
    def post(self, kind, body):
        raise http.client.IncompleteRead(b"")


class StuckWorkerTests(unittest.TestCase):
    def test_a_worker_that_raises_a_non_backend_error_survives_and_reports_failure(self) -> None:
        backend = AsyncBackend(RaisesHttpException(), retry_seconds=0.02)
        self.addCleanup(backend.stop)
        backend.post("telemetry", {"a": 1})
        self.assertTrue(wait_for(lambda: backend.last_error is not None))
        self.assertTrue(backend.running, "the worker thread must not die")

    def test_the_http_backend_turns_library_errors_into_backend_errors(self) -> None:
        def transport(method, url, headers, body, timeout):
            raise http.client.IncompleteRead(b"")

        http_backend = HttpBackend("http://x", "AV-1", transport=transport)
        with self.assertRaises(BackendError):
            http_backend.pending_requests()

    def test_time_without_any_success_grows_while_the_worker_is_stuck(self) -> None:
        inner = BlockingBackend()
        backend = AsyncBackend(inner, retry_seconds=0.02)
        self.addCleanup(inner.gate.set)
        self.addCleanup(backend.stop)
        backend.post("telemetry", {"a": 1})
        self.assertTrue(inner.entered.wait(2))
        time.sleep(0.3)
        self.assertGreaterEqual(backend.link_problem_seconds(), 0.25)

    def test_the_agent_halts_on_link_loss_when_the_worker_is_stuck(self) -> None:
        inner = BlockingBackend()
        backend = AsyncBackend(inner, retry_seconds=0.02, poll_seconds=0.0)
        self.addCleanup(inner.gate.set)
        self.addCleanup(backend.stop)
        world = World(config=AgentConfig(link_loss_halt_seconds=1.0), backend=backend)
        world.agent.arrive(STOP)
        for _ in range(60):
            world.tick()
            time.sleep(0.02)
        self.assertIn("BACKEND_LINK_LOST", world.agent.last_decision.reasons)


class DirectionTests(unittest.TestCase):
    def test_failing_posts_count_as_link_loss_even_while_polls_succeed(self) -> None:
        class PostsFail(FakeBackend):
            def post(self, kind, body):
                raise BackendError("posts are failing")

        world = World(config=AgentConfig(link_loss_halt_seconds=3.0), backend=PostsFail())
        world.tick(40)
        self.assertIn("BACKEND_LINK_LOST", world.agent.last_decision.reasons)


if __name__ == "__main__":
    unittest.main()
