"""The simulated ramp. Nothing here is physical, and nothing claims physical verification.

States follow contracts/ (SimulatedRampState). Functions return a new RampSim and never
change the one they are given.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace

STOWED = "STOWED"
DEPLOYMENT_REQUESTED = "DEPLOYMENT_REQUESTED"
DEPLOYING = "DEPLOYING"
DEPLOYED = "DEPLOYED"
HALTED = "HALTED"

CONTINUE = "CONTINUE"

# ASSUMPTION: a placeholder for the simulated deployment time, not a measured or agreed value.
DEFAULT_DEPLOY_SECONDS = 4.0

_MOVING = frozenset({DEPLOYMENT_REQUESTED, DEPLOYING, HALTED})


@dataclass(frozen=True)
class RampSim:
    state: str = STOWED
    progress: float = 0.0
    halt_reasons: tuple = ()


def request_deployment(ramp: RampSim) -> RampSim:
    """Only a stowed ramp can be asked to deploy; any other state is left as it is."""
    return RampSim(DEPLOYMENT_REQUESTED) if ramp.state == STOWED else ramp


def stow(ramp: RampSim) -> RampSim:
    """Simulated instant retraction, from any state."""
    return RampSim()


def _valid_step(dt: float, deploy_seconds: float) -> bool:
    return (
        math.isfinite(dt)
        and dt >= 0
        and math.isfinite(deploy_seconds)
        and deploy_seconds > 0
    )


def step(
    ramp: RampSim,
    permission: str,
    reasons: tuple,
    dt: float,
    deploy_seconds: float = DEFAULT_DEPLOY_SECONDS,
) -> RampSim:
    """Advance one tick under the gate's permission.

    A halt holds the ramp where it is and records why; the same ramp resumes when the gate
    says CONTINUE again. A stowed or deployed ramp does not react to the gate.
    """
    if ramp.state not in _MOVING:
        return ramp
    if permission != CONTINUE:
        return replace(ramp, state=HALTED, halt_reasons=tuple(reasons))
    if not _valid_step(dt, deploy_seconds):
        return replace(ramp, state=DEPLOYING, halt_reasons=())
    progress = min(1.0, ramp.progress + dt / deploy_seconds)
    state = DEPLOYED if progress >= 1.0 else DEPLOYING
    return RampSim(state, progress, ())
