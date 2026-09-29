const configuredWebTileUrl = process.env.EXPO_PUBLIC_MAP_TILE_URL?.trim() ?? "";

export const WEB_TILE_URL =
  configuredWebTileUrl || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const WEB_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// At the supported phone heights, zoom 18 keeps the opening map focused on
// roughly the nearest 200 metres while still showing several nearby stops.
export const INITIAL_NEIGHBORHOOD_RADIUS_METERS = 200;
export const DEFAULT_ZOOM = 18;
export const MIN_MAP_ZOOM = 11;
export const MAX_MAP_ZOOM = 19;
export const MAP_INITIALIZATION_TIMEOUT_MS = 12_000;
