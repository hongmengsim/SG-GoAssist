import test from "node:test";
import assert from "node:assert/strict";
import { startProblems } from "../src/guard.js";
import { readConfig } from "../src/config.js";

test("the director does not start unless it is asked to", () => {
  assert.equal(startProblems({}).length, 1);
  assert.equal(startProblems({ DEMO_DIRECTOR: "yes" }).length, 1);
  assert.deepEqual(startProblems({ DEMO_DIRECTOR: "on" }), []);
});

test("it never starts in production, even when asked", () => {
  const problems = startProblems({
    DEMO_DIRECTOR: "on",
    NODE_ENV: "production",
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /production/);
});

const agents = JSON.stringify([
  { busId: "AV-095-01", url: "http://localhost:8780/", code: "c1" },
  { busId: "AV-095-02", url: "http://localhost:8781", code: "c2" },
]);

test("the settings come from the environment, and the buses are numbered in order", () => {
  const config = readConfig({ DEMO_AGENTS: agents, OPERATOR_API_TOKEN: "t" });
  assert.deepEqual(
    config.agents.map((agent) => [agent.busId, agent.label, agent.url]),
    [
      ["AV-095-01", "BUS 1", "http://localhost:8780"],
      ["AV-095-02", "BUS 2", "http://localhost:8781"],
    ],
  );
  assert.equal(config.operatorToken, "t");
  assert.equal(config.host, "127.0.0.1", "loopback by default");
  assert.equal(config.port, 5190);
});

test("a missing or malformed agent list is refused with a clear reason", () => {
  assert.throws(() => readConfig({}), /DEMO_AGENTS/);
  assert.throws(() => readConfig({ DEMO_AGENTS: "nope" }), /valid JSON/);
  assert.throws(() => readConfig({ DEMO_AGENTS: "[]" }), /non-empty/);
  assert.throws(
    () => readConfig({ DEMO_AGENTS: JSON.stringify([{ busId: "B" }]) }),
    /url is required/,
  );
  assert.throws(
    () =>
      readConfig({
        DEMO_AGENTS: JSON.stringify([
          { busId: "B", url: "ftp://x", code: "c" },
        ]),
      }),
    /http or https/,
  );
});
