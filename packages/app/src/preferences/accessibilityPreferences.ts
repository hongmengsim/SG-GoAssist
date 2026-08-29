import type {
  AccessibilityPreferences,
  AccessibilityRequirements,
  AccessibilityTextSize,
  VibrationAlertMode,
} from "@buspass/shared";

export type AccessibilityPreset =
  | "WHEELCHAIR"
  | "LOW_VISION"
  | "HEARING_ASSISTANCE"
  | "SIMPLIFIED_JOURNEY";

export type PersistedAccessibilityPreferences = {
  version: 2;
  accessibilityPreferences: AccessibilityPreferences;
};

export const defaultAccessibilityPreferences: AccessibilityPreferences = {
  wheelchairAssistance: false,
  wheelchairRouting: false,
  avoidSteepSlopes: true,
  preferSmoothSurfaces: true,
  extraBoardingTime: false,
  alightingAssistance: false,
  preferAccessibleStops: false,
  textSize: "STANDARD",
  highContrast: false,
  spokenGuidance: false,
  audioBusIdentification: false,
  reduceMapDependence: false,
  screenReaderOptimised: true,
  visualJourneyAlerts: true,
  vibrationAlerts: "IMPORTANT",
  textAnnouncementEquivalent: true,
  simplifiedJourney: false,
  alwaysShowNextAction: false,
  plainLanguage: true,
  confirmImportantActions: false,
  largerControls: false,
  longerMessageDuration: false,
  reducedMotion: false,
  warnBusApproaching: true,
  warnBusArrives: true,
  warnTwoStopsBeforeDestination: true,
  warnDestinationNext: true,
  repeatAudio: true,
  themeMode: "light",
};

const booleanKeys = [
  "wheelchairAssistance",
  "wheelchairRouting",
  "avoidSteepSlopes",
  "preferSmoothSurfaces",
  "extraBoardingTime",
  "alightingAssistance",
  "preferAccessibleStops",
  "highContrast",
  "spokenGuidance",
  "audioBusIdentification",
  "reduceMapDependence",
  "screenReaderOptimised",
  "visualJourneyAlerts",
  "textAnnouncementEquivalent",
  "simplifiedJourney",
  "alwaysShowNextAction",
  "plainLanguage",
  "confirmImportantActions",
  "largerControls",
  "longerMessageDuration",
  "reducedMotion",
  "warnBusApproaching",
  "warnBusArrives",
  "warnTwoStopsBeforeDestination",
  "warnDestinationNext",
  "repeatAudio",
] as const satisfies readonly (keyof AccessibilityPreferences)[];

const textSizes: AccessibilityTextSize[] = [
  "STANDARD",
  "LARGE",
  "EXTRA_LARGE",
];
const vibrationModes: VibrationAlertMode[] = ["OFF", "IMPORTANT", "ALL"];

type LegacyAccessibilityPreferences = Partial<AccessibilityPreferences> & {
  largeText?: boolean;
  hapticAlerts?: boolean;
};

export function mergeAccessibilityPreferences(
  saved?: LegacyAccessibilityPreferences | null,
  legacyAssistance?: Partial<AccessibilityRequirements> | null,
): AccessibilityPreferences {
  const merged = { ...defaultAccessibilityPreferences };
  if (saved) {
    for (const key of booleanKeys) {
      if (typeof saved[key] === "boolean") {
        (merged[key] as boolean) = saved[key] as boolean;
      }
    }
    if (saved.themeMode === "light" || saved.themeMode === "dark") {
      merged.themeMode = saved.themeMode;
    }
    if (textSizes.includes(saved.textSize as AccessibilityTextSize)) {
      merged.textSize = saved.textSize as AccessibilityTextSize;
    } else if (saved.largeText === true) {
      merged.textSize = "LARGE";
    }
    if (vibrationModes.includes(saved.vibrationAlerts as VibrationAlertMode)) {
      merged.vibrationAlerts = saved.vibrationAlerts as VibrationAlertMode;
    } else if (typeof saved.hapticAlerts === "boolean") {
      merged.vibrationAlerts = saved.hapticAlerts ? "IMPORTANT" : "OFF";
    }
  }

  if (legacyAssistance) {
    if (typeof legacyAssistance.wheelchairRamp === "boolean") {
      merged.wheelchairAssistance = legacyAssistance.wheelchairRamp;
    }
    if (typeof legacyAssistance.extendedDwellTime === "boolean") {
      merged.extraBoardingTime = legacyAssistance.extendedDwellTime;
    }
    if (typeof legacyAssistance.busAudioIdentification === "boolean") {
      merged.audioBusIdentification = legacyAssistance.busAudioIdentification;
    }
    if (
      legacyAssistance.wheelchairRamp ||
      legacyAssistance.extendedDwellTime
    ) {
      merged.alightingAssistance = true;
    }
  }

  // Preserve the previous behaviour where wheelchair routing also ranked
  // nearby stops by accessible route viability.
  if (
    saved?.preferAccessibleStops === undefined &&
    merged.wheelchairRouting
  ) {
    merged.preferAccessibleStops = true;
  }

  return merged;
}

export function parsePersistedAccessibilityPreferences(
  raw: string,
): AccessibilityPreferences | null {
  try {
    const parsed = JSON.parse(raw) as {
      version?: number;
      accessibilityPreferences?: LegacyAccessibilityPreferences;
      assistanceDefaults?: Partial<AccessibilityRequirements>;
      appPreferences?: LegacyAccessibilityPreferences;
    };
    if (parsed.accessibilityPreferences) {
      return mergeAccessibilityPreferences(parsed.accessibilityPreferences);
    }
    if (parsed.appPreferences || parsed.assistanceDefaults) {
      return mergeAccessibilityPreferences(
        parsed.appPreferences,
        parsed.assistanceDefaults,
      );
    }
    return mergeAccessibilityPreferences(parsed as LegacyAccessibilityPreferences);
  } catch {
    return null;
  }
}

export function serializeAccessibilityPreferences(
  preferences: AccessibilityPreferences,
): string {
  const persisted: PersistedAccessibilityPreferences = {
    version: 2,
    accessibilityPreferences: mergeAccessibilityPreferences(preferences),
  };
  return JSON.stringify(persisted);
}

export function applyAccessibilityPreset(
  current: AccessibilityPreferences,
  preset: AccessibilityPreset,
): AccessibilityPreferences {
  if (preset === "WHEELCHAIR") {
    return {
      ...current,
      wheelchairAssistance: true,
      wheelchairRouting: true,
      avoidSteepSlopes: true,
      preferSmoothSurfaces: true,
      extraBoardingTime: true,
      alightingAssistance: true,
      preferAccessibleStops: true,
    };
  }
  if (preset === "LOW_VISION") {
    return {
      ...current,
      textSize: "LARGE",
      highContrast: true,
      spokenGuidance: true,
      audioBusIdentification: true,
      alwaysShowNextAction: true,
    };
  }
  if (preset === "HEARING_ASSISTANCE") {
    return {
      ...current,
      visualJourneyAlerts: true,
      vibrationAlerts: "IMPORTANT",
      textAnnouncementEquivalent: true,
    };
  }
  return {
    ...current,
    simplifiedJourney: true,
    alwaysShowNextAction: true,
    plainLanguage: true,
    confirmImportantActions: true,
  };
}

export function accessibilityRequirementsFromPreferences(
  preferences: AccessibilityPreferences,
): AccessibilityRequirements {
  return {
    wheelchairRamp: preferences.wheelchairAssistance,
    busAudioIdentification: preferences.audioBusIdentification,
    extendedDwellTime: preferences.extraBoardingTime,
  };
}

export function preferencesWithAssistanceRequirements(
  preferences: AccessibilityPreferences,
  requirements: AccessibilityRequirements,
): AccessibilityPreferences {
  return {
    ...preferences,
    wheelchairAssistance: requirements.wheelchairRamp,
    audioBusIdentification: requirements.busAudioIdentification,
    extraBoardingTime: requirements.extendedDwellTime,
  };
}

export function isLargeText(preferences: AccessibilityPreferences) {
  return preferences.textSize !== "STANDARD";
}

export function textSizeScale(textSize: AccessibilityTextSize) {
  if (textSize === "EXTRA_LARGE") return 1.28;
  if (textSize === "LARGE") return 1.12;
  return 1;
}
