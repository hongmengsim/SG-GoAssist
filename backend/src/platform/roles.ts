/**
 * Which workloads one process serves (scalability method SM1). `GOASSIST_ROLES` is a comma
 * list of `passenger` (app APIs: assistance requests, location, bus stops, journeys, assistant)
 * and `operations` (`/api/operations`: buses, bays, cases, actuators, audit). `fleet` and
 * `operator` are accepted as aliases of `operations`: splitting those two needs the operations
 * router divided, which is designed but not done. Unset means every role, as today.
 */

export type Role = "passenger" | "operations";

const ALIASES: Record<string, Role> = {
  passenger: "passenger",
  operations: "operations",
  fleet: "operations",
  operator: "operations",
};

export function parseRoles(value: string | undefined): Set<Role> {
  if (value === undefined) return new Set<Role>(["passenger", "operations"]);
  const names = value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length === 0)
    throw new Error("GOASSIST_ROLES needs at least one role");
  const roles = new Set<Role>();
  for (const name of names) {
    const role = ALIASES[name.toLowerCase()];
    if (!role) {
      throw new Error(
        `Unknown role "${name}" in GOASSIST_ROLES (use passenger, operations, fleet or operator)`,
      );
    }
    roles.add(role);
  }
  return roles;
}
