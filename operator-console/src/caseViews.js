// Pages and panels for assistance cases (the operator's case queue and case detail).

import { esc, tag } from "./html.js";
import { CASE_ACTIONS } from "./labels.js";
import {
  caseForBus,
  caseList,
  caseMetrics,
  caseView,
  needsAttention,
} from "./cases.js";
import { kv, section } from "./ui.js";

const caseLink = (item) =>
  `<a class="row-link" href="#/case/${esc(item.caseId)}">${esc(item.caseId.slice(-8).toUpperCase())}</a>`;

function queueRows(items) {
  if (!items.length)
    return '<tr><td class="empty" colspan="5">No assistance cases yet.</td></tr>';
  return items
    .map(
      (item) => `<tr><td>${caseLink(item)}</td>
        <td>${esc(item.busService || item.busId || "Vehicle needed")} · stop ${esc(item.stopCode ?? "-")}</td>
        <td>${tag(item.stateKind, item.stateWords)}${item.attention ? ` ${tag("warn", "Needs attention")}` : ""}</td>
        <td>${esc((item.assistanceTypes ?? []).join(", ").replaceAll("_", " ").toLowerCase())}</td>
        <td>${esc(item.escalationReason ?? "")}</td></tr>`,
    )
    .join("");
}

const queueTable = (items) =>
  `<table><thead><tr><th>Case</th><th>Bus and stop</th><th>State</th><th>Assistance</th><th>Reason</th></tr></thead><tbody>${queueRows(items)}</tbody></table>`;

/** The metrics strip the older operator page showed, in words. */
export function metricsStrip(state) {
  const metrics = caseMetrics(state);
  const cell = (label, value) =>
    `<div><b>${label}</b><span>${esc(value)}</span></div>`;
  return `<div class="stats six" role="group" aria-label="Case metrics">${cell("Active cases", metrics.active)}${cell("Needs attention", metrics.attention)}${cell("Acknowledgement p95", metrics.acknowledgement)}${cell("Safety blocks", metrics.safetyBlocks)}${cell("Devices online", metrics.devicesOnline)}${cell("Perception precision", metrics.perception)}</div>`;
}

/** Cases that need an operator, for the overview. */
export function attentionPanel(state) {
  const items = caseList(state).filter((item) => item.attention);
  return section(
    "c12",
    "Cases needing attention",
    items.length
      ? tag("warn", `${items.length} need attention`)
      : tag("ok", "None"),
    items.length
      ? queueTable(items)
      : '<p class="empty">No case needs an operator right now.</p>',
  );
}

export function casesPage(state) {
  return `${metricsStrip(state)}${section("c12", "Assistance cases", tag("idle", `${Object.keys(state.cases).length} in total`), queueTable(caseList(state)))}`;
}

/** The case for a bus, as a row on the bus page. */
export function busCaseRow(state, busId) {
  const item = caseForBus(state, busId);
  if (!item) return null;
  const view = caseView(state, item.caseId);
  return `${tag(view.state.kind, view.state.text)} <a class="row-link" href="#/case/${esc(item.caseId)}">${esc(item.caseId.slice(-8).toUpperCase())}</a>`;
}

function checklistHtml(view) {
  if (!view.checklist)
    return '<p class="note">Waiting for vehicle safety telemetry.</p>';
  return `<ul class="checklist">${view.checklist
    .map(
      (row) =>
        `<li>${esc(row.label)} ${tag(row.ok ? "ok" : "stop", row.value)}</li>`,
    )
    .join("")}</ul>`;
}

function autonomyHtml(view, actions) {
  const autonomy = view.autonomy;
  if (!autonomy) return "";
  const button = (name, label, cls) => {
    const state = actions?.[`AUTONOMY_${name}`] ?? { enabled: false };
    return `<button class="${cls}" data-autonomy="${name}" data-bus="${esc(view.busId)}" ${state.enabled ? "" : "disabled"}>${esc(label)}</button>`;
  };
  return `<h3 class="mini">Autonomous vehicle (simulated route automation)</h3>
    ${kv([
      [
        "Drive state",
        esc(
          String(autonomy.state ?? "")
            .replaceAll("_", " ")
            .toLowerCase(),
        ),
      ],
      [
        "Mode",
        esc(
          String(autonomy.mode ?? "")
            .replaceAll("_", " ")
            .toLowerCase(),
        ),
      ],
      ["Target stop", esc(autonomy.targetStopCode ?? "-")],
      ["Distance", `${Math.round(autonomy.distanceToTargetMeters ?? 0)} m`],
      ["Speed", `${Math.round(autonomy.speedKph ?? 0)} km/h`],
    ])}
    ${autonomy.blockReason ? `<p class="note">${esc(autonomy.blockReason)}</p>` : ""}
    <div class="row">${button("STOP", "Safety stop", "danger")}${button("MANUAL", "Manual control", "")}${button("RESUME", "Resume after checks", "primary")}</div>`;
}

export function casePage(state, caseId, actions) {
  const view = caseView(state, caseId);
  if (!view)
    return section(
      "c12",
      "Case",
      null,
      "<p>No such case. It may have been removed, or has not reached the console yet.</p>",
    );
  const buttons = CASE_ACTIONS.map(([name, label, cls]) => {
    const action = actions?.[name] ?? { enabled: false };
    const why =
      !action.enabled && action.reason
        ? `<span class="why">${esc(action.reason)}</span>`
        : "";
    return `<button class="${cls}" data-case-action="${name}" data-case="${esc(caseId)}" ${action.enabled ? "" : "disabled"}>${esc(label)}</button>${why}`;
  }).join("");
  return `${section(
    "c7",
    `Case ${esc(caseId.slice(-8).toUpperCase())} · ${esc(view.title)}`,
    tag(view.state.kind, view.state.text),
    `${kv([
      [
        "Intent",
        `${esc(view.intentsConfirmed)} · confidence ${esc(view.confidence)}`,
      ],
      ["Boarding intent", esc(view.boardingIntent)],
      ["Assistance", esc(view.assistance.join(", ") || "none")],
      ["Passengers", esc(view.passengers ?? "-")],
      [
        "Bus",
        view.busId
          ? `<a class="row-link" href="#/bus/${esc(view.busId)}">${esc(view.busId)}</a>`
          : "<small>not assigned</small>",
      ],
    ])}
    ${view.reason ? `<div class="banner-lite"><p role="status">${esc(view.reason)}</p></div>` : ""}
    ${autonomyHtml(view, actions)}`,
  )}
  ${section(
    "c5",
    "Safety clearance",
    tag("info", "Reported by the bus agent; interlocks are simulated"),
    `${checklistHtml(view)}<h3 class="mini">Action plan</h3>${view.plan.length ? `<ul>${view.plan.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : '<p class="note">No actions planned.</p>'}`,
  )}
  ${section(
    "c12",
    "Operator actions",
    tag("idle", "Operator"),
    `<div class="row">${buttons}</div>
     <p class="note">These ask the backend to change the case. It decides whether the action is allowed now, and safety checks still apply: completing or cancelling while something is in the ramp path does not retract the ramp.</p>`,
  )}`;
}

export { needsAttention };
