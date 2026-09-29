// The data source for mock mode: a simulated world that ticks by itself. A live source with the
// same shape (state, revision, actionsFor, onChange) is added in the next step.

import { createMockWorld } from "./world.js";

const TICK_MS = 500;

export function createMockSource({ setIntervalFn = setInterval } = {}) {
  const world = createMockWorld();
  let revision = 0;
  const listeners = new Set();
  const changed = () => {
    revision += 1;
    listeners.forEach((listener) => listener());
  };

  setIntervalFn(() => {
    world.tick(TICK_MS / 1000);
    changed();
  }, TICK_MS);

  return {
    mode: "mock",
    world,
    get state() {
      return world.state;
    },
    get revision() {
      return revision;
    },
    actionsFor: (busId) => world.actionsFor(busId),
    caseActionsFor: (caseId) => world.caseActionsFor(caseId),
    async perform(action, context = {}) {
      const { busId } = context;
      if (action === "proceed") world.proceedNext("OPERATOR");
      else if (action === "deploy") world.deploy(busId, "OPERATOR");
      else if (action === "halt") world.halt(busId, "OPERATOR");
      else if (action === "cancel") world.cancelRequest(busId, "OPERATOR");
      else if (action === "case")
        world.caseAction(context.caseId, context.action);
      else return { ok: false, message: "Unknown action." };
      changed();
      return { ok: true, message: "Done (mock)." };
    },
    start() {},
    onChange: (listener) => {
      listeners.add(listener);
    },
  };
}
