import {
  createRouteMonitoringState,
  isWalkingLocationAccuracyLimited,
  updateRouteMonitoring,
} from "../src/routing/routeMonitor";

it("requires three reliable observations before declaring off-route", () => {
  let state = createRouteMonitoringState();
  const observation = {
    accuracyMeters: 10,
    distanceToDestinationMeters: 200,
    distanceToRouteMeters: 70,
  };

  state = updateRouteMonitoring(state, observation);
  expect(state.offRoute).toBe(false);
  state = updateRouteMonitoring(state, observation);
  expect(state.offRoute).toBe(false);
  state = updateRouteMonitoring(state, observation);
  expect(state.offRoute).toBe(true);
  expect(state.offRouteEpisode).toBe(1);
});

it("does not declare off-route when GPS accuracy exceeds the threshold", () => {
  let state = createRouteMonitoringState();
  for (let index = 0; index < 5; index += 1) {
    state = updateRouteMonitoring(state, {
      accuracyMeters: 80,
      distanceToDestinationMeters: 200,
      distanceToRouteMeters: 100,
    });
  }

  expect(state.offRoute).toBe(false);
  expect(isWalkingLocationAccuracyLimited(80)).toBe(true);
});

it("requires stable accurate arrival observations", () => {
  let state = createRouteMonitoringState();
  const nearDestination = {
    accuracyMeters: 8,
    distanceToDestinationMeters: 18,
    distanceToRouteMeters: 3,
  };

  state = updateRouteMonitoring(state, nearDestination);
  expect(state.arrived).toBe(false);
  state = updateRouteMonitoring(state, nearDestination);
  expect(state.arrived).toBe(true);
});

it("rejects a single noisy arrival sample", () => {
  let state = createRouteMonitoringState();
  state = updateRouteMonitoring(state, {
    accuracyMeters: 70,
    distanceToDestinationMeters: 5,
    distanceToRouteMeters: 5,
  });
  state = updateRouteMonitoring(state, {
    accuracyMeters: 8,
    distanceToDestinationMeters: 120,
    distanceToRouteMeters: 3,
  });

  expect(state.arrived).toBe(false);
  expect(state.arrivalObservationCount).toBe(0);
});
