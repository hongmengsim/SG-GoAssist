import { Platform } from "react-native";
import { developmentE2EAssistantGenerator } from "../src/voiceAssistant/E2EAssistantBridge";

describe("development E2E assistant bridge", () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { value: originalPlatform });
    delete window.__GOASSIST_E2E_ASSISTANT__;
  });

  it("provides queued structured output on web development builds", async () => {
    Object.defineProperty(Platform, "OS", { value: "web" });
    window.__GOASSIST_E2E_ASSISTANT__ = {
      enabled: true,
      responses: [
        JSON.stringify({
          kind: "ARTICLE_SELECTION",
          evidenceId: "journey-stages:en-SG",
          confidence: 0.98,
        }),
      ],
      calls: [],
    };

    const generator = developmentE2EAssistantGenerator();
    expect(generator?.isReady()).toBe(true);
    await expect(
      generator?.generateStructured("prompt", "grammar", {
        turnId: "turn-1",
        deadlineAt: Date.now() + 1_000,
      }),
    ).resolves.toContain("journey-stages:en-SG");
    expect(window.__GOASSIST_E2E_ASSISTANT__.calls).toEqual([
      { prompt: "prompt", grammar: "grammar", turnId: "turn-1" },
    ]);
  });

  it("stays inactive without the explicit bridge flag", () => {
    Object.defineProperty(Platform, "OS", { value: "web" });
    const generator = developmentE2EAssistantGenerator();
    expect(generator).toBeDefined();
    expect(generator?.isReady()).toBe(false);
  });
});
