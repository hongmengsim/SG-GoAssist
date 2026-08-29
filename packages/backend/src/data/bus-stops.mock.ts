import { ArrivalBus, BusArrivalService, BusStop, NearbyBusStop } from "@buspass/shared";

const legacyMockBusStops: Array<Omit<BusStop, "services">> = [
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
    busStopCode: "18129",
    roadName: "Lower Kent Ridge Rd",
    description: "Opp NUH",
    latitude: 1.29394,
    longitude: 103.78428,
  },
  {
    busStopCode: "18131",
    roadName: "Lower Kent Ridge Rd",
    description: "Yusof Ishak House",
    latitude: 1.29831,
    longitude: 103.77392,
  },
  {
    busStopCode: "18139",
    roadName: "Lower Kent Ridge Rd",
    description: "Opp Yusof Ishak House",
    latitude: 1.29812,
    longitude: 103.77424,
  },
  {
    busStopCode: "18331",
    roadName: "Kent Ridge Cres",
    description: "University Hall",
    latitude: 1.29708,
    longitude: 103.77602,
  },
  {
    busStopCode: "18339",
    roadName: "Kent Ridge Cres",
    description: "Opp University Hall",
    latitude: 1.29674,
    longitude: 103.77581,
  },
  {
    busStopCode: "18341",
    roadName: "Kent Ridge Cres",
    description: "Central Library",
    latitude: 1.29618,
    longitude: 103.77331,
  },
  {
    busStopCode: "18349",
    roadName: "Kent Ridge Cres",
    description: "Opp Central Library",
    latitude: 1.29572,
    longitude: 103.77318,
  },
  {
    busStopCode: "19019",
    roadName: "Kent Ridge Cres",
    description: "Opp Kent Ridge Terminal",
    latitude: 1.29447,
    longitude: 103.77135,
  },
  {
    busStopCode: "15131",
    roadName: "Commonwealth Ave",
    description: "Buona Vista Stn Exit D",
    latitude: 1.30731,
    longitude: 103.79021,
  },
  {
    busStopCode: "15139",
    roadName: "Commonwealth Ave",
    description: "Buona Vista Stn Exit C",
    latitude: 1.30692,
    longitude: 103.79056,
  },
  {
    busStopCode: "17171",
    roadName: "Clementi Rd",
    description: "SIM HQ",
    latitude: 1.32951,
    longitude: 103.77612,
  },
  {
    busStopCode: "17179",
    roadName: "Clementi Rd",
    description: "Opp SIM HQ",
    latitude: 1.32915,
    longitude: 103.77574,
  },
  {
    busStopCode: "01012",
    roadName: "Victoria St",
    description: "Hotel Grand Pacific",
    latitude: 1.2969,
    longitude: 103.8531,
  },
  {
    busStopCode: "01013",
    roadName: "Victoria St",
    description: "St Joseph's Church",
    latitude: 1.29772,
    longitude: 103.85271,
  },
  {
    busStopCode: "02049",
    roadName: "Bras Basah Rd",
    description: "Raffles Hotel",
    latitude: 1.29612,
    longitude: 103.85402,
  },
  {
    busStopCode: "04167",
    roadName: "North Bridge Rd",
    description: "City Hall Stn Exit B",
    latitude: 1.29335,
    longitude: 103.85201,
  },
  {
    busStopCode: "95029",
    roadName: "Airport Blvd",
    description: "Changi Airport Terminal 1",
    latitude: 1.3589,
    longitude: 103.9875,
  },
  {
    busStopCode: "95019",
    roadName: "Airport Blvd",
    description: "Changi Airport Terminal 2",
    latitude: 1.35684,
    longitude: 103.98912,
  },
];

export const mockBusStops: BusStop[] = legacyMockBusStops.map((stop) => ({
  ...stop,
  services: [],
}));

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
  "18321": [
    {
      serviceNo: "95",
      buses: [arrival("AV-095-01", "95", "NEXT_BUS", 360, true, "Kent Ridge Terminal")],
    },
    {
      serviceNo: "151",
      buses: [arrival("AV-151-01", "151", "NEXT_BUS", 540, true, "Kent Ridge Terminal")],
    },
  ],
  "18341": [
    {
      serviceNo: "95",
      buses: [arrival("AV-095-02", "95", "NEXT_BUS", 260, true, "Buona Vista")],
    },
  ],
  "18349": [
    {
      serviceNo: "95",
      destination: "Kent Ridge Terminal",
      buses: [arrival("AV-095-01", "95", "NEXT_BUS", 300, true, "Kent Ridge Terminal")],
    },
  ],
  "18139": [
    {
      serviceNo: "151",
      destination: "Hougang Central",
      buses: [
        arrival("AV-151-02", "151", "NEXT_BUS", 180, true, "Hougang Central"),
        arrival("AV-151-03", "151", "NEXT_BUS_2", 660, true, "Hougang Central"),
      ],
    },
    {
      serviceNo: "183",
      destination: "Kent Ridge",
      buses: [arrival("AV-183-01", "183", "NEXT_BUS", 360, true, "Kent Ridge")],
    },
    {
      serviceNo: "188",
      destination: "Clementi",
      buses: [],
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
  "95029": [
    {
      serviceNo: "191",
      buses: [arrival("SBS-191-001", "191", "NEXT_BUS", 120, true, "Changi Airport Terminal 2")],
    },
  ],
  "95019": [
    {
      serviceNo: "191",
      buses: [arrival("SBS-191-001", "191", "NEXT_BUS", 240, true, "Changi Airport Terminal 1")],
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
