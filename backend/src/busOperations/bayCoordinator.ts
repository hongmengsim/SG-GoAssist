import type { BayStatus, BusStatus } from "@buspass/shared";

/** One bay per stop in this prototype. */
export const DEFAULT_BAY_ID = "BAY-1";

export function emptyBay(stopCode: string, nowIso: string): BayStatus {
  return {
    stopCode,
    bayId: DEFAULT_BAY_ID,
    occupantBusId: null,
    waitingBusIds: [],
    grantedBusId: null,
    updatedAt: nowIso,
  };
}

export type BayReportDecision =
  | { accepted: true; bay: BayStatus; changed: boolean }
  | { accepted: false; reason: string };

export type BayGrantDecision =
  { granted: true; bay: BayStatus } | { granted: false; reason: string };

function sameBay(a: BayStatus, b: BayStatus): boolean {
  return (
    a.occupantBusId === b.occupantBusId &&
    a.grantedBusId === b.grantedBusId &&
    a.waitingBusIds.length === b.waitingBusIds.length &&
    a.waitingBusIds.every((id, index) => id === b.waitingBusIds[index])
  );
}

/**
 * Pure bay rules. A bus becomes the occupant only by its own POSITIONED_AT_STOP report,
 * and only when the bay is free and either the controller granted it or nobody is queued.
 * A departure frees the bay but never grants the next bus; only grantNext does that.
 */
export function applyBusReport(
  bay: BayStatus,
  status: BusStatus,
  nowIso: string,
): BayReportDecision {
  const busId = status.busId;
  let occupant = bay.occupantBusId;
  let granted = bay.grantedBusId;
  let waiting = bay.waitingBusIds.filter((id) => id !== busId);
  const wasQueued = waiting.length !== bay.waitingBusIds.length;

  if (occupant === busId && status.movement !== "POSITIONED_AT_STOP") {
    occupant = null;
  }
  if (
    granted === busId &&
    status.movement !== "POSITIONED_AT_STOP" &&
    status.movement !== "WAITING_FOR_BAY"
  ) {
    granted = null;
  }

  if (status.movement === "WAITING_FOR_BAY") {
    if (granted !== busId) {
      waiting = wasQueued ? [...bay.waitingBusIds] : [...waiting, busId];
    }
  }

  if (status.movement === "POSITIONED_AT_STOP" && occupant !== busId) {
    if (occupant !== null) {
      return {
        accepted: false,
        reason: `Bay is occupied by ${occupant}; wait for a grant`,
      };
    }
    const mayEnter =
      granted === busId ||
      (granted === null && !wasQueued && waiting.length === 0);
    if (!mayEnter) {
      return {
        accepted: false,
        reason: "Bay entry has not been granted to this bus",
      };
    }
    occupant = busId;
    if (granted === busId) granted = null;
  }

  const next: BayStatus = {
    ...bay,
    occupantBusId: occupant,
    waitingBusIds: waiting,
    grantedBusId: granted,
    updatedAt: nowIso,
  };
  const changed = !sameBay(bay, next);
  return { accepted: true, bay: changed ? next : bay, changed };
}

/** The controller sends the first waiting bus into the free bay. */
export function grantNext(bay: BayStatus, nowIso: string): BayGrantDecision {
  if (bay.occupantBusId !== null) {
    return {
      granted: false,
      reason: `Bay is occupied by ${bay.occupantBusId}`,
    };
  }
  if (bay.grantedBusId !== null) {
    return {
      granted: false,
      reason: `Entry already granted to ${bay.grantedBusId}`,
    };
  }
  const [first, ...rest] = bay.waitingBusIds;
  if (first === undefined) {
    return { granted: false, reason: "No bus is waiting for the bay" };
  }
  return {
    granted: true,
    bay: {
      ...bay,
      waitingBusIds: rest,
      grantedBusId: first,
      updatedAt: nowIso,
    },
  };
}
