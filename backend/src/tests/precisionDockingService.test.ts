import test from "node:test";
import assert from "node:assert/strict";
import { PrecisionDockingObservation } from "@buspass/shared";
import { assessPrecisionDocking } from "../services/precisionDockingService";

const now = Date.parse("2026-08-31T12:00:00.000Z");

test("precision docking requires marker, ToF, heading, offset, and range agreement", () => {
  const aligned = assessPrecisionDocking(observation(), now);
  assert.equal(aligned.aligned, true);

  assert.match(
    assessPrecisionDocking(observation({ markerDetected: false }), now).reason,
    /marker is not visible/i,
  );
  assert.match(
    assessPrecisionDocking(observation({ tofHealthy: false }), now).reason,
    /distance sensor is unavailable/i,
  );
  assert.match(
    assessPrecisionDocking(observation({ lateralOffsetMm: 190 }), now).reason,
    /laterally misaligned/i,
  );
  assert.match(
    assessPrecisionDocking(observation({ headingErrorDegrees: 9 }), now).reason,
    /heading/i,
  );
  assert.match(
    assessPrecisionDocking(observation({ markerRangeMm: 900 }), now).reason,
    /do not agree/i,
  );
});

test("stale docking observations fail closed", () => {
  const stale = assessPrecisionDocking(
    observation({ observedAt: "2026-08-31T11:59:55.000Z" }),
    now,
  );
  assert.equal(stale.fresh, false);
  assert.equal(stale.aligned, false);
  assert.match(stale.reason, /stale/i);
});

function observation(
  overrides: Partial<PrecisionDockingObservation> = {},
): PrecisionDockingObservation {
  return {
    busId: "AV-DEMO",
    stopCode: "18331",
    markerId: 18331,
    markerDetected: true,
    markerRangeMm: 610,
    lateralOffsetMm: 20,
    headingErrorDegrees: 1,
    tofDistanceMm: 600,
    tofHealthy: true,
    confidence: 0.97,
    observedAt: "2026-08-31T12:00:00.000Z",
    ...overrides,
  };
}
