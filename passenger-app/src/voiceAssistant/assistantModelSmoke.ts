import { useEffect, useRef } from "react";
import { Linking, Platform } from "react-native";
import { goAssistModelAsset } from "../../modules/goassist-model-asset";
import {
  HybridAssistantTurnProvider,
  type OnDeviceStructuredGenerator,
} from "./AssistantTurnProvider";
import { OnDeviceAssistantRuntime } from "./OnDeviceAssistantRuntime";
import { assistantKnowledgeArticles } from "./assistantKnowledge";
import type { AssistantContext } from "./types";

export const assistantModelSmokePrefix = "GOASSIST_ASSISTANT_E2E_RESULT:";

const smokeContext: AssistantContext = {
  locale: "en-SG",
  journeyId: "android-model-smoke",
  revision: 1,
  activeCaseId: null,
  journeyStage: "WAITING_FOR_BUS",
  hasActiveJourney: true,
  onboard: false,
  currentStop: {
    busStopCode: "18301",
    description: "Lim Seng Tjoe Bldg (LT 27)",
  },
  selectedService: "95",
  destination: "Ctrl Lib",
  nextStop: null,
  stopsRemaining: null,
  busesAtStop: [],
  selectedBusAtStop: null,
  busArrivalSeconds: 120,
  rampStatus: "ACKNOWLEDGED",
  alightingAssistanceStatus: null,
  walkingGuidanceActive: false,
  walkingRouteAvailable: true,
  routeOptions: [],
  preferences: {
    wheelchairAssistance: true,
    spokenGuidance: false,
    simplifiedJourney: false,
    vibrationAlerts: true,
  },
};

export async function runOnDeviceAssistantSmoke() {
  if (Platform.OS !== "android" || !goAssistModelAsset) {
    throw new Error("The packaged assistant model smoke test requires Android.");
  }
  const asset = await goAssistModelAsset.getModelPath();
  if (!asset.checksumVerified || !asset.version || !asset.path) {
    throw new Error("The packaged model asset did not pass integrity checks.");
  }

  const runtime = new OnDeviceAssistantRuntime();
  const calls = { generation: 0, network: 0 };
  const countedGenerator: OnDeviceStructuredGenerator = {
    id: runtime.id,
    isReady: () => runtime.isReady(),
    generateStructured: async (prompt, grammar, options) => {
      calls.generation += 1;
      return runtime.generateStructured(prompt, grammar, options);
    },
  };
  try {
    const status = await runtime.initialize(true);
    if (status.mode !== "AI_READY") {
      throw new Error(`The assistant runtime did not become ready: ${status.mode}`);
    }

    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((...arguments_: Parameters<typeof fetch>) => {
      calls.network += 1;
      return originalFetch(...arguments_);
    }) as typeof fetch;
    let resolution;
    try {
      const provider = new HybridAssistantTurnProvider(
        undefined,
        countedGenerator,
      );
      resolution = await provider.resolveTurn({
        turnId: "android-model-smoke-turn",
        transcript: "Could you walk me through everything?",
        context: smokeContext,
        deadlineAt: Date.now() + 8_000,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const article = assistantKnowledgeArticles.find(
      (candidate) => candidate.id === "journey-stages:en-SG",
    );
    if (!article) throw new Error("The reviewed journey-stage article is missing.");
    if (
      resolution.kind !== "ANSWER" ||
      resolution.provider !== "AI" ||
      !resolution.evidenceIds.includes(article.id) ||
      resolution.message !== article.body ||
      resolution.sourceLabel !== article.sourceLabel
    ) {
      throw new Error(
        `The model did not select the reviewed journey article: ${JSON.stringify(resolution)}`,
      );
    }
    if (calls.generation !== 1 || calls.network !== 0) {
      throw new Error(
        `Unexpected smoke-test calls: ${JSON.stringify(calls)}`,
      );
    }
    return {
      ok: true,
      runtime: status.mode,
      modelVersion: status.modelVersion,
      assetVersion: asset.version,
      checksumVerified: asset.checksumVerified,
      resolutionKind: resolution.kind,
      provider: resolution.provider,
      evidenceIds: resolution.evidenceIds,
      sourceLabel: resolution.sourceLabel,
      renderedWordingMatchesArticle: true,
      generationCalls: calls.generation,
      inferenceNetworkRequests: calls.network,
    };
  } finally {
    await runtime.release();
  }
}

export function useAssistantModelSmokeDeepLink() {
  const running = useRef(false);
  useEffect(() => {
    if (!__DEV__ || Platform.OS !== "android") return undefined;
    const handleUrl = async (url: string | null) => {
      if (!url?.startsWith("buspass://assistant-e2e") || running.current) return;
      running.current = true;
      try {
        const result = await runOnDeviceAssistantSmoke();
        console.info(`${assistantModelSmokePrefix}${JSON.stringify(result)}`);
      } catch (error) {
        console.info(
          `${assistantModelSmokePrefix}${JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })}`,
        );
      } finally {
        running.current = false;
      }
    };
    void Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener("url", ({ url }) => {
      void handleUrl(url);
    });
    return () => subscription.remove();
  }, []);
}
