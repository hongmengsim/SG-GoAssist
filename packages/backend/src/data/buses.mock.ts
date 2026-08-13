/**
 * Mock Bus Data
 * 
 * Simulates buses available in the system.
 * Later: Replace with real database/GTFS integration
 */

import { Bus } from "@buspass/shared";

export const mockBuses: Bus[] = [
  {
    busId: "SBS-191-001",
    busService: "191",
    routeNumber: "191",
    currentStop: "Changi Airport Terminal 1",
    nextStop: "Changi Airport Terminal 2",
    isAccessible: true,
    wheelchairSpaces: 2,
    latitude: 1.3589,
    longitude: 103.9875,
    estimatedArrivalSeconds: 120,
  },
  {
    busId: "SBS-191-002",
    busService: "191",
    routeNumber: "191",
    currentStop: "East Coast Parkway",
    nextStop: "Bedok MRT Station",
    isAccessible: true,
    wheelchairSpaces: 2,
    latitude: 1.3245,
    longitude: 103.9456,
    estimatedArrivalSeconds: 450,
  },
  {
    busId: "SBS-191-003",
    busService: "191",
    routeNumber: "191",
    currentStop: "Bedok MRT Station",
    nextStop: "Marine Parade",
    isAccessible: true,
    wheelchairSpaces: 1,
    latitude: 1.3168,
    longitude: 103.9301,
    estimatedArrivalSeconds: 300,
  },
];

export function getBusesByService(busService: string): Bus[] {
  return mockBuses.filter((bus) => bus.busService === busService);
}

export function getBusById(busId: string): Bus | undefined {
  return mockBuses.find((bus) => bus.busId === busId);
}
