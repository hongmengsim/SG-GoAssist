import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const modelName = "Qwen3-0.6B-Q8_0.gguf";
const revision = "1eaf4d9657fe65ad10a51eab76a8db5b363bddaa";
const expectedSha256 =
  "9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031";
const expectedBytes = 639446688;
const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(scriptRoot, "../packages/app/.model-cache");
const outputPath = path.join(outputDir, modelName);
const temporaryPath = `${outputPath}.partial`;
const modelUrl = `https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/${revision}/${modelName}`;

await mkdir(outputDir, { recursive: true });
if (await validExistingModel(outputPath)) {
  process.stdout.write(`Verified existing ${modelName}.\n`);
  process.exit(0);
}

await rm(temporaryPath, { force: true });
const response = await fetch(modelUrl, { redirect: "follow" });
if (!response.ok || !response.body) {
  throw new Error(`Model download failed with HTTP ${response.status}.`);
}
await pipeline(
  Readable.fromWeb(response.body),
  createWriteStream(temporaryPath),
);
if (!(await validExistingModel(temporaryPath))) {
  await rm(temporaryPath, { force: true });
  throw new Error(
    "Downloaded model did not match the pinned size and SHA-256.",
  );
}
await rm(outputPath, { force: true });
await rename(temporaryPath, outputPath);
process.stdout.write(`Downloaded and verified ${modelName}.\n`);

async function validExistingModel(filePath) {
  try {
    if ((await stat(filePath)).size !== expectedBytes) return false;
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(filePath)) hash.update(chunk);
    return hash.digest("hex") === expectedSha256;
  } catch {
    return false;
  }
}
