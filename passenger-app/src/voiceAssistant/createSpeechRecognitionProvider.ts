import {
  WebSpeechRecognitionProvider,
  type SpeechRecognitionProvider,
} from "./SpeechRecognitionProvider";

export function createSpeechRecognitionProvider(): SpeechRecognitionProvider {
  return new WebSpeechRecognitionProvider();
}
