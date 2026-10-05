// Pure functions that turn the director's state into HTML. No DOM here, so they can be tested directly.
// Meaning is never carried by colour alone: every state is a word plus a shape mark, and REAL and
// SIMULATED differ by border style (solid and dashed) as well as by their words.

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
  );

export const MARK = { REAL: "■", SIMULATED: "◇", UNKNOWN: "?" };

/** A REAL or SIMULATED tag: a word, a shape, and a border style. */
export const kindTag = (kind) =>
  `<span class="kind kind-${esc(kind.toLowerCase())}">${MARK[kind] ?? "?"} ${esc(kind)}</span>`;

// Where a bus is drawn along the stop, from what the bus itself says.
const POSITIONS = {
  TRAVELLING_TO_STOP: ["pos-approach", "APPROACHING THE STOP"],
  WAITING_FOR_BAY: ["pos-queue", "WAITING FOR THE BAY"],
  POSITIONED_AT_STOP: ["pos-bay", "IN THE BAY"],
  DEPARTING: ["pos-leave", "LEAVING"],
};

export function busPosition(movementCode) {
  return POSITIONS[movementCode] ?? ["pos-approach", "POSITION UNKNOWN"];
}

const RAMP_MARK = {
  STOWED: "▭ stowed",
  DEPLOYMENT_REQUESTED: "◆ deployment requested",
  DEPLOYING: "◆ deploying",
  DEPLOYED: "▬ deployed",
  HALTED: "■ halted",
};

const time = (iso) => {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? "--:--:--"
    : parsed.toLocaleTimeString("en-GB", { hour12: false });
};

export function renderStop(state) {
  const rows = state.order.map((busId) => {
    const bus = state.buses[busId];
    const [position, words] = busPosition(bus.agent?.movement?.code);
    const ramp = RAMP_MARK[bus.agent?.ramp?.state] ?? "? ramp unknown";
    return `<div class="lane">
      <div class="token ${position} token-${esc(bus.kind.toLowerCase())}" data-bus="${esc(busId)}">
        <b>${esc(bus.label)}</b> ${kindTag(bus.kind)}<br>
        <span class="small">${esc(words)} · ramp ${esc(ramp)}</span>
      </div>
    </div>`;
  });
  const bay = state.backend.bay;
  const bayText = bay
    ? `Bay: occupant ${esc(bay.occupantBusId ?? "nobody")} · granted ${esc(bay.grantedBusId ?? "nobody")} · waiting ${esc((bay.waitingBusIds ?? []).join(", ") || "nobody")}`
    : `Bay: not known (${esc(state.backend.error ?? "no data")})`;
  return `<div class="stop" role="img" aria-label="The stop: each bus is drawn where it says it is">
    <div class="zones"><span>APPROACHING</span><span>WAITING LANE</span><span class="bay-zone">BOARDING BAY (one only)</span><span>LEAVING</span></div>
    ${rows.join("")}
  </div><p class="bay-text">${bayText}</p>`;
}

const SCENE = [
  ["place", "person", "Person in the ramp zone", { value: "person" }],
  ["place", "leaf", "Leaf in the zone (safe object)", { value: "leaf", confidence: 0.95 }],
  ["place", "plastic_bag", "Plastic bag in the zone (safe object)", { value: "plastic_bag", confidence: 0.95 }],
  ["clear", "clear", "Empty the zone", {}],
  ["block", "block-on", "Beam blocked", { value: "on" }],
  ["block", "block-off", "Beam clear again", { value: "off" }],
  ["dropout", "dropout-on", "Sensor drops out", { value: "on" }],
  ["dropout", "dropout-off", "Sensor back", { value: "off" }],
  ["cover", "cover-on", "Camera covered", { value: "on" }],
  ["cover", "cover-off", "Camera uncovered", { value: "off" }],
  ["link", "link-off", "Cut the backend link", { value: "off" }],
  ["link", "link-on", "Restore the link", { value: "on" }],
];

const button = (action, label, data = {}, hint = "") =>
  `<button type="button" data-action="${esc(action)}" ${Object.entries(data)
    .map(([key, value]) => `data-${esc(key)}="${esc(typeof value === "object" ? JSON.stringify(value) : value)}"`)
    .join(" ")}>${esc(label)}</button>${hint ? `<span class="hint">${esc(hint)}</span>` : ""}`;

function readings(bus) {
  const agent = bus.agent;
  if (!agent) return `<p class="note">The agent is not reachable: ${esc(bus.agentError ?? "no answer")}</p>`;
  const decision = agent.decision;
  const reasons = (decision?.reasons ?? []).map((reason) => reason.text ?? reason.code).join("; ");
  return `<dl class="kv">
    <dt>Movement</dt><dd>${esc(agent.movement?.text ?? "unknown")}</dd>
    <dt>Simulated ramp</dt><dd>${esc(RAMP_MARK[agent.ramp?.state] ?? agent.ramp?.state ?? "unknown")}</dd>
    <dt>The bus's own gate</dt><dd>${decision ? `${decision.permission === "CONTINUE" ? "● CONTINUE" : "■ HALT"}${reasons ? ` · ${esc(reasons)}` : ""}` : "no decision yet"}</dd>
    <dt>Beam ${kindTag(agent.beam?.simulated ? "SIMULATED" : "REAL")}</dt><dd>${esc(agent.beam?.state ?? "unknown")}${agent.beam?.distanceMm != null ? ` · ${esc(Math.round(agent.beam.distanceMm))} mm` : ""}</dd>
    <dt>Camera ${kindTag(bus.kind)}</dt><dd>${agent.camera?.imageOk ? "● image ok" : `▲ ${esc(agent.camera?.degradedReason ?? "degraded")}`}</dd>
    <dt>Backend link</dt><dd>${agent.link?.ok === false ? "■ DOWN" : "● working"}</dd>
    <dt>Operator halt</dt><dd>${bus.operatorHalt ? "■ ON" : "○ off"}</dd>
  </dl>`;
}

export function renderBus(bus, stopCode) {
  const busId = bus.busId;
  const movement = [
    button("move", "TRAVEL", { bus: busId, command: "travel" }),
    button("move", "ARRIVE", { bus: busId, command: "arrive", value: stopCode }),
    button("move", "DEPART", { bus: busId, command: "depart" }),
  ].join(" ");
  let injected;
  if (bus.kind === "SIMULATED" && bus.controlLevel === "scene") {
    injected = `<h4>Inject a state ${kindTag("SIMULATED")}</h4>
      <p class="note">These change only what this simulated bus appears to see. Its own gate still decides.</p>
      <div class="buttons">${SCENE.map(([command, id, label, extra]) =>
        button("scene", label, { bus: busId, command, ...extra }),
      ).join(" ")}</div>`;
  } else {
    injected = `<h4>Do it physically ${kindTag("REAL")}</h4>
      <p class="note">This bus's sensors are real. The demo cannot change what they read; the readings above are live.</p>
      <ul class="prompts">
        <li>Put a hand or an object in the beam: the beam reads BLOCKED and the gate HALTS.</li>
        <li>Take it away: the beam reads clear again after a few readings.</li>
        <li>Cover the camera lens with a card: the camera reads degraded and the gate HALTS.</li>
      </ul>`;
  }
  return `<section class="card card-${esc(bus.kind.toLowerCase())}">
    <h3>${esc(bus.label)} · ${esc(busId)} ${kindTag(bus.kind)}</h3>
    ${readings(bus)}
    <h4>Move the bus ${kindTag(bus.kind)}</h4>
    <p class="note">Bus movement is represented in the demonstration; no vehicle drives.</p>
    <div class="buttons">${movement}</div>
    ${injected}
  </section>`;
}

export function renderActions(state) {
  const perBus = state.order
    .map((busId) => {
      const bus = state.buses[busId];
      return `<div class="row"><b>${esc(bus.label)}</b>
        ${button("request", "Create a request", { bus: busId })}
        ${button("halt", "Operator halt", { bus: busId, halted: "true" })}
        ${button("halt", "Release halt", { bus: busId, halted: "false" })}
        ${button("cancel", "Cancel its request", { bus: busId })}</div>`;
    })
    .join("");
  return `<section class="card card-operator">
    <h3>Passenger and operator actions</h3>
    <p class="note">${kindTag("SIMULATED")} <b>Create a request</b> is a simulated passenger (no phone). ${kindTag("REAL")} Grant, halt and cancel use the backend's real operator routes. Confirmation always comes from the bus itself, never from here.</p>
    ${perBus}
    <div class="row">${button("proceed", "GRANT THE BAY to the next waiting bus")}</div>
  </section>`;
}

export function renderSteps(steps) {
  const next = steps.find((step) => !step.done)?.id;
  return `<ol class="steps">${steps
    .map(
      (step) => `<li class="step ${step.done ? "done" : ""} ${step.id === next ? "next" : ""}">
      <div class="step-head"><span class="mark">${step.done ? "● DONE" : step.id === next ? "◆ NEXT" : "○ not yet"}</span>
        <b>${step.id}. ${esc(step.title)}</b> <span class="label">[${esc(step.label)}]</span></div>
      <p>${esc(step.presenter)}</p>
      <p class="detail">${esc(step.detail)}</p>
      ${step.hasAction ? button("step", "DO THIS STEP", { step: step.id }) : ""}
    </li>`,
    )
    .join("")}</ol>`;
}

const SOURCE_MARK = (source) =>
  source.includes("SIMULATED") ? "◇" : source.includes("REAL") ? "■" : source.startsWith("DEMO") ? "◆" : "○";

export function renderTimeline(timeline) {
  if (timeline.length === 0) return `<p class="note">Nothing has happened yet.</p>`;
  return `<ul class="timeline">${[...timeline]
    .reverse()
    .map(
      (entry) =>
        `<li><span class="t">${esc(time(entry.at))}</span> <span class="src">${SOURCE_MARK(entry.source)} ${esc(entry.source)}</span> ${esc(entry.text)}</li>`,
    )
    .join("")}</ul>`;
}
