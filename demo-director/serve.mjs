#!/usr/bin/env node
// DEMO CONTROL. Not the operator console. Starts only with DEMO_DIRECTOR=on, never in production.
//   DEMO_DIRECTOR=on DEMO_AGENTS='[{"busId":"AV-095-01","url":"http://localhost:8780","code":"..."}, ...]' \
//   OPERATOR_API_TOKEN=... DEMO_BACKEND_URL=http://localhost:3000 node serve.mjs
import { readConfig } from "./src/config.js";
import { createDirector } from "./src/director.js";
import { startProblems } from "./src/guard.js";
import { createDirectorServer } from "./src/server.js";

const problems = startProblems(process.env);
if (problems.length > 0) {
  console.error("The demo director will not start:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(2);
}

let config;
try {
  config = readConfig(process.env);
} catch (error) {
  console.error(
    `Configuration error: ${error instanceof Error ? error.message : error}`,
  );
  process.exit(2);
}

const director = createDirector({ config });
const server = createDirectorServer({ director });
server.listen(config.port, config.host, () => {
  director.start();
  console.log(
    `DEMO CONTROL (not the operator console): http://${config.host}:${config.port}/  ·  buses: ${config.agents.map((agent) => agent.busId).join(", ")}`,
  );
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    director.stop();
    server.close(() => process.exit(0));
  });
