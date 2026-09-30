import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { installAsyncErrorHandling } from "../routes/asyncErrors";

function get(port: number, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    http
      .get({ port, path, host: "127.0.0.1", timeout: 1500 }, (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      })
      .on("timeout", function (this: http.ClientRequest) {
        this.destroy(new Error("no response"));
      })
      .on("error", reject);
  });
}

async function withApp(work: (port: number) => Promise<void>): Promise<void> {
  const app = express();
  app.get("/rejects", async () => {
    await Promise.resolve();
    throw new Error("database away");
  });
  app.get("/throws", () => {
    throw new Error("sync failure");
  });
  app.get("/fine", async (_req, res) => {
    res.json({ ok: true });
  });
  app.use(
    (
      _error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(500).json({ error: "Internal server error" });
    },
  );
  const server = http.createServer(app);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    await work((server.address() as { port: number }).port);
  } finally {
    await new Promise((done) => server.close(done));
  }
}

test("a handler that rejects reaches the error middleware and the process stays up", async () => {
  installAsyncErrorHandling();
  installAsyncErrorHandling(); // more than once is harmless
  let unhandled = 0;
  const count = () => {
    unhandled += 1;
  };
  process.on("unhandledRejection", count);
  try {
    await withApp(async (port) => {
      assert.equal(await get(port, "/rejects"), 500);
      assert.equal(await get(port, "/throws"), 500);
      assert.equal(await get(port, "/fine"), 200);
    });
    await new Promise((done) => setImmediate(done));
    assert.equal(unhandled, 0, "no rejection may be left unhandled");
  } finally {
    process.off("unhandledRejection", count);
  }
});
