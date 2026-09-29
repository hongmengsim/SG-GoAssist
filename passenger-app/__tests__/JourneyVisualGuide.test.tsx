import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { JourneyVisualGuide } from "../src/components/JourneyVisualGuide";
import { deriveJourneyVisualInstruction } from "../src/guidance/visualJourneyGuidance";

const walkingInstruction = deriveJourneyVisualInstruction({
  journeyPhase: "WALKING_TO_STOP",
  selectedStopName: "Science Drive",
  stopCode: "18331",
  cameraGuideAvailable: true,
  walkingStep: {
    instruction: "Turn right onto Science Drive",
    distanceMeters: 45,
    maneuverDirection: "RIGHT",
    roadName: "Science Drive",
  },
  nextWalkingStep: {
    instruction: "The bus stop is ahead",
    distanceMeters: 80,
    maneuverDirection: "ARRIVE",
  },
});

function renderGuide(
  options: {
    simplified?: boolean;
    onUseCamera?: () => void;
  } = {},
) {
  return render(
    <JourneyVisualGuide
      instruction={walkingInstruction}
      illustration={{ uri: "walking.png" }}
      lightMode
      highContrast={false}
      largeText
      simplified={options.simplified ?? false}
      reducedMotion
      onUseCamera={options.onUseCamera}
    />,
  );
}

it("shows one stable phase guide and expands its numbered instructions", () => {
  renderGuide();

  expect(screen.getByTestId("journey-visual-guide")).toBeTruthy();
  expect(screen.getByText("Turn right onto Science Drive")).toBeTruthy();
  fireEvent.press(screen.getByText("Show steps"));
  expect(screen.getByText("VISUAL GUIDE")).toBeTruthy();
  expect(screen.getByText("The bus stop is ahead")).toBeTruthy();
  expect(screen.getByText(/Stop and use the diagram/)).toBeTruthy();
});

it("opens the camera guide only after its explicit action", () => {
  const onUseCamera = jest.fn();
  renderGuide({ onUseCamera });

  expect(onUseCamera).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText("Use camera direction guide"));
  expect(onUseCamera).toHaveBeenCalledTimes(1);
});

it("keeps simplified mode focused on the current visual and action", () => {
  renderGuide({ simplified: true, onUseCamera: jest.fn() });

  expect(screen.queryByText("Show steps")).toBeNull();
  expect(screen.getByText("Camera guide")).toBeTruthy();
  expect(screen.getByText("Turn right onto Science Drive")).toBeTruthy();
});
