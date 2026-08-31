import {
  OnDeviceAssistantRuntime,
  type LlamaContextAdapter,
} from "../src/voiceAssistant/OnDeviceAssistantRuntime";

function modelAsset() {
  return {
    getModelPath: jest.fn(async () => ({
      path: "/private/model.gguf",
      checksumVerified: true,
      version: "test-model",
    })),
  };
}

function runtimeWith(context: LlamaContextAdapter) {
  return new OnDeviceAssistantRuntime({
    platform: "android",
    totalMemory: 6 * 1024 ** 3,
    assetBridge: modelAsset(),
    loadLlama: async () => ({ initLlama: jest.fn(async () => context) }),
  });
}

async function flushModelQueue() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

it("keeps deterministic mode available on unsupported or low-memory devices", async () => {
  const unsupported = new OnDeviceAssistantRuntime({ platform: "web" });
  await expect(unsupported.initialize()).resolves.toMatchObject({
    mode: "RULES_ONLY",
    reasonCode: "UNSUPPORTED_PLATFORM",
    retryAllowed: false,
  });

  const lowMemory = new OnDeviceAssistantRuntime({
    platform: "android",
    totalMemory: 3 * 1024 ** 3,
  });
  await expect(lowMemory.initialize()).resolves.toMatchObject({
    mode: "RULES_ONLY",
    reasonCode: "LOW_MEMORY",
    retryAllowed: false,
  });
});

it("rejects an unverified model and allows a later explicit retry", async () => {
  const assetBridge = modelAsset();
  assetBridge.getModelPath
    .mockResolvedValueOnce({
      path: "/private/model.gguf",
      checksumVerified: false,
      version: "bad-model",
    })
    .mockResolvedValueOnce({
      path: "/private/model.gguf",
      checksumVerified: true,
      version: "test-model",
    });
  const runtime = new OnDeviceAssistantRuntime({
    platform: "android",
    totalMemory: 6 * 1024 ** 3,
    assetBridge,
    loadLlama: async () => ({
      initLlama: jest.fn(async () => ({
        completion: jest.fn(async () => ({ text: "{}" })),
      })),
    }),
  });

  await expect(runtime.initialize()).resolves.toMatchObject({
    mode: "RULES_ONLY",
    reasonCode: "MODEL_INTEGRITY_FAILED",
    retryAllowed: true,
  });
  await expect(runtime.retry()).resolves.toMatchObject({
    mode: "AI_READY",
    modelVersion: "test-model",
  });
  expect(assetBridge.getModelPath).toHaveBeenCalledTimes(2);
});

it("runs model completions one at a time", async () => {
  let resolveFirst!: (value: { text: string }) => void;
  let active = 0;
  let maximumActive = 0;
  const completion = jest
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<{ text: string }>((resolve) => {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          resolveFirst = (value) => {
            active -= 1;
            resolve(value);
          };
        }),
    )
    .mockImplementationOnce(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      active -= 1;
      return { text: "second" };
    });
  const runtime = runtimeWith({ completion });
  await runtime.initialize();

  const first = runtime.generateStructured("first", "grammar");
  const second = runtime.generateStructured("second", "grammar");
  await flushModelQueue();
  expect(completion).toHaveBeenCalledTimes(1);
  resolveFirst({ text: "first" });

  await expect(first).resolves.toBe("first");
  await expect(second).resolves.toBe("second");
  expect(maximumActive).toBe(1);
});

it("opens the circuit after two inference deadlines and can explicitly retry", async () => {
  jest.useFakeTimers();
  try {
    const runtime = runtimeWith({
      completion: jest.fn(() => new Promise(() => undefined)),
      release: jest.fn(),
    });
    await runtime.initialize();

    const first = runtime.generateStructured("first", "grammar");
    const firstExpectation = expect(first).rejects.toThrow(/too long/i);
    await jest.advanceTimersByTimeAsync(8_001);
    await firstExpectation;
    expect(runtime.getStatus()).toMatchObject({
      mode: "AI_READY",
      consecutiveFailures: 1,
    });

    const second = runtime.generateStructured("second", "grammar");
    const secondExpectation = expect(second).rejects.toThrow(/too long/i);
    await jest.advanceTimersByTimeAsync(8_001);
    await secondExpectation;
    expect(runtime.getStatus()).toMatchObject({
      mode: "RULES_ONLY",
      reasonCode: "CIRCUIT_OPEN",
      retryAllowed: true,
      consecutiveFailures: 2,
    });
  } finally {
    jest.useRealTimers();
  }
});

it("rejects a stale aborted result and releases model memory", async () => {
  let resolveCompletion!: (value: { text: string }) => void;
  const release = jest.fn();
  const runtime = runtimeWith({
    completion: jest.fn(
      () =>
        new Promise<{ text: string }>(
          (resolve) => (resolveCompletion = resolve),
        ),
    ),
    release,
  });
  await runtime.initialize();
  const cancellation = new AbortController();
  const pending = runtime.generateStructured("question", "grammar", {
    turnId: "stale-turn",
    deadlineAt: Date.now() + 8_000,
    signal: cancellation.signal,
  });
  const rejection = expect(pending).rejects.toThrow("TURN_CANCELLED");
  await flushModelQueue();
  cancellation.abort();
  resolveCompletion({ text: "stale" });
  await rejection;
  expect(runtime.getStatus()).toMatchObject({
    mode: "AI_READY",
    consecutiveFailures: 0,
  });

  await runtime.release("RELEASED");
  expect(release).toHaveBeenCalledTimes(1);
  expect(runtime.getStatus()).toMatchObject({
    mode: "RULES_ONLY",
    reasonCode: "RELEASED",
  });
});

it("does not start inference for an already cancelled turn", async () => {
  const completion = jest.fn(async () => ({ text: "should not run" }));
  const runtime = runtimeWith({ completion });
  await runtime.initialize();
  const cancellation = new AbortController();
  cancellation.abort();

  await expect(
    runtime.generateStructured("cancelled", "grammar", {
      turnId: "already-cancelled",
      deadlineAt: Date.now() + 8_000,
      signal: cancellation.signal,
    }),
  ).rejects.toThrow("TURN_CANCELLED");
  expect(completion).not.toHaveBeenCalled();
});
