import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { OperationalGuidancePanel } from "../src/components/OperationalGuidancePanel";
import { deriveOperationalGuidance } from "../src/operationalGuidance/operationalGuidance";

const observedAt = "2026-09-01T04:00:03.000Z";
const now = Date.parse("2026-09-01T04:00:05.000Z");

function readyGuidance() {
  return deriveOperationalGuidance(
    {
      serviceNumber: "95",
      mode: "BOARDING",
      expectedStopCode: "18301",
      presenceState: "PARKED",
      requestActive: true,
      caseState: "READY",
      telemetry: {
        busId: "AV-095-01",
        stopCode: "18301",
        vehicleStopped: true,
        parkingBrakeActive: true,
        doorOpen: true,
        deploymentPathClear: true,
        rampPosition: "DEPLOYED",
        observedAt,
      },
    },
    now,
  );
}

describe("OperationalGuidancePanel", () => {
  it("renders the verified central-door ramp and expandable safety checks", () => {
    const screen = render(
      <OperationalGuidancePanel
        guidance={readyGuidance()}
        lightMode
        highContrast={false}
        testID="guidance"
      />,
    );

    expect(screen.getByTestId("central-door-ramp")).toBeTruthy();
    fireEvent.press(
      screen.getByLabelText("Why am I waiting? Show safety checks"),
    );
    expect(screen.getByTestId("operational-safety-checkpoints")).toBeTruthy();
    fireEvent.press(screen.getByLabelText(/Ramp area\. passed\./i));
    expect(
      screen.getByText(
        "The laser safety check confirms that the ramp area is clear.",
      ),
    ).toBeTruthy();
  });

  it("keeps simplified mode to the visual and current action", () => {
    const screen = render(
      <OperationalGuidancePanel
        guidance={readyGuidance()}
        lightMode
        highContrast={false}
        simplified
      />,
    );
    expect(screen.getByText("Ramp ready")).toBeTruthy();
    expect(
      screen.queryByLabelText("Why am I waiting? Show safety checks"),
    ).toBeNull();
  });

  it("keeps the ramp stowed during ordinary boarding guidance", () => {
    const guidance = deriveOperationalGuidance(
      {
        serviceNumber: "95",
        mode: "BOARDING",
        presenceState: "PARKED",
        journeyPhase: "BOARDING",
      },
      now,
    );
    const screen = render(
      <OperationalGuidancePanel
        guidance={guidance}
        lightMode
        highContrast={false}
      />,
    );
    expect(screen.queryByTestId("central-door-ramp")).toBeNull();
    expect(screen.getByLabelText(/Central door ramp stowed/i)).toBeTruthy();
  });
});
