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
import {
  closeOperationsData,
  configureOperationsData,
} from "../services/operationsData";

let dataDirectory = "";

beforeEach(async () => {
  dataDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "goassist-perception-"),
  );
  await configureOperationsData(dataDirectory, { retentionTimer: false });
});

afterEach(() => {
  closeOperationsData();
  fs.rmSync(dataDirectory, { recursive: true, force: true });
});

test("perception trials report reproducible precision and recall", async () => {
  await record("sample-1", ["WHEELCHAIR"], ["WHEELCHAIR"]);
  await record("sample-2", ["WHEELCHAIR", "LUGGAGE"], ["LUGGAGE"]);
  await record("sample-3", [], ["WALKING_AID"]);

  const metrics = await getPerceptionEvaluationMetrics();
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

test("evaluation samples are idempotent and reject unknown classes", async () => {
  const first = await record("same-sample", ["STROLLER"], ["STROLLER"]);
  const duplicate = await record("same-sample", ["STROLLER"], ["STROLLER"]);
  assert.deepEqual(duplicate, first);
  assert.equal((await getPerceptionEvaluationMetrics()).sampleCount, 1);

  await assert.rejects(
    async () =>
      await recordPerceptionEvaluation({
        sampleId: "invalid",
        predicted: ["FACE" as never],
        actual: [],
        observedAt: new Date().toISOString(),
      }),
    PerceptionEvaluationValidationError,
  );
});

async function record(
  sampleId: string,
  predicted: Parameters<typeof recordPerceptionEvaluation>[0]["predicted"],
  actual: Parameters<typeof recordPerceptionEvaluation>[0]["actual"],
) {
  return await recordPerceptionEvaluation({
    sampleId,
    predicted,
    actual,
    observedAt: new Date().toISOString(),
  });
}
