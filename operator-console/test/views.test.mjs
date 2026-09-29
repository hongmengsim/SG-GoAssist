import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MARKS, esc, tag } from "../src/html.js";
import { initialState, reduce, setAudit } from "../src/state.js";
import {
  auditSection,
  breadcrumbs,
  busPage,
  overviewPage,
  stopPage,
} from "../src/views.js";

const T = "2026-09-30T00:00:00.000Z";
const STOP = "18331";
const B1 = "AV-095-01";
const B2 = "AV-095-02";

const messages = [
  {
    type: "BUS_STATUS",
    status: {
      busId: B1,
      busService: "95",
      stopCode: STOP,
      movement: "POSITIONED_AT_STOP",
      simulated: false,
      observedAt: T,
    },
    timestamp: T,
  },
  {
    type: "BUS_STATUS",
    status: {
      busId: B2,
      busService: "95",
      stopCode: STOP,
      movement: "WAITING_FOR_BAY",
      simulated: true,
      observedAt: T,
    },
    timestamp: T,
  },
  {
    type: "BAY_STATUS",
    bay: {
      stopCode: STOP,
      bayId: "BAY-1",
      occupantBusId: B1,
      waitingBusIds: [B2],
      grantedBusId: null,
      updatedAt: T,
    },
    timestamp: T,
  },
  {
    type: "RAMP_SIMULATION",
    ramp: {
      busId: B1,
      state: "HALTED",
      simulated: true,
      haltReasons: ["OBJECT_IN_ZONE"],
      observedAt: T,
    },
    timestamp: T,
  },
  {
    type: "RAMP_SAFETY",
    decision: {
      busId: B1,
      zoneState: "OCCUPIED",
      permission: "HALT",
      reasons: ["OBJECT_IN_ZONE"],
      tof: { state: "BLOCKED", distanceMm: 340, simulated: false },
      camera: { imageOk: true },
      objectsInZone: [
        { className: "person", safety: "UNSAFE", confidence: 0.93 },
      ],
      simulated: false,
      observedAt: T,
    },
    timestamp: T,
  },
  {
    type: "HELP_REQUIRED",
    help: {
      busId: B1,
      reason: "DEPLOYMENT_TIMEOUT",
      state: "HALTED",
      observedAt: T,
    },
    timestamp: T,
  },
  {
    type: "REQUEST_STATUS",
    requestId: "REQ-1",
    status: "ACKNOWLEDGED",
    busId: B1,
    busService: "95",
    assistanceTypes: ["WHEELCHAIR_RAMP"],
    timestamp: T,
  },
];
const state = setAudit(messages.reduce(reduce, initialState()), [
  {
    eventId: "1",
    eventType: "RAMP_SAFETY_CHANGED",
    actor: "VEHICLE",
    busId: B1,
    timestamp: T,
    detail: { permission: "HALT", reasons: ["OBJECT_IN_ZONE"] },
  },
  {
    eventId: "2",
    eventType: "BAY_ENTRY_GRANTED",
    actor: "OPERATOR",
    busId: B2,
    timestamp: "2026-09-30T00:00:01.000Z",
  },
]);
const ui = { kind: "ALL", busId: "ALL", requestId: "ALL" };
const enabled = {
  proceed: { enabled: true },
  deploy: { enabled: true },
  halt: { enabled: true },
  cancel: { enabled: true },
};

const pages = () => ({
  overview: overviewPage(state, ui),
  stop: stopPage(state, STOP, ui, enabled),
  bus1: busPage(state, B1, ui, enabled),
  bus2: busPage(state, B2, ui, enabled),
  audit: auditSection(state, ui, "Audit log"),
});

test("everything user-visible is escaped", () => {
  const hostile = reduce(state, {
    type: "BUS_STATUS",
    status: {
      busId: "<img src=x onerror=alert(1)>",
      busService: "95",
      movement: "DEPARTING",
      simulated: true,
      observedAt: T,
    },
    timestamp: T,
  });
  const html = overviewPage(hostile, ui);
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;img"));
  assert.equal(esc(`"'<>&`), "&quot;&#39;&lt;&gt;&amp;");
});

test("every status tag carries a shape mark and words, never colour alone", () => {
  for (const [name, html] of Object.entries(pages())) {
    const tags = [
      ...html.matchAll(
        /<span class="tag (\w+)">(.*?)<\/span><\/span>|<span class="tag (\w+)">(.*?)<\/span>/g,
      ),
    ];
    assert.ok(tags.length > 0 || name === "audit", `${name} has tags`);
    for (const match of html.matchAll(
      /<span class="tag (\w+)"><span aria-hidden="true">(.)<\/span> ([^<]+)<\/span>/g,
    )) {
      const [, kind, glyph, text] = match;
      assert.equal(MARKS[kind].glyph, glyph, `${name}: ${kind} glyph`);
      assert.ok(text.trim().length > 0, `${name}: ${kind} has words`);
    }
    assert.ok(
      !/class="tag \w+">(?!<span aria-hidden)/.test(html),
      `${name}: a tag without a shape mark`,
    );
  }
});

test("each tag kind has its own shape and its own border style in the stylesheet", () => {
  const glyphs = new Set(Object.values(MARKS).map((mark) => mark.glyph));
  assert.equal(
    glyphs.size,
    Object.keys(MARKS).length,
    "no two kinds share a glyph",
  );
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  for (const [kind, mark] of Object.entries(MARKS)) {
    const rule = new RegExp(
      `\\.tag\\.${kind}\\s*\\{[^}]*border-style:\\s*${mark.border}`,
    );
    assert.match(css, rule, `.tag.${kind} should use a ${mark.border} border`);
  }
  assert.throws(() => tag("nonsense", "x"));
});

test("no colour is applied inline: colour lives in the stylesheet next to a word or shape", () => {
  for (const [name, html] of Object.entries(pages())) {
    assert.ok(
      !/style="[^"]*(color|background|fill)/i.test(html),
      `${name} has inline colour`,
    );
  }
});

test("the overview shows the summary, stops, buses, help alert and audit log", () => {
  const html = overviewPage(state, ui);
  assert.match(html, /HELP REQUIRED/);
  assert.match(html, /Deployment timed out/);
  assert.match(html, new RegExp(`href="#/stop/${STOP}"`));
  assert.match(html, new RegExp(`href="#/bus/${B1}"`));
  assert.match(html, /Open requests/);
  assert.match(html, /Audit log/);
});

test("simulated buses and the simulated ramp are labelled in words", () => {
  const bus2 = busPage(state, B2, ui, enabled);
  assert.match(bus2, /Simulated/);
  assert.match(busPage(state, B1, ui, enabled), /Ramp/);
  assert.match(busPage(state, B1, ui, enabled), /no physical ramp|Simulated/);
});

test("the bus page shows the four categories, the zone from the Pi's decision, and operator actions", () => {
  const html = busPage(state, B1, ui, enabled);
  for (const title of [
    "Bus movement",
    "Assistance request",
    "Ramp",
    "Sensors and faults",
  ])
    assert.match(html, new RegExp(title));
  assert.match(html, /Object in the ramp zone/);
  assert.match(html, /not a camera image/i);
  assert.match(html, /person/i);
  assert.match(html, /data-act="cancel"/);
  assert.match(html, /Live view: not connected|placeholder/i);
});

test("actions the source cannot perform are disabled with the reason shown", () => {
  const disabled = {
    proceed: { enabled: false },
    deploy: { enabled: false, reason: "Not available in live mode yet" },
    halt: { enabled: false },
    cancel: { enabled: false },
  };
  const html = busPage(state, B1, ui, disabled);
  assert.match(html, /data-act="deploy"[^>]*disabled/);
  assert.match(html, /Not available in live mode yet/);
});

test("the stop page shows the bay in words, the buses, and the proceed control", () => {
  const html = stopPage(state, STOP, ui, {
    ...enabled,
    proceed: { enabled: false },
  });
  assert.match(html, /Occupied|occupied/);
  assert.match(html, new RegExp(B2));
  assert.match(html, /Proceed next waiting bus to bay/);
  assert.match(html, /data-act="proceed"[^>]*disabled/);
  assert.match(html, /never deploys the next one/i);
});

test("the audit log can be filtered and says it holds events, not camera footage", () => {
  const all = auditSection(state, ui, "Audit log");
  assert.match(all, /not camera footage/i);
  assert.match(all, /Pi decision: Halt/);
  const operatorOnly = auditSection(
    state,
    { ...ui, kind: "OPERATOR" },
    "Audit log",
  );
  assert.match(operatorOnly, /Bay entry granted/);
  assert.ok(!/Pi decision: Halt/.test(operatorOnly));
  assert.match(all, /aria-pressed="true"/);
  const none = auditSection(state, { ...ui, busId: "AV-000-00" }, "Audit log");
  assert.match(none, /No log entries match/);
});

test("breadcrumbs mark the current page and link back", () => {
  assert.match(
    breadcrumbs({ name: "overview" }),
    /aria-current="page">Overview/,
  );
  assert.match(
    breadcrumbs({ name: "bus", id: B1 }),
    new RegExp(`href="#/">Overview.*aria-current="page">${B1}`),
  );
});

// ---- O4: the Pi's decision with reasons, and the camera placeholder --------------------------

import { HALT_REASON, HELP_REASON } from "../src/labels.js";

const schema = (name) =>
  JSON.parse(
    readFileSync(
      new URL(`../../contracts/schema/${name}.schema.json`, import.meta.url),
      "utf8",
    ),
  );

test("every halt reason and help reason in the contract has words in the console", () => {
  const halt = schema("RampSafetyReport").definitions.HaltReason.enum;
  for (const reason of halt)
    assert.ok(HALT_REASON[reason], `no words for halt reason ${reason}`);
  const help = schema("HelpRequiredReport").definitions.HelpReason.enum;
  for (const reason of help)
    assert.ok(HELP_REASON[reason], `no words for help reason ${reason}`);
});

test("the bus page lists each halt reason as its own item, in words, whatever the cause", () => {
  const causes = schema("RampSafetyReport").definitions.HaltReason.enum;
  for (const reason of causes) {
    const halted = reduce(state, {
      type: "RAMP_SAFETY",
      decision: {
        busId: B1,
        zoneState: "UNCERTAIN",
        permission: "HALT",
        reasons: [reason],
        tof: { state: "UNKNOWN", simulated: false },
        camera: { imageOk: false, degradedReason: "covered" },
        objectsInZone: [],
        simulated: false,
        observedAt: "2026-09-30T00:00:09.000Z",
      },
      timestamp: T,
    });
    const html = busPage(halted, B1, ui, enabled);
    assert.match(
      html,
      new RegExp(
        `<li[^>]*>[^<]*${HALT_REASON[reason].replace(/[()]/g, "\$&")}`,
      ),
      reason,
    );
  }
});

test("the decision panel says when the bus decided and that the bus, not the console, decides", () => {
  const html = busPage(state, B1, ui, enabled);
  assert.match(html, /Pi decision/);
  assert.match(html, /00:00:00/);
  assert.match(html, /local gate|the bus decides/i);
});

test("the camera view is a clearly labelled placeholder, separate from the schematic", () => {
  const html = busPage(state, B1, ui, enabled);
  assert.match(html, /class="live-placeholder"/);
  assert.match(html, /LIVE CAMERA VIEW/);
  assert.match(html, /NOT CONNECTED/);
  assert.match(html, /not recorded/i);
});
