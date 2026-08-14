import { ArrivalBus, BusArrivalService, BusStop, NearbyBusStop } from "@buspass/shared";

export const mockBusStops: BusStop[] = [
  {
    busStopCode: "18301",
    roadName: "Kent Ridge Cres",
    description: "Kent Ridge Crescent",
    latitude: 1.29398,
    longitude: 103.77104,
  },
  {
    busStopCode: "18309",
    roadName: "Kent Ridge Cres",
    description: "Opp Kent Ridge Crescent",
    latitude: 1.29429,
    longitude: 103.77125,
  },
  {
    busStopCode: "18311",
    roadName: "Prince George's Park",
    description: "Prince George's Park",
    latitude: 1.29485,
    longitude: 103.77158,
  },
  {
    busStopCode: "18321",
    roadName: "Kent Ridge Cres",
    description: "Opp Heng Mui Keng Terrace",
    latitude: 1.29295,
    longitude: 103.77508,
  },
  {
    busStopCode: "19011",
    roadName: "Kent Ridge Cres",
    description: "Kent Ridge Terminal",
    latitude: 1.2942,
    longitude: 103.7711,
  },
  {
    busStopCode: "18121",
    roadName: "Lower Kent Ridge Rd",
    description: "NUH",
    latitude: 1.29369,
    longitude: 103.78382,
  },
  {
    busStopCode: "01012",
    roadName: "Victoria St",
    description: "Hotel Grand Pacific",
    latitude: 1.2969,
    longitude: 103.8531,
  },
];

const mockArrivalsByStop: Record<string, BusArrivalService[]> = {
  "18301": [
    {
      serviceNo: "95",
      buses: [arrival("AV-095-01", "95", "NEXT_BUS", 120, true, "Kent Ridge Terminal")],
    },
    {
      serviceNo: "151",
      buses: [arrival("AV-151-01", "151", "NEXT_BUS", 300, true, "Hougang Central")],
    },
  ],
  "18309": [
    {
      serviceNo: "95",
      buses: [arrival("AV-095-02", "95", "NEXT_BUS", 240, true, "Buona Vista")],
    },
  ],
  "19011": [
    {
      serviceNo: "191",
      buses: [
        arrival("AV-191-03", "191", "NEXT_BUS", 125, true, "Kent Ridge Terminal"),
        arrival("AV-191-04", "191", "NEXT_BUS_2", 520, true, "Kent Ridge Terminal"),
      ],
    },
    {
      serviceNo: "95",
      buses: [arrival("AV-095-01", "95", "NEXT_BUS", 300, true, "Buona Vista")],
    },
  ],
  "19019": [
    {
      serviceNo: "191",
      buses: [arrival("AV-191-05", "191", "NEXT_BUS", 210, true, "Buona Vista")],
    },
  ],
  "01012": [
    {
      serviceNo: "191",
      buses: [arrival("AV-191-03", "191", "NEXT_BUS", 125, true, "Buona Vista")],
    },
    {
      serviceNo: "7",
      buses: [arrival("AV-007-02", "7", "NEXT_BUS", 300, true, "Clementi")],
    },
    {
      serviceNo: "14",
      buses: [arrival("AV-014-01", "14", "NEXT_BUS", 420, false, "Bedok")],
    },
  ],
};

function arrival(
  busId: string,
  serviceNo: string,
  arrivalSlot: ArrivalBus["arrivalSlot"],
  etaSeconds: number,
  wheelchairAccessible: boolean,
  destination: string
): ArrivalBus {
  return {
    busId,
    serviceNo,
    arrivalSlot,
    etaSeconds,
    wheelchairAccessible,
    vehicleType: "SD",
    destination,
  };
}

export function getBusStopByCode(busStopCode: string): BusStop | undefined {
  return mockBusStops.find((stop) => stop.busStopCode === busStopCode);
}

export function getArrivalsForStop(busStopCode: string): BusArrivalService[] {
  return mockArrivalsByStop[busStopCode] ?? [];
}

export function findNearestBusStops(
  latitude: number,
  longitude: number,
  limit = 3,
  maxDistanceMeters = 150
): NearbyBusStop[] {
  return mockBusStops
    .map((stop) => ({
      ...stop,
      distanceMeters: Math.round(distanceMeters(latitude, longitude, stop.latitude, stop.longitude)),
    }))
    .filter((stop) => stop.distanceMeters <= maxDistanceMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

function toRadians(degrees: number) {
  return degrees * (Math.PI / 180);
}
