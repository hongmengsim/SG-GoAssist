import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BusStop, PassengerContextSnapshot } from "@buspass/shared";

const storageKey = "goassist.passenger-context.v1";
const currentVersion = 1 as const;

export type SavedDestination = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};

export type RecentJourney = {
  id: string;
  completedAt: string;
  serviceNo: string;
  boardingStop: BusStop;
  destination: BusStop;
};

export type PassengerJourneyLocalState = {
  version: typeof currentVersion;
  favouriteStops: BusStop[];
  favouriteDestinations: SavedDestination[];
  recentJourneys: RecentJourney[];
  lastContext: PassengerContextSnapshot | null;
};

export const emptyPassengerJourneyLocalState: PassengerJourneyLocalState = {
  version: currentVersion,
  favouriteStops: [],
  favouriteDestinations: [],
  recentJourneys: [],
  lastContext: null,
};

export async function readPassengerJourneyLocalState(): Promise<PassengerJourneyLocalState> {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    return raw
      ? parsePassengerJourneyLocalState(raw)
      : emptyPassengerJourneyLocalState;
  } catch {
    return emptyPassengerJourneyLocalState;
  }
}

export async function savePassengerJourneyLocalState(
  state: PassengerJourneyLocalState,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      storageKey,
      JSON.stringify(normalizeState(state)),
    );
  } catch {
    // Local conveniences must never interrupt journey guidance.
  }
}

export function parsePassengerJourneyLocalState(
  raw: string,
): PassengerJourneyLocalState {
  try {
    const value = JSON.parse(raw) as Partial<PassengerJourneyLocalState>;
    if (value.version !== currentVersion)
      return emptyPassengerJourneyLocalState;
    return normalizeState({
      version: currentVersion,
      favouriteStops: Array.isArray(value.favouriteStops)
        ? value.favouriteStops.filter(validBusStop)
        : [],
      favouriteDestinations: Array.isArray(value.favouriteDestinations)
        ? value.favouriteDestinations.filter(validDestination)
        : [],
      recentJourneys: Array.isArray(value.recentJourneys)
        ? value.recentJourneys.filter(validRecentJourney)
        : [],
      lastContext: validContext(value.lastContext) ? value.lastContext : null,
    });
  } catch {
    return emptyPassengerJourneyLocalState;
  }
}

export function withPassengerContext(
  state: PassengerJourneyLocalState,
  snapshot: PassengerContextSnapshot,
): PassengerJourneyLocalState {
  return normalizeState({ ...state, lastContext: snapshot });
}

export function withRecentJourney(
  state: PassengerJourneyLocalState,
  journey: RecentJourney,
): PassengerJourneyLocalState {
  return normalizeState({
    ...state,
    recentJourneys: [
      journey,
      ...state.recentJourneys.filter((item) => item.id !== journey.id),
    ],
  });
}

export function toggleFavouriteStop(
  state: PassengerJourneyLocalState,
  stop: BusStop,
): PassengerJourneyLocalState {
  const exists = state.favouriteStops.some(
    (item) => item.busStopCode === stop.busStopCode,
  );
  return normalizeState({
    ...state,
    favouriteStops: exists
      ? state.favouriteStops.filter(
          (item) => item.busStopCode !== stop.busStopCode,
        )
      : [stop, ...state.favouriteStops],
  });
}

export function toggleFavouriteDestination(
  state: PassengerJourneyLocalState,
  destination: SavedDestination,
): PassengerJourneyLocalState {
  const exists = state.favouriteDestinations.some(
    (item) => item.id === destination.id,
  );
  return normalizeState({
    ...state,
    favouriteDestinations: exists
      ? state.favouriteDestinations.filter((item) => item.id !== destination.id)
      : [destination, ...state.favouriteDestinations],
  });
}

function normalizeState(
  state: PassengerJourneyLocalState,
): PassengerJourneyLocalState {
  return {
    ...state,
    version: currentVersion,
    favouriteStops: state.favouriteStops.slice(0, 10),
    favouriteDestinations: state.favouriteDestinations.slice(0, 10),
    recentJourneys: state.recentJourneys.slice(0, 5),
  };
}

function validBusStop(value: unknown): value is BusStop {
  const stop = value as Partial<BusStop> | null;
  return Boolean(
    stop &&
    typeof stop.busStopCode === "string" &&
    typeof stop.description === "string" &&
    typeof stop.latitude === "number" &&
    typeof stop.longitude === "number" &&
    Array.isArray(stop.services),
  );
}

function validDestination(value: unknown): value is SavedDestination {
  const destination = value as Partial<SavedDestination> | null;
  return Boolean(
    destination &&
    typeof destination.id === "string" &&
    typeof destination.label === "string" &&
    typeof destination.latitude === "number" &&
    typeof destination.longitude === "number",
  );
}

function validRecentJourney(value: unknown): value is RecentJourney {
  const journey = value as Partial<RecentJourney> | null;
  return Boolean(
    journey &&
    typeof journey.id === "string" &&
    typeof journey.completedAt === "string" &&
    typeof journey.serviceNo === "string" &&
    validBusStop(journey.boardingStop) &&
    validBusStop(journey.destination),
  );
}

function validContext(value: unknown): value is PassengerContextSnapshot {
  const context = value as Partial<PassengerContextSnapshot> | null;
  return Boolean(
    context &&
    typeof context.generatedAt === "string" &&
    Array.isArray(context.nearbyStops) &&
    Array.isArray(context.advisories) &&
    context.provenance &&
    typeof context.provenance.sourceLabel === "string",
  );
}
