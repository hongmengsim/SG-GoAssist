import {
  createBrowserSpeechAdapter,
  type SpeechAdapter,
} from "./GuidanceService";

export function createSpeechAdapter(
  getLanguage: () => string,
): SpeechAdapter | null {
  return createBrowserSpeechAdapter(getLanguage);
}
