// Browser entry: picks a data source, renders the current route, and wires the controls.
//   ?mode=mock   (default) a simulated world in the page, no backend
//   ?mode=live   the real backend: ?backend=http://host:3000 (default: this host, port 3000)

import { patchInner } from "./domPatch.js";
import { resolveBackend } from "./backendUrl.js";
import { simulatedTag, tag } from "./html.js";
import { createLiveSource } from "./live/source.js";
import { createMockSource } from "./mock/source.js";
import { handlePlayground, playgroundHtml } from "./mock/playground.js";
import { busIds, haltConfirmText, stopCodes } from "./viewmodel.js";
import {
  breadcrumbs,
  busPage,
  casePage,
  casesPage,
  overviewPage,
  stopPage,
} from "./views.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const mode = params.get("mode") === "live" ? "live" : "mock";
const TOKEN_KEY = "goassist.operatorToken";

function storedToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || undefined;
  } catch {
    return undefined; // storage can be blocked; the token then lives for this page only
  }
}
function storeToken(value) {
  try {
    sessionStorage.setItem(TOKEN_KEY, value);
  } catch {
    // ignore: see above
  }
}

// Where the operator token is sent is decided by an allow-list, never by the link alone.
const allowedBackends = (
  document
    .querySelector('meta[name="goassist-allowed-backends"]')
    ?.getAttribute("content") ?? ""
)
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);
const { baseUrl: backend, warning: backendWarning } = resolveBackend({
  param: params.get("backend"),
  page: location,
  allowed: allowedBackends,
});
const source =
  mode === "live"
    ? createLiveSource({ baseUrl: backend, token: storedToken() })
    : createMockSource();
const ui = { kind: "ALL", busId: "ALL", requestId: "ALL", now: Date.now() };
let notice = "";

// ---- header ---------------------------------------------------------------------------------------

const CONNECTION = {
  connected: ["ok", "Connected"],
  connecting: ["info", "Connecting"],
  reconnecting: ["warn", "Reconnecting"],
  "auth-required": ["stop", "Operator token needed"],
  error: ["stop", "Backend unreachable"],
};

function renderModeBar() {
  const switcher = `<a class="link" href="?mode=${mode === "live" ? "mock" : "live"}">Switch to ${mode === "live" ? "mock" : "live"} mode</a>`;
  if (mode === "mock")
    return `${tag("info", "Mock data")} ${simulatedTag("Ramp simulated")} ${switcher}`;
  const [kind, text] = CONNECTION[source.connection.status] ?? [
    "idle",
    source.connection.status,
  ];
  return `${tag("ok", "Live")} ${tag(kind, text)} ${simulatedTag("Simulated things are labelled")} ${switcher}`;
}

function renderNotice() {
  const detail = mode === "live" ? source.connection.detail : "";
  const tokenForm =
    mode === "live" && source.needsToken
      ? `<form id="tokenForm" class="row"><label for="tokenInput">Operator token</label>
        <input id="tokenInput" type="password" autocomplete="off" required><button class="primary" type="submit">Use token</button></form>`
      : "";
  const messages = [notice, detail, mode === "live" ? backendWarning : ""]
    .filter(Boolean)
    .map((text) => `<p role="status">${text.replace(/[&<>]/g, "")}</p>`)
    .join("");
  patchInner(
    $("notice"),
    messages || tokenForm
      ? `<div class="banner-lite">${messages}${tokenForm}</div>`
      : "",
  );
}

// ---- routing and rendering ---------------------------------------------------------------------------

function route(state) {
  const parts = (location.hash || "#/").replace(/^#\/?/, "").split("/");
  if (parts[0] === "stop" && stopCodes(state).includes(parts[1]))
    return { name: "stop", id: parts[1] };
  if (parts[0] === "bus" && busIds(state).includes(parts[1]))
    return { name: "bus", id: parts[1] };
  if (parts[0] === "cases") return { name: "cases" };
  if (parts[0] === "case" && parts[1]) return { name: "case", id: parts[1] };
  return { name: "overview" };
}

let lastKey = "";
function render(force = false) {
  ui.now = Date.now();
  const state = source.state;
  const current = route(state);
  // The clock is rounded to five seconds so a page that is otherwise idle redraws only that often.
  const key = JSON.stringify([
    current,
    state,
    { ...ui, now: Math.floor(ui.now / 5000) },
    source.revision,
    notice,
  ]);
  if (!force && key === lastKey) return;
  lastKey = key;

  // Only what changed is written, so the field being typed in keeps its focus and text, drop-downs
  // stay open and unchanged alert banners are not announced again.
  patchInner($("modeBar"), renderModeBar());
  renderNotice();
  patchInner($("crumbs"), breadcrumbs(current));
  patchInner(
    $("root"),
    current.name === "stop"
      ? stopPage(
          state,
          current.id,
          ui,
          source.actionsFor(undefined, current.id),
        )
      : current.name === "bus"
        ? busPage(state, current.id, ui, source.actionsFor(current.id))
        : current.name === "cases"
          ? casesPage(state)
          : current.name === "case"
            ? casePage(state, current.id, source.caseActionsFor(current.id))
            : overviewPage(state, ui),
  );
  if (mode === "mock") renderDrawer();
}

window.addEventListener("hashchange", () => {
  render(true);
  window.scrollTo(0, 0);
});

// ---- operator actions, with a confirmation for the ones that cannot be undone ------------------------

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

async function run(action, context) {
  const result = await source.perform(action, context);
  notice = result.ok ? "" : `${action}: ${result.message}`;
  render(true);
}
$("confirmYes").onclick = () => {
  const action = pending;
  closeAsk();
  if (action) action();
};
$("confirmNo").onclick = closeAsk;

$("root").addEventListener("click", (event) => {
  const chip = event.target.closest("[data-kind]");
  if (chip) {
    ui.kind = chip.dataset.kind;
    return render(true);
  }
  const caseButton = event.target.closest("[data-case-action]");
  if (caseButton && !caseButton.disabled) {
    const { caseAction, case: caseId } = caseButton.dataset;
    const words = {
      CONFIRM: "Confirm the intent",
      RETRY: "Retry the checks",
      ESCALATE: "Escalate",
      COMPLETE: "Mark the case complete",
      CANCEL: "Cancel the case",
    };
    const go = () => run("case", { caseId, action: caseAction });
    return ["ESCALATE", "COMPLETE", "CANCEL"].includes(caseAction)
      ? ask(`${words[caseAction]} for ${caseId.slice(-8).toUpperCase()}?`, go)
      : go();
  }
  const vehicleButton = event.target.closest("[data-autonomy]");
  if (vehicleButton && !vehicleButton.disabled) {
    const { autonomy, bus } = vehicleButton.dataset;
    // Resuming tells the vehicle the obstacle is cleared, so the operator is asked to confirm that.
    const question =
      autonomy === "RESUME"
        ? `Resume ${bus}? This tells the vehicle the obstacle is cleared and its position is accurate. Confirm only if you have checked.`
        : `Send "${autonomy.toLowerCase()}" to ${bus}?`;
    return ask(question, () => run("autonomy", { busId: bus, action: autonomy }));
  }
  const button = event.target.closest("[data-act]");
  if (!button || button.disabled) return;
  const { act, bus, stop, intent } = button.dataset;
  if (act === "deploy" || act === "proceed")
    run(act, { busId: bus, stopCode: stop });
  if (act === "halt") {
    // The button says what it will do; the confirmation and the request follow the same intent.
    const release = intent === "release";
    ask(haltConfirmText(release, bus), () => run("halt", { busId: bus, release }));
  }
  if (act === "cancel")
    ask(
      `Cancel the accepted request on ${bus}? The passenger will be told it cannot be fulfilled.`,
      () => run("cancel", { busId: bus }),
    );
});
$("root").addEventListener("change", (event) => {
  const field = event.target.dataset?.ui;
  if (field) {
    ui[field] = event.target.value;
    render(true);
  }
});
$("notice").addEventListener("submit", (event) => {
  if (event.target.id !== "tokenForm") return;
  event.preventDefault();
  const value = $("tokenInput").value.trim();
  if (!value) return;
  storeToken(value);
  source.setToken(value);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeAsk();
    setDrawer(false);
  }
});

// ---- mock-mode playground ---------------------------------------------------------------------------

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
function setDrawer(open) {
  $("drawer").classList.toggle("open", open);
  $("drawerBtn").setAttribute("aria-expanded", String(open));
}
if (mode === "mock") {
  $("drawerBtn").hidden = false;
  $("drawer").hidden = false;
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
}

setInterval(() => render(), 5000);
setInterval(() => {
  $("clock").textContent = new Date().toTimeString().slice(0, 8);
}, 1000);
source.onChange(() => render());
source.start?.();
render(true);
