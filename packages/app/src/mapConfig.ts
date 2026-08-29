const configuredWebTileUrl = process.env.EXPO_PUBLIC_MAP_TILE_URL?.trim() ?? "";

export const WEB_TILE_URL =
  configuredWebTileUrl || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const WEB_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const DEFAULT_ZOOM = 15;
export const MIN_MAP_ZOOM = 11;
export const MAX_MAP_ZOOM = 19;
export const MAP_INITIALIZATION_TIMEOUT_MS = 12_000;
