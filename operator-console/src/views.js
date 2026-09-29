// HTML for each page. Pure functions of (state, ui, actions); no DOM access. Meaning is
// carried by words and the shape marks from html.js; colour is added by the stylesheet only.

import { esc, simulatedTag, tag } from "./html.js";
import { PASSENGER_SEES, word } from "./labels.js";
import {
  ALL,
  AUDIT_KINDS,
  busCategories,
  busIds,
  classify,
  describe,
  filterAudit,
  helpAlerts,
  requestsForBus,
  stopCodes,
  stopStatus,
  stopView,
  summary,
  zoneView,
} from "./viewmodel.js";

const time = (iso) => {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? "--:--:--"
    : parsed.toISOString().slice(11, 19);
};

const kv = (rows) =>
  `<dl class="kv">${rows.map(([key, value]) => `<dt>${esc(key)}</dt><dd>${value}</dd>`).join("")}</dl>`;

const section = (width, title, right, body) =>
  `<section class="${width}"><h2><span>${title}</span>${right ?? ""}</h2><div class="body">${body}</div></section>`;

// ---- shared pieces --------------------------------------------------------------------------

export function breadcrumbs(route) {
  const here = (text) =>
    `<span class="here" aria-current="page">${esc(text)}</span>`;
  const link = (href, text) => `<a href="${href}">${esc(text)}</a>`;
  const sep = '<span class="sep">›</span>';
  if (route.name === "stop")
    return link("#/", "Overview") + sep + here(route.id);
  if (route.name === "bus")
    return link("#/", "Overview") + sep + here(route.id);
  return here("Overview");
}

function statusCategories(state, busId) {
  const cells = busCategories(state, busId).map((cat) => {
    const marks = [
      cat.simulated ? simulatedTag("Simulated") : "",
      cat.kind ? tag(cat.kind, kindWord(cat.kind)) : "",
    ].join(" ");
    return `<div class="cat"><h3><span>${esc(cat.title)}</span><span class="marks">${marks}</span></h3>
      <span class="val">${esc(cat.value)}</span><div class="sub">${esc(cat.sub)}</div></div>`;
  });
  return `<div class="cats">${cells.join("")}</div>`;
}

// The word that goes with each shape mark, so the mark is never the only signal.
function kindWord(kind) {
  return {
    ok: "Normal",
    idle: "Idle",
    warn: "Attention",
    stop: "Halted or fault",
    info: "In progress",
    sim: "Simulated",
  }[kind];
}

function busCard(state, busId) {
  const bus = state.buses[busId];
  const { text, kind } = stopStatus(state, busId);
  const [request] = requestsForBus(state, busId);
  const decision = bus.decision;
  const help = helpAlerts(state).some((alert) => alert.busId === busId);
  const flags = [
    help ? tag("stop", "Help required") : "",
    bus.status?.simulated
      ? simulatedTag("Sensors simulated")
      : tag("info", "Camera + ToF"),
  ].join(" ");
  return `<a class="card" href="#/bus/${esc(busId)}" aria-label="Open ${esc(busId)}">
    <div class="top"><span class="name">${esc(busId)}</span><span class="marks">${flags}</span></div>
    ${kv([
      [
        "Location",
        `${tag(kind, text)}${bus.status?.stopCode ? ` <small>· ${esc(bus.status.stopCode)}</small>` : ""}`,
      ],
      [
        "Request",
        request
          ? `${esc(request.requestId)} <small>· ${esc(word(PASSENGER_SEES, request.status))}</small>`
          : "<small>none</small>",
      ],
      [
        "Ramp (simulated)",
        esc(bus.ramp ? busCategories(state, busId)[2].value : "No report"),
      ],
      [
        "Local gate",
        decision
          ? `${esc(busCategories(state, busId)[3].value.toUpperCase())}`
          : "<small>no report</small>",
      ],
    ])}
    <span class="go">Open ${esc(busId)} status →</span></a>`;
}

function stopCard(state, stopCode) {
  const view = stopView(state, stopCode);
  const occupant = view.bay?.occupantBusId;
  return `<a class="card" href="#/stop/${esc(stopCode)}" aria-label="Open bus stop ${esc(stopCode)}">
    <div class="top"><span class="name">${esc(stopCode)}</span>${occupant ? tag("warn", "Bay occupied") : tag("ok", "Bay free")}</div>
    ${kv([
      [
        "Bay",
        `${esc(view.bay?.bayId ?? "BAY-1")} <small>· ${occupant ? `${esc(occupant)} in bay` : "empty"}</small>`,
      ],
      [
        "Waiting",
        view.bay?.waitingBusIds.length
          ? `${esc(view.bay.waitingBusIds.join(", "))} <small>· waiting for bay</small>`
          : "<small>none</small>",
      ],
      ["Requests", `${view.requests.length} <small>· at this stop</small>`],
    ])}
    <span class="go">Open stop status →</span></a>`;
}

// ---- audit log ------------------------------------------------------------------------------

function auditControls(state, ui) {
  const chips = AUDIT_KINDS.map(
    ([kind, label]) =>
      `<button class="chip" data-kind="${kind}" aria-pressed="${ui.kind === kind}">${esc(label)}</button>`,
  ).join("");
  const options = (values, selected) =>
    [ALL, ...values]
      .map(
        (value) =>
          `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${value === ALL ? "All" : esc(value)}</option>`,
      )
      .join("");
  return `<div class="row filters">${chips}
    <label>Bus <select data-ui="busId">${options(busIds(state), ui.busId)}</select></label>
    <label>Request <select data-ui="requestId">${options(Object.keys(state.requests).sort(), ui.requestId)}</select></label></div>`;
}

export function auditSection(state, ui, title) {
  const events = filterAudit(state, ui);
  const rows = events.length
    ? events
        .map(
          (
            event,
          ) => `<div class="lg k-${classify(event).toLowerCase()}"><span class="t">${time(event.timestamp)}</span>
            <span class="b">${esc(event.busId ?? "controller")}</span>
            <span class="k">${esc(kindLabel(classify(event)))}</span>
            <span class="m">${esc(describe(event))}</span></div>`,
        )
        .join("")
    : `<div class="lg"><span class="m wide">No log entries match this filter.</span></div>`;
  return section(
    "c12",
    esc(title),
    '<span class="note-inline">events and decisions, not camera footage</span>',
    `${auditControls(state, ui)}<div id="logbox" class="logbox" role="log" aria-live="polite">${rows}</div>`,
  );
}

function kindLabel(kind) {
  return AUDIT_KINDS.find(([value]) => value === kind)?.[1] ?? kind;
}

// ---- pages ----------------------------------------------------------------------------------

export function overviewPage(state, ui) {
  const counts = summary(state);
  const alerts = helpAlerts(state)
    .map(
      (
        alert,
      ) => `<div class="banner" role="alert"><span>HELP REQUIRED · ${esc(alert.busId)}: ${esc(alert.text)}</span>
        <a class="link" href="#/bus/${esc(alert.busId)}">Open ${esc(alert.busId)} →</a></div>`,
    )
    .join("");
  const stat = (label, value) =>
    `<div><b>${label}</b><span>${value}</span></div>`;
  const stops = stopCodes(state);
  const buses = busIds(state);
  return `${alerts}
    <div class="stats" role="group" aria-label="Summary">${stat("Bus stops", counts.stops)}${stat("Buses", counts.buses)}${stat("Open requests", counts.openRequests)}${stat("Fault entries", counts.faultEntries)}</div>
    ${section("c12", "Bus stops", tag("idle", "Click to open"), `<div class="cards">${stops.map((code) => stopCard(state, code)).join("") || '<p class="empty">No bus stop has reported yet.</p>'}</div>`)}
    ${section("c12", "Buses", tag("idle", "Click to open"), `<div class="cards">${buses.map((id) => busCard(state, id)).join("") || '<p class="empty">No bus has reported yet.</p>'}</div>`)}
    ${auditSection(state, ui, "Audit log · all requests, all buses")}`;
}

function baySvg(state, stopCode) {
  const bay = state.bays[stopCode];
  const xFor = {
    TRAVELLING_TO_STOP: 70,
    WAITING_FOR_BAY: 250,
    POSITIONED_AT_STOP: 500,
    DEPARTING: 800,
  };
  const buses = busIds(state).filter(
    (id) => state.buses[id].status?.stopCode === stopCode,
  );
  const drawn = buses
    .map((id, index) => {
      const status = state.buses[id].status;
      const cls = status.simulated ? "svg-bus sim" : "svg-bus";
      return `<g transform="translate(${xFor[status.movement] ?? 70},${46 + index * 44})"><rect class="${cls}" x="-70" y="0" width="140" height="34"/>
        <text x="0" y="22" text-anchor="middle">${esc(id)}${status.simulated ? " (sim)" : ""}</text></g>`;
    })
    .join("");
  const label = bay?.occupantBusId ? `OCCUPIED · ${bay.occupantBusId}` : "FREE";
  return `<svg viewBox="0 0 900 ${Math.max(150, 60 + buses.length * 44)}" width="100%" role="img" aria-label="Bay schematic: ${esc(label)}">
    <rect class="svg-bay ${bay?.occupantBusId ? "occupied" : "free"}" x="435" y="18" width="130" height="110"/>
    <text class="svg-note" x="500" y="14" text-anchor="middle">${esc(bay?.bayId ?? "BAY-1")} · ${esc(stopCode)} · ${esc(label)}</text>
    <line class="svg-kerb" x1="0" y1="130" x2="900" y2="130"/><text class="svg-note" x="8" y="146">kerb</text>${drawn}</svg>`;
}

function action(actions, id, label, cls, extra = "") {
  const state = actions?.[id] ?? { enabled: false };
  const reason =
    !state.enabled && state.reason
      ? `<span class="why">${esc(state.reason)}</span>`
      : "";
  return `<button class="${cls}" data-act="${id}" ${extra} ${state.enabled ? "" : "disabled"}>${esc(label)}</button>${reason}`;
}

export function stopPage(state, stopCode, ui, actions) {
  const view = stopView(state, stopCode);
  const occupied = view.bay?.occupantBusId;
  const rows = view.rows.length
    ? view.rows
        .map(
          (
            row,
          ) => `<tr><td><a class="row-link" href="#/bus/${esc(row.busId)}">${esc(row.busId)}</a> ${row.simulated ? simulatedTag("Sim") : ""}</td>
            <td>${tag(row.status.kind, row.status.text)}</td><td class="m">${esc(row.requestId ?? "-")}</td><td>${esc(row.ramp)}</td></tr>`,
        )
        .join("")
    : '<tr><td class="empty" colspan="4">No buses at or heading to this stop.</td></tr>';
  const requests = view.requests.length
    ? view.requests
        .map(
          (r) =>
            `<tr><td class="m">${esc(r.requestId)}</td><td>${esc(r.busId ?? "-")}</td><td>${esc(word(PASSENGER_SEES, r.status))}</td></tr>`,
        )
        .join("")
    : '<tr><td class="empty" colspan="3">No requests yet.</td></tr>';
  return `${section("c12", `${esc(stopCode)} · bay ${esc(view.bay?.bayId ?? "BAY-1")}`, occupied ? tag("warn", `Occupied · ${occupied}`) : tag("ok", "Free"), baySvg(state, stopCode))}
    ${section(
      "c8",
      "Buses at this stop",
      tag("idle", "Click a bus to open"),
      `<table><thead><tr><th>Bus</th><th>Status at stop</th><th>Request</th><th>Ramp (simulated)</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="row spaced">${action(actions, "proceed", "Proceed next waiting bus to bay", "", `data-stop="${esc(stopCode)}"`)}
      <span class="note">A bus leaving never deploys the next one; the next bus must be granted the bay and reach the boarding position first.</span></div>`,
    )}
    ${section("c4", "Requests at this stop", tag("idle", String(view.requests.length)), `<table><thead><tr><th>Request</th><th>Bus</th><th>Passenger sees</th></tr></thead><tbody>${requests}</tbody></table>`)}
    ${auditSection(state, ui, `Audit log · ${stopCode}`)}`;
}

function zonePanel(state, busId) {
  const bus = state.buses[busId];
  const view = zoneView(bus.decision);
  if (!view) {
    return section(
      "c5",
      "Ramp zone",
      tag("idle", "No decision yet"),
      "<p>The bus has not reported a safety decision.</p>",
    );
  }
  const objects = view.objects.length
    ? view.objects
        .map(
          (o) =>
            `<g class="zone-object ${o.safety === "Safe" ? "safe" : "unsafe"}"><rect x="0" y="0" width="180" height="26"/><text x="8" y="17">${esc(o.label)} · ${esc(o.safety.toUpperCase())} ${esc(o.confidence)}</text></g>`,
        )
        .map((item, index) =>
          item.replace(
            "<g ",
            `<g transform="translate(150,${150 + index * 34})" `,
          ),
        )
        .join("")
    : '<text class="svg-note" x="240" y="215" text-anchor="middle">nothing in the zone</text>';
  const svg = `<svg viewBox="0 0 480 420" width="100%" role="img" aria-label="Ramp zone schematic: zone ${esc(view.zone)}, ${esc(view.permission)}">
    <rect class="zone-frame" x="0" y="0" width="480" height="420"/>
    <rect class="zone-box" x="120" y="105" width="240" height="210"/><text class="svg-note" x="126" y="98">RAMP ZONE</text>${objects}</svg>`;
  const mark = tag(
    bus.decision.permission === "HALT" ? "stop" : "ok",
    view.permission,
  );
  return section(
    "c5",
    "Ramp zone",
    `${view.simulated ? simulatedTag("Simulated input") : ""} ${tag("info", "Not recorded")}`,
    `${svg}
     <div class="readout"><div><b>Zone</b><span>${esc(view.zone)}</span></div><div><b>Local gate</b><span>${mark}</span></div><div><b>ToF</b><span>${esc(view.tof)}</span></div></div>
     <h3 class="mini">Pi decision · ${esc(time(view.observedAt))}</h3>
     ${
       view.reasonItems.length
         ? `<ul class="reasons">${view.reasonItems.map((item) => `<li data-reason="${esc(item.code)}">${esc(item.text)}</li>`).join("")}</ul>`
         : '<p class="note">No halt reasons: every check passed.</p>'
     }
     <p class="note">Camera: ${esc(view.camera)}. Decided by the bus's local gate at ${esc(time(view.observedAt))}; the bus decides, and the console only shows it.</p>
     <div class="live-placeholder" role="img" aria-label="Live camera view placeholder">
       <b>LIVE CAMERA VIEW · NOT CONNECTED</b>
       <span>The real view will be a stream with access control and is not recorded. Until then, the schematic above is drawn from the Pi's decision, not a camera image.</span></div>`,
  );
}

export function busPage(state, busId, ui, actions) {
  const bus = state.buses[busId] ?? {};
  const alert = helpAlerts(state).find((item) => item.busId === busId);
  const banner = alert
    ? `<div class="banner" role="alert"><span>HELP REQUIRED · ${esc(alert.text)}. Inspect the bus; halt or cancel if needed.</span></div>`
    : "";
  const location = stopStatus(state, busId);
  const [request] = requestsForBus(state, busId);
  const flag = bus.status?.simulated
    ? simulatedTag("Sensors simulated")
    : tag("info", "Camera + ToF");
  return `${banner}
    ${section(
      "c7",
      `${esc(busId)}${bus.status?.busService ? ` · service ${esc(bus.status.busService)}` : ""}`,
      flag,
      `${statusCategories(state, busId)}
      ${kv([
        [
          "Location",
          bus.status?.stopCode
            ? `${tag(location.kind, location.text)} <a class="row-link" href="#/stop/${esc(bus.status.stopCode)}">${esc(bus.status.stopCode)}</a>`
            : "<small>not near any bus stop</small>",
        ],
        [
          "Request",
          request
            ? `${esc(request.requestId)} <small>· passenger sees "${esc(word(PASSENGER_SEES, request.status))}"</small>`
            : "<small>none accepted</small>",
        ],
      ])}`,
    )}
    ${zonePanel(state, busId)}
    ${section(
      "c7",
      `Operator intervention · ${esc(busId)}`,
      tag("idle", "Operator"),
      `<div class="row">${action(actions, "deploy", "Issue deploy request", "primary", `data-bus="${esc(busId)}"`)}
      ${action(actions, "halt", "Halt deployment", "danger", `data-bus="${esc(busId)}"`)}
      ${action(actions, "cancel", "Cancel request", "danger", `data-bus="${esc(busId)}"`)}</div>
      <p class="note">Commands are requests. The bus's local safety gate still decides, and an operator cannot override an obstruction or missing sensor data.</p>`,
    )}
    ${auditSection(state, { ...ui, busId }, `Audit log · ${busId}`)}`;
}
