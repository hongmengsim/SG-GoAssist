// Browser entry: picks a data source, renders the current route, and wires the controls.
// ?mode=mock (default) runs a simulated world in the page with no backend.

import { simulatedTag, tag } from "./html.js";
import { createMockSource } from "./mock/source.js";
import { playgroundHtml, handlePlayground } from "./mock/playground.js";
import { stopCodes, busIds } from "./viewmodel.js";
import {
  auditSection,
  breadcrumbs,
  busPage,
  overviewPage,
  stopPage,
} from "./views.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const mode = params.get("mode") ?? "mock";

if (mode !== "mock") {
  $("root").innerHTML =
    `<section class="c12"><h2><span>Live mode</span></h2><div class="body"><p>Live mode is not available in this build. Use <a class="row-link" href="?mode=mock">mock mode</a>.</p></div></section>`;
  throw new Error(`Unsupported mode: ${mode}`);
}

const source = createMockSource();
const ui = { kind: "ALL", busId: "ALL", requestId: "ALL" };

$("modeBar").innerHTML =
  `${tag("info", "Mock data")} ${simulatedTag("Ramp simulated")}`;
$("drawerBtn").hidden = false;
$("drawer").hidden = false;

function route(state) {
  const parts = (location.hash || "#/").replace(/^#\/?/, "").split("/");
  if (parts[0] === "stop" && stopCodes(state).includes(parts[1]))
    return { name: "stop", id: parts[1] };
  if (parts[0] === "bus" && busIds(state).includes(parts[1]))
    return { name: "bus", id: parts[1] };
  return { name: "overview" };
}

let lastKey = "";
function render(force = false) {
  const state = source.state;
  const current = route(state);
  const key = JSON.stringify([current, state, ui, source.revision]);
  if (!force && key === lastKey) return;
  lastKey = key;

  const focused = document.activeElement;
  const keep = focused?.dataset?.act
    ? `[data-act="${focused.dataset.act}"]${focused.dataset.bus ? `[data-bus="${focused.dataset.bus}"]` : ""}`
    : focused?.dataset?.kind
      ? `[data-kind="${focused.dataset.kind}"]`
      : focused?.id
        ? `#${focused.id}`
        : null;

  $("crumbs").innerHTML = breadcrumbs(current);
  const actions = source.actionsFor(
    current.name === "bus" ? current.id : undefined,
  );
  $("root").innerHTML =
    current.name === "stop"
      ? stopPage(state, current.id, ui, actions)
      : current.name === "bus"
        ? busPage(state, current.id, ui, actions)
        : overviewPage(state, ui);
  if (keep) {
    const element = $("root").querySelector(keep);
    if (element && !element.disabled) element.focus();
  }
  renderDrawer();
}

function renderDrawer() {
  const drawer = $("drawer");
  if (
    drawer.contains(document.activeElement) &&
    document.activeElement.tagName === "INPUT"
  )
    return;
  const focusedId = drawer.contains(document.activeElement)
    ? document.activeElement.id
    : "";
  drawer.innerHTML = playgroundHtml(source.world);
  if (focusedId) $(focusedId)?.focus();
}

window.addEventListener("hashchange", () => {
  render(true);
  window.scrollTo(0, 0);
});

// ---- operator actions, with a confirmation for the ones that cannot be undone ----------------

let pending = null;
function ask(text, action) {
  pending = action;
  $("confirmText").textContent = text;
  $("confirm").className = "on";
  $("confirmYes").focus();
}
function closeAsk() {
  pending = null;
  $("confirm").className = "";
}
$("confirmYes").onclick = () => {
  const action = pending;
  closeAsk();
  if (action) action();
  render();
};
$("confirmNo").onclick = closeAsk;

$("root").addEventListener("click", (event) => {
  const chip = event.target.closest("[data-kind]");
  if (chip) {
    ui.kind = chip.dataset.kind;
    return render(true);
  }
  const button = event.target.closest("[data-act]");
  if (!button || button.disabled) return;
  const { act, bus } = button.dataset;
  if (act === "deploy") {
    source.world.deploy(bus, "OPERATOR");
    render(true);
  }
  if (act === "proceed") {
    source.world.proceedNext("OPERATOR");
    render(true);
  }
  if (act === "halt")
    ask(`Halt deployment on ${bus}?`, () => source.world.halt(bus, "OPERATOR"));
  if (act === "cancel")
    ask(
      `Cancel the accepted request on ${bus}? The passenger will be told it cannot be fulfilled.`,
      () => source.world.cancelRequest(bus, "OPERATOR"),
    );
});
$("root").addEventListener("change", (event) => {
  const field = event.target.dataset?.ui;
  if (field) {
    ui[field] = event.target.value;
    render(true);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeAsk();
    setDrawer(false);
  }
});

// ---- playground ------------------------------------------------------------------------------

function setDrawer(open) {
  $("drawer").classList.toggle("open", open);
  $("drawerBtn").setAttribute("aria-expanded", String(open));
}
$("drawerBtn").onclick = () =>
  setDrawer(!$("drawer").classList.contains("open"));
$("drawer").addEventListener("click", (event) => {
  if (event.target.id === "drawerClose") return setDrawer(false);
  if (event.target.id === "btnReset") {
    source.world.reset();
    return render(true);
  }
  const button = event.target.closest("[data-pg]");
  if (!button || button.disabled) return;
  const dataset = { ...button.dataset };
  if (dataset.pg === "submit") {
    dataset.bus = $("pgBus").value;
    dataset.help = $("pgHelp").value;
  }
  if (handlePlayground(source.world, dataset)) render(true);
});
$("drawer").addEventListener("change", (event) => {
  const target = event.target;
  if (target.id === "oAccept") source.world.setAutoAccept(target.checked);
  if (target.id === "oProceed") source.world.setAutoProceed(target.checked);
  if (target.id === "stallTimeout")
    source.world.setStallTimeoutSeconds(target.value);
  if (target.dataset.fault)
    source.world.setFault(target.dataset.fault, target.checked);
  render(true);
});

setInterval(() => {
  $("clock").textContent = new Date().toTimeString().slice(0, 8);
}, 1000);
source.onChange(() => render());
render(true);
