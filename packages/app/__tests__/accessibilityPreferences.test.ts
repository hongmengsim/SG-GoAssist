import {
  accessibilityRequirementsFromPreferences,
  applyAccessibilityPreset,
  defaultAccessibilityPreferences,
  mergeAccessibilityPreferences,
  parsePersistedAccessibilityPreferences,
  preferencesWithAssistanceRequirements,
  serializeAccessibilityPreferences,
  textSizeScale,
} from "../src/preferences/accessibilityPreferences";

describe("accessibility preferences", () => {
  it("migrates the legacy split stores into the canonical model", () => {
    const migrated = parsePersistedAccessibilityPreferences(
      JSON.stringify({
        assistanceDefaults: {
          wheelchairRamp: true,
          busAudioIdentification: true,
          extendedDwellTime: true,
        },
        appPreferences: {
          largeText: true,
          hapticAlerts: false,
          highContrast: true,
          wheelchairRouting: true,
        },
      }),
    );

    expect(migrated).toMatchObject({
      wheelchairAssistance: true,
      wheelchairRouting: true,
      extraBoardingTime: true,
      alightingAssistance: true,
      preferAccessibleStops: true,
      audioBusIdentification: true,
      textSize: "LARGE",
      vibrationAlerts: "OFF",
      highContrast: true,
    });
  });

  it("fills missing fields and rejects invalid storage safely", () => {
    expect(
      parsePersistedAccessibilityPreferences(
        JSON.stringify({ accessibilityPreferences: { spokenGuidance: true } }),
      ),
    ).toEqual({ ...defaultAccessibilityPreferences, spokenGuidance: true });
    expect(parsePersistedAccessibilityPreferences("not json")).toBeNull();
  });

  it.each([
    ["WHEELCHAIR", { wheelchairAssistance: true, wheelchairRouting: true, extraBoardingTime: true, alightingAssistance: true, preferAccessibleStops: true }],
    ["LOW_VISION", { textSize: "LARGE", highContrast: true, spokenGuidance: true, audioBusIdentification: true, alwaysShowNextAction: true }],
    ["HEARING_ASSISTANCE", { visualJourneyAlerts: true, vibrationAlerts: "IMPORTANT", textAnnouncementEquivalent: true }],
    ["SIMPLIFIED_JOURNEY", { simplifiedJourney: true, alwaysShowNextAction: true, plainLanguage: true, confirmImportantActions: true }],
  ] as const)("applies the %s preset without erasing customization", (preset, expected) => {
    const current = { ...defaultAccessibilityPreferences, themeMode: "dark" as const, repeatAudio: false };
    expect(applyAccessibilityPreset(current, preset)).toMatchObject({
      ...expected,
      themeMode: "dark",
      repeatAudio: false,
    });
  });

  it("round-trips canonical customization through versioned storage", () => {
    const customized = {
      ...defaultAccessibilityPreferences,
      textSize: "EXTRA_LARGE" as const,
      vibrationAlerts: "ALL" as const,
      largerControls: true,
      reducedMotion: true,
    };
    const serialized = serializeAccessibilityPreferences(customized);
    expect(JSON.parse(serialized).version).toBe(2);
    expect(parsePersistedAccessibilityPreferences(serialized)).toEqual(customized);
  });

  it("keeps journey assistance derived from and mergeable into the same model", () => {
    const preferences = preferencesWithAssistanceRequirements(
      defaultAccessibilityPreferences,
      {
        wheelchairRamp: true,
        busAudioIdentification: true,
        extendedDwellTime: true,
      },
    );
    expect(accessibilityRequirementsFromPreferences(preferences)).toEqual({
      wheelchairRamp: true,
      busAudioIdentification: true,
      extendedDwellTime: true,
    });
  });

  it("provides monotonic text scaling", () => {
    expect(textSizeScale("STANDARD")).toBeLessThan(textSizeScale("LARGE"));
    expect(textSizeScale("LARGE")).toBeLessThan(textSizeScale("EXTRA_LARGE"));
  });
});
