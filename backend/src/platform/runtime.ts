/**
 * True when running under the node test runner. Test runs get in-memory storage and no rate
 * limit, which a production process must never do because of a stray environment variable.
 */
export function isTestRun(
  env: { [name: string]: string | undefined } = process.env,
): boolean {
  return Boolean(env.NODE_TEST_CONTEXT) && env.NODE_ENV !== "production";
}
