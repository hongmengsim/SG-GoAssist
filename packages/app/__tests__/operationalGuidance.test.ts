import type { SafetyTelemetry } from "@buspass/shared";
import {
  deriveOperationalGuidance,
  isOperationalTelemetryFresh,
} from "../src/operationalGuidance/operationalGuidance";

const now = Date.parse("2026-09-01T04:00:05.000Z");

function telemetry(overrides: Partial<SafetyTelemetry> = {}): SafetyTelemetry {
  return {
    busId: "AV-095-01",
    stopCode: "18301",
    vehicleStopped: true,
    parkingBrakeActive: true,
    doorOpen: true,
    deploymentPathClear: true,
    rampPosition: "DEPLOYED",
    observedAt: "2026-09-01T04:00:03.000Z",
    ...overrides,
  };
}

const baseContext = {
  serviceNumber: "95",
  mode: "BOARDING" as const,
  expectedStopCode: "18301",
  presenceState: "PARKED" as const,
};

describe("operational guidance derivation", () => {
  it("distinguishes approaching and parked buses before a request", () => {
    expect(
      deriveOperationalGuidance(
        { ...baseContext, presenceState: "APPROACHING" },
        now,
      ).phase,
    ).toBe("APPROACHING");
    expect(deriveOperationalGuidance(baseContext, now).phase).toBe("PARKED");
  });

  it("requires every live interlock before showing ramp ready", () => {
    const ready = deriveOperationalGuidance(
      {
        ...baseContext,
        requestActive: true,
        caseState: "READY",
        telemetry: telemetry(),
      },
      now,
    );
    expect(ready.phase).toBe("READY");
    expect(ready.canTraverseRamp).toBe(true);
    expect(ready.canCompletePhase).toBe(false);
    expect(ready.checkpoints.every((item) => item.status === "PASSED")).toBe(
      true,
    );

    for (const unsafe of [
      { vehicleStopped: false },
      { parkingBrakeActive: false },
      { doorOpen: false },
      { deploymentPathClear: false },
      { rampPosition: "STOWED" as const },
    ]) {
      const result = deriveOperationalGuidance(
        {
          ...baseContext,
          requestActive: true,
          caseState: "READY",
          telemetry: telemetry(unsafe),
        },
        now,
      );
      expect(result.phase).not.toBe("READY");
      expect(result.canTraverseRamp).toBe(false);
    }
  });

  it("fails closed for stale telemetry and stop mismatches", () => {
    const staleTelemetry = telemetry({
      observedAt: "2026-09-01T03:59:55.000Z",
    });
    expect(isOperationalTelemetryFresh(staleTelemetry, now)).toBe(false);
    expect(
      deriveOperationalGuidance(
        { ...baseContext, requestActive: true, telemetry: staleTelemetry },
        now,
      ).phase,
    ).toBe("STALE");

    const mismatch = deriveOperationalGuidance(
      {
        ...baseContext,
        requestActive: true,
        telemetry: telemetry({ stopCode: "16181" }),
      },
      now,
    );
    expect(mismatch.phase).toBe("BLOCKED");
    expect(
      mismatch.checkpoints.find((item) => item.id === "STOP")?.status,
    ).toBe("BLOCKED");
  });

  it("shows harmless light debris without reporting a blocked path", () => {
    const result = deriveOperationalGuidance(
      {
        ...baseContext,
        requestActive: true,
        caseState: "READY",
        telemetry: telemetry({
          rampObstacle: {
            laserHealthy: true,
            objectDetected: true,
            nearestDistanceMm: 500,
            occupiedZoneCount: 1,
            criticalZoneOccupied: false,
            observedAt: "2026-09-01T04:00:03.000Z",
            classification: "LIGHT_DEBRIS",
            classificationConfidence: 0.98,
            classificationObservedAt: "2026-09-01T04:00:03.000Z",
            blocksDeployment: false,
            reason: "Small light debris identified outside critical ramp zones",
          },
        }),
      },
      now,
    );
    expect(result.phase).toBe("READY");
    expect(
      result.checkpoints.find((item) => item.id === "PATH")?.explanation,
    ).toContain("Small light debris");
  });

  it("blocks for an unsafe obstacle and surfaces a ramp fault", () => {
    const blocked = deriveOperationalGuidance(
      {
        ...baseContext,
        requestActive: true,
        caseState: "BLOCKED",
        escalationReason: "Luggage blocks ramp deployment",
        telemetry: telemetry({
          deploymentPathClear: false,
          rampPosition: "STOWED",
        }),
      },
      now,
    );
    expect(blocked.phase).toBe("BLOCKED");
    expect(blocked.warning).toBe("Luggage blocks ramp deployment");

    const fault = deriveOperationalGuidance(
      {
        ...baseContext,
        requestActive: true,
        telemetry: telemetry({ rampPosition: "FAULT" }),
      },
      now,
    );
    expect(fault.phase).toBe("FAULT");
  });

  it("uses alighting-specific instructions when the ramp is ready", () => {
    const result = deriveOperationalGuidance(
      {
        ...baseContext,
        mode: "ALIGHTING",
        requestActive: true,
        caseState: "READY",
        telemetry: telemetry(),
      },
      now,
    );
    expect(result.currentAction).toContain("Exit through the central door");
  });

  it("keeps an actuating case in deployment until the controller marks it ready", () => {
    const result = deriveOperationalGuidance(
      {
        ...baseContext,
        requestActive: true,
        caseState: "ACTUATING",
        telemetry: telemetry(),
      },
      now,
    );
    expect(result.phase).toBe("DEPLOYING");
    expect(result.canTraverseRamp).toBe(false);
  });

  it("lets a completed alighting case finish after the ramp is safely stowed", () => {
    const result = deriveOperationalGuidance(
      {
        ...baseContext,
        mode: "ALIGHTING",
        requestActive: false,
        caseState: "COMPLETED",
        telemetry: telemetry({
          rampPosition: "STOWED",
          observedAt: "2026-09-01T03:59:40.000Z",
        }),
      },
      now,
    );

    expect(result.phase).toBe("COMPLETED");
    expect(result.canTraverseRamp).toBe(false);
    expect(result.canCompletePhase).toBe(true);
    expect(result.headline).toBe("Journey can finish");
  });
});
