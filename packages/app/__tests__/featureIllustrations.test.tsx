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
    "home_find_bus.png",
    "wheelchair_ramp.png",
    "extra_boarding_time.png",
    "audio_identification.png",
    "illustrations/05_journey_tracking_disembark.png",
    "illustrations/08_physical_help_button.png",
  ];

  assets.forEach((asset) => {
    expect(source).toContain(`require("../assets/${asset}")`);
    expect(fs.existsSync(path.join(__dirname, "..", "assets", asset))).toBe(
      true,
    );
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
