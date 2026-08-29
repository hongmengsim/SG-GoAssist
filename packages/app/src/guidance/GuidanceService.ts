import type { VibrationAlertMode } from "@buspass/shared";

export type GuidancePriority = "GENERAL" | "WALKING" | "BUS" | "DESTINATION";

export type GuidanceHaptic = "START" | "TURN" | "WARNING" | "SUCCESS";

export type GuidanceEventKind =
  | "NAVIGATION"
  | "ACCESSIBLE_ROUTE_SELECTED"
  | "ACCESSIBILITY_WARNING"
  | "NO_ACCESSIBLE_ROUTE"
  | "MOBILITY_MODE_CHANGED";

export type GuidanceEvent = {
  id: string;
  text: string;
  priority: GuidancePriority;
  haptic?: GuidanceHaptic;
  kind?: GuidanceEventKind;
};

export type GuidancePreferences = {
  spokenGuidanceEnabled: boolean;
  vibrationAlerts: VibrationAlertMode;
};

export type SpeechAdapter = {
  speak(
    text: string,
    options: { interrupt: boolean; onDone: () => void },
  ): boolean;
  cancel(): void;
};

export type GuidanceAdapters = {
  speech?: SpeechAdapter | null;
  haptic?: (haptic: GuidanceHaptic) => void;
};

export type GuidanceSnapshot = {
  latestSpokenText: string | null;
  speaking: boolean;
  speechSupported: boolean;
  hapticsSupported: boolean;
};

export type GuidanceAnnouncementResult = {
  duplicate: boolean;
  hapticTriggered: boolean;
  spoken: boolean;
};

const priorityValue: Record<GuidancePriority, number> = {
  GENERAL: 1,
  WALKING: 2,
  BUS: 3,
  DESTINATION: 4,
};

const maximumRememberedEvents = 160;

export class GuidanceService {
  private preferences: GuidancePreferences = {
    spokenGuidanceEnabled: false,
    vibrationAlerts: "OFF",
  };
  private readonly announcedEventIds = new Set<string>();
  private activeSpeechPriority: GuidancePriority | null = null;
  private latestSpokenText: string | null = null;
  private readonly listeners = new Set<(snapshot: GuidanceSnapshot) => void>();

  constructor(private readonly adapters: GuidanceAdapters = {}) {}

  configure(preferences: GuidancePreferences) {
    this.preferences = preferences;
    if (!preferences.spokenGuidanceEnabled) {
      this.adapters.speech?.cancel();
      this.activeSpeechPriority = null;
    }
    this.emit();
  }

  subscribe(listener: (snapshot: GuidanceSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  snapshot(): GuidanceSnapshot {
    return {
      latestSpokenText: this.latestSpokenText,
      speaking: this.activeSpeechPriority !== null,
      speechSupported: Boolean(this.adapters.speech),
      hapticsSupported: Boolean(this.adapters.haptic),
    };
  }

  announce(event: GuidanceEvent): GuidanceAnnouncementResult {
    const id = event.id.trim();
    const text = event.text.trim();
    if (!id || !text || this.announcedEventIds.has(id)) {
      return { duplicate: true, hapticTriggered: false, spoken: false };
    }
    this.rememberEvent(id);

    let hapticTriggered = false;
    if (
      event.haptic &&
      shouldTriggerHaptic(this.preferences.vibrationAlerts, event.haptic)
    ) {
      this.adapters.haptic?.(event.haptic);
      hapticTriggered = Boolean(this.adapters.haptic);
    }

    const spoken = this.speak(text, event.priority);
    return { duplicate: false, hapticTriggered, spoken };
  }

  repeatLatest({ force = false }: { force?: boolean } = {}) {
    if (
      !this.latestSpokenText ||
      (!force && !this.preferences.spokenGuidanceEnabled)
    ) {
      return false;
    }
    return this.speak(this.latestSpokenText, "DESTINATION", true, force);
  }

  speakAssistantResponse(text: string) {
    return this.speak(text, "DESTINATION", true, true);
  }

  stopActiveSpeech() {
    this.adapters.speech?.cancel();
    this.activeSpeechPriority = null;
    this.latestSpokenText = null;
    this.emit();
  }

  clearEvents(prefix?: string) {
    if (!prefix) {
      this.announcedEventIds.clear();
      return;
    }
    for (const id of this.announcedEventIds) {
      if (id.startsWith(prefix)) this.announcedEventIds.delete(id);
    }
  }

  private rememberEvent(id: string) {
    this.announcedEventIds.add(id);
    if (this.announcedEventIds.size <= maximumRememberedEvents) return;
    const oldest = this.announcedEventIds.values().next().value as
      string | undefined;
    if (oldest) this.announcedEventIds.delete(oldest);
  }

  private speak(
    text: string,
    priority: GuidancePriority,
    forceInterrupt = false,
    forceSpeech = false,
  ) {
    const speech = this.adapters.speech;
    if ((!forceSpeech && !this.preferences.spokenGuidanceEnabled) || !speech) {
      return false;
    }
    if (
      !forceInterrupt &&
      this.activeSpeechPriority &&
      priorityValue[priority] < priorityValue[this.activeSpeechPriority]
    ) {
      return false;
    }
    const interrupt =
      forceInterrupt ||
      Boolean(
        this.activeSpeechPriority &&
        priorityValue[priority] >= priorityValue[this.activeSpeechPriority],
      );
    if (interrupt) speech.cancel();
    this.activeSpeechPriority = priority;
    const accepted = speech.speak(text, {
      interrupt,
      onDone: () => {
        this.activeSpeechPriority = null;
        this.emit();
      },
    });
    if (!accepted) {
      this.activeSpeechPriority = null;
      return false;
    }
    this.latestSpokenText = text;
    this.emit();
    return true;
  }

  private emit() {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export function shouldTriggerHaptic(
  mode: VibrationAlertMode,
  haptic: GuidanceHaptic,
) {
  if (mode === "OFF") return false;
  if (mode === "ALL") return true;
  return haptic === "WARNING" || haptic === "SUCCESS";
}

export function createBrowserSpeechAdapter(): SpeechAdapter | null {
  const environment = globalThis as typeof globalThis & {
    SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
    speechSynthesis?: SpeechSynthesis;
  };
  const speechSynthesis = environment.speechSynthesis;
  const Utterance = environment.SpeechSynthesisUtterance;
  if (!speechSynthesis || !Utterance) return null;

  return {
    cancel: () => speechSynthesis.cancel(),
    speak: (text, { onDone }) => {
      try {
        const utterance = new Utterance(text);
        utterance.lang = "en-SG";
        utterance.rate = 0.96;
        utterance.onend = onDone;
        utterance.onerror = onDone;
        speechSynthesis.speak(utterance);
        return true;
      } catch {
        return false;
      }
    },
  };
}
