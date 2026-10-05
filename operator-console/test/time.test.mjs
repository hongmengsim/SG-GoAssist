import test from "node:test";
import assert from "node:assert/strict";
import { time, useTimeZone } from "../src/ui.js";

test("times are shown in the viewer's own zone, as the header clock is, with a way to pin the zone", () => {
  useTimeZone("Asia/Singapore");
  assert.equal(time("2026-10-05T00:30:15.000Z"), "08:30:15");
  useTimeZone("UTC");
  assert.equal(time("2026-10-05T00:30:15.000Z"), "00:30:15");
  useTimeZone(undefined); // back to the machine's own zone
  assert.match(time("2026-10-05T00:30:15.000Z"), /^\d\d:\d\d:\d\d$/);
});

test("a time that cannot be read is shown as dashes", () => {
  assert.equal(time("not a time"), "--:--:--");
});
