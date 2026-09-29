// Case view models: what an operator sees for an assistance case. Pure functions of the state.
// Re-exported from viewmodel.js.

import {
  ATTENTION_CASE_STATES,
  CASE_STATE,
  RAMP_POSITION,
  TERMINAL_CASE_STATES,
  humanize,
  word,
} from "./labels.js";

const time = (value) => Date.parse(value) || 0;

export const isFinished = (item) => TERMINAL_CASE_STATES.has(item.state);

export function needsAttention(state) {
  return Object.values(state.cases).filter((item) =>
    ATTENTION_CASE_STATES.has(item.state),
  );
}

const stateText = (name) => CASE_STATE[name]?.text ?? humanize(name);
const stateKind = (name) => CASE_STATE[name]?.kind ?? "idle";

/** Cases needing attention first, then newest first. */
export function caseList(state) {
  return Object.values(state.cases)
    .map((item) => ({
      ...item,
      stateWords: stateText(item.state),
      stateKind: stateKind(item.state),
      attention: ATTENTION_CASE_STATES.has(item.state),
    }))
    .sort(
      (a, b) =>
        Number(b.attention) - Number(a.attention) ||
        time(b.updatedAt ?? b.createdAt) - time(a.updatedAt ?? a.createdAt),
    );
}

/** A bus's newest case that is not finished. */
export function caseForBus(state, busId) {
  return Object.values(state.cases)
    .filter((item) => item.busId === busId && !isFinished(item))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
}

const clear = (value) => ({
  value: value ? "Clear" : "Blocked",
  ok: Boolean(value),
});

function checklist(telemetry) {
  if (!telemetry) return null;
  return [
    { label: "Vehicle stopped", ...clear(telemetry.vehicleStopped) },
    { label: "Parking brake", ...clear(telemetry.parkingBrakeActive) },
    { label: "Door open", ...clear(telemetry.doorOpen) },
    { label: "Ramp path", ...clear(telemetry.deploymentPathClear) },
    {
      label: "Ramp position",
      value: word(RAMP_POSITION, telemetry.rampPosition),
      ok:
        telemetry.rampPosition === "STOWED" ||
        telemetry.rampPosition === "DEPLOYED",
    },
  ];
}

export function caseView(state, caseId) {
  const item = state.cases[caseId];
  if (!item) return undefined;
  const intents = item.intents ?? [];
  const intent = item.boardingIntent;
  return {
    caseId,
    title: `${item.busService || item.busId || "Vehicle needed"} · stop ${item.stopCode}`,
    state: { text: stateText(item.state), kind: stateKind(item.state) },
    busId: item.busId,
    finished: isFinished(item),
    intentsConfirmed: `${intents.filter((entry) => entry.confirmed).length} of ${intents.length} intents confirmed`,
    confidence:
      item.confidence === undefined
        ? ""
        : `${Math.round(item.confidence * 100)}%`,
    boardingIntent: intent
      ? `${humanize(intent.decision)} · ${Math.round(intent.confidence * 100)}% · ${intent.reason}`
      : "Waiting for evidence",
    checklist: checklist(item.busId ? state.telemetry[item.busId] : undefined),
    plan: (item.actionPlan ?? []).map(
      (entry) => `${humanize(entry.action)}: ${humanize(entry.status)}`,
    ),
    reason: item.escalationReason ?? "",
    assistance: (item.assistanceTypes ?? []).map((type) => humanize(type)),
    passengers: item.passengerCount,
    autonomy: item.busId ? state.autonomy[item.busId] : undefined,
  };
}

export function caseMetrics(state) {
  const metrics = state.metrics ?? {};
  const show = (value) =>
    value === undefined || value === null ? "–" : String(value);
  return {
    active: show(metrics.activeCases),
    attention: String(needsAttention(state).length),
    acknowledgement:
      metrics.acknowledgementP95Ms == null
        ? "–"
        : `${metrics.acknowledgementP95Ms} ms`,
    safetyBlocks: show(metrics.safetyBlocks),
    devicesOnline: show(metrics.devicesOnline),
    perception:
      metrics.perceptionPrecision == null
        ? "–"
        : `${Math.round(metrics.perceptionPrecision * 100)}%`,
  };
}
