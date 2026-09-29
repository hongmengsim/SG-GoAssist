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
    onChange: (listener) => {
      listeners.add(listener);
    },
  };
}
