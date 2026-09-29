import { Platform } from "react-native";
import * as Device from "expo-device";
import { goAssistModelAsset } from "../../modules/goassist-model-asset";
import type {
  OnDeviceGenerationOptions,
  OnDeviceStructuredGenerator,
} from "./AssistantTurnProvider";
import type {
  AssistantRuntimeReasonCode,
  AssistantRuntimeStatus,
} from "./types";

type LlamaCompletionResult = { text?: string };
export type LlamaContextAdapter = {
  completion(options: Record<string, unknown>): Promise<LlamaCompletionResult>;
  release?(): Promise<void> | void;
};

export type ModelAssetBridge = {
  getModelPath(): Promise<{
    path: string;
    checksumVerified: boolean;
    version?: string;
  }>;
};

export type LlamaModuleAdapter = {
  initLlama(options: Record<string, unknown>): Promise<LlamaContextAdapter>;
};

export type OnDeviceAssistantRuntimeDependencies = {
  platform?: string;
  totalMemory?: number | null;
  assetBridge?: ModelAssetBridge | null;
  loadLlama?: () => Promise<LlamaModuleAdapter>;
  now?: () => number;
};

const minimumDeviceMemoryBytes = 4 * 1024 * 1024 * 1024;
const defaultModelVersion = "Qwen3-0.6B-Q8_0";
const inferenceTimeoutMs = 8_000;
const circuitFailureThreshold = 2;
const circuitCooldownMs = 5 * 60_000;

export class OnDeviceAssistantRuntime implements OnDeviceStructuredGenerator {
  readonly id = "qwen3-0.6b-local";
  private context: LlamaContextAdapter | null = null;
  private status: AssistantRuntimeStatus = rulesOnly("NOT_PREPARED", true, 0);
  private initialization: Promise<AssistantRuntimeStatus> | null = null;
  private inferenceTail: Promise<unknown> = Promise.resolve();
  private listeners = new Set<(status: AssistantRuntimeStatus) => void>();
  private consecutiveFailures = 0;
  private initializationAttempts = 0;
  private readonly platform: string;
  private readonly totalMemory: number | null;
  private readonly assetBridge: ModelAssetBridge | null;
  private readonly loadLlama: () => Promise<LlamaModuleAdapter>;
  private readonly now: () => number;

  constructor(dependencies: OnDeviceAssistantRuntimeDependencies = {}) {
    this.platform = dependencies.platform ?? Platform.OS;
    this.totalMemory = dependencies.totalMemory ?? Device.totalMemory ?? null;
    this.assetBridge =
      dependencies.assetBridge === undefined
        ? (goAssistModelAsset as ModelAssetBridge | null)
        : dependencies.assetBridge;
    this.loadLlama =
      dependencies.loadLlama ??
      (async () => (await import("llama.rn")) as unknown as LlamaModuleAdapter);
    this.now = dependencies.now ?? Date.now;
  }

  isReady() {
    return this.status.mode === "AI_READY" && Boolean(this.context);
  }

  getStatus() {
    return this.status;
  }

  subscribe(listener: (status: AssistantRuntimeStatus) => void) {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  initialize(force = false) {
    if (this.isReady()) return Promise.resolve(this.status);
    if (this.initialization) return this.initialization;
    if (
      !force &&
      this.status.mode === "RULES_ONLY" &&
      this.status.retryAt &&
      this.status.retryAt > this.now()
    ) {
      return Promise.resolve(this.status);
    }
    this.initializationAttempts += 1;
    const attempt = this.initializeOnce();
    this.initialization = attempt;
    void attempt.then(
      () => {
        if (this.initialization === attempt) this.initialization = null;
      },
      () => {
        if (this.initialization === attempt) this.initialization = null;
      },
    );
    return attempt;
  }

  retry() {
    return this.initialize(true);
  }

  async generateStructured(
    prompt: string,
    grammar: string,
    options?: OnDeviceGenerationOptions,
  ) {
    if (options?.signal?.aborted) {
      throw new Error("TURN_CANCELLED");
    }
    if (!this.context || this.status.mode !== "AI_READY") {
      throw new Error("The private assistant model is unavailable.");
    }
    const context = this.context;
    const previous = this.inferenceTail.catch(() => undefined);
    const completion = previous.then(() =>
      context.completion({
        messages: [{ role: "user", content: prompt }],
        grammar,
        n_predict: 160,
        temperature: 0.2,
        top_k: 20,
        top_p: 0.8,
        min_p: 0,
        presence_penalty: 1.2,
        stop: ["<|im_end|>", "<|endoftext|>", "</s>"],
      }),
    );
    this.inferenceTail = completion;

    const deadlineAt = Math.min(
      options?.deadlineAt ?? this.now() + inferenceTimeoutMs,
      this.now() + inferenceTimeoutMs,
    );
    try {
      const result = await withDeadline(
        completion,
        Math.max(1, deadlineAt - this.now()),
        options?.signal,
      );
      if (!result.text?.trim()) throw new Error("EMPTY_MODEL_OUTPUT");
      this.consecutiveFailures = 0;
      if (this.status.mode === "AI_READY") {
        this.setStatus({ ...this.status, consecutiveFailures: 0 });
      }
      return result.text;
    } catch (error) {
      if (error instanceof Error && error.message === "TURN_CANCELLED") {
        throw error;
      }
      this.recordInferenceFailure(
        error instanceof AssistantInferenceTimeoutError
          ? "INFERENCE_TIMEOUT"
          : "INFERENCE_FAILED",
      );
      throw error;
    }
  }

  async release(reasonCode: AssistantRuntimeReasonCode = "RELEASED") {
    await this.context?.release?.();
    this.context = null;
    this.initialization = null;
    this.inferenceTail = Promise.resolve();
    this.setStatus(rulesOnly(reasonCode, true, this.consecutiveFailures));
  }

  private async initializeOnce(): Promise<AssistantRuntimeStatus> {
    if (this.platform !== "android") {
      return this.setStatus(
        rulesOnly("UNSUPPORTED_PLATFORM", false, this.consecutiveFailures),
      );
    }
    if (
      typeof this.totalMemory === "number" &&
      this.totalMemory < minimumDeviceMemoryBytes
    ) {
      return this.setStatus(
        rulesOnly("LOW_MEMORY", false, this.consecutiveFailures),
      );
    }
    if (!this.assetBridge?.getModelPath) {
      return this.setStatus(
        rulesOnly("MODEL_NOT_INSTALLED", true, this.consecutiveFailures),
      );
    }

    this.setStatus({
      mode: "LOADING",
      attempt: this.initializationAttempts,
      consecutiveFailures: this.consecutiveFailures,
    });
    try {
      await this.context?.release?.();
      this.context = null;
      const model = await this.assetBridge.getModelPath();
      if (!model.path || !model.checksumVerified) {
        return this.setStatus(
          rulesOnly(
            "MODEL_INTEGRITY_FAILED",
            true,
            this.consecutiveFailures,
          ),
        );
      }
      const llama = await this.loadLlama();
      this.context = await llama.initLlama({
        model: model.path,
        n_ctx: 2048,
        n_batch: 256,
        n_ubatch: 128,
        n_gpu_layers: 0,
        use_mlock: false,
        ctx_shift: false,
      });
      this.consecutiveFailures = 0;
      return this.setStatus({
        mode: "AI_READY",
        modelVersion: model.version ?? defaultModelVersion,
        consecutiveFailures: 0,
      });
    } catch {
      this.context = null;
      this.consecutiveFailures += 1;
      return this.setStatus(
        rulesOnly(
          "INITIALIZATION_FAILED",
          true,
          this.consecutiveFailures,
        ),
      );
    }
  }

  private recordInferenceFailure(reasonCode: AssistantRuntimeReasonCode) {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= circuitFailureThreshold) {
      this.setStatus({
        mode: "RULES_ONLY",
        reasonCode: "CIRCUIT_OPEN",
        retryAllowed: true,
        consecutiveFailures: this.consecutiveFailures,
        retryAt: this.now() + circuitCooldownMs,
      });
      return;
    }
    if (this.status.mode === "AI_READY") {
      this.setStatus({
        ...this.status,
        consecutiveFailures: this.consecutiveFailures,
      });
      return;
    }
    this.setStatus(rulesOnly(reasonCode, true, this.consecutiveFailures));
  }

  private setStatus(status: AssistantRuntimeStatus) {
    this.status = status;
    this.listeners.forEach((listener) => listener(status));
    return status;
  }
}

class AssistantInferenceTimeoutError extends Error {
  constructor() {
    super("The private assistant took too long to respond.");
    this.name = "AssistantInferenceTimeoutError";
  }
}

function rulesOnly(
  reasonCode: AssistantRuntimeReasonCode,
  retryAllowed: boolean,
  consecutiveFailures: number,
): Extract<AssistantRuntimeStatus, { mode: "RULES_ONLY" }> {
  return {
    mode: "RULES_ONLY",
    reasonCode,
    retryAllowed,
    consecutiveFailures,
  };
}

function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
) {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(new Error("TURN_CANCELLED")));
    const timeout = setTimeout(
      () => finish(() => reject(new AssistantInferenceTimeoutError())),
      timeoutMs,
    );
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}
