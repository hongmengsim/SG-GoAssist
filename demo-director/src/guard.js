// The demo director can move buses and inject faults, so it only starts when it is asked to, and never in
// production. (The things it controls are separately off by default: the agents' control surface exists
// only on simulated buses, or on a real bus started with --demo-movement.)

/** Reasons the director must not start, from the environment. An empty list means it may. */
export function startProblems(env) {
  const problems = [];
  if (env.DEMO_DIRECTOR !== "on")
    problems.push(
      "DEMO_DIRECTOR=on is not set: the demo director only runs when asked to",
    );
  if (env.NODE_ENV === "production")
    problems.push("refused in production (NODE_ENV=production)");
  return problems;
}
