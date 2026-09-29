import type {
  DataProvenance,
  ServiceAdvisory,
  StopAmenityProfile,
} from "@buspass/shared";

export const prototypeVerifiedProvenance: DataProvenance = {
  kind: "VERIFIED_FIXTURE",
  sourceLabel: "Prototype verified data",
  observedAt: "2026-09-01T00:00:00.000Z",
};

const unknownAmenities = {
  shelter: "UNKNOWN",
  seating: "UNKNOWN",
  lighting: "UNKNOWN",
  tactilePaving: "UNKNOWN",
  stepFreeKerb: "UNKNOWN",
  audioBeacon: "UNKNOWN",
  physicalAssistButton: "UNKNOWN",
} as const;

const verifiedAmenities: Record<
  string,
  Omit<StopAmenityProfile, "stopCode" | "provenance">
> = {
  "18301": {
    shelter: "YES",
    seating: "YES",
    lighting: "YES",
    tactilePaving: "YES",
    stepFreeKerb: "YES",
    audioBeacon: "YES",
    physicalAssistButton: "YES",
  },
  "18331": {
    shelter: "YES",
    seating: "YES",
    lighting: "YES",
    tactilePaving: "UNKNOWN",
    stepFreeKerb: "YES",
    audioBeacon: "NO",
    physicalAssistButton: "YES",
  },
  "16181": {
    shelter: "YES",
    seating: "YES",
    lighting: "YES",
    tactilePaving: "UNKNOWN",
    stepFreeKerb: "YES",
    audioBeacon: "NO",
    physicalAssistButton: "UNKNOWN",
  },
};

export function prototypeStopAmenities(stopCode: string): StopAmenityProfile {
  const known = verifiedAmenities[stopCode];
  return {
    stopCode,
    ...(known ?? unknownAmenities),
    provenance: known
      ? prototypeVerifiedProvenance
      : {
          kind: "UNAVAILABLE",
          sourceLabel: "Amenity information unavailable",
        },
  };
}

export const prototypeServiceAdvisories: ServiceAdvisory[] = [
  {
    id: "prototype-95-accessible-boarding",
    severity: "INFO",
    title:
      "Central-door assistance is available on the prototype Service 95 bus.",
    affectedServices: ["95"],
    affectedStops: ["18301", "18331", "16181"],
    startsAt: "2026-09-01T00:00:00.000Z",
    provenance: prototypeVerifiedProvenance,
  },
];

export const prototypeRouteShelterCoverage: Record<
  string,
  "FULL" | "PARTIAL" | "UNVERIFIED"
> = {
  "18301:16181": "PARTIAL",
  "18301:18331": "FULL",
};
