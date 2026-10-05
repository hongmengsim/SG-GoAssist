// The agreed two-bus sequence (handoff section 7), one step at a time. Each step says what the presenter
// does, whether that is REAL or SIMULATED, and how the director can tell it has happened. A step's check
// reads the state the backend and the agents report; the director never fakes an outcome.

const WAITING = "WAITING_FOR_BAY";
const POSITIONED = "POSITIONED_AT_STOP";

const agentOf = (state, busId) => state.buses[busId]?.agent ?? null;
const movementOf = (state, busId) => agentOf(state, busId)?.movement?.code;
const rampOf = (state, busId) => agentOf(state, busId)?.ramp?.state;
const reasonsOf = (state, busId) =>
  (agentOf(state, busId)?.decision?.reasons ?? []).map((reason) => reason.code);
const bayOf = (state) => state.backend.bay ?? {};
const requestOf = (state, busId) =>
  (state.backend.requests ?? []).find(
    (request) =>
      request.busId === busId &&
      ["SENDING", "ACKNOWLEDGED"].includes(request.status),
  );

/** The buses in the order they were configured: the first is Bus 1, the second Bus 2. */
const [BUS1, BUS2] = [0, 1];
const bus = (state, index) => state.order[index];
const kindOf = (state, index) =>
  `${state.buses[bus(state, index)]?.kind ?? "UNKNOWN"} bus`;

export const STEPS = [
  {
    id: 1,
    title: "Bus 1 occupies the boarding bay",
    label: (state) => kindOf(state, BUS1),
    presenter:
      "Press ARRIVE for Bus 1. Its state moves into the bay; the readings shown for a real Bus 1 are real.",
    act: {
      kind: "control",
      bus: BUS1,
      body: (config) => ({ command: "arrive", value: config.stopCode }),
    },
    check: (state) => {
      const occupant = bayOf(state).occupantBusId;
      return {
        done: occupant === bus(state, BUS1),
        detail: `bay occupant: ${occupant ?? "nobody"}`,
      };
    },
  },
  {
    id: 2,
    title: "Bus 2 arrives and reports that it is waiting for the bay",
    label: (state) => kindOf(state, BUS2),
    presenter: "Press ARRIVE for Bus 2. The bay is occupied, so it must wait.",
    act: {
      kind: "control",
      bus: BUS2,
      body: (config) => ({ command: "arrive", value: config.stopCode }),
    },
    check: (state) => {
      const second = bus(state, BUS2);
      const queued = (bayOf(state).waitingBusIds ?? []).includes(second);
      return {
        done: queued && movementOf(state, second) === WAITING,
        detail: `Bus 2 is ${movementOf(state, second) ?? "unknown"}, queued: ${queued ? "yes" : "no"}`,
      };
    },
  },
  {
    id: 3,
    title:
      "Bus 2 keeps an acknowledged request but cannot deploy while waiting",
    label: (state) =>
      `SIMULATED passenger; the ${kindOf(state, BUS2)} confirms for itself`,
    presenter:
      "Press CREATE REQUEST for Bus 2 (a simulated passenger, no phone). Bus 2 itself confirms it; its ramp must stay stowed.",
    act: { kind: "request", bus: BUS2 },
    check: (state) => {
      const second = bus(state, BUS2);
      const request = requestOf(state, second);
      const held =
        rampOf(state, second) === "STOWED" &&
        reasonsOf(state, second).includes(WAITING);
      return {
        done: request?.status === "ACKNOWLEDGED" && held,
        detail: `request ${request?.status ?? "none"}, ramp ${rampOf(state, second) ?? "unknown"}, held by the gate: ${held ? "yes" : "no"}`,
      };
    },
  },
  {
    id: 4,
    title: "Bus 1 leaves and releases the bay",
    label: (state) => kindOf(state, BUS1),
    presenter:
      "Press DEPART for Bus 1. The bay frees, but Bus 2's ramp must NOT move: leaving does not deploy for the next bus.",
    act: { kind: "control", bus: BUS1, body: () => ({ command: "depart" }) },
    check: (state) => {
      const bay = bayOf(state);
      const second = bus(state, BUS2);
      return {
        done:
          !bay.occupantBusId &&
          !bay.grantedBusId &&
          rampOf(state, second) === "STOWED",
        detail: `bay occupant: ${bay.occupantBusId ?? "nobody"}, granted: ${bay.grantedBusId ?? "nobody"}, Bus 2 ramp ${rampOf(state, second) ?? "unknown"}`,
      };
    },
  },
  {
    id: 5,
    title: "The controller sends Bus 2 into the bay",
    label: () => "REAL operator route",
    presenter:
      "Press GRANT THE BAY. This is the operator's action; nothing grants it automatically.",
    act: { kind: "proceed" },
    check: (state) => {
      const bay = bayOf(state);
      const second = bus(state, BUS2);
      return {
        done: bay.grantedBusId === second || bay.occupantBusId === second,
        detail: `granted: ${bay.grantedBusId ?? "nobody"}, occupant: ${bay.occupantBusId ?? "nobody"}`,
      };
    },
  },
  {
    id: 6,
    title:
      "Bus 2 enters the bay and confirms it is stopped at the boarding position",
    label: (state) => kindOf(state, BUS2),
    presenter: "Nothing to press: Bus 2 enters by itself once granted.",
    act: null,
    check: (state) => {
      const second = bus(state, BUS2);
      return {
        done:
          bayOf(state).occupantBusId === second &&
          movementOf(state, second) === POSITIONED,
        detail: `bay occupant: ${bayOf(state).occupantBusId ?? "nobody"}, Bus 2 is ${movementOf(state, second) ?? "unknown"}`,
      };
    },
  },
  {
    id: 7,
    title: "Bus 2 completes its simulated assistance sequence",
    label: () => "SIMULATED ramp",
    presenter:
      "Nothing to press: with its request confirmed and the zone clear, the simulated ramp deploys. This is a simulated completion, not a physical one.",
    act: null,
    check: (state) => {
      const second = bus(state, BUS2);
      return {
        done: rampOf(state, second) === "DEPLOYED",
        detail: `Bus 2 simulated ramp: ${rampOf(state, second) ?? "unknown"}`,
      };
    },
  },
];

/** What a step looks like to the page: its text, and whether the system shows it has happened. */
export function describeSteps(state, config) {
  return STEPS.map((step) => {
    const result =
      state?.order?.length >= 2
        ? step.check(state)
        : { done: false, detail: "waiting for both buses" };
    return {
      id: step.id,
      title: step.title,
      label: step.label(state),
      presenter: step.presenter,
      hasAction: step.act !== null,
      done: Boolean(result.done),
      detail: result.detail,
    };
  });
}

export function stepById(id) {
  return STEPS.find((step) => step.id === id);
}
