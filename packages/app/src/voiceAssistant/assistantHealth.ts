import type {
  AssistantHealthSnapshot,
  AssistantTurnResult,
} from "./types";

export class AssistantHealthMonitor {
  private snapshot: AssistantHealthSnapshot = emptySnapshot();

  recordTurn(turn: AssistantTurnResult) {
    this.snapshot.turns += 1;
    increment(
      this.snapshot.resolutionCounts,
      turn.resolutionKind ?? "COMMAND",
    );
    if (turn.fallbackReason) {
      increment(this.snapshot.fallbackCounts, turn.fallbackReason);
    }
    const latency = turn.latencyMs ?? 0;
    this.snapshot.latencyBands[
      latency < 500 ? "FAST" : latency < 6_000 ? "NORMAL" : "SLOW"
    ] += 1;
  }

  recordModelFailure(reason: string) {
    this.snapshot.modelFailures += 1;
    increment(this.snapshot.fallbackCounts, reason);
  }

  recordConfirmationRejection() {
    this.snapshot.confirmationRejections += 1;
  }

  recordHelpfulness(helpful: boolean) {
    if (helpful) this.snapshot.helpful += 1;
    else this.snapshot.unhelpful += 1;
  }

  getSnapshot(): AssistantHealthSnapshot {
    return {
      ...this.snapshot,
      resolutionCounts: { ...this.snapshot.resolutionCounts },
      fallbackCounts: { ...this.snapshot.fallbackCounts },
      latencyBands: { ...this.snapshot.latencyBands },
    };
  }

  reset() {
    this.snapshot = emptySnapshot();
  }
}

function emptySnapshot(): AssistantHealthSnapshot {
  return {
    turns: 0,
    resolutionCounts: {},
    fallbackCounts: {},
    latencyBands: { FAST: 0, NORMAL: 0, SLOW: 0 },
    modelFailures: 0,
    confirmationRejections: 0,
    helpful: 0,
    unhelpful: 0,
  };
}

function increment(record: Record<string, number>, key: string) {
  record[key] = (record[key] ?? 0) + 1;
}
