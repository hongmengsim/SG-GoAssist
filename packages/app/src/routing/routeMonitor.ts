export type RouteMonitoringState = {
  arrivalObservationCount: number;
  arrived: boolean;
  offRoute: boolean;
  offRouteEpisode: number;
  offRouteObservationCount: number;
};

export type RouteMonitoringObservation = {
  accuracyMeters?: number;
  distanceToDestinationMeters: number;
  distanceToRouteMeters: number;
};

const offRouteThresholdMeters = 45;
const arrivalThresholdMeters = 30;
const requiredOffRouteObservations = 3;
const requiredArrivalObservations = 2;

export function createRouteMonitoringState(): RouteMonitoringState {
  return {
    arrivalObservationCount: 0,
    arrived: false,
    offRoute: false,
    offRouteEpisode: 0,
    offRouteObservationCount: 0,
  };
}

export function updateRouteMonitoring(
  state: RouteMonitoringState,
  observation: RouteMonitoringObservation,
): RouteMonitoringState {
  const accuracy = observation.accuracyMeters;
  const reliableForOffRoute =
    accuracy === undefined || accuracy <= offRouteThresholdMeters;
  const reliableForArrival =
    accuracy === undefined || accuracy <= arrivalThresholdMeters;
  const offRouteCandidate =
    reliableForOffRoute &&
    observation.distanceToRouteMeters >
      Math.max(offRouteThresholdMeters, (accuracy ?? 0) * 1.5);
  const arrivalCandidate =
    reliableForArrival &&
    observation.distanceToDestinationMeters <= arrivalThresholdMeters;

  const offRouteObservationCount = offRouteCandidate
    ? Math.min(
        requiredOffRouteObservations,
        state.offRouteObservationCount + 1,
      )
    : 0;
  const nextOffRoute = offRouteCandidate
    ? state.offRoute ||
      offRouteObservationCount >= requiredOffRouteObservations
    : false;
  const arrivalObservationCount = arrivalCandidate
    ? Math.min(
        requiredArrivalObservations,
        state.arrivalObservationCount + 1,
      )
    : 0;

  return {
    arrivalObservationCount,
    arrived:
      state.arrived ||
      arrivalObservationCount >= requiredArrivalObservations,
    offRoute: nextOffRoute,
    offRouteEpisode:
      !state.offRoute && nextOffRoute
        ? state.offRouteEpisode + 1
        : state.offRouteEpisode,
    offRouteObservationCount,
  };
}

export function isWalkingLocationAccuracyLimited(accuracyMeters?: number) {
  return accuracyMeters !== undefined && accuracyMeters > offRouteThresholdMeters;
}
