// The page: reads /api/state every second and sends the presenter's button presses to the director.
import {
  renderActions,
  renderBus,
  renderSteps,
  renderStop,
  renderTimeline,
} from "./view.js";

const $ = (id) => document.getElementById(id);
const HEADERS = { "Content-Type": "application/json", "X-Demo-Director": "1" };
let last = {};
let state = null;

async function post(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body ?? {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

function toast(text) {
  $("toast").textContent = text;
}

/** Writes a section only when its HTML changed, and puts keyboard focus back on the same button. */
function put(id, html) {
  if (last[id] === html) return;
  last[id] = html;
  const focused = document.activeElement;
  const inside = focused && $(id).contains(focused);
  const index = inside
    ? [...$(id).querySelectorAll("button")].indexOf(focused)
    : -1;
  $(id).innerHTML = html;
  if (index >= 0) $(id).querySelectorAll("button")[index]?.focus();
}

function render() {
  if (!state) return;
  put("stop", renderStop(state));
  put(
    "buses",
    state.order
      .map((busId) => renderBus(state.buses[busId], state.stopCode))
      .join(""),
  );
  put("actions", renderActions(state));
  put("steps", renderSteps(state.steps));
  put("timeline", renderTimeline(state.timeline));
}

async function refresh() {
  try {
    state = await (await fetch("/api/state")).json();
    render();
  } catch {
    toast("✖ The demo director is not answering.");
  }
}

async function act(label, work) {
  try {
    await work();
    toast(`✔ ${label}: sent`);
  } catch (error) {
    toast(`✖ ${label}: refused. ${error.message}`);
  }
  refresh();
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-action]");
  if (!target) return;
  const { action, bus, command, value, confidence, step, halted } =
    target.dataset;
  if (action === "move" || action === "scene")
    return act(target.textContent, () =>
      post(`/api/agents/${encodeURIComponent(bus)}/control`, {
        command,
        ...(value === undefined ? {} : { value }),
        ...(confidence === undefined ? {} : { confidence: Number(confidence) }),
      }),
    );
  if (action === "request")
    return act(target.textContent, () => post("/api/request", { busId: bus }));
  if (action === "proceed")
    return act("Grant the bay", () => post("/api/bay/proceed"));
  if (action === "halt")
    return act(target.textContent, () =>
      post("/api/halt", { busId: bus, halted: halted === "true" }),
    );
  if (action === "cancel")
    return act(target.textContent, () => post("/api/cancel", { busId: bus }));
  if (action === "reset-sequence")
    return act("Start the sequence again", () => post("/api/sequence/reset"));
  if (action === "step")
    return act(`Step ${step}`, () => post(`/api/sequence/${step}/act`));
});

refresh();
setInterval(refresh, 1000);
