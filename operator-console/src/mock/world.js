// A small simulated world for mock mode: two buses, one stop, one bay. It produces exactly
// the messages the backend would push to an operator (contracts: BUS_STATUS, BAY_STATUS,
// RAMP_SIMULATION, RAMP_SAFETY, HELP_REQUIRED, REQUEST_STATUS) and feeds them through the same
// reducer as live mode. The rules here are stand-ins so the console can be shown and tested on
// its own; the real decision is made by pi/safety-gate on each bus. Everything is simulated.

import { addAudit, initialState, reduce } from "../state.js";
import { canProceedNow } from "../viewmodel.js";
import { HALT_REASON } from "../labels.js";

export const MOCK_STOP = "18331";
export const MOCK_BUSES = ["AV-095-01", "AV-095-02"];

const DEPLOY_SECONDS = 4; // placeholder simulated deployment time
const DEFAULT_STALL_TIMEOUT_SECONDS = 8; // placeholder so a fault can be shown; not an agreed value
const SAFE_CLASSES = new Set(["leaf", "plastic_bag"]);
const TOF_BLOCKED_MM = {
  person: 250,
  box: 300,
  wheelchair: 250,
  stroller: 250,
  bicycle: 250,
};
const REASON_ORDER = [
  "OBJECT_IN_ZONE",
  "TOF_BLOCKED",
  "TOF_UNAVAILABLE",
  "CAMERA_DEGRADED",
  "SENSORS_DISAGREE",
  "BUS_NOT_AT_BOARDING_POSITION",
  "WAITING_FOR_BAY",
  "NO_ACCEPTED_REQUEST",
  "OPERATOR_HALT",
];

const facts = (record) => {
  const copy = { ...record };
  delete copy.observedAt;
  delete copy.updatedAt;
  return JSON.stringify(copy);
};

export function createMockWorld({ clock = () => Date.now() } = {}) {
  let state;
  let messages;
  let counter;
  let requestCounter;
  let options;
  let buses;
  let caseCounter;

  const iso = () => new Date(clock()).toISOString();

  function fresh() {
    state = initialState();
    messages = [];
    counter = 0;
    requestCounter = 7;
    caseCounter = 0;
    options = {
      autoAccept: true,
      autoProceed: false,
      stallTimeoutSeconds: DEFAULT_STALL_TIMEOUT_SECONDS,
    };
    buses = Object.fromEntries(
      MOCK_BUSES.map((id, index) => [
        id,
        {
          simulated: index === 1,
          accepted: null,
          caseId: null,
          caseOverride: null,
          object: null,
          faults: { tof: false, cam: false, stall: false },
          operatorHalt: false,
          progress: 0,
          stalledFor: 0,
          wasDeploying: false,
        },
      ]),
    );
    for (const id of MOCK_BUSES) {
      emitStatus(id, "TRAVELLING_TO_STOP");
      emitRamp(id, "STOWED");
      emitDecision(id);
    }
    emit({
      type: "BAY_STATUS",
      bay: bayRecord(null, [], null),
      timestamp: iso(),
    });
    state = { ...state, audit: [] };
    audit("MOCK_STARTED", { actor: "SIMULATION" });
  }

  function emit(message) {
    messages.push(message);
    state = reduce(state, message);
  }

  function audit(eventType, { busId, actor = "VEHICLE", detail } = {}) {
    counter += 1;
    state = addAudit(state, {
      eventId: `MOCK-${counter}`,
      eventType,
      busId,
      actor,
      timestamp: iso(),
      detail,
    });
  }

  const bay = () => state.bays[MOCK_STOP];
  const movement = (id) => state.buses[id].status.movement;
  const rampState = (id) => state.buses[id].ramp?.state ?? "STOWED";

  function bayRecord(occupantBusId, waitingBusIds, grantedBusId) {
    return {
      stopCode: MOCK_STOP,
      bayId: "BAY-1",
      occupantBusId,
      waitingBusIds,
      grantedBusId,
      updatedAt: iso(),
    };
  }

  function setBay(
    occupant,
    waiting,
    granted,
    eventType = "BAY_CHANGED",
    actor = "VEHICLE",
    busId,
  ) {
    const next = bayRecord(occupant, waiting, granted);
    if (facts(next) === facts(bay() ?? {})) return;
    emit({ type: "BAY_STATUS", bay: next, timestamp: iso() });
    audit(eventType, {
      actor,
      busId,
      detail: {
        stopCode: MOCK_STOP,
        occupantBusId: occupant,
        waitingBusIds: waiting,
        grantedBusId: granted,
      },
    });
  }

  function emitStatus(id, next) {
    const previous = state.buses[id]?.status?.movement;
    const status = {
      busId: id,
      busService: "95",
      stopCode: MOCK_STOP,
      movement: next,
      simulated: buses[id].simulated,
      observedAt: iso(),
    };
    emit({ type: "BUS_STATUS", status, timestamp: iso() });
    if (previous !== next)
      audit("BUS_STATUS_CHANGED", {
        busId: id,
        detail: { from: previous ?? null, to: next },
      });
  }

  function emitRamp(id, next, haltReasons) {
    const previous = state.buses[id]?.ramp;
    const ramp = {
      busId: id,
      state: next,
      simulated: true,
      ...(haltReasons?.length ? { haltReasons } : {}),
      observedAt: iso(),
    };
    if (previous && facts(previous) === facts(ramp)) return;
    emit({ type: "RAMP_SIMULATION", ramp, timestamp: iso() });
    audit("RAMP_SIMULATION_CHANGED", {
      busId: id,
      detail: { state: next, ...(haltReasons?.length ? { haltReasons } : {}) },
    });
  }

  // ---- the stand-in gate --------------------------------------------------------------------

  function decisionFor(id) {
    const bus = buses[id];
    const camOk = !bus.faults.cam;
    const tofOk = !bus.faults.tof;
    const unsafe = bus.object && !SAFE_CLASSES.has(bus.object);
    const reasons = new Set();
    let zoneState = "CLEAR";
    let tof = { state: "BEAM_CLEAR", distanceMm: 500, simulated: true };
    if (!tofOk) {
      tof = { state: "UNKNOWN", simulated: true };
      reasons.add("TOF_UNAVAILABLE");
    } else if (unsafe) {
      tof = {
        state: "BLOCKED",
        distanceMm: TOF_BLOCKED_MM[bus.object] ?? 300,
        simulated: true,
      };
      reasons.add("TOF_BLOCKED");
    }
    if (!camOk) reasons.add("CAMERA_DEGRADED");
    if (camOk && unsafe) reasons.add("OBJECT_IN_ZONE");
    if (!camOk || !tofOk) zoneState = "UNCERTAIN";
    else if (unsafe) zoneState = "OCCUPIED";
    const at = movement(id);
    if (at === "WAITING_FOR_BAY") reasons.add("WAITING_FOR_BAY");
    else if (at !== "POSITIONED_AT_STOP")
      reasons.add("BUS_NOT_AT_BOARDING_POSITION");
    if (!bus.accepted) reasons.add("NO_ACCEPTED_REQUEST");
    if (bus.operatorHalt) reasons.add("OPERATOR_HALT");
    const ordered = REASON_ORDER.filter((reason) => reasons.has(reason));
    const objectsInZone =
      camOk && bus.object
        ? [
            {
              className: bus.object,
              safety: unsafe ? "UNSAFE" : "SAFE",
              confidence: unsafe ? 0.93 : 0.95,
            },
          ]
        : [];
    return {
      busId: id,
      zoneState,
      permission:
        zoneState === "CLEAR" && ordered.length === 0 ? "CONTINUE" : "HALT",
      reasons: ordered,
      tof,
      camera: camOk
        ? { imageOk: true }
        : { imageOk: false, degradedReason: "covered" },
      objectsInZone,
      simulated: true,
      observedAt: iso(),
    };
  }

  function emitDecision(id) {
    const decision = decisionFor(id);
    const previous = state.buses[id]?.decision;
    if (!previous || facts(previous) !== facts(decision)) {
      emit({ type: "RAMP_SAFETY", decision, timestamp: iso() });
      audit("RAMP_SAFETY_CHANGED", {
        busId: id,
        detail: { permission: decision.permission, reasons: decision.reasons },
      });
    }
    publishTelemetry(id, decision);
    syncCase(id, decision);
    return decision;
  }

  // ---- telemetry and cases (what the backend's case orchestrator would keep) -----------------

  const RAMP_POSITION = {
    STOWED: "STOWED",
    DEPLOYED: "DEPLOYED",
    DEPLOYMENT_REQUESTED: "DEPLOYING",
    DEPLOYING: "DEPLOYING",
    HALTED: "DEPLOYING",
  };

  function publishTelemetry(id, decision) {
    const positioned = movement(id) === "POSITIONED_AT_STOP";
    const telemetry = {
      busId: id,
      stopCode: MOCK_STOP,
      vehicleStopped: positioned,
      parkingBrakeActive: positioned,
      doorOpen: positioned,
      deploymentPathClear: decision.permission === "CONTINUE",
      rampPosition: RAMP_POSITION[rampState(id)] ?? "UNKNOWN",
      networkOnline: true,
      observedAt: iso(),
    };
    const previous = state.telemetry[id];
    if (previous && facts(previous) === facts(telemetry)) return;
    emit({ type: "TELEMETRY_SNAPSHOT", telemetry, timestamp: iso() });
  }

  function saveCase(item) {
    emit({ type: "CASE_SNAPSHOT", case: item, timestamp: iso() });
  }

  function openCase(busId, requestId) {
    caseCounter += 1;
    const caseId = `CASE-MOCK-${String(caseCounter).padStart(4, "0")}`;
    const request = state.requests[requestId];
    buses[busId].caseId = caseId;
    buses[busId].caseOverride = null;
    saveCase({
      caseId,
      stopCode: MOCK_STOP,
      busId,
      busService: "95",
      phase: "BOARDING",
      intents: [{ intentId: `INT-${caseCounter}`, confirmed: true }],
      assistanceTypes: request?.assistanceTypes ?? ["WHEELCHAIR_RAMP"],
      passengerCount: 1,
      confidence: 0.9,
      boardingIntent: {
        decision: "CONFIRMED",
        confidence: 0.9,
        reason: "Explicit request from the app (mock)",
        evidence: [],
        assessedAt: iso(),
      },
      state: "VALIDATED",
      actionPlan: [
        {
          assistanceType: "WHEELCHAIR_RAMP",
          action: "DEPLOY_RAMP",
          requiresSafetyClearance: true,
          status: "PLANNED",
        },
      ],
      outcome: { operatorInterventions: 0 },
      createdAt: iso(),
      updatedAt: iso(),
    });
  }

  function setCaseState(busId, next, reason) {
    const current = state.cases[buses[busId].caseId];
    if (
      !current ||
      ["COMPLETED", "FAILED", "CANCELLED"].includes(current.state)
    )
      return;
    if (current.state === next && current.escalationReason === reason) return;
    const updated = { ...current, state: next, updatedAt: iso() };
    if (reason) updated.escalationReason = reason;
    else delete updated.escalationReason;
    saveCase(updated);
  }

  function syncCase(busId, decision) {
    const bus = buses[busId];
    if (!bus.caseId || bus.caseOverride) return;
    const ramp = rampState(busId);
    if (ramp === "DEPLOYED") return setCaseState(busId, "READY");
    if (ramp === "HALTED") {
      const first = decision.reasons[0];
      return setCaseState(
        busId,
        "BLOCKED",
        first ? HALT_REASON[first] : "Ramp halted",
      );
    }
    if (ramp === "DEPLOYING" || ramp === "DEPLOYMENT_REQUESTED")
      return setCaseState(busId, "ACTUATING");
    setCaseState(busId, "VALIDATED");
  }

  // ---- passenger requests -------------------------------------------------------------------

  function requestStatus(requestId, status, busId) {
    emit({
      type: "REQUEST_STATUS",
      requestId,
      status,
      busId,
      busService: "95",
      assistanceTypes: [
        state.requests[requestId]?.assistanceTypes?.[0] ?? "WHEELCHAIR_RAMP",
      ],
      source: "MOBILE_APP",
      timestamp: iso(),
    });
  }

  function submitRequest({ busId, help = "WHEELCHAIR_RAMP" }) {
    requestCounter += 1;
    const requestId = `REQ-MOCK-${String(requestCounter).padStart(4, "0")}`;
    emit({
      type: "ASSIST_REQUESTED",
      request: {
        requestId,
        busId,
        busService: "95",
        boardingStop: "18301",
        stopCode: MOCK_STOP,
        assistanceTypes: [help],
        boardingOrAlighting: "BOARDING",
        createdAt: iso(),
      },
      timestamp: iso(),
    });
    audit("REQUEST_RECEIVED", {
      busId,
      actor: "PASSENGER",
      detail: { requestId },
    });
    if (options.autoAccept) busAccept(requestId);
    return requestId;
  }

  function busAccept(requestId) {
    const request = state.requests[requestId];
    if (!request || request.status !== "SENDING") return;
    const bus = buses[request.busId];
    if (bus.accepted) {
      requestStatus(requestId, "FAILED", request.busId);
      audit("REQUEST_REFUSED_BUS_BUSY", {
        busId: request.busId,
        detail: { requestId },
      });
      return;
    }
    bus.accepted = requestId;
    openCase(request.busId, requestId);
    requestStatus(requestId, "ACKNOWLEDGED", request.busId);
    audit("REQUEST_ACKNOWLEDGED", {
      busId: request.busId,
      detail: { requestId },
    });
    emitDecision(request.busId);
  }

  function busReject(requestId) {
    const request = state.requests[requestId];
    if (!request || request.status !== "SENDING") return;
    requestStatus(requestId, "FAILED", request.busId);
    audit("REQUEST_REJECTED_BY_BUS", {
      busId: request.busId,
      detail: { requestId },
    });
  }

  function endRequest(busId, status, eventType, actor) {
    const requestId = buses[busId].accepted;
    if (!requestId) return;
    buses[busId].accepted = null;
    buses[busId].caseOverride = null;
    setCaseFinal(busId, status === "COMPLETED" ? "COMPLETED" : "CANCELLED");
    requestStatus(requestId, status, busId);
    audit(eventType, { busId, actor, detail: { requestId } });
    emitDecision(busId);
  }

  const cancelRequest = (busId, who) =>
    endRequest(
      busId,
      "CANCELLED",
      who === "OPERATOR" ? "OPERATOR_CANCELLED_REQUEST" : "REQUEST_CANCELLED",
      who === "OPERATOR" ? "OPERATOR" : "PASSENGER",
    );

  function passengerCancel(requestId) {
    const request = state.requests[requestId];
    if (!request || !["SENDING", "ACKNOWLEDGED"].includes(request.status))
      return;
    if (buses[request.busId].accepted === requestId)
      return endRequest(
        request.busId,
        "CANCELLED",
        "REQUEST_CANCELLED",
        "PASSENGER",
      );
    requestStatus(requestId, "CANCELLED", request.busId);
    audit("REQUEST_CANCELLED", {
      busId: request.busId,
      actor: "PASSENGER",
      detail: { requestId },
    });
  }

  function boardingComplete(busId) {
    const requestId = buses[busId].accepted;
    if (!requestId) return;
    endRequest(busId, "COMPLETED", "ASSISTANCE_COMPLETED", "VEHICLE");
  }

  // ---- movement and bay ---------------------------------------------------------------------

  function arrive(id) {
    if (movement(id) !== "TRAVELLING_TO_STOP") return;
    const current = bay();
    if (
      !current.occupantBusId &&
      current.waitingBusIds.length === 0 &&
      !current.grantedBusId
    ) {
      emitStatus(id, "POSITIONED_AT_STOP");
      setBay(id, [], null, "BAY_CHANGED", "VEHICLE", id);
    } else {
      emitStatus(id, "WAITING_FOR_BAY");
      setBay(
        current.occupantBusId,
        [...current.waitingBusIds, id],
        current.grantedBusId,
        "BAY_CHANGED",
        "VEHICLE",
        id,
      );
    }
    emitDecision(id);
  }

  function depart(id) {
    if (movement(id) !== "POSITIONED_AT_STOP" || rampState(id) !== "STOWED")
      return false;
    emitStatus(id, "DEPARTING");
    const current = bay();
    setBay(
      null,
      current.waitingBusIds,
      current.grantedBusId,
      "BAY_CHANGED",
      "VEHICLE",
      id,
    );
    emitDecision(id);
    if (options.autoProceed) proceedNext("CONTROLLER");
    return true;
  }

  function backOnRoute(id) {
    if (movement(id) !== "DEPARTING") return;
    emitStatus(id, "TRAVELLING_TO_STOP");
    emitDecision(id);
  }

  function proceedNext(who) {
    const current = bay();
    if (!canProceedNow(current)) return false;
    const [next, ...rest] = current.waitingBusIds;
    setBay(
      null,
      rest,
      next,
      "BAY_ENTRY_GRANTED",
      who === "CONTROLLER" ? "CONTROLLER" : "OPERATOR",
      next,
    );
    // The granted bus then enters by its own positioned report.
    emitStatus(next, "POSITIONED_AT_STOP");
    setBay(next, rest, null, "BAY_CHANGED", "VEHICLE", next);
    emitDecision(next);
    return true;
  }

  // ---- ramp ---------------------------------------------------------------------------------

  function deploy(id, who) {
    const bus = buses[id];
    const operator = who === "OPERATOR";
    if (operator)
      audit("OPERATOR_DEPLOY_REQUESTED", { busId: id, actor: "OPERATOR" });
    if (!bus.accepted || movement(id) !== "POSITIONED_AT_STOP") return;
    if (
      ["DEPLOYING", "DEPLOYED", "DEPLOYMENT_REQUESTED"].includes(rampState(id))
    )
      return;
    bus.operatorHalt = false;
    bus.progress = 0;
    bus.stalledFor = 0;
    emitRamp(id, "DEPLOYMENT_REQUESTED");
    const decision = emitDecision(id);
    if (decision.permission === "HALT")
      emitRamp(id, "HALTED", decision.reasons);
    else emitRamp(id, "DEPLOYING");
    bus.wasDeploying = true;
  }

  function halt(id, who) {
    if (!["DEPLOYING", "DEPLOYMENT_REQUESTED"].includes(rampState(id))) return;
    buses[id].operatorHalt = true;
    if (who === "OPERATOR")
      audit("OPERATOR_HALT", { busId: id, actor: "OPERATOR" });
    const decision = emitDecision(id);
    emitRamp(id, "HALTED", decision.reasons);
  }

  function stowRamp(id) {
    buses[id].progress = 0;
    buses[id].wasDeploying = false;
    emitRamp(id, "STOWED");
    emitDecision(id);
  }

  function tick(seconds) {
    for (const id of MOCK_BUSES) {
      const bus = buses[id];
      const decision = emitDecision(id);
      const current = rampState(id);
      if (current === "DEPLOYING") {
        if (decision.permission === "HALT") {
          emitRamp(id, "HALTED", decision.reasons);
        } else if (bus.faults.stall && id === MOCK_BUSES[0]) {
          bus.stalledFor += seconds;
          if (
            bus.stalledFor > options.stallTimeoutSeconds &&
            !state.buses[id].help
          ) {
            emit({
              type: "HELP_REQUIRED",
              help: {
                busId: id,
                reason: "DEPLOYMENT_TIMEOUT",
                state: "DEPLOYING",
                observedAt: iso(),
              },
              timestamp: iso(),
            });
            audit("HELP_REQUIRED_CHANGED", {
              busId: id,
              detail: { reason: "DEPLOYMENT_TIMEOUT", state: "DEPLOYING" },
            });
          }
        } else {
          bus.progress += seconds / DEPLOY_SECONDS;
          if (bus.progress >= 1) emitRamp(id, "DEPLOYED");
        }
      } else if (
        current === "HALTED" &&
        bus.wasDeploying &&
        !bus.operatorHalt &&
        decision.permission === "CONTINUE"
      ) {
        emitRamp(id, "DEPLOYING");
      }
    }
  }

  function setCaseFinal(busId, finalState) {
    const item = state.cases[buses[busId].caseId];
    if (!item) return;
    saveCase({
      ...item,
      state: finalState,
      updatedAt: iso(),
      escalationReason: undefined,
    });
  }

  const finished = (item) =>
    ["COMPLETED", "FAILED", "CANCELLED"].includes(item.state);

  function caseAction(caseId, action) {
    const item = state.cases[caseId];
    if (!item || finished(item)) return;
    const busId = item.busId;
    audit(`OPERATOR_${action}`, {
      busId,
      actor: "OPERATOR",
      detail: { caseId },
    });
    saveCase({
      ...item,
      outcome: {
        ...item.outcome,
        operatorInterventions: (item.outcome?.operatorInterventions ?? 0) + 1,
      },
    });
    const bus = buses[busId];
    if (action === "ESCALATE") {
      bus.caseOverride = "ESCALATED";
      saveCase({
        ...state.cases[caseId],
        state: "ESCALATED",
        escalationReason: "Operator review requested",
        updatedAt: iso(),
      });
    } else if (action === "CONFIRM" || action === "RETRY") {
      bus.caseOverride = null;
      const current = state.cases[caseId];
      saveCase({
        ...current,
        state: "VALIDATED",
        escalationReason: undefined,
        updatedAt: iso(),
      });
      syncCase(busId, emitDecision(busId));
    } else if (action === "COMPLETE") {
      const decision = emitDecision(busId);
      if (decision.permission === "HALT" && rampState(busId) !== "STOWED") {
        setCaseState(
          busId,
          "BLOCKED",
          "Ramp path is not clear, so the ramp cannot be stowed yet",
        );
        return;
      }
      if (rampState(busId) !== "STOWED") stowRamp(busId);
      boardingComplete(busId);
    } else if (action === "CANCEL") {
      cancelRequest(busId, "OPERATOR");
    }
  }

  function caseActionsFor(caseId) {
    const item = state.cases[caseId];
    const allowed = Boolean(item) && !finished(item);
    const reason = allowed ? undefined : "This case is finished.";
    return Object.fromEntries(
      ["CONFIRM", "RETRY", "ESCALATE", "COMPLETE", "CANCEL"].map((name) => [
        name,
        { enabled: allowed, reason },
      ]),
    );
  }

  // ---- scene controls (mock only) -----------------------------------------------------------

  function placeObject(id, className) {
    buses[id].object = className;
    audit("MOCK_ZONE_CHANGED", {
      busId: id,
      actor: "SIMULATION",
      detail: { object: className },
    });
    emitDecision(id);
  }

  function setFault(name, on, id = MOCK_BUSES[0]) {
    buses[id].faults[name] = Boolean(on);
    if (name === "stall" && !on) buses[id].stalledFor = 0;
    audit("MOCK_FAULT_CHANGED", {
      busId: id,
      actor: "SIMULATION",
      detail: { fault: name, on: Boolean(on) },
    });
    emitDecision(id);
  }

  // ---- what the operator may do now ---------------------------------------------------------

  function actions(busId) {
    const bus = busId ? buses[busId] : undefined;
    const positioned = busId ? movement(busId) === "POSITIONED_AT_STOP" : false;
    const ramp = busId ? rampState(busId) : "STOWED";
    return {
      proceed: { enabled: canProceedNow(bay()) },
      deploy: {
        enabled:
          Boolean(bus?.accepted) &&
          positioned &&
          ["STOWED", "HALTED"].includes(ramp),
      },
      halt: { enabled: ["DEPLOYING", "DEPLOYMENT_REQUESTED"].includes(ramp) },
      cancel: { enabled: Boolean(bus?.accepted) },
    };
  }

  fresh();

  return {
    get state() {
      return state;
    },
    get messages() {
      return messages;
    },
    get options() {
      return { ...options };
    },
    submitRequest,
    busAccept,
    busReject,
    passengerCancel,
    cancelRequest,
    boardingComplete,
    arrive,
    depart,
    backOnRoute,
    proceedNext,
    deploy,
    halt,
    stowRamp,
    tick,
    placeObject,
    setFault,
    setAutoAccept: (on) => {
      options.autoAccept = Boolean(on);
    },
    setAutoProceed: (on) => {
      options.autoProceed = Boolean(on);
    },
    setStallTimeoutSeconds: (seconds) => {
      options.stallTimeoutSeconds = Math.max(
        1,
        Number(seconds) || DEFAULT_STALL_TIMEOUT_SECONDS,
      );
    },
    actionsFor: actions,
    caseAction,
    caseActionsFor,
    reset: fresh,
  };
}
