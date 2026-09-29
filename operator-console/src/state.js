// The console's whole picture of the system, built only by reducing the messages the
// backend pushes to operators (contracts: OperatorStatusUpdateMessage and the passenger
// request messages). Live mode and mock mode feed the same reducer, so the views cannot
// tell them apart. Nothing here changes the state it is given.

export const MAX_AUDIT = 500;

export function initialState() {
  return {
    buses: {},
    bays: {},
    requests: {},
    cases: {},
    telemetry: {},
    autonomy: {},
    metrics: {},
    audit: [],
  };
}

const isRecord = (value) => typeof value === "object" && value !== null;
const isId = (value) => typeof value === "string" && value.length > 0;
const time = (value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function withBus(state, busId, patch) {
  return {
    ...state,
    buses: { ...state.buses, [busId]: { ...state.buses[busId], ...patch } },
  };
}

/** Keeps the newer of two records of the same kind for one bus. */
function newer(existing, incoming, field) {
  return !existing || time(incoming[field]) >= time(existing[field]);
}

function requestFromPush(request) {
  return {
    requestId: request.requestId,
    busId: request.busId,
    busService: request.busService,
    boardingStop: request.boardingStop,
    stopCode: request.stopCode,
    assistanceTypes: request.assistanceTypes,
    createdAt: request.createdAt,
    status: "SENDING",
  };
}

function withRequest(state, requestId, patch) {
  const existing = state.requests[requestId] ?? { requestId };
  return {
    ...state,
    requests: { ...state.requests, [requestId]: { ...existing, ...patch } },
  };
}

export function reduce(state, message) {
  if (!isRecord(message)) return state;
  switch (message.type) {
    case "BUS_STATUS": {
      const status = message.status;
      if (!isRecord(status) || !isId(status.busId)) return state;
      if (!newer(state.buses[status.busId]?.status, status, "observedAt"))
        return state;
      return withBus(state, status.busId, { status });
    }
    case "RAMP_SIMULATION": {
      const ramp = message.ramp;
      if (!isRecord(ramp) || !isId(ramp.busId)) return state;
      if (!newer(state.buses[ramp.busId]?.ramp, ramp, "observedAt"))
        return state;
      return withBus(state, ramp.busId, { ramp });
    }
    case "RAMP_SAFETY": {
      const decision = message.decision;
      if (!isRecord(decision) || !isId(decision.busId)) return state;
      if (!newer(state.buses[decision.busId]?.decision, decision, "observedAt"))
        return state;
      return withBus(state, decision.busId, { decision });
    }
    case "HELP_REQUIRED": {
      const help = message.help;
      if (!isRecord(help) || !isId(help.busId)) return state;
      if (!newer(state.buses[help.busId]?.help, help, "observedAt"))
        return state;
      return withBus(state, help.busId, { help });
    }
    case "OPERATOR_HALT": {
      const halt = message.halt;
      if (!isRecord(halt) || !isId(halt.busId)) return state;
      if (!newer(state.buses[halt.busId]?.operatorHalt, halt, "setAt"))
        return state;
      return withBus(state, halt.busId, { operatorHalt: halt });
    }
    case "BAY_STATUS": {
      const bay = message.bay;
      if (!isRecord(bay) || !isId(bay.stopCode)) return state;
      if (!newer(state.bays[bay.stopCode], bay, "updatedAt")) return state;
      return { ...state, bays: { ...state.bays, [bay.stopCode]: bay } };
    }
    case "ASSIST_REQUESTED": {
      const request = message.request;
      if (!isRecord(request) || !isId(request.requestId)) return state;
      return withRequest(state, request.requestId, requestFromPush(request));
    }
    case "CASE_SNAPSHOT": {
      const item = message.case;
      if (!isRecord(item) || !isId(item.caseId)) return state;
      return { ...state, cases: { ...state.cases, [item.caseId]: item } };
    }
    case "CASE_STATUS": {
      if (!isId(message.caseId)) return state;
      const existing = state.cases[message.caseId] ?? {
        caseId: message.caseId,
      };
      const next = { ...existing, updatedAt: message.timestamp };
      for (const key of [
        "state",
        "busId",
        "stopCode",
        "passengerCount",
        "assistanceTypes",
      ]) {
        if (message[key] !== undefined) next[key] = message[key];
      }
      // A status push carries the current reason, so an absent one means it no longer applies.
      if (message.escalationReason !== undefined)
        next.escalationReason = message.escalationReason;
      else delete next.escalationReason;
      return { ...state, cases: { ...state.cases, [message.caseId]: next } };
    }
    case "TELEMETRY_SNAPSHOT": {
      const item = message.telemetry;
      if (!isRecord(item) || !isId(item.busId)) return state;
      return {
        ...state,
        telemetry: { ...state.telemetry, [item.busId]: item },
      };
    }
    case "AUTONOMY_SNAPSHOT": {
      const item = message.autonomy;
      if (!isRecord(item) || !isId(item.busId)) return state;
      return { ...state, autonomy: { ...state.autonomy, [item.busId]: item } };
    }
    case "METRICS_SNAPSHOT": {
      if (!isRecord(message.metrics)) return state;
      return {
        ...state,
        metrics: {
          ...message.metrics,
          devicesOnline: message.devicesOnline,
          perceptionPrecision: message.perceptionPrecision,
        },
      };
    }
    case "REQUEST_SNAPSHOT": {
      // A request as listed by the backend. Only the fields the console needs: never the session id.
      const request = message.request;
      if (!isRecord(request) || !isId(request.requestId)) return state;
      const kept = {};
      for (const key of [
        "caseId",
        "busId",
        "busService",
        "boardingStop",
        "stopCode",
        "assistanceTypes",
        "createdAt",
        "status",
      ]) {
        if (request[key] !== undefined) kept[key] = request[key];
      }
      return withRequest(state, request.requestId, kept);
    }
    case "REQUEST_STATUS": {
      if (!isId(message.requestId)) return state;
      const patch = { status: message.status };
      for (const key of ["busId", "busService", "assistanceTypes"]) {
        if (message[key] !== undefined) patch[key] = message[key];
      }
      return withRequest(state, message.requestId, patch);
    }
    default:
      return state;
  }
}

/**
 * A help request stays active while the bus is still in the state it asked for help in.
 * Once the bus reports a different state after the request, the situation has moved on.
 */
export function activeHelp(bus) {
  const { help, ramp } = bus ?? {};
  if (!help) return false;
  if (!ramp) return true;
  if (ramp.state === help.state) return true;
  return time(ramp.observedAt) <= time(help.observedAt);
}

function sortNewestFirst(events) {
  return [...events].sort((a, b) => time(b.timestamp) - time(a.timestamp));
}

/** Replaces the audit list, for example after fetching it from the backend. */
export function setAudit(state, events) {
  const seen = new Set();
  const unique = events.filter((event) => {
    if (!isRecord(event) || !isId(event.eventId) || seen.has(event.eventId))
      return false;
    seen.add(event.eventId);
    return true;
  });
  return { ...state, audit: sortNewestFirst(unique).slice(0, MAX_AUDIT) };
}

export function addAudit(state, event) {
  if (!isRecord(event) || !isId(event.eventId)) return state;
  if (state.audit.some((existing) => existing.eventId === event.eventId))
    return state;
  return setAudit(state, [event, ...state.audit]);
}
