// Words shown to the operator for the values in contracts/. Meaning is always carried by
// these words (and a shape mark, see html.js), never by colour alone.

export const MOVEMENT = {
  TRAVELLING_TO_STOP: "Travelling to stop",
  WAITING_FOR_BAY: "Waiting for bay",
  POSITIONED_AT_STOP: "Positioned at stop",
  DEPARTING: "Departing",
};

export const RAMP = {
  STOWED: "Stowed",
  DEPLOYMENT_REQUESTED: "Deployment requested",
  DEPLOYING: "Deploying",
  DEPLOYED: "Deployed",
  HALTED: "Halted",
};

export const ZONE = {
  CLEAR: "Clear",
  OCCUPIED: "Occupied",
  UNCERTAIN: "Uncertain",
};

export const PERMISSION = { CONTINUE: "Continue", HALT: "Halt" };

export const HALT_REASON = {
  OBJECT_IN_ZONE: "Object in the ramp zone",
  TOF_BLOCKED: "ToF beam blocked",
  TOF_UNAVAILABLE: "ToF sensor unavailable",
  TOF_NOT_CALIBRATED: "ToF not calibrated",
  CAMERA_DEGRADED: "Camera degraded",
  SENSORS_DISAGREE: "Camera and ToF disagree",
  BUS_NOT_AT_BOARDING_POSITION: "Bus not at boarding position",
  WAITING_FOR_BAY: "Waiting for the bay",
  NO_ACCEPTED_REQUEST: "No accepted request",
  OPERATOR_HALT: "Operator halt",
  DEPLOYMENT_TIMEOUT: "Deployment timed out",
};

export const HELP_REASON = {
  DEPLOYMENT_TIMEOUT: "Deployment timed out",
  OBSTRUCTION_PERSISTENT: "Obstruction will not clear",
  SENSOR_UNAVAILABLE: "Sensor unavailable",
  OTHER: "Other problem",
};

export const TOF = {
  BEAM_CLEAR: "Beam clear",
  BLOCKED: "Blocked",
  CHECKING: "Checking",
  UNCALIBRATED: "Not calibrated",
  UNKNOWN: "Unknown",
};

// What the passenger's app shows for each request status.
export const PASSENGER_SEES = {
  SENDING: "Request submitted",
  ACKNOWLEDGED: "Confirmed by bus",
  CANCELLED: "Cancelled (exception)",
  FAILED: "Cannot fulfil (exception)",
  // Not a backend request status: the mock marks a finished request this way.
  COMPLETED: "Confirmed by bus",
};

export const OPEN_REQUEST_STATUSES = new Set(["SENDING", "ACKNOWLEDGED"]);

export const ASSISTANCE = {
  WHEELCHAIR_RAMP: "Ramp",
  EXTRA_BOARDING_TIME: "Extra boarding time",
  BUS_AUDIO_IDENTIFICATION: "Audio identification",
};

export function word(map, key, fallback) {
  if (key !== undefined && key !== null && Object.hasOwn(map, key))
    return map[key];
  return fallback ?? humanize(key);
}

/** "BAY_ENTRY_GRANTED" becomes "Bay entry granted". Unknown values stay readable. */
export function humanize(value) {
  if (value === undefined || value === null || value === "") return "None";
  const text = String(value).replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function reasonsText(reasons) {
  return (reasons ?? []).map((reason) => word(HALT_REASON, reason)).join(", ");
}
