import fs from "node:fs";
import path from "node:path";

const appRoot = path.join(__dirname, "..");
const source = (relativePath: string) =>
  fs.readFileSync(path.join(appRoot, relativePath), "utf8");

it("uses mature Leaflet clustering while keeping priority stops independent", () => {
  const webMap = source("src/components/JourneyMap.web.tsx");
  const packageJson = JSON.parse(source("package.json"));

  [
    'import "leaflet.markercluster"',
    "markerClusterGroup({",
    "chunkedLoading: true",
    "disableClusteringAtZoom: 18",
    "maxClusterRadius: clusterRadiusForZoom",
    "removeOutsideVisibleBounds: true",
    "spiderfyOnMaxZoom: true",
    "<ClusteredStopMarkers",
    "priorityStops.map((stop)",
    "createLeafletMarker(toLatLng(stop)",
    'clusterGroup.on("clusterclick", handleClusterClick)',
  ].forEach((token) => expect(webMap).toContain(token));

  expect(packageJson.dependencies["leaflet.markercluster"]).toBe("1.5.3");
  expect(packageJson.devDependencies["@types/leaflet.markercluster"]).toBe(
    "1.5.6",
  );
  expect(webMap).not.toContain("MarkerClusterer");
  expect(webMap).not.toContain("function clusterStops");
});

it("makes clusters and map-marker hierarchy accessible", () => {
  const webMap = source("src/components/JourneyMap.web.tsx");

  [
    "function ClusterAccessibilityController",
    "MutationObserver",
    'data-cluster-count="${count}"',
    "Cluster of ${count} nearby bus stops. Activate to zoom in.",
    'event.key !== "Enter" && event.key !== " "',
    "cluster.click()",
    '"Selected bus stop"',
    '"Recommended bus stop"',
    "selected || stop.busStopCode === recommendedStopCode",
    "? 1200",
    "zIndexOffset={1100}",
  ].forEach((token) => expect(webMap).toContain(token));

  expect(webMap.indexOf("<ClusteredStopMarkers")).toBeLessThan(
    webMap.indexOf("priorityStops.map"),
  );
});

it("uses a label-free navigation puck and avoids empty Leaflet overlays", () => {
  const webMap = source("src/components/JourneyMap.web.tsx");

  [
    'className: "goassist-leaflet-marker goassist-user-location-marker"',
    'class="goassist-user-puck',
    'data-user-heading="true"',
    'return "Your location"',
    "const normalizedAccessibilityLabel = accessibilityLabel.trim()",
    'element.removeAttribute("aria-label")',
  ].forEach((token) => expect(webMap).toContain(token));

  expect(webMap).not.toMatch(/\bTooltip\b/);
  expect(webMap).not.toMatch(/\bPopup\b/);
  expect(webMap).not.toContain("bindTooltip");
  expect(webMap).not.toContain("bindPopup");
});

it("uses a keyless OpenStreetMap web provider with retry and resize handling", () => {
  const webMap = source("src/components/JourneyMap.web.tsx");
  const mapConfig = source("src/mapConfig.ts");
  const packageJson = JSON.parse(source("package.json"));

  [
    "MapContainer",
    "TileLayer",
    "WEB_TILE_URL",
    "WEB_TILE_ATTRIBUTION",
    "tileerror: handleTileError",
    "tileload: handleTileLoad",
    'useState<ProviderState>("INITIALIZING")',
    "key={providerRetryKey}",
    "ResizeObserver",
    "map.invalidateSize({ animate: false, pan: false })",
  ].forEach((token) => expect(webMap).toContain(token));

  [
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    "OpenStreetMap</a> contributors",
    "EXPO_PUBLIC_MAP_TILE_URL",
    "DEFAULT_ZOOM",
    "MIN_MAP_ZOOM",
    "MAX_MAP_ZOOM",
  ].forEach((token) => expect(mapConfig).toContain(token));

  expect(packageJson.dependencies.leaflet).toBe("1.9.4");
  expect(packageJson.dependencies["react-leaflet"]).toBe("^5.0.0");
});

it("opens on the immediate neighbourhood and uses prominent stop markers", () => {
  const app = source("App.tsx");
  const mapConfig = source("src/mapConfig.ts");
  const nativeMap = source("src/components/NativeJourneyMap.native.tsx");
  const webMap = source("src/components/JourneyMap.web.tsx");

  expect(mapConfig).toContain("INITIAL_NEIGHBORHOOD_RADIUS_METERS = 200");
  expect(mapConfig).toContain("DEFAULT_ZOOM = 18");
  expect(app).toContain('import { DEFAULT_ZOOM } from "./src/mapConfig"');
  expect(app).toContain("const focusZoom = DEFAULT_ZOOM");

  [
    "sizes.selectedMarker",
    "sizes.recommendedMarker",
    "sizes.stopMarker",
    "const hitSize = Math.max(48, size)",
    "goassist-recommended-stop-callout",
    'data-marker-state="selected"',
    'data-marker-state="recommended"',
  ].forEach((token) => expect(webMap).toContain(token));
  [
    "recommendedStopMarker",
    "stopMarkerHitArea",
    "height: 46",
    "height: 52",
    "height: 58",
    "<BusFront",
    "<Star",
    "<Check",
  ].forEach((token) => expect(nativeMap).toContain(token));
});

it("prioritizes three stops and exposes all stops only through map options", () => {
  const app = source("App.tsx");
  const mapTypes = source("src/components/JourneyMap.types.ts");
  const webMap = source("src/components/JourneyMap.web.tsx");
  const nativeMap = source("src/components/NativeJourneyMap.native.tsx");

  [
    'useState<MapStopDensity>("PRIORITIZED")',
    'testID="recommended-stop-card"',
    'accessibilityLabel="Show all bus stops"',
    'accessibilityLabel="Choose this stop"',
    'accessibilityLabel="Compare nearby bus stops"',
  ].forEach((token) => expect(app).toContain(token));
  expect(mapTypes).toContain('stopDensity?: "PRIORITIZED" | "ALL"');
  expect(webMap).toContain('stopDensity === "ALL"');
  expect(webMap).toContain('stopDensity === "PRIORITIZED"');
  expect(nativeMap).toContain('stopDensity === "ALL"');
});

it("uses provider-native geographic maps on Android and iOS", () => {
  const nativeMap = source("src/components/NativeJourneyMap.native.tsx");
  const nativeWrapper = source("src/components/JourneyMap.native.tsx");
  const expoConfig = source("app.config.js");

  ["NativeJourneyMap", "<NativeJourneyMap {...props}"].forEach((token) =>
    expect(nativeWrapper).toContain(token),
  );
  [
    "react-native-maps",
    "provider={PROVIDER_GOOGLE}",
    "style={StyleSheet.absoluteFill}",
    "<Marker",
    "coordinate={currentLocation}",
    "<Circle",
    "<Polyline",
    "onRegionChangeComplete",
    "clusterStops(",
  ].forEach((token) => expect(nativeMap).toContain(token));
  [
    "../../.env",
    "googleMapsApiKey",
    "googleMaps",
    "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY",
  ].forEach((token) => expect(expoConfig).toContain(token));

  expect(nativeMap).not.toContain("window.innerWidth");
  expect(nativeMap).not.toContain("Dimensions.get");
  expect(expoConfig).not.toContain("AIza");
});
