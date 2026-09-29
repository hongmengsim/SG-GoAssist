import React from "react";
import { StyleSheet } from "react-native";
import { render } from "@testing-library/react-native";
import { resolvePresentationSizes } from "../src/accessibility/presentationSizes";
import { AccessibilityRuntimeContext } from "../src/accessibility/AccessibilityRuntime";
import {
  PassengerPressable,
  PassengerText,
} from "../src/accessibility/PassengerControls";
import { CircleHelp } from "../src/components/AppIcons";
import { BusIdentificationGraphic } from "../src/components/BusIdentificationGraphic";

describe("consistent passenger sizing", () => {
  it("makes readable sizes the default without changing saved preferences", () => {
    expect(resolvePresentationSizes()).toMatchObject({
      statusIcon: 24,
      actionIcon: 28,
      featureIcon: 32,
      featureContainer: 56,
      controlHeight: 56,
      primaryHeight: 64,
      buttonText: 18,
      stopMarker: 56,
      recommendedMarker: 64,
      selectedMarker: 72,
    });
  });
  it.each([{ largerControls: true }, { textSize: "LARGE" as const }])(
    "enlarges from either preference: %j",
    (preferences) => {
      expect(resolvePresentationSizes(preferences)).toMatchObject({
        statusIcon: 28,
        actionIcon: 32,
        featureIcon: 36,
        featureContainer: 64,
        controlHeight: 68,
        primaryHeight: 72,
        stopMarker: 64,
        recommendedMarker: 72,
        selectedMarker: 80,
      });
    },
  );
  it("applies enlargement once and adds four icon pixels for extra-large text", () => {
    expect(
      resolvePresentationSizes({ textSize: "LARGE", largerControls: true }),
    ).toEqual(resolvePresentationSizes({ textSize: "LARGE" }));
    expect(
      resolvePresentationSizes({
        textSize: "EXTRA_LARGE",
        largerControls: true,
      }),
    ).toMatchObject({
      statusIcon: 32,
      actionIcon: 36,
      featureIcon: 40,
      buttonText: 24,
      controlHeight: 68,
    });
  });
  it.each(["STANDARD", "LARGE", "EXTRA_LARGE"] as const)(
    "shares %s sizing with controls and icons",
    (textSize) => {
      const sizes = resolvePresentationSizes({ textSize });
      const view = render(
        <AccessibilityRuntimeContext.Provider
          value={{
            textSize,
            largerControls: false,
            reducedMotion: true,
            preserveViewport: (_anchor, update) => update(),
          }}
        >
          <PassengerPressable
            accessibilityRole="button"
            accessibilityLabel="Help"
            style={{ height: 32, width: 32 }}
          >
            <CircleHelp testID="help-icon" size={16} />
            <PassengerText testID="label" style={{ fontSize: 12 }}>
              Help
            </PassengerText>
          </PassengerPressable>
        </AccessibilityRuntimeContext.Provider>,
      );
      expect(
        StyleSheet.flatten(view.getByLabelText("Help").props.style),
      ).toMatchObject({
        minHeight: sizes.controlHeight,
        minWidth: sizes.controlHeight,
      });
      expect(
        StyleSheet.flatten(view.getByTestId("label").props.style)?.fontSize,
      ).toBe(sizes.buttonText);
      const icon = view.getByTestId("help-icon", {
        includeHiddenElements: true,
      });
      expect(Number(icon.props.width ?? icon.props.size)).toBe(
        sizes.actionIcon,
      );
    },
  );
  it("keeps the replacement bus graphic decorative and responsive", () => {
    const view = render(<BusIdentificationGraphic lightMode highContrast />);
    const graphic = view.getByTestId("bus-identification-graphic", {
      includeHiddenElements: true,
    });
    expect(graphic.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(StyleSheet.flatten(graphic.props.style)).toMatchObject({
      aspectRatio: 2,
      maxWidth: "100%",
    });
  });
});
