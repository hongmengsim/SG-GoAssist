"""The agent side of the demo director: movement-only control for a real bus, scene and link
control for simulated ones, and nothing that touches a real bus's sensors."""

import json
import queue
import unittest
import urllib.error
import urllib.request
from types import SimpleNamespace

from bus_agent.__main__ import control_level, simulate_agent_config
from bus_agent.backend import BackendError, FakeBackend
from bus_agent.console import apply_command
from bus_agent.link_switch import LinkSwitch
from bus_agent.status_page import StatusBoard, StatusServer, parse_control

from tests.test_agent import World

TOKEN = "0123456789abcdef0123456789abcdef"


def post(base, body, token=TOKEN):
    request = urllib.request.Request(
        base + "/api/control",
        data=json.dumps(body).encode(),
        method="POST",
        headers={"Content-Type": "application/json", "X-Status-Token": token},
    )
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())


class ParseTests(unittest.TestCase):
    def test_a_safe_object_can_be_placed_with_its_own_confidence(self) -> None:
        self.assertEqual("place leaf 0.95", parse_control({"command": "place", "value": "leaf", "confidence": 0.95}))
        self.assertEqual("place leaf 0.9", parse_control({"command": "place", "value": "leaf"}))

    def test_a_bad_confidence_is_refused(self) -> None:
        for bad in ("high", 1.5, -0.1, True, float("nan")):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                parse_control({"command": "place", "value": "leaf", "confidence": bad})

    def test_the_link_can_be_cut_and_restored(self) -> None:
        self.assertEqual("link off", parse_control({"command": "link", "value": "off"}))
        with self.assertRaises(ValueError):
            parse_control({"command": "link", "value": "maybe"})


class ServerLevelTests(unittest.TestCase):
    def serve(self, level):
        commands: "queue.Queue[str]" = queue.Queue()
        server = StatusServer(StatusBoard(), commands, TOKEN, port=0, controls=level)
        server.start()
        self.addCleanup(server.stop)
        return f"http://127.0.0.1:{server.port}", commands

    def test_a_real_bus_in_movement_mode_takes_movement_commands_only(self) -> None:
        base, commands = self.serve("movement")
        for body in (
            {"command": "arrive", "value": "18331"},
            {"command": "depart"},
            {"command": "travel", "value": "18301"},
        ):
            self.assertEqual(202, post(base, body)[0], body)
        for body in (
            {"command": "place", "value": "person"},
            {"command": "block", "value": "on"},
            {"command": "dropout", "value": "on"},
            {"command": "cover", "value": "on"},
            {"command": "clear"},
            {"command": "halt", "value": "on"},
            {"command": "link", "value": "off"},
            {"command": "frames", "value": "off"},
        ):
            status, answer = post(base, body)
            self.assertEqual(403, status, body)
        self.assertEqual(3, commands.qsize(), "only the movement commands were queued")

    def test_a_simulated_bus_takes_every_command(self) -> None:
        base, commands = self.serve("scene")
        for body in (
            {"command": "arrive", "value": "18331"},
            {"command": "place", "value": "leaf", "confidence": 0.95},
            {"command": "block", "value": "on"},
            {"command": "link", "value": "off"},
        ):
            self.assertEqual(202, post(base, body)[0], body)

    def test_with_no_control_level_nothing_is_taken_and_a_wrong_code_is_refused(self) -> None:
        base, commands = self.serve("")
        self.assertEqual(403, post(base, {"command": "depart"})[0])
        base, commands = self.serve("scene")
        self.assertEqual(403, post(base, {"command": "depart"}, token="wrong")[0])
        self.assertTrue(commands.empty())

    def test_the_snapshot_says_which_level_of_control_is_on(self) -> None:
        from bus_agent.status_page import snapshot

        world = World()
        data = snapshot(world.agent, None, controls=True, control_level="movement")
        self.assertEqual("movement", data["controlLevel"])
        self.assertFalse(data["controls"], "the scene controls card stays hidden")
        self.assertTrue(snapshot(world.agent, None, controls=True)["controls"])


class LinkSwitchTests(unittest.TestCase):
    def test_a_cut_link_fails_every_call_and_a_restored_one_works(self) -> None:
        inner = FakeBackend()
        switch = LinkSwitch(inner)
        self.assertEqual("CHANGED", switch.post("telemetry", {}))
        switch.cut = True
        for call in (
            lambda: switch.post("telemetry", {}),
            lambda: switch.ack_request("R1"),
            lambda: switch.pending_requests(),
            lambda: switch.pending_actuator_commands(),
            lambda: switch.pending_operator_halt(),
            lambda: switch.report_actuator("C1", {}),
        ):
            with self.assertRaises(BackendError):
                call()
        switch.cut = False
        self.assertEqual([], switch.pending_requests())

    def test_it_forwards_what_the_real_backend_offers_and_hides_what_it_does_not(self) -> None:
        class Plain:
            def post(self, kind, body):
                return "CHANGED"

        self.assertFalse(hasattr(LinkSwitch(Plain()), "register_capability"))
        self.assertTrue(hasattr(LinkSwitch(FakeBackend()), "pending_accepted_requests"))

    def test_the_console_command_cuts_the_link_of_a_simulated_bus_only(self) -> None:
        world = World()
        switch = LinkSwitch(FakeBackend())
        rig = SimpleNamespace(
            agent=world.agent, beam=world.beam, camera=world.camera, beam_source=world.beam_source, link=switch
        )
        self.assertIn("link off", apply_command(rig, "link off"))
        self.assertTrue(switch.cut)
        apply_command(rig, "link on")
        self.assertFalse(switch.cut)
        real = SimpleNamespace(agent=world.agent, beam=world.beam)  # no scene, no link switch
        self.assertIn("not available", apply_command(real, "link off"))


class StartUpTests(unittest.TestCase):
    def args(self, **kwargs):
        base = dict(simulate=False, real=False, demo_movement=False, deployment_timeout=None, link_loss_halt=None)
        base.update(kwargs)
        return SimpleNamespace(**base)

    def test_the_control_level_follows_the_mode_and_an_explicit_flag(self) -> None:
        self.assertEqual("scene", control_level(self.args(simulate=True)))
        self.assertEqual("", control_level(self.args(real=True)))
        self.assertEqual("movement", control_level(self.args(real=True, demo_movement=True)))
        self.assertEqual("", control_level(self.args()))

    def test_a_simulated_bus_can_be_given_the_two_safety_timeouts(self) -> None:
        config = simulate_agent_config(self.args(simulate=True, deployment_timeout=20.0, link_loss_halt=8.0))
        self.assertEqual(20.0, config.deployment_timeout_seconds)
        self.assertEqual(8.0, config.link_loss_halt_seconds)
        plain = simulate_agent_config(self.args(simulate=True))
        self.assertIsNone(plain.deployment_timeout_seconds)
        self.assertIsNone(plain.link_loss_halt_seconds)


if __name__ == "__main__":
    unittest.main()


class RunnerLevelTests(unittest.TestCase):
    def test_the_published_snapshot_carries_the_control_level(self) -> None:
        from bus_agent.runner import Runner, build_simulated_rig

        backend = FakeBackend()
        rig = build_simulated_rig("AV-1", "95", backend)
        board = StatusBoard()
        runner = Runner(rig, queue.Queue(), board=board, controls=False, control_level="movement")
        runner.step()
        self.assertEqual("movement", board.read()["controlLevel"])
