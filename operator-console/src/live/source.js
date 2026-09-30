// Live mode: reads the backend's operator endpoints and follows a SUBSCRIBE_OPERATIONS
// WebSocket. Everything goes through the same reducer as mock mode, so the views cannot tell
// the two apart. Actions the backend does not offer are reported as unavailable, with the
// reason, never faked.
//
// The console holds no passenger identity: request lists are reduced to the fields it needs.

import { addAudit, initialState, reduce, setAudit } from "../state.js";
import {
  canProceedNow,
  isFinished,
  requestsForBus,
  stopCodes,
} from "../viewmodel.js";

const AUDIT_LIMIT = 200;
const RECONNECT_MS = 2000;
const MAX_HELD_MESSAGES = 1000;
const REFRESH_DELAY_MS = 500;
const DEVICE_FRESH_MS = 15000;
const CASE_ACTIONS = new Set([
  "CONFIRM",
  "RETRY",
  "ESCALATE",
  "COMPLETE",
  "CANCEL",
]);
const AUTONOMY_ACTIONS = new Set(["STOP", "MANUAL", "RESUME"]);

const DEPLOY_UNAVAILABLE =
  "The backend issues the deploy command itself once the case is cleared; there is no operator deploy.";
const HALT_REASON = "Halted by operator from the console";

const defaultSchedule = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

class HttpFailure extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createLiveSource({
  baseUrl,
  token,
  fetchFn = (...args) => fetch(...args),
  WebSocketCtor = globalThis.WebSocket,
  schedule = defaultSchedule,
} = {}) {
  const base = baseUrl.replace(/\/+$/, "");
  let state = initialState();
  let revision = 0;
  let connection = { status: "connecting", detail: "" };
  let started = false;
  let socket;
  let cancelReconnect = () => {};
  let cancelRefresh = null;
  let currentToken = token;
  let snapshotRun = 0;
  // Reads of the backend's current state that are in flight. A message pushed meanwhile is newer
  // than the data those reads will return, so it is kept and applied again after them.
  let reading = 0;
  const held = [];
  const listeners = new Set();

  const notify = () => listeners.forEach((listener) => listener());
  function apply(next) {
    if (next === state) return;
    state = next;
    revision += 1;
    notify();
  }
  function setConnection(status, detail = "") {
    if (connection.status === status && connection.detail === detail) return;
    connection = { status, detail };
    revision += 1;
    notify();
  }

  function beginReading() {
    reading += 1;
  }
  function endReading() {
    reading -= 1;
    if (reading > 0 || held.length === 0) return;
    const queued = held.splice(0);
    apply(queued.reduce(reduce, state));
    scheduleRefresh();
  }
  function hold(message) {
    if (held.length >= MAX_HELD_MESSAGES) held.shift();
    held.push(message);
  }

  const authHeaders = () =>
    currentToken ? { Authorization: `Bearer ${currentToken}` } : {};

  async function request(method, path, body) {
    const headers = {
      ...authHeaders(),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    };
    const response = await fetchFn(`${base}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new HttpFailure(
        response.status,
        payload?.error ?? `HTTP ${response.status}`,
      );
    return payload;
  }

  const get = (path) => request("GET", path);

  // ---- snapshot -------------------------------------------------------------------------------

  async function loadSnapshot() {
    const run = (snapshotRun += 1);
    beginReading();
    try {
      const [statuses, ramps, decisions, help, requests, audit] =
        await Promise.all([
          get("/api/operations/bus-status?limit=500"),
          get("/api/operations/ramp-simulations?limit=500"),
          get("/api/operations/safety-decisions?limit=500"),
          get("/api/operations/help-required?limit=500"),
          get("/api/assistance"),
          get(`/api/operations/audit?limit=${AUDIT_LIMIT}`),
        ]);
      if (run !== snapshotRun) return;
      const caseData = await readCaseData();
      if (run !== snapshotRun) return;
      const wrap = (type, key) => (item) => ({
        type,
        [key]: item,
        timestamp: item.observedAt,
      });
      const messages = [
        ...statuses.statuses.map(wrap("BUS_STATUS", "status")),
        ...ramps.records.map(wrap("RAMP_SIMULATION", "ramp")),
        ...decisions.records.map(wrap("RAMP_SAFETY", "decision")),
        ...help.records.map(wrap("HELP_REQUIRED", "help")),
        ...requests.requests.map((item) => ({
          type: "REQUEST_SNAPSHOT",
          request: item,
        })),
      ];
      // Read everything that needs the network first. The state is folded in only afterwards, in
      // one synchronous step, so a message pushed while these reads were in flight is kept.
      const stops = stopCodes(messages.reduce(reduce, state));
      const bays = [];
      for (const stop of stops) {
        bays.push(
          await get(`/api/operations/bays/${encodeURIComponent(stop)}`),
        );
      }
      if (run !== snapshotRun) return;
      let next = messages.reduce(reduce, state);
      next = setAudit(next, audit.events);
      next = applyCaseData(next, caseData);
      for (const bay of bays) {
        next = reduce(next, {
          type: "BAY_STATUS",
          bay,
          timestamp: bay.updatedAt,
        });
      }
      apply(next);
      if (
        connection.status === "auth-required" ||
        connection.status === "error"
      ) {
        setConnection(socket?.readyState === 1 ? "connected" : "connecting");
      }
    } catch (error) {
      if (run !== snapshotRun) return;
      if (error instanceof HttpFailure && error.status === 401) {
        setConnection("auth-required", "The backend needs the operator token.");
      } else {
        setConnection(
          "error",
          error instanceof Error ? error.message : String(error),
        );
      }
    } finally {
      endReading();
    }
  }

  // The optional reads (telemetry, autonomy, metrics) may legitimately be missing for a bus or
  // when a service is off; only the case list itself is required.
  async function optional(path) {
    try {
      return await get(path);
    } catch (error) {
      if (error instanceof HttpFailure && error.status === 401) throw error;
      return undefined;
    }
  }

  async function readCaseData() {
    const cases = await get("/api/operations/cases");
    const busIdsWithCases = [
      ...new Set(cases.cases.map((item) => item.busId).filter(Boolean)),
    ];
    const vehicle = (id, suffix) =>
      optional(`/api/operations/vehicles/${encodeURIComponent(id)}/${suffix}`);
    const halts = await optional("/api/operations/operator-halts?limit=500");
    const [telemetry, autonomy, metrics, devices, perception] =
      await Promise.all([
        Promise.all(busIdsWithCases.map((id) => vehicle(id, "telemetry"))),
        Promise.all(busIdsWithCases.map((id) => vehicle(id, "autonomy"))),
        optional("/api/operations/metrics"),
        optional("/api/operations/devices"),
        optional("/api/operations/perception/metrics"),
      ]);
    return {
      halts: halts?.records ?? [],
      cases: cases.cases,
      telemetry,
      autonomy,
      metrics,
      devices,
      perception,
    };
  }

  function applyCaseData(start, data) {
    let next = start;
    for (const item of data.cases)
      next = reduce(next, { type: "CASE_SNAPSHOT", case: item });
    for (const item of data.halts)
      next = reduce(next, { type: "OPERATOR_HALT", halt: item });
    for (const item of data.telemetry)
      if (item)
        next = reduce(next, { type: "TELEMETRY_SNAPSHOT", telemetry: item });
    for (const item of data.autonomy)
      if (item)
        next = reduce(next, { type: "AUTONOMY_SNAPSHOT", autonomy: item });
    if (data.metrics) {
      const online = (data.devices?.devices ?? []).filter(
        (device) =>
          device.networkOnline &&
          Date.now() - Date.parse(device.observedAt) < DEVICE_FRESH_MS,
      ).length;
      next = reduce(next, {
        type: "METRICS_SNAPSHOT",
        metrics: data.metrics,
        devicesOnline: data.devices ? online : undefined,
        perceptionPrecision: data.perception?.microPrecision ?? undefined,
      });
    }
    return next;
  }

  // The audit log is not pushed, and pushed request messages carry no case id, so both are
  // re-read shortly after anything changes.
  async function refreshLists() {
    cancelRefresh = null;
    beginReading();
    try {
      const [audit, requests, caseData] = await Promise.all([
        get(`/api/operations/audit?limit=${AUDIT_LIMIT}`),
        get("/api/assistance"),
        readCaseData(),
      ]);
      let next = setAudit(state, audit.events);
      for (const item of requests.requests)
        next = reduce(next, { type: "REQUEST_SNAPSHOT", request: item });
      apply(applyCaseData(next, caseData));
    } catch {
      // The next pushed message or reconnect refreshes again; the connection tag shows real failures.
    } finally {
      endReading();
    }
  }

  function scheduleRefresh() {
    if (cancelRefresh) return;
    cancelRefresh = schedule(refreshLists, REFRESH_DELAY_MS);
  }

  // ---- socket ---------------------------------------------------------------------------------

  function connect() {
    if (!started || !WebSocketCtor) return;
    const url = base.replace(/^http/, "ws");
    socket = new WebSocketCtor(url);
    const mine = socket;
    mine.onopen = () => {
      mine.send(
        JSON.stringify({
          type: "SUBSCRIBE_OPERATIONS",
          ...(currentToken ? { token: currentToken } : {}),
        }),
      );
      loadSnapshot();
    };
    mine.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message?.type === "SUBSCRIBED_OPERATIONS")
        return setConnection("connected");
      if (message?.type === "AUTH_REQUIRED")
        return setConnection(
          "auth-required",
          "The backend needs the operator token.",
        );
      // Shown at once, and kept when a read is in flight so it is applied again on top of that
      // read's older data.
      if (reading > 0) hold(message);
      const next = reduce(state, message);
      if (next !== state) {
        apply(next);
        scheduleRefresh();
      }
      if (
        ["ASSIST_REQUESTED", "REQUEST_STATUS", "CASE_STATUS"].includes(
          message?.type,
        )
      )
        scheduleRefresh();
    };
    mine.onclose = () => {
      if (!started || mine !== socket) return;
      if (connection.status !== "auth-required")
        setConnection("reconnecting", "Connection to the backend was lost.");
      cancelReconnect = schedule(connect, RECONNECT_MS);
    };
  }

  // ---- actions --------------------------------------------------------------------------------

  function actionsFor(busId, stopCode) {
    const bays = stopCode ? [state.bays[stopCode]] : Object.values(state.bays);
    const [request] = busId ? requestsForBus(state, busId) : [];
    return {
      proceed: { enabled: bays.some((bay) => canProceedNow(bay)) },
      deploy: { enabled: false, reason: DEPLOY_UNAVAILABLE },
      halt:
        busId && state.buses[busId]?.operatorHalt?.halted
          ? { enabled: true, label: "Release halt", intent: "release" }
          : { enabled: Boolean(busId), label: "Halt bus", intent: "halt" },
      cancel: request?.caseId
        ? { enabled: true }
        : {
            enabled: false,
            reason: busId
              ? "This bus has no open request with a case."
              : undefined,
          },
    };
  }

  /**
   * Halts the bus or releases the halt, as the operator confirmed (`release`). Without an explicit
   * intent it flips the state it last saw. The bus adds the halt to its own reasons.
   */
  async function toggleHalt(busId, release) {
    if (!busId) return { ok: false, message: "Open a bus to halt it." };
    const halted =
      typeof release === "boolean"
        ? release
        : Boolean(state.buses[busId]?.operatorHalt?.halted);
    try {
      await request(
        "POST",
        `/api/operations/vehicles/${encodeURIComponent(busId)}/operator-halt`,
        halted ? { halted: false } : { halted: true, reason: HALT_REASON },
      );
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
    loadSnapshot();
    return { ok: true, message: "Done." };
  }

  async function performCaseAction(kind, { caseId, busId, action }) {
    try {
      if (kind === "case") {
        if (!CASE_ACTIONS.has(action))
          return { ok: false, message: "Unknown case action." };
        await request(
          "POST",
          `/api/operations/cases/${encodeURIComponent(caseId)}/operator`,
          { action },
        );
      } else {
        if (!AUTONOMY_ACTIONS.has(action))
          return { ok: false, message: "Unknown vehicle action." };
        // The same body the older operator page sent: resuming declares the checks done.
        const clearance =
          action === "RESUME"
            ? { obstacleCleared: true, localizationAccuracyMeters: 5 }
            : {};
        await request(
          "POST",
          `/api/operations/vehicles/${encodeURIComponent(busId)}/autonomy/override`,
          { action, ...clearance },
        );
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
    loadSnapshot();
    return { ok: true, message: "Done." };
  }

  function caseActionsFor(caseId) {
    const item = state.cases[caseId];
    const open = Boolean(item) && !isFinished(item);
    const reason = open ? undefined : "This case is finished or not known.";
    const actions = Object.fromEntries(
      [...CASE_ACTIONS].map((name) => [name, { enabled: open, reason }]),
    );
    const hasAutonomy = Boolean(item?.busId && state.autonomy[item.busId]);
    for (const name of AUTONOMY_ACTIONS)
      actions[`AUTONOMY_${name}`] = { enabled: hasAutonomy };
    return actions;
  }

  async function perform(action, context = {}) {
    const { busId, stopCode } = context;
    // The backend is the authority on whether an action is allowed now; the console's own view may
    // be a moment out of date, so it does not pre-empt a refusal. Only actions that do not exist
    // are refused here.
    if (action === "case" || action === "autonomy")
      return performCaseAction(action, context);
    if (action === "halt") return toggleHalt(busId, context.release);
    if (action !== "proceed" && action !== "cancel") {
      return {
        ok: false,
        message:
          actionsFor(busId, stopCode)[action]?.reason ??
          "This action is not available.",
      };
    }
    try {
      if (action === "proceed") {
        const stop =
          stopCode ??
          Object.values(state.bays).find((bay) => canProceedNow(bay))?.stopCode;
        if (!stop)
          return { ok: false, message: "No bay is waiting to be granted." };
        await request(
          "POST",
          `/api/operations/bays/${encodeURIComponent(stop)}/proceed`,
          {},
        );
      } else if (action === "cancel") {
        const [open] = requestsForBus(state, busId);
        if (!open?.caseId)
          return {
            ok: false,
            message: "This bus has no open request with a case.",
          };
        await request(
          "POST",
          `/api/operations/cases/${encodeURIComponent(open.caseId)}/operator`,
          {
            action: "CANCEL",
            reason: "Cancelled by operator from the console",
          },
        );
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
    loadSnapshot();
    return { ok: true, message: "Done." };
  }

  return {
    mode: "live",
    get state() {
      return state;
    },
    get revision() {
      return revision;
    },
    get connection() {
      return connection;
    },
    get needsToken() {
      return connection.status === "auth-required";
    },
    actionsFor,
    caseActionsFor,
    perform,
    onChange: (listener) => {
      listeners.add(listener);
    },
    start() {
      started = true;
      loadSnapshot();
      connect();
    },
    stop() {
      started = false;
      cancelReconnect();
      cancelRefresh?.();
      socket?.close();
    },
    setToken(next) {
      currentToken = next || undefined;
      if (!started) return;
      socket?.close();
      cancelReconnect();
      connect();
      loadSnapshot();
    },
    addAuditEvent: (event) => apply(addAudit(state, event)),
  };
}
