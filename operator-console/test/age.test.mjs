// How long since a bus last reported, so a bus that has gone quiet is noticed.
import test from "node:test";
import assert from "node:assert/strict";
import { initialState, reduce } from "../src/state.js";
import { STALE_AFTER_SECONDS, reportAge } from "../src/viewmodel.js";
import { busPage, overviewPage } from "../src/views.js";

const B1 = "AV-095-01";
const at = (seconds) =>
  new Date(
    Date.parse("2026-09-30T00:00:00.000Z") + seconds * 1000,
  ).toISOString();
const NOW = Date.parse("2026-09-30T00:01:00.000Z");

const state = (statusAt, decisionAt) =>
  [
    {
      type: "BUS_STATUS",
      status: {
        busId: B1,
        busService: "95",
        movement: "DEPARTING",
        simulated: true,
        observedAt: at(statusAt),
      },
      timestamp: at(statusAt),
    },
    ...(decisionAt === undefined
      ? []
      : [
          {
            type: "RAMP_SAFETY",
            decision: {
              busId: B1,
              zoneState: "CLEAR",
              permission: "CONTINUE",
              reasons: [],
              tof: { state: "BEAM_CLEAR", simulated: true },
              camera: { imageOk: true },
              objectsInZone: [],
              simulated: true,
              observedAt: at(decisionAt),
            },
            timestamp: at(decisionAt),
          },
        ]),
  ].reduce(reduce, initialState());

const ui = { kind: "ALL", busId: "ALL", requestId: "ALL", now: NOW };

test("the age is measured from the newest report of any kind", () => {
  const age = reportAge(state(10, 55), B1, NOW);
  assert.equal(age.seconds, 5);
  assert.equal(age.text, "Last report 5 s ago");
  assert.equal(age.stale, false);
});

test("a bus that has gone quiet is marked in words after the threshold", () => {
  const age = reportAge(state(0, 0), B1, NOW);
  assert.equal(age.seconds, 60);
  assert.equal(age.stale, true);
  assert.match(age.text, /1 min/);
  assert.ok(STALE_AFTER_SECONDS > 0);
});

test("a bus that never reported says so, and larger gaps read in minutes and hours", () => {
  assert.equal(reportAge(initialState(), B1, NOW).text, "No report yet");
  assert.equal(
    reportAge(state(-3 * 3600, undefined), B1, NOW).text.includes("h"),
    true,
  );
});

test("a clock that is behind the bus never gives a negative age", () => {
  assert.equal(reportAge(state(120, undefined), B1, NOW).seconds, 0);
});

test("the bus page and the overview show the age, and a quiet bus gets a warning tag", () => {
  const fresh = state(50, 55);
  assert.match(busPage(fresh, B1, ui, {}), /Last report 5 s ago/);
  assert.doesNotMatch(busPage(fresh, B1, ui, {}), /No recent report/);
  const quiet = state(0, 0);
  assert.match(busPage(quiet, B1, ui, {}), /No recent report/);
  assert.match(overviewPage(quiet, ui), /No recent report/);
});

test("without a clock the age is simply not shown", () => {
  const { now, ...noClock } = ui;
  assert.doesNotMatch(busPage(state(0, 0), B1, noClock, {}), /Last report/);
});
