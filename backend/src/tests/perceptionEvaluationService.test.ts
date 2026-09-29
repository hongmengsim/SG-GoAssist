import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  PerceptionEvaluationValidationError,
  getPerceptionEvaluationMetrics,
  recordPerceptionEvaluation,
} from "../services/perceptionEvaluationService";
import { configureOperationsStore } from "../services/operationsStore";

let dataDirectory = "";

beforeEach(() => {
  dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "goassist-perception-"));
  configureOperationsStore(dataDirectory);
});

afterEach(() => {
  fs.rmSync(dataDirectory, { recursive: true, force: true });
});

test("perception trials report reproducible precision and recall", () => {
  record("sample-1", ["WHEELCHAIR"], ["WHEELCHAIR"]);
  record("sample-2", ["WHEELCHAIR", "LUGGAGE"], ["LUGGAGE"]);
  record("sample-3", [], ["WALKING_AID"]);

  const metrics = getPerceptionEvaluationMetrics();
  assert.equal(metrics.sampleCount, 3);
  assert.equal(metrics.microPrecision, 2 / 3);
  assert.equal(metrics.microRecall, 2 / 3);
  assert.deepEqual(
    metrics.classes.find((item) => item.className === "WHEELCHAIR"),
    {
      className: "WHEELCHAIR",
      truePositives: 1,
      falsePositives: 1,
      falseNegatives: 0,
      precision: 0.5,
      recall: 1,
    },
  );
});

test("evaluation samples are idempotent and reject unknown classes", () => {
  const first = record("same-sample", ["STROLLER"], ["STROLLER"]);
  const duplicate = record("same-sample", ["STROLLER"], ["STROLLER"]);
  assert.deepEqual(duplicate, first);
  assert.equal(getPerceptionEvaluationMetrics().sampleCount, 1);

  assert.throws(
    () =>
      recordPerceptionEvaluation({
        sampleId: "invalid",
        predicted: ["FACE" as never],
        actual: [],
        observedAt: new Date().toISOString(),
      }),
    PerceptionEvaluationValidationError,
  );
});

function record(
  sampleId: string,
  predicted: Parameters<typeof recordPerceptionEvaluation>[0]["predicted"],
  actual: Parameters<typeof recordPerceptionEvaluation>[0]["actual"],
) {
  return recordPerceptionEvaluation({
    sampleId,
    predicted,
    actual,
    observedAt: new Date().toISOString(),
  });
}
