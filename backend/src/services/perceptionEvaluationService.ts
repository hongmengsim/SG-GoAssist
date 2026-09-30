import {
  PerceptionEvaluationMetrics,
  PerceptionEvaluationSample,
  PerceptionNeedClass,
} from "@buspass/shared";
import { getOperationsData } from "./operationsData";

const CLASSES: PerceptionNeedClass[] = [
  "WHEELCHAIR",
  "WALKING_AID",
  "STROLLER",
  "LUGGAGE",
  "PASSENGER_IN_BOARDING_ZONE",
];
/** The metrics read at most this many samples (the retention policy keeps far fewer). */
const METRICS_SAMPLE_LIMIT = 100_000;
const CLASS_SET = new Set<PerceptionNeedClass>(CLASSES);

export class PerceptionEvaluationValidationError extends Error {}

export function recordPerceptionEvaluation(
  input: PerceptionEvaluationSample,
): PerceptionEvaluationSample {
  const normalized = validateAndNormalize(input);
  const samples = getOperationsData().perceptionSamples;
  const existing = samples.get(normalized.sampleId);
  if (existing) return existing;
  samples.put(normalized);
  return normalized;
}

export function getPerceptionEvaluationMetrics(): PerceptionEvaluationMetrics {
  const samples =
    getOperationsData().perceptionSamples.list(METRICS_SAMPLE_LIMIT);
  const classes = CLASSES.map((className) => {
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    for (const sample of samples) {
      const predicted = sample.predicted.includes(className);
      const actual = sample.actual.includes(className);
      if (predicted && actual) truePositives++;
      else if (predicted) falsePositives++;
      else if (actual) falseNegatives++;
    }
    return {
      className,
      truePositives,
      falsePositives,
      falseNegatives,
      precision: ratio(truePositives, truePositives + falsePositives),
      recall: ratio(truePositives, truePositives + falseNegatives),
    };
  });
  const truePositives = classes.reduce(
    (sum, item) => sum + item.truePositives,
    0,
  );
  const falsePositives = classes.reduce(
    (sum, item) => sum + item.falsePositives,
    0,
  );
  const falseNegatives = classes.reduce(
    (sum, item) => sum + item.falseNegatives,
    0,
  );
  return {
    sampleCount: samples.length,
    microPrecision: ratio(truePositives, truePositives + falsePositives),
    microRecall: ratio(truePositives, truePositives + falseNegatives),
    classes,
  };
}

function validateAndNormalize(
  input: PerceptionEvaluationSample,
): PerceptionEvaluationSample {
  if (!input.sampleId?.trim()) {
    throw new PerceptionEvaluationValidationError("sampleId is required");
  }
  if (!Array.isArray(input.predicted) || !Array.isArray(input.actual)) {
    throw new PerceptionEvaluationValidationError(
      "predicted and actual must be arrays",
    );
  }
  if (
    [...input.predicted, ...input.actual].some(
      (className) => !CLASS_SET.has(className),
    )
  ) {
    throw new PerceptionEvaluationValidationError("Unknown perception class");
  }
  if (Number.isNaN(Date.parse(input.observedAt))) {
    throw new PerceptionEvaluationValidationError(
      "observedAt must be an ISO timestamp",
    );
  }
  if (
    input.confidence &&
    Object.entries(input.confidence).some(
      ([className, confidence]) =>
        !CLASS_SET.has(className as PerceptionNeedClass) ||
        typeof confidence !== "number" ||
        !Number.isFinite(confidence) ||
        confidence < 0 ||
        confidence > 1,
    )
  ) {
    throw new PerceptionEvaluationValidationError(
      "confidence values must be between 0 and 1",
    );
  }
  return {
    ...input,
    sampleId: input.sampleId.trim(),
    predicted: [...new Set(input.predicted)],
    actual: [...new Set(input.actual)],
    observedAt: new Date(input.observedAt).toISOString(),
  };
}

function ratio(numerator: number, denominator: number): number | undefined {
  return denominator === 0 ? undefined : numerator / denominator;
}
