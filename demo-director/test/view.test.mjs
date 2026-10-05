import test from "node:test";
import assert from "node:assert/strict";
import {
  busPosition,
  renderActions,
  renderBus,
  renderSteps,
  renderStop,
  renderTimeline,
} from "../ui/view.js";
import { describeSteps } from "../src/sequence.js";

const agent = (overrides = {}) => ({
  simulated: true,
  movement: { code: "WAITING_FOR_BAY", text: "Waiting for bay" },
  ramp: { state: "STOWED" },
  decision: {
    permission: "HALT",
    reasons: [{ code: "WAITING_FOR_BAY", text: "Waiting for the bay" }],
  },
  beam: { state: "BEAM_CLEAR", simulated: true },
  camera: { imageOk: true },
  link: { ok: true },
  ...overrides,
});

const real = {
  busId: "AV-1",
  label: "BUS 1",
  kind: "REAL",
  controlLevel: "movement",
  agentOk: true,
  agent: agent({
    simulated: false,
    beam: { state: "BLOCKED", simulated: false, distanceMm: 212 },
    movement: { code: "POSITIONED_AT_STOP", text: "Positioned at stop" },
  }),
  operatorHalt: false,
};
const simulated = {
  busId: "AV-2",
  label: "BUS 2",
  kind: "SIMULATED",
  controlLevel: "scene",
  agentOk: true,
  agent: agent(),
  operatorHalt: true,
};
const state = {
  order: ["AV-1", "AV-2"],
  stopCode: "18331",
  buses: { "AV-1": real, "AV-2": simulated },
  backend: {
    ok: true,
    bay: { occupantBusId: "AV-1", grantedBusId: null, waitingBusIds: ["AV-2"] },
    requests: [],
  },
};

test("a bus is drawn where it says it is: approaching, waiting, in the bay, leaving", () => {
  assert.equal(busPosition("TRAVELLING_TO_STOP")[0], "pos-approach");
  assert.equal(busPosition("WAITING_FOR_BAY")[0], "pos-queue");
  assert.equal(busPosition("POSITIONED_AT_STOP")[0], "pos-bay");
  assert.equal(busPosition("DEPARTING")[0], "pos-leave");
  assert.equal(busPosition("nonsense")[1], "POSITION UNKNOWN");
});

test("the stop display shows each bus in words with its REAL or SIMULATED tag and its place", () => {
  const html = renderStop(state);
  assert.match(html, /pos-bay[^>]*token-real|token-real[^>]*pos-bay/);
  assert.match(html, /■ REAL/);
  assert.match(html, /◇ SIMULATED/);
  assert.match(html, /IN THE BAY/);
  assert.match(html, /WAITING FOR THE BAY/);
  assert.match(html, /occupant AV-1/);
  assert.doesNotMatch(html, /\sstyle=/);
});

test("a simulated bus offers scene injections, each under a SIMULATED heading", () => {
  const html = renderBus(simulated, "18331");
  assert.match(html, /Inject a state/);
  for (const label of [
    "Person in the ramp zone",
    "Leaf in the zone",
    "Beam blocked",
    "Sensor drops out",
    "Camera covered",
    "Cut the backend link",
  ])
    assert.match(html, new RegExp(label), label);
  assert.match(html, /data-action="move"/);
});

test("a real bus offers movement and physical prompts, and no scene button at all", () => {
  const html = renderBus(real, "18331");
  assert.match(html, /Do it physically/);
  assert.match(html, /Put a hand or an object in the beam/);
  assert.match(html, /■ REAL/);
  assert.doesNotMatch(html, /data-action="scene"/);
  assert.match(html, /BLOCKED · 212 mm/);
});

test("every state is a word with a mark, so colour is never the only signal", () => {
  const html = renderBus(simulated, "18331") + renderBus(real, "18331");
  for (const word of ["● working", "■ ON", "○ off", "■ HALT", "● image ok"])
    assert.match(html, new RegExp(word));
});

test("the operator actions say which are real routes and which are a simulated passenger", () => {
  const html = renderActions(state);
  assert.match(html, /◇ SIMULATED[^]*Create a request/);
  assert.match(html, /■ REAL[^]*real operator routes/);
  assert.match(html, /never from here/);
});

test("the sequence shows done, next and not yet in words, and an action button only where there is one", () => {
  const steps = describeSteps(state, { stopCode: "18331" }, new Set([1, 2]));
  const html = renderSteps(steps);
  assert.match(html, /● DONE/);
  assert.match(html, /◆ NEXT/);
  assert.match(html, /○ not yet/);
  assert.equal((html.match(/data-action="step"/g) ?? []).length, 5);
});

test("the timeline marks each source with a shape as well as its name", () => {
  const html = renderTimeline([
    {
      at: "2026-10-06T00:00:01.000Z",
      source: "BUS 2 · SIMULATED",
      text: "movement",
    },
    { at: "2026-10-06T00:00:02.000Z", source: "BUS 1 · REAL", text: "ramp" },
    {
      at: "2026-10-06T00:00:03.000Z",
      source: "DEMO ACTION · SIMULATED",
      text: "pressed",
    },
    { at: "2026-10-06T00:00:04.000Z", source: "BACKEND", text: "bay" },
  ]);
  assert.match(html, /◇ BUS 2 · SIMULATED/);
  assert.match(html, /■ BUS 1 · REAL/);
  assert.match(html, /○ BACKEND/);
  assert.ok(html.indexOf("BACKEND") < html.indexOf("BUS 2"), "newest first");
  assert.match(renderTimeline([]), /Nothing has happened yet/);
});

test("text from the system is escaped", () => {
  const html = renderTimeline([
    {
      at: "2026-10-06T00:00:01.000Z",
      source: "BACKEND",
      text: "<img src=x onerror=alert(1)>",
    },
  ]);
  assert.doesNotMatch(html, /<img/);
});

test("the sequence panel offers to start again", () => {
  const html = renderSteps(
    describeSteps(state, { stopCode: "18331" }, new Set()),
  );
  assert.match(html, /data-action="reset-sequence"/);
  assert.match(html, /Start the sequence again/);
});
