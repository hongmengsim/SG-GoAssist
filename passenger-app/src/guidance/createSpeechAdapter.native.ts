import * as Speech from "expo-speech";
import type { SpeechAdapter } from "./GuidanceService";

export function createSpeechAdapter(getLanguage: () => string): SpeechAdapter {
  return {
    cancel: () => {
      void Speech.stop();
    },
    speak: (text, { interrupt, onDone }) => {
      if (interrupt) void Speech.stop();
      let completed = false;
      const complete = () => {
        if (completed) return;
        completed = true;
        onDone();
      };
      try {
        Speech.speak(text, {
          language: getLanguage(),
          rate: 0.96,
          onDone: complete,
          onError: complete,
          onStopped: complete,
        });
        return true;
      } catch {
        complete();
        return false;
      }
    },
  };
}
