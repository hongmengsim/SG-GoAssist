import type { RoutingCoordinate, WalkingRoute } from "./RoutingProvider";

export type WalkingRouteProgress = {
  activeStepIndex: number;
  completedDistanceMeters: number;
  distanceToNextManeuverMeters: number;
  distanceToRouteMeters: number;
  remainingDistanceMeters: number;
  remainingDurationSeconds: number;
};

export type WalkingRouteProgressOptions = {
  accuracyMeters?: number;
  headingDegrees?: number;
  previousProgress?: WalkingRouteProgress | null;
};

const earthRadiusMeters = 6_371_000;

export function distanceBetweenRoutingCoordinates(
  a: RoutingCoordinate,
  b: RoutingCoordinate,
) {
  const latitudeDelta = ((b.latitude - a.latitude) * Math.PI) / 180;
  const longitudeDelta = ((b.longitude - a.longitude) * Math.PI) / 180;
  const meanLatitude = (((a.latitude + b.latitude) / 2) * Math.PI) / 180;
  const x = longitudeDelta * Math.cos(meanLatitude) * earthRadiusMeters;
  const y = latitudeDelta * earthRadiusMeters;
  return Math.hypot(x, y);
}

function localPoint(
  coordinate: RoutingCoordinate,
  origin: RoutingCoordinate,
) {
  const meanLatitude = (((coordinate.latitude + origin.latitude) / 2) * Math.PI) / 180;
  return {
    x:
      ((coordinate.longitude - origin.longitude) * Math.PI *
        Math.cos(meanLatitude) *
        earthRadiusMeters) /
      180,
    y:
      ((coordinate.latitude - origin.latitude) * Math.PI *
        earthRadiusMeters) /
      180,
  };
}

export function calculateWalkingRouteProgress(
  route: WalkingRoute,
  currentLocation: RoutingCoordinate,
  options: WalkingRouteProgressOptions = {},
): WalkingRouteProgress {
  const geometry = route.geometry;
  if (geometry.length < 2) {
    return {
      activeStepIndex: 0,
      completedDistanceMeters: 0,
      distanceToNextManeuverMeters: route.distanceMeters,
      distanceToRouteMeters: distanceBetweenRoutingCoordinates(
        currentLocation,
        geometry[0] ?? currentLocation,
      ),
      remainingDistanceMeters: route.distanceMeters,
      remainingDurationSeconds: route.durationSeconds,
    };
  }

  const cumulativeDistances = [0];
  for (let index = 1; index < geometry.length; index += 1) {
    cumulativeDistances.push(
      cumulativeDistances[index - 1] +
        distanceBetweenRoutingCoordinates(geometry[index - 1], geometry[index]),
    );
  }
  const rawTotalDistance = cumulativeDistances.at(-1) || 1;
  let closestSegmentIndex = 0;
  let closestSegmentProgress = 0;
  let distanceToRouteMeters = Number.POSITIVE_INFINITY;
  let closestSegmentScore = Number.POSITIVE_INFINITY;

  for (let index = 0; index < geometry.length - 1; index += 1) {
    const segmentStart = geometry[index];
    const start = localPoint(segmentStart, segmentStart);
    const end = localPoint(geometry[index + 1], segmentStart);
    const current = localPoint(currentLocation, segmentStart);
    const segmentLengthSquared = end.x * end.x + end.y * end.y;
    const progress =
      segmentLengthSquared > 0
        ? Math.max(
            0,
            Math.min(
              1,
              ((current.x - start.x) * end.x +
                (current.y - start.y) * end.y) /
                segmentLengthSquared,
            ),
          )
        : 0;
    const projectedX = end.x * progress;
    const projectedY = end.y * progress;
    const distance = Math.hypot(
      current.x - projectedX,
      current.y - projectedY,
    );
    const segmentHeading =
      ((Math.atan2(end.x, end.y) * 180) / Math.PI + 360) % 360;
    const headingDifference =
      options.headingDegrees === undefined
        ? 0
        : Math.abs(
            ((segmentHeading - options.headingDegrees + 540) % 360) - 180,
          );
    const headingPenalty =
      options.headingDegrees === undefined ||
      (options.accuracyMeters !== undefined && options.accuracyMeters > 50)
        ? 0
        : headingDifference > 135
          ? 50
          : headingDifference > 90
            ? 25
            : 0;
    const candidateScore = distance + headingPenalty;
    distanceToRouteMeters = Math.min(distanceToRouteMeters, distance);
    if (candidateScore < closestSegmentScore) {
      closestSegmentScore = candidateScore;
      closestSegmentIndex = index;
      closestSegmentProgress = progress;
    }
  }

  const segmentDistance =
    cumulativeDistances[closestSegmentIndex + 1] -
    cumulativeDistances[closestSegmentIndex];
  const completedRawDistance =
    cumulativeDistances[closestSegmentIndex] +
    segmentDistance * closestSegmentProgress;
  const completionRatio = Math.max(
    0,
    Math.min(1, completedRawDistance / rawTotalDistance),
  );
  const candidateCompletedDistanceMeters = route.distanceMeters * completionRatio;
  const completedDistanceMeters = Math.max(
    options.previousProgress?.completedDistanceMeters ?? 0,
    candidateCompletedDistanceMeters,
  );
  const stableCompletionRatio = Math.max(
    0,
    Math.min(1, completedDistanceMeters / Math.max(1, route.distanceMeters)),
  );
  const remainingDistanceMeters = Math.max(
    0,
    route.distanceMeters - completedDistanceMeters,
  );

  let activeStepIndex = 0;
  route.steps.forEach((step, index) => {
    if (
      step.geometryIndex !== undefined &&
      step.geometryIndex <= closestSegmentIndex + 1
    ) {
      activeStepIndex = index;
    }
  });
  activeStepIndex = Math.min(
    activeStepIndex,
    Math.max(0, route.steps.length - 2),
  );
  activeStepIndex = Math.max(
    options.previousProgress?.activeStepIndex ?? 0,
    activeStepIndex,
  );
  if (
    options.accuracyMeters !== undefined &&
    options.accuracyMeters > 45 &&
    options.previousProgress
  ) {
    activeStepIndex = options.previousProgress.activeStepIndex;
  }

  const nextStepGeometryIndex =
    route.steps[activeStepIndex + 1]?.geometryIndex ?? geometry.length - 1;
  const nextStepRawDistance =
    cumulativeDistances[
      Math.max(0, Math.min(nextStepGeometryIndex, geometry.length - 1))
    ];
  const distanceToNextManeuverMeters = Math.max(
    0,
    ((nextStepRawDistance - stableCompletionRatio * rawTotalDistance) / rawTotalDistance) *
      route.distanceMeters,
  );

  return {
    activeStepIndex,
    completedDistanceMeters: Math.round(completedDistanceMeters),
    distanceToNextManeuverMeters: Math.round(distanceToNextManeuverMeters),
    distanceToRouteMeters: Math.round(distanceToRouteMeters),
    remainingDistanceMeters: Math.round(remainingDistanceMeters),
    remainingDurationSeconds: Math.round(
      route.durationSeconds * (1 - stableCompletionRatio),
    ),
  };
}
