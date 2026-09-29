import fs from "node:fs";
import path from "node:path";
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet, View } from "react-native";
import { FeatureIllustration } from "../src/components/FeatureIllustration";

it("maps every runtime illustration to a checked-in asset", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "illustrations.ts"),
    "utf8",
  );
  const assets = [
    "illustrations/features/wheelchair_ramp_v2.png",
    "illustrations/features/extra_boarding_time_v2.png",
    "illustrations/features/audio_identification_v2.png",
    "illustrations/physical_help_button_v4.png",
    "illustrations/nearest_stop_loading_v1.png",
    "illustrations/journey_find_bus_v2.png",
    "illustrations/choose_bus_v1.png",
    "illustrations/journey_review_v1.png",
    "illustrations/onboard_guidance_v1.png",
    "illustrations/assist_communication_v2.png",
    "illustrations/accessibility_profile_v2.png",
    "illustrations/journey-guide/walking_to_stop_v2.png",
    "illustrations/journey-guide/waiting_for_bus_v2.png",
    "illustrations/journey-guide/safe_boarding_v2.png",
    "illustrations/journey-guide/onboard_journey_v2.png",
    "illustrations/journey-guide/safe_alighting_v2.png",
    "illustrations/journey-guide/journey_complete_v2.png",
  ];

  assets.forEach((asset) => {
    expect(source).toContain(`require("../assets/${asset}")`);
    expect(fs.existsSync(path.join(__dirname, "..", "assets", asset))).toBe(
      true,
    );
  });
});

it("keeps every replacement scene at the standard 3:2 production size", () => {
  const assets = [
    "illustrations/features/wheelchair_ramp_v2.png",
    "illustrations/features/extra_boarding_time_v2.png",
    "illustrations/features/audio_identification_v2.png",
    "illustrations/physical_help_button_v4.png",
    "illustrations/journey_find_bus_v2.png",
    "illustrations/assist_communication_v2.png",
    "illustrations/journey-guide/walking_to_stop_v2.png",
    "illustrations/journey-guide/waiting_for_bus_v2.png",
    "illustrations/journey-guide/safe_boarding_v2.png",
    "illustrations/journey-guide/onboard_journey_v2.png",
    "illustrations/journey-guide/safe_alighting_v2.png",
    "illustrations/journey-guide/journey_complete_v2.png",
  ];

  assets.forEach((asset) => {
    const png = fs.readFileSync(path.join(__dirname, "..", "assets", asset));
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1536);
    expect(png.readUInt32BE(20)).toBe(1024);
  });
});

it("exposes meaningful illustrations to accessibility services", () => {
  render(
    <FeatureIllustration
      source={{ uri: "illustration.png" }}
      accessibilityLabel="Passenger requesting ramp assistance"
      size="large"
      testID="feature-art"
    />,
  );

  expect(
    screen.getByLabelText("Passenger requesting ramp assistance"),
  ).toBeTruthy();
  expect(
    StyleSheet.flatten(screen.getByTestId("feature-art").props.style),
  ).toMatchObject({
    height: 104,
    width: 160,
  });
});

it("keeps decorative illustrations out of the accessibility tree", () => {
  const rendered = render(
    <FeatureIllustration
      source={{ uri: "decorative.png" }}
      accessibilityLabel="Should not be announced"
      decorative
      testID="decorative-art"
    />,
  );

  expect(screen.queryByLabelText("Should not be announced")).toBeNull();
  expect(rendered.UNSAFE_getByType(View).props).toMatchObject({
    accessibilityElementsHidden: true,
    importantForAccessibility: "no",
  });
});
