import type { AccessibilityTextSize } from "@buspass/shared";

export type PresentationPreferences = {
  textSize?: AccessibilityTextSize;
  largerControls?: boolean;
};

/** Logical pixels on web and density-independent pixels on native. */
export function resolvePresentationSizes(
  preferences: PresentationPreferences = {},
) {
  const textSize = preferences.textSize ?? "STANDARD";
  const enlarged = Boolean(
    preferences.largerControls || textSize !== "STANDARD",
  );
  const extraIcon = textSize === "EXTRA_LARGE" ? 4 : 0;
  return {
    enlarged,
    statusIcon: (enlarged ? 28 : 24) + extraIcon,
    actionIcon: (enlarged ? 32 : 28) + extraIcon,
    featureIcon: (enlarged ? 36 : 32) + extraIcon,
    featureContainer: enlarged ? 64 : 56,
    controlHeight: enlarged ? 68 : 56,
    primaryHeight: enlarged ? 72 : 64,
    buttonText:
      textSize === "EXTRA_LARGE" ? 24 : textSize === "LARGE" ? 21 : 18,
    bodyText: textSize === "EXTRA_LARGE" ? 22 : textSize === "LARGE" ? 19 : 16,
    metadataText:
      textSize === "EXTRA_LARGE" ? 20 : textSize === "LARGE" ? 17 : 14,
    stopMarker: 56 + (enlarged ? 8 : 0),
    recommendedMarker: 64 + (enlarged ? 8 : 0),
    selectedMarker: 72 + (enlarged ? 8 : 0),
    markerBadge: enlarged ? 36 : 32,
    strokeWidth: 2.75,
  } as const;
}

export type PresentationSizes = ReturnType<typeof resolvePresentationSizes>;
