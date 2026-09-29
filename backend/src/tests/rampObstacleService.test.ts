import test from "node:test";
import assert from "node:assert/strict";
import { fuseRampObstacleAssessment } from "../services/rampObstacleService";

const now = Date.parse("2026-08-31T12:00:00.000Z");

test("clear fresh laser ranging permits ramp deployment", () => {
  const result = fuseRampObstacleAssessment(ranging(), undefined, now);
  assert.equal(result.blocksDeployment, false);
  assert.equal(result.classification, "NONE");
});

test("high-confidence leaf or tissue may clear only a small non-critical object", () => {
  const result = fuseRampObstacleAssessment(
    ranging({
      objectDetected: true,
      occupiedZoneCount: 2,
      nearestDistanceMm: 500,
    }),
    {
      busId: "AV-DEMO",
      classification: "LIGHT_DEBRIS",
      confidence: 0.96,
      observedAt: "2026-08-31T11:59:59.500Z",
    },
    now,
  );
  assert.equal(result.blocksDeployment, false);
  assert.match(result.reason, /light debris/i);
});

test("critical zones, weak classifications, and stale laser data remain blocked", () => {
  const classification = {
    busId: "AV-DEMO",
    classification: "LIGHT_DEBRIS" as const,
    confidence: 0.96,
    observedAt: "2026-08-31T11:59:59.500Z",
  };
  assert.equal(
    fuseRampObstacleAssessment(
      ranging({
        objectDetected: true,
        occupiedZoneCount: 1,
        criticalZoneOccupied: true,
      }),
      classification,
      now,
    ).blocksDeployment,
    true,
  );
  assert.equal(
    fuseRampObstacleAssessment(
      ranging({ objectDetected: true, occupiedZoneCount: 1 }),
      { ...classification, confidence: 0.7 },
      now,
    ).blocksDeployment,
    true,
  );
  assert.equal(
    fuseRampObstacleAssessment(
      ranging({ observedAt: "2026-08-31T11:59:55.000Z" }),
      undefined,
      now,
    ).blocksDeployment,
    true,
  );
});

function ranging(overrides: Partial<ReturnType<typeof rangingBase>> = {}) {
  return { ...rangingBase(), ...overrides };
}

function rangingBase() {
  return {
    laserHealthy: true,
    objectDetected: false,
    nearestDistanceMm: 0,
    occupiedZoneCount: 0,
    criticalZoneOccupied: false,
    observedAt: "2026-08-31T11:59:59.500Z",
  };
}
