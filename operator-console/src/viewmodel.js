// Pure functions that turn the console's state into what each view shows. No HTML here.

import {
  MOVEMENT,
  OPEN_REQUEST_STATUSES,
  PASSENGER_SEES,
  PERMISSION,
  RAMP,
  TOF,
  ZONE,
  HALT_REASON,
  HELP_REASON,
  humanize,
  reasonsText,
  word,
} from "./labels.js";
import { activeHelp } from "./state.js";

const sortedKeys = (record) => Object.keys(record).sort();

export function busIds(state) {
  return sortedKeys(state.buses);
}

export function stopCodes(state) {
  const codes = new Set(Object.keys(state.bays));
  for (const bus of Object.values(state.buses)) {
    if (bus.status?.stopCode) codes.add(bus.status.stopCode);
  }
  return [...codes].sort();
}

/** Where a bus is relative to its stop and the bay, in words. */
export function stopStatus(state, busId) {
  const status = state.buses[busId]?.status;
  if (!status) return { text: "No report yet", kind: "idle" };
  if (!status.stopCode) return { text: "Not near any bus stop", kind: "idle" };
  const bay = state.bays[status.stopCode];
  switch (status.movement) {
    case "POSITIONED_AT_STOP":
      return { text: "In the bay, at boarding position", kind: "ok" };
    case "WAITING_FOR_BAY":
      if (bay?.grantedBusId === busId)
        return { text: "Cleared to enter the bay", kind: "info" };
      if (bay?.occupantBusId) {
        return {
          text: `Waiting for ${bay.occupantBusId} to leave the bay`,
          kind: "warn",
        };
      }
      return {
        text: "Waiting for bay; the bay is free, awaiting the controller",
        kind: "warn",
      };
    case "DEPARTING":
      return { text: "Departing the stop", kind: "idle" };
    default:
      return { text: "Travelling to this stop", kind: "info" };
  }
}

export function requestsForBus(state, busId) {
  return Object.values(state.requests)
    .filter(
      (request) =>
        request.busId === busId && OPEN_REQUEST_STATUSES.has(request.status),
    )
    .sort((a, b) =>
      String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")),
    );
}

const RAMP_KIND = {
  STOWED: "idle",
  DEPLOYMENT_REQUESTED: "info",
  DEPLOYING: "info",
  DEPLOYED: "ok",
  HALTED: "stop",
};

function requestCategory(state, busId) {
  const [request] = requestsForBus(state, busId);
  if (!request)
    return {
      title: "Assistance request",
      value: "None",
      sub: "no active request",
      kind: "idle",
    };
  const accepted = request.status === "ACKNOWLEDGED";
  return {
    title: "Assistance request",
    value: accepted ? "Accepted" : "Received, not yet accepted",
    sub: `${request.requestId} · passenger sees "${word(PASSENGER_SEES, request.status)}"`,
    kind: accepted ? "ok" : "warn",
  };
}

function sensorsCategory(decision) {
  if (!decision) {
    return {
      title: "Sensors and faults",
      value: "No report",
      sub: "no decision received yet",
      kind: "idle",
      simulated: false,
    };
  }
  const halted = decision.permission === "HALT";
  const detail = [`zone ${word(ZONE, decision.zoneState).toLowerCase()}`];
  if (decision.reasons?.length) detail.push(reasonsText(decision.reasons));
  return {
    title: "Sensors and faults",
    value: word(PERMISSION, decision.permission),
    sub: detail.join(" · "),
    kind: halted ? "stop" : "ok",
    simulated: Boolean(decision.simulated),
  };
}

/** The four separate status categories of a bus. Movement, request, ramp and sensors never merge. */
export function busCategories(state, busId) {
  const bus = state.buses[busId] ?? {};
  const movement = bus.status
    ? {
        value: word(MOVEMENT, bus.status.movement),
        sub: stopStatus(state, busId).text,
      }
    : { value: "No report", sub: "no status received yet" };
  const ramp = bus.ramp
    ? {
        value: word(RAMP, bus.ramp.state),
        sub: bus.ramp.haltReasons?.length
          ? reasonsText(bus.ramp.haltReasons)
          : "no physical ramp",
        kind: RAMP_KIND[bus.ramp.state] ?? "idle",
      }
    : { value: "No report", sub: "no physical ramp", kind: "idle" };
  return [
    {
      title: "Bus movement",
      ...movement,
      kind: stopStatus(state, busId).kind,
      simulated: Boolean(bus.status?.simulated),
    },
    requestCategory(state, busId),
    { title: "Ramp", ...ramp, simulated: true },
    sensorsCategory(bus.decision),
  ];
}

export function helpAlerts(state) {
  return busIds(state)
    .filter((busId) => activeHelp(state.buses[busId]))
    .map((busId) => {
      const { help } = state.buses[busId];
      return {
        busId,
        text: `${word(HELP_REASON, help.reason)} (state ${word(RAMP, help.state).toLowerCase()})`,
      };
    });
}

export function stopView(state, stopCode) {
  const bay = state.bays[stopCode];
  const rows = busIds(state)
    .filter((busId) => state.buses[busId].status?.stopCode === stopCode)
    .map((busId) => {
      const bus = state.buses[busId];
      const [request] = requestsForBus(state, busId);
      return {
        busId,
        simulated: Boolean(bus.status.simulated),
        status: stopStatus(state, busId),
        requestId: request?.requestId ?? null,
        ramp: bus.ramp ? word(RAMP, bus.ramp.state) : "No report",
      };
    });
  const requests = Object.values(state.requests).filter(
    (request) =>
      request.stopCode === stopCode || request.boardingStop === stopCode,
  );
  return {
    stopCode,
    bay: bay ?? null,
    rows,
    requests,
    canProceed: canProceedNow(bay),
  };
}

/** The bay is free, nobody has been granted it, and someone is waiting. */
export function canProceedNow(bay) {
  return Boolean(
    bay &&
    bay.waitingBusIds.length > 0 &&
    !bay.occupantBusId &&
    !bay.grantedBusId,
  );
}

export function summary(state) {
  return {
    stops: stopCodes(state).length,
    buses: busIds(state).length,
    openRequests: Object.values(state.requests).filter((r) =>
      OPEN_REQUEST_STATUSES.has(r.status),
    ).length,
    faultEntries: state.audit.filter((event) => classify(event) === "FAULT")
      .length,
  };
}

/** What to draw for the ramp zone. It comes from the Pi's decision, never from an image. */
export function zoneView(decision) {
  if (!decision) return undefined;
  const distance = decision.tof?.distanceMm;
  return {
    zone: word(ZONE, decision.zoneState),
    permission: word(PERMISSION, decision.permission),
    reasons: reasonsText(decision.reasons),
    reasonItems: (decision.reasons ?? []).map((code) => ({
      code,
      text: word(HALT_REASON, code),
    })),
    observedAt: decision.observedAt,
    tof: `${word(TOF, decision.tof?.state)}${distance !== undefined ? ` · ${distance} mm` : ""}`,
    camera: decision.camera?.imageOk
      ? "Image OK"
      : `Degraded${decision.camera?.degradedReason ? ` (${decision.camera.degradedReason})` : ""}`,
    objects: (decision.objectsInZone ?? []).map((item) => ({
      label: humanize(item.className),
      safety: humanize(item.safety),
      confidence: `${Math.round(item.confidence * 100)}%`,
    })),
    simulated: Boolean(decision.simulated),
  };
}

// ---- audit log ----------------------------------------------------------------------------

export const AUDIT_KINDS = [
  ["ALL", "All"],
  ["EVENT", "Events"],
  ["CONFIRMED", "Confirmations"],
  ["FAULT", "Faults and halts"],
  ["OPERATOR", "Operator"],
];

const FAULT_WORDS = ["BLOCKED", "FAILED", "ESCALAT", "HELP_REQUIRED", "HALT"];

export function classify(event) {
  const type = String(event.eventType ?? "");
  if (event.actor === "OPERATOR") return "OPERATOR";
  if (event.eventType === "RAMP_SAFETY_CHANGED") {
    return event.detail?.permission === "HALT" ? "FAULT" : "EVENT";
  }
  if (event.eventType === "RAMP_SIMULATION_CHANGED") {
    return event.detail?.state === "HALTED" ? "FAULT" : "EVENT";
  }
  if (FAULT_WORDS.some((part) => type.includes(part))) return "FAULT";
  if (type.includes("ACKNOWLEDG") || type.includes("COMPLETED"))
    return "CONFIRMED";
  return "EVENT";
}

export function describe(event) {
  const detail = event.detail ?? {};
  switch (event.eventType) {
    case "BUS_STATUS_CHANGED": {
      const to = word(MOVEMENT, detail.to);
      return detail.from
        ? `Movement: ${word(MOVEMENT, detail.from)} to ${to}`
        : `Movement: ${to}`;
    }
    case "BAY_ENTRY_GRANTED":
      return `Bay entry granted to ${event.busId ?? "the first waiting bus"}`;
    case "BAY_CHANGED": {
      const waiting = detail.waitingBusIds?.length ?? 0;
      const granted = detail.grantedBusId
        ? `, granted to ${detail.grantedBusId}`
        : "";
      return `Bay: ${detail.occupantBusId ? `${detail.occupantBusId} in bay` : "empty"}, ${waiting} waiting${granted}`;
    }
    case "RAMP_SAFETY_CHANGED": {
      const reasons = detail.reasons?.length
        ? ` (${reasonsText(detail.reasons)})`
        : "";
      return `Pi decision: ${word(PERMISSION, detail.permission)}${reasons}`;
    }
    case "RAMP_SIMULATION_CHANGED": {
      const reasons = detail.haltReasons?.length
        ? ` (${reasonsText(detail.haltReasons)})`
        : "";
      return `Ramp (simulated): ${word(RAMP, detail.state)}${reasons}`;
    }
    case "HELP_REQUIRED_CHANGED":
      return `Help required: ${word(HELP_REASON, detail.reason)}`;
    default:
      return humanize(event.eventType);
  }
}

export const ALL = "ALL";

export function filterAudit(
  state,
  { kind = ALL, busId = ALL, requestId = ALL } = {},
) {
  const request = requestId === ALL ? undefined : state.requests[requestId];
  return state.audit.filter((event) => {
    if (kind !== ALL && classify(event) !== kind) return false;
    if (busId !== ALL && event.busId !== busId) return false;
    if (requestId !== ALL) {
      const matches =
        event.detail?.requestId === requestId ||
        (request?.caseId && event.caseId === request.caseId);
      if (!matches) return false;
    }
    return true;
  });
}

export * from "./cases.js";

// ---- how long since a bus last reported -------------------------------------------------------

// ASSUMPTION: a placeholder, three times the agent's five-second heartbeat. Not an agreed value.
export const STALE_AFTER_SECONDS = 15;

const AGE_FIELDS = [
  ["status", "observedAt"],
  ["ramp", "observedAt"],
  ["decision", "observedAt"],
  ["help", "observedAt"],
];

function ageText(seconds) {
  if (seconds < 60) return `${seconds} s ago`;
  if (seconds < 90 * 60) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

/** Seconds since the newest report of any kind from the bus, in words, and whether it has gone quiet. */
export function reportAge(state, busId, nowMs) {
  const bus = state.buses[busId] ?? {};
  const times = AGE_FIELDS.map(([key, field]) =>
    Date.parse(bus[key]?.[field]),
  ).filter(Number.isFinite);
  if (times.length === 0)
    return { seconds: null, text: "No report yet", stale: false };
  const seconds = Math.max(0, Math.round((nowMs - Math.max(...times)) / 1000));
  return {
    seconds,
    text: `Last report ${ageText(seconds)}`,
    stale: seconds > STALE_AFTER_SECONDS,
  };
}
