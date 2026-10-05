// The demo director's brain: it reads what the backend and the agents report, keeps a timeline, and sends
// the presenter's actions on. What it can do is deliberately small:
//
//  * move a bus (arrive, depart, travel), for a real or a simulated bus;
//  * change the SCENE of a simulated bus only (object in the zone, beam, sensor, camera, link);
//  * do what an operator or a passenger would do through the backend's existing routes.
//
// It cannot set a ramp state, acknowledge a request for a bus, change the Pi's gate, or change what a
// real bus's sensors read. There is no code path for any of those, and there are tests that say so.

import { createAgentClient, createBackendClient } from "./clients.js";
import { advanceSteps, describeSteps, stepById } from "./sequence.js";

const MOVEMENT_COMMANDS = new Set(["arrive", "depart", "travel"]);
const SCENE_COMMANDS = new Set([
  "place",
  "clear",
  "block",
  "dropout",
  "cover",
  "frames",
  "link",
]);
const STOP = /^[A-Za-z0-9-]{1,40}$/;
const CLASS = /^[a-z_]{1,40}$/;
const MAX_TIMELINE = 300;

export class DirectorError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createDirector({
  config,
  agentClients,
  backend,
  now = () => new Date(),
}) {
  const clients =
    agentClients ??
    Object.fromEntries(
      config.agents.map((agent) => [agent.busId, createAgentClient(agent)]),
    );
  const api =
    backend ??
    createBackendClient({
      baseUrl: config.backendUrl,
      token: config.operatorToken,
    });
  const order = config.agents.map((agent) => agent.busId);
  const labels = Object.fromEntries(
    config.agents.map((agent) => [agent.busId, agent.label]),
  );

  let state = emptyState(order, labels);
  let previous = null;
  let seenAudit = null;
  const latched = new Set();
  const timeline = [];
  let timer;

  function record(source, text) {
    timeline.push({ at: now().toISOString(), source, text });
    if (timeline.length > MAX_TIMELINE) timeline.shift();
  }

  // ---- reading ---------------------------------------------------------------------------------

  async function refresh() {
    const [agentResults, bay, statuses, requests, halts, audit] =
      await Promise.all([
        Promise.all(order.map((busId) => clients[busId].state())),
        api.bay(config.stopCode),
        api.busStatuses(),
        api.requests(),
        api.halts(),
        api.audit(40),
      ]);
    const buses = {};
    order.forEach((busId, index) => {
      const result = agentResults[index];
      const agent = result.ok ? result.body : null;
      const status = (statuses.body?.statuses ?? []).find(
        (item) => item.busId === busId,
      );
      buses[busId] = {
        busId,
        label: labels[busId],
        kind: agent ? (agent.simulated ? "SIMULATED" : "REAL") : "UNKNOWN",
        controlLevel: agent?.controlLevel ?? "",
        agentOk: result.ok,
        agentError: result.ok
          ? null
          : (result.body?.error ?? `HTTP ${result.status}`),
        agent,
        status: status ?? null,
        operatorHalt: Boolean(
          (halts.body?.records ?? []).find((item) => item.busId === busId)
            ?.halted,
        ),
      };
    });
    state = {
      generatedAt: now().toISOString(),
      order,
      stopCode: config.stopCode,
      backend: {
        ok: bay.ok,
        error: bay.ok ? null : (bay.body?.error ?? `HTTP ${bay.status}`),
        bay: bay.ok ? bay.body : null,
        requests: (requests.body?.requests ?? []).map((request) => ({
          requestId: request.requestId,
          busId: request.busId,
          status: request.status,
          caseId: request.caseId,
          createdAt: request.createdAt,
        })),
      },
      buses,
    };
    advanceSteps(state, latched);
    diff(previous, state, audit.body?.events ?? []);
    previous = state;
    return state;
  }

  function diff(before, after, auditEvents) {
    // The first read only seeds what is already there; it is not a change.
    if (before) {
      for (const busId of order) {
        const was = before.buses[busId];
        const is = after.buses[busId];
        const tag = `${is.label} · ${is.kind}`;
        const moved = is.agent?.movement?.code;
        if (moved && moved !== was.agent?.movement?.code)
          record(tag, `movement: ${is.agent.movement.text ?? moved}`);
        const ramp = is.agent?.ramp?.state;
        if (ramp && ramp !== was.agent?.ramp?.state)
          record(tag, `simulated ramp: ${ramp}`);
        const decision = decisionText(is.agent);
        if (decision && decision !== decisionText(was.agent))
          record(tag, `the bus's own gate: ${decision}`);
        if (was.agentOk !== is.agentOk)
          record(
            tag,
            is.agentOk ? "agent reachable again" : "agent not reachable",
          );
        const link = is.agent?.link?.ok;
        if (link !== undefined && link !== was.agent?.link?.ok)
          record(tag, link ? "backend link working" : "backend link DOWN");
        if (was.operatorHalt !== is.operatorHalt)
          record(
            "BACKEND · REAL route",
            `${is.label}: operator halt ${is.operatorHalt ? "ON" : "released"}`,
          );
      }
      const bayWas = bayText(before.backend.bay);
      const bayIs = bayText(after.backend.bay);
      if (bayIs && bayIs !== bayWas) record("BACKEND", `bay: ${bayIs}`);
      const was = new Map(
        before.backend.requests.map((item) => [item.requestId, item.status]),
      );
      for (const request of after.backend.requests)
        if (was.get(request.requestId) !== request.status)
          record(
            "BACKEND",
            `request ${shortId(request.requestId)} (${labels[request.busId] ?? request.busId}): ${request.status}`,
          );
    }
    // Audit events are the backend's own record; show each once.
    const ids = new Set(auditEvents.map((event) => event.eventId));
    if (seenAudit) {
      for (const event of [...auditEvents].reverse())
        if (!seenAudit.has(event.eventId))
          record(
            "AUDIT",
            `${event.eventType} (${event.actor}${event.busId ? `, ${labels[event.busId] ?? event.busId}` : ""})`,
          );
    }
    seenAudit = ids;
  }

  // ---- doing -----------------------------------------------------------------------------------

  function agentFor(busId) {
    if (!clients[busId]) throw new DirectorError(404, `Unknown bus ${busId}`);
    return clients[busId];
  }

  /** Movement for any bus; scene changes for a simulated bus only. */
  async function control(busId, body) {
    const client = agentFor(busId);
    const { command, value, confidence } = body ?? {};
    const isMovement = MOVEMENT_COMMANDS.has(command);
    if (!isMovement && !SCENE_COMMANDS.has(command))
      throw new DirectorError(400, `Unknown command: ${String(command)}`);
    if (
      ["arrive", "travel"].includes(command) &&
      !STOP.test(String(value ?? ""))
    )
      if (!(command === "travel" && value === undefined))
        throw new DirectorError(400, "A stop code is required");
    if (command === "place" && !CLASS.test(String(value ?? "")))
      throw new DirectorError(400, "An object class is required");
    if (
      ["block", "dropout", "cover", "frames", "link"].includes(command) &&
      !["on", "off"].includes(value)
    )
      throw new DirectorError(400, "value must be on or off");
    const bus = state.buses[busId];
    if (!isMovement) {
      // A real bus's sensors are only ever real. This check does not depend on the agent refusing.
      if (!bus?.agent)
        throw new DirectorError(502, `${labels[busId]} is not reachable`);
      if (bus.kind !== "SIMULATED" || bus.controlLevel !== "scene")
        throw new DirectorError(
          403,
          `${labels[busId]} is ${bus.kind}: scene controls are refused. Do it physically.`,
        );
    }
    const result = await client.control({
      command,
      ...(value === undefined ? {} : { value }),
      ...(confidence === undefined ? {} : { confidence }),
    });
    const tag = `DEMO ACTION · ${bus?.kind ?? "UNKNOWN"}`;
    if (!result.ok)
      throw new DirectorError(
        result.status || 502,
        result.body?.error ?? "The agent refused",
      );
    record(tag, `${labels[busId]}: ${describe(command, value, confidence)}`);
    return result.body;
  }

  function stopOf(busId) {
    const found = (state.backend.requests ?? []).find(
      (request) =>
        request.busId === busId &&
        ["SENDING", "ACKNOWLEDGED"].includes(request.status),
    );
    return found;
  }

  async function createRequest(busId) {
    agentFor(busId);
    const result = await api.createRequest({
      sessionId: "demo-director",
      busService: "95",
      busId,
      boardingStop: config.stopCode,
      stopCode: config.stopCode,
      assistanceTypes: ["WHEELCHAIR_RAMP"],
      source: "MOBILE_APP",
      boardingOrAlighting: "BOARDING",
    });
    if (!result.ok)
      throw new DirectorError(
        result.status || 502,
        result.body?.error ?? "The backend refused",
      );
    record(
      "DEMO ACTION · SIMULATED passenger",
      `${labels[busId]}: request created${result.body?.duplicateOfRequestId ? " (merged into an active one)" : ""}`,
    );
    return result.body;
  }

  async function proceed() {
    const result = await api.proceed(config.stopCode);
    if (!result.ok)
      throw new DirectorError(
        result.status || 502,
        result.body?.error ?? "The backend refused",
      );
    record(
      "DEMO ACTION · REAL operator route",
      "bay granted to the next waiting bus",
    );
    return result.body;
  }

  async function halt(busId, halted) {
    agentFor(busId);
    const result = await api.setHalt(
      busId,
      Boolean(halted),
      "Demo: operator halt from the demo director",
    );
    if (!result.ok)
      throw new DirectorError(
        result.status || 502,
        result.body?.error ?? "The backend refused",
      );
    record(
      "DEMO ACTION · REAL operator route",
      `${labels[busId]}: operator halt ${halted ? "set" : "released"}`,
    );
    return result.body;
  }

  async function cancel(busId) {
    agentFor(busId);
    const request = stopOf(busId);
    if (!request?.caseId)
      throw new DirectorError(
        409,
        `${labels[busId]} has no open request with a case`,
      );
    const result = await api.cancelCase(
      request.caseId,
      "Demo: cancelled from the demo director",
    );
    if (!result.ok)
      throw new DirectorError(
        result.status || 502,
        result.body?.error ?? "The backend refused",
      );
    record(
      "DEMO ACTION · REAL operator route",
      `${labels[busId]}: request cancelled by the operator`,
    );
    return result.body;
  }

  async function runStep(id) {
    const step = stepById(id);
    if (!step) throw new DirectorError(404, `No step ${id}`);
    if (!step.act) throw new DirectorError(409, "This step needs no action");
    const { act } = step;
    const busId = act.bus === undefined ? undefined : order[act.bus];
    if (act.kind === "control") return control(busId, act.body(config));
    if (act.kind === "request") return createRequest(busId);
    if (act.kind === "proceed") return proceed();
    throw new DirectorError(500, "Unknown step action");
  }

  return {
    refresh,
    control,
    createRequest,
    proceed,
    halt,
    cancel,
    runStep,
    resetSequence() {
      latched.clear();
      record("DIRECTOR", "the sequence was started again");
    },
    start(intervalMs = config.pollMs) {
      const tick = async () => {
        try {
          await refresh();
        } catch (error) {
          record(
            "DIRECTOR",
            `could not read the system: ${error instanceof Error ? error.message : error}`,
          );
        }
        timer = setTimeout(tick, intervalMs);
        timer.unref?.();
      };
      void tick();
    },
    stop() {
      clearTimeout(timer);
    },
    snapshot() {
      return {
        ...state,
        timeline: [...timeline],
        steps: describeSteps(state, config, latched),
      };
    },
  };
}

function emptyState(order, labels) {
  return {
    generatedAt: null,
    order,
    stopCode: null,
    backend: { ok: false, error: "not read yet", bay: null, requests: [] },
    buses: Object.fromEntries(
      order.map((busId) => [
        busId,
        {
          busId,
          label: labels[busId],
          kind: "UNKNOWN",
          controlLevel: "",
          agentOk: false,
          agentError: "not read yet",
          agent: null,
          status: null,
          operatorHalt: false,
        },
      ]),
    ),
  };
}

const shortId = (id) => String(id).slice(-6);

function decisionText(agent) {
  const decision = agent?.decision;
  if (!decision) return "";
  const reasons = (decision.reasons ?? [])
    .map((reason) => reason.code)
    .join(", ");
  return `${decision.permission}${reasons ? ` (${reasons})` : ""}`;
}

function bayText(bay) {
  if (!bay) return "";
  const waiting = (bay.waitingBusIds ?? []).join(", ") || "none";
  return `occupant ${bay.occupantBusId ?? "none"}, granted ${bay.grantedBusId ?? "none"}, waiting ${waiting}`;
}

function describe(command, value, confidence) {
  if (command === "place")
    return `object placed in the ramp zone: ${value}${confidence ? ` at ${confidence}` : ""}`;
  if (command === "clear") return "ramp zone emptied";
  if (command === "arrive") return `ARRIVE at ${value}`;
  if (command === "depart") return "DEPART";
  if (command === "travel") return `TRAVEL${value ? ` to ${value}` : ""}`;
  if (command === "link")
    return `backend link ${value === "off" ? "CUT" : "restored"}`;
  return `${command} ${value}`;
}
