import type { NearbyBusStop } from "@buspass/shared";
import { deriveMapStopPresentation } from "../src/mapStopPresentation";

function stop(
  code: string,
  distanceMeters: number,
  services: string[] = [],
): NearbyBusStop {
  return {
    busStopCode: code,
    description: `Stop ${code}`,
    roadName: "Test Road",
    latitude: 1.3,
    longitude: 103.8,
    distanceMeters,
    services,
  };
}

describe("deriveMapStopPresentation", () => {
  it("shows only the recommended stop and two alternatives by default", () => {
    const result = deriveMapStopPresentation({
      stops: [stop("4", 400), stop("2", 200), stop("1", 100), stop("3", 300)],
    });

    expect(result.prioritizedStops.map((item) => item.busStopCode)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(result.recommendation).toMatchObject({
      stopCode: "1",
      reason: "Closest stop to this area",
    });
  });

  it("keeps selected and retained searched stops outside the shortlist", () => {
    const result = deriveMapStopPresentation({
      stops: [stop("1", 10), stop("2", 20), stop("3", 30), stop("4", 40)],
      selectedStopCode: "4",
      retainedStopCodes: ["3"],
      shortlistSize: 3,
    });

    expect(result.prioritizedStops.map((item) => item.busStopCode)).toEqual([
      "4",
      "3",
      "1",
    ]);
  });

  it("promotes a verified accessible route when accessibility is preferred", () => {
    const result = deriveMapStopPresentation({
      stops: [stop("1", 40), stop("2", 90), stop("3", 120)],
      preferAccessibleStops: true,
      routeStatuses: {
        "1": "UNAVAILABLE",
        "2": "AVAILABLE",
        "3": "CHECKING",
      },
    });

    expect(result.recommendation).toEqual({
      stopCode: "2",
      reason: "Closest wheelchair-accessible stop",
      accessibilityStatus: "AVAILABLE",
      provisional: false,
    });
  });

  it("marks an unchecked accessible recommendation as provisional", () => {
    const result = deriveMapStopPresentation({
      stops: [stop("1", 40), stop("2", 90)],
      preferAccessibleStops: true,
      routeStatuses: { "1": "CHECKING" },
    });

    expect(result.recommendation).toMatchObject({
      stopCode: "1",
      provisional: true,
    });
  });

  it("uses service matches as a stable tie-breaker", () => {
    const result = deriveMapStopPresentation({
      stops: [stop("1", 50, ["14"]), stop("2", 50, ["95"])],
      serviceFilter: "95",
    });

    expect(result.rankedStops[0].busStopCode).toBe("2");
    expect(result.recommendation?.reason).toBe("Closest stop for Service 95");
  });
});
