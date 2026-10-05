"""Text commands that drive a simulated bus and its surroundings, for demos and scenarios.

Each command returns a one-line reply; a command it does not understand returns an
explanation and changes nothing.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from .agent import DepartureBlocked

if TYPE_CHECKING:  # pragma: no cover
    from .runner import SimulatedRig

HELP = (
    "commands: arrive <stop> | depart | travel [stop] | place <class> [confidence] | clear | "
    "cover on|off | block on|off | dropout on|off | frames on|off | halt on|off | link on|off | calibrate | status"
)


def _switch(value: str) -> "bool | None":
    return {"on": True, "off": False}.get(value)


def apply_command(rig: "SimulatedRig", line: str) -> str:
    parts = line.split()
    if not parts:
        return HELP
    name, args = parts[0].lower(), parts[1:]
    agent = rig.agent

    if name == "arrive" and len(args) == 1:
        agent.arrive(args[0])
        return f"arrived at {args[0]}: {agent.movement}"
    if name == "depart" and not args:
        try:
            agent.depart()
        except DepartureBlocked as error:
            return f"cannot depart: {error}"
        return f"{agent.movement}"
    if name == "travel" and len(args) <= 1:
        agent.start_travel(args[0] if args else None)
        return f"{agent.movement}"
    if name == "calibrate" and not args:
        if agent.ramp.state != "STOWED":
            # A reference taken with the ramp out, or an object on it, would make that the "clear" path.
            return "refused: the ramp must be stowed and the path empty before calibrating"
        try:
            return f"beam reference taken at {rig.beam.calibrate()} mm (path must be empty)"
        except ValueError as error:
            return str(error)
    if name == "link" and len(args) == 1:
        switch = getattr(rig, "link", None)
        state = _switch(args[0].lower())
        if switch is None:
            return "link control is not available on this bus (simulated buses only)"
        if state is None:
            return "link needs on or off"
        switch.cut = not state  # "link off" cuts it
        return f"link {'on' if state else 'off'}"
    scene = {"place", "clear", "cover", "frames", "block", "dropout"}
    if name in scene and getattr(rig, "beam_source", None) is None:
        return "scene controls are not available with real sensors"
    if name == "place" and 1 <= len(args) <= 2:
        try:
            confidence = float(args[1]) if len(args) == 2 else 0.9
        except ValueError:
            return f"confidence must be a number, got {args[1]!r}"
        rig.camera.place(args[0], confidence)
        return f"placed {args[0]} in the ramp zone"
    if name == "clear" and not args:
        rig.camera.clear_objects()
        return "zone emptied"
    if name == "status" and not args:
        return _status(rig)

    switches = {"halt": agent.set_operator_halt}
    if getattr(rig, "beam_source", None) is not None:
        switches.update(
            {
                "cover": rig.camera.cover_lens,
                "frames": lambda on: rig.camera.stop_frames(not on),
                "block": rig.beam_source.set_blocked,
                "dropout": rig.beam_source.set_dropout,
            }
        )
    if name in switches and len(args) == 1:
        state = _switch(args[0].lower())
        if state is None:
            return f"{name} needs on or off"
        switches[name](state)
        return f"{name} {'on' if state else 'off'}"
    return f"not understood: {line.strip()!r}. {HELP}"


def _status(rig: "SimulatedRig") -> str:
    agent = rig.agent
    decision = agent.last_decision
    permission = decision.permission if decision else "none yet"
    reasons = ", ".join(decision.reasons) if decision and decision.reasons else "none"
    return (
        f"{agent.bus_id}{' (simulated)' if agent._simulated else ''}: movement {agent.movement}, ramp {agent.ramp.state} "
        f"({agent.ramp.progress:.0%}), gate {permission}, reasons: {reasons}"
    )
