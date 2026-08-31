import { Platform } from "react-native";
import type {
  OnDeviceGenerationOptions,
  OnDeviceStructuredGenerator,
} from "./AssistantTurnProvider";

export type E2EAssistantModelBridge = {
  enabled: true;
  responses: string[];
  calls?: Array<{
    prompt: string;
    grammar: string;
    turnId?: string;
  }>;
};

declare global {
  interface Window {
    __GOASSIST_E2E_ASSISTANT__?: E2EAssistantModelBridge;
  }
}

/**
 * Returns the controlled model used by the live browser integration test.
 * The hook is deliberately limited to web development builds. Production
 * builds and native releases always use the packaged on-device runtime.
 */
export function developmentE2EAssistantGenerator():
  | OnDeviceStructuredGenerator
  | undefined {
  if (
    !__DEV__ ||
    Platform.OS !== "web" ||
    typeof window === "undefined"
  ) {
    return undefined;
  }
  return {
    id: "e2e-controlled-assistant",
    isReady: () => window.__GOASSIST_E2E_ASSISTANT__?.enabled === true,
    async generateStructured(
      prompt: string,
      grammar: string,
      options?: OnDeviceGenerationOptions,
    ) {
      const bridge = window.__GOASSIST_E2E_ASSISTANT__;
      if (bridge?.enabled !== true) {
        throw new Error("The controlled assistant bridge is not enabled.");
      }
      bridge.calls ??= [];
      bridge.calls.push({ prompt, grammar, turnId: options?.turnId });
      const response = bridge.responses.shift();
      if (!response) {
        throw new Error("No controlled assistant response was queued.");
      }
      return response;
    },
  };
}
