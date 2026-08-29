import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, View } from "react-native";
import {
  divIcon,
  latLngBounds,
  marker as createLeafletMarker,
  markerClusterGroup,
  type DivIcon,
  type LeafletEvent,
  type LatLngTuple,
  type Marker as LeafletMarker,
  type MarkerCluster,
} from "leaflet";
import {
  AttributionControl,
  Circle,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import {
  MAP_INITIALIZATION_TIMEOUT_MS,
  MAX_MAP_ZOOM,
  MIN_MAP_ZOOM,
  WEB_TILE_ATTRIBUTION,
  WEB_TILE_URL,
} from "../mapConfig";
import type {
  JourneyMapCoordinate,
  JourneyMapPalette,
  JourneyMapProps,
  JourneyMapViewport,
} from "./JourneyMap.types";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "./JourneyMap.web.css";

type ProviderState = "INITIALIZING" | "READY" | "ERROR";

function toLatLng(coordinate: JourneyMapCoordinate): LatLngTuple {
  return [coordinate.latitude, coordinate.longitude];
}

function clampZoom(zoom: number) {
  return Math.max(MIN_MAP_ZOOM, Math.min(MAX_MAP_ZOOM, zoom));
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stopMarkerIcon({
  fill,
  glyphColor,
  kind,
  stroke,
  size,
  strokeWidth,
}: {
  fill: string;
  glyphColor: string;
  kind: "default" | "recommended" | "selected";
  stroke: string;
  size: number;
  strokeWidth: number;
}) {
  const markerContent =
    kind === "selected"
      ? "&#10003;"
      : `<svg aria-hidden="true" viewBox="0 0 16 16" width="68%" height="68%" focusable="false"><path d="M4 2.5h8c.8 0 1.5.7 1.5 1.5v6.5c0 .6-.4 1-1 1H3.5c-.6 0-1-.4-1-1V4c0-.8.7-1.5 1.5-1.5Zm-.2 2v3.4h8.4V4.5H3.8Zm1 4.7a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Zm6.4 0a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8ZM4 11.5v1.3m8-1.3v1.3" fill="none" stroke="${glyphColor}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return divIcon({
    className: `goassist-leaflet-marker goassist-stop-marker goassist-stop-marker-${kind}`,
    html: `<span aria-hidden="true" data-marker-kind="${kind}" style="align-items:center;box-sizing:border-box;display:flex;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${fill};border:${strokeWidth}px solid ${stroke};box-shadow:0 2px 6px rgba(6,37,41,.38);color:${glyphColor};font:900 14px/1 system-ui,sans-serif">${markerContent}</span>`,
    iconAnchor: [size / 2, size / 2],
    iconSize: [size, size],
  });
}

function clusterRadiusForZoom(zoom: number) {
  if (zoom >= 17) {
    return 34;
  }
  if (zoom >= 15) {
    return 46;
  }
  return 58;
}

function stopClusterIcon(
  cluster: MarkerCluster,
  palette: JourneyMapPalette,
  highContrast: boolean,
) {
  const count = cluster.getChildCount();
  const size = count >= 10 ? 48 : count >= 5 ? 44 : 40;
  return divIcon({
    className: "goassist-leaflet-cluster",
    html: `<span aria-hidden="true" data-cluster-count="${count}" style="align-items:center;box-sizing:border-box;display:flex;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${palette.stopSelected};border:${highContrast ? 4 : 3}px solid ${palette.stopOutline};box-shadow:0 3px 9px rgba(6,37,41,.42);color:${palette.textOnMarker};font:900 15px/1 system-ui,sans-serif">${count}</span>`,
    iconAnchor: [size / 2, size / 2],
    iconSize: [size, size],
  });
}

function userLocationIcon(
  palette: JourneyMapPalette,
  highContrast: boolean,
  headingDegrees: number | undefined,
  pulseKey: number,
) {
  const headingAvailable =
    headingDegrees !== undefined && Number.isFinite(headingDegrees);
  const outlineWidth = highContrast ? 3.5 : 2.5;
  return divIcon({
    className: "goassist-leaflet-marker goassist-user-location-marker",
    html: `<span aria-hidden="true" class="goassist-user-puck${pulseKey > 0 ? " goassist-user-puck-pulsed" : ""}" data-location-pulse-key="${pulseKey}">${
      headingAvailable
        ? `<svg class="goassist-user-heading" data-user-heading="true" viewBox="0 0 44 44" style="transform:rotate(${headingDegrees}deg)" focusable="false"><path d="M22 1 L30 19 L22 16 L14 19 Z" fill="${palette.currentLocation}" stroke="${palette.currentLocationOutline}" stroke-width="${outlineWidth}" stroke-linejoin="round"/><path d="M22 4 L26 15 L22 13 L18 15 Z" fill="#FFFFFF" opacity=".92"/></svg>`
        : ""
    }<span class="goassist-user-puck-shadow"></span><span class="goassist-user-puck-outer" style="background:${palette.currentLocationOutline}"><span class="goassist-user-puck-halo"><span class="goassist-user-puck-core" style="background:${palette.currentLocation}"></span></span></span><span class="goassist-user-puck-pulse" style="border-color:${palette.currentLocation}"></span></span>`,
    iconAnchor: [22, 22],
    iconSize: [44, 44],
  });
}

function headingAccessibilityLabel(headingDegrees: number | undefined) {
  if (headingDegrees === undefined || !Number.isFinite(headingDegrees)) {
    return "Your location";
  }
  const directions = [
    "north",
    "northeast",
    "east",
    "southeast",
    "south",
    "southwest",
    "west",
    "northwest",
  ];
  const normalized = ((headingDegrees % 360) + 360) % 360;
  return `Your location, facing ${directions[Math.round(normalized / 45) % 8]}`;
}

function vehicleIcon(
  serviceNo: string,
  palette: JourneyMapPalette,
  highContrast: boolean,
) {
  return divIcon({
    className: "goassist-leaflet-marker",
    html: `<span aria-hidden="true" style="box-sizing:border-box;display:block;min-width:42px;padding:5px 7px;border-radius:8px;background:${palette.routePrimary};border:${highContrast ? 4 : 2}px solid ${palette.routeOutline};color:${palette.textOnMarker};font:900 13px/16px system-ui,sans-serif;text-align:center;box-shadow:0 2px 6px rgba(6,37,41,.35)">${escapeHtml(serviceNo)}</span>`,
    iconAnchor: [21, 16],
    iconSize: [42, 32],
  });
}

function destinationIcon(palette: JourneyMapPalette, highContrast: boolean) {
  return divIcon({
    className: "goassist-leaflet-marker goassist-destination-marker",
    html: `<span aria-hidden="true" class="goassist-destination-pin" style="background:${palette.stopSelected};border-color:${palette.stopOutline};border-width:${highContrast ? 4 : 3}px"><svg viewBox="0 0 24 24" focusable="false"><path d="M5 16V7c0-2 1.5-3 7-3s7 1 7 3v9m-14 0h14m-12 0v3m10-3v3M8 8h8M8 12h2m4 0h2" fill="none" stroke="${palette.textOnMarker}" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.3"/></svg></span>`,
    iconAnchor: [18, 18],
    iconSize: [36, 36],
  });
}

function accessibilityWarningIcon(palette: JourneyMapPalette) {
  return divIcon({
    className: "goassist-accessibility-warning-icon",
    html: `<span aria-hidden="true" style="background:${escapeHtml(palette.routeOutline)};color:${escapeHtml(palette.textOnMarker)}">!</span>`,
    iconAnchor: [13, 13],
    iconSize: [26, 26],
  });
}

function AccessibleMarker({
  accessibilityLabel,
  icon,
  position,
  onPress,
  zIndexOffset = 0,
}: {
  accessibilityLabel: string;
  icon: DivIcon;
  position: LatLngTuple;
  onPress?: () => void;
  zIndexOffset?: number;
}) {
  const markerRef = useRef<LeafletMarker | null>(null);
  const normalizedAccessibilityLabel = accessibilityLabel.trim();

  useEffect(() => {
    const element = markerRef.current?.getElement();
    if (!element) {
      return undefined;
    }
    if (normalizedAccessibilityLabel) {
      element.setAttribute("aria-label", normalizedAccessibilityLabel);
    } else {
      element.removeAttribute("aria-label");
    }
    element.setAttribute("role", onPress ? "button" : "img");
    if (onPress) {
      element.setAttribute("tabindex", "0");
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!onPress || (event.key !== "Enter" && event.key !== " ")) {
        return;
      }
      event.preventDefault();
      onPress();
    };
    element.addEventListener("keydown", handleKeyDown);
    return () => element.removeEventListener("keydown", handleKeyDown);
  }, [normalizedAccessibilityLabel, onPress]);

  return (
    <Marker
      ref={markerRef}
      position={position}
      icon={icon}
      keyboard={Boolean(onPress)}
      riseOnHover={Boolean(onPress)}
      riseOffset={200}
      title={normalizedAccessibilityLabel || undefined}
      zIndexOffset={zIndexOffset}
      eventHandlers={onPress ? { click: onPress } : undefined}
    />
  );
}

function ClusterAccessibilityController() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const syncClusterLabels = () => {
      container
        .querySelectorAll<HTMLElement>(".goassist-leaflet-cluster")
        .forEach((element) => {
          const count =
            element.querySelector<HTMLElement>("[data-cluster-count]")?.dataset
              .clusterCount ?? "multiple";
          const label = `Cluster of ${count} nearby bus stops. Activate to zoom in.`;
          element.setAttribute("aria-label", label);
          element.setAttribute("role", "button");
          element.setAttribute("tabindex", "0");
          element.setAttribute("title", label);
        });
    };
    const observer = new MutationObserver(syncClusterLabels);
    observer.observe(container, { childList: true, subtree: true });
    const handleClusterKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const cluster = target.closest<HTMLElement>(".goassist-leaflet-cluster");
      if (!cluster) {
        return;
      }
      event.preventDefault();
      cluster.click();
    };
    container.addEventListener("keydown", handleClusterKeyDown);
    syncClusterLabels();
    return () => {
      observer.disconnect();
      container.removeEventListener("keydown", handleClusterKeyDown);
    };
  }, [map]);

  return null;
}

function ClusteredStopMarkers({
  stops,
  stopIcons,
  palette,
  highContrast,
  onSelectStop,
  onFocusCluster,
}: {
  stops: JourneyMapProps["stops"];
  stopIcons: Map<string, DivIcon>;
  palette: JourneyMapPalette;
  highContrast: boolean;
  onSelectStop: JourneyMapProps["onSelectStop"];
  onFocusCluster: JourneyMapProps["onFocusCluster"];
}) {
  const map = useMap();
  const onSelectStopRef = useRef(onSelectStop);
  const onFocusClusterRef = useRef(onFocusCluster);
  onSelectStopRef.current = onSelectStop;
  onFocusClusterRef.current = onFocusCluster;

  useEffect(() => {
    const configuredElements = new WeakSet<HTMLElement>();
    const clusterGroup = markerClusterGroup({
      animate: true,
      chunkedLoading: true,
      disableClusteringAtZoom: 18,
      iconCreateFunction: (cluster) =>
        stopClusterIcon(cluster, palette, highContrast),
      maxClusterRadius: clusterRadiusForZoom,
      removeOutsideVisibleBounds: true,
      showCoverageOnHover: false,
      spiderfyDistanceMultiplier: 1.25,
      spiderfyOnMaxZoom: true,
      spiderLegPolylineOptions: {
        color: palette.routeOutline,
        opacity: 0.72,
        weight: highContrast ? 3 : 2,
      },
      zoomToBoundsOnClick: false,
    });
    const handleClusterClick = (event: LeafletEvent) => {
      const cluster = (event as LeafletEvent & { layer: MarkerCluster }).layer;
      const center = cluster.getLatLng();
      onFocusClusterRef.current({
        latitude: center.lat,
        longitude: center.lng,
      });
    };
    clusterGroup.on("clusterclick", handleClusterClick);

    stops.forEach((stop) => {
      const accessibilityLabel = `Bus stop ${stop.description}, ${stop.roadName}, stop ${stop.busStopCode}`;
      const stopMarker = createLeafletMarker(toLatLng(stop), {
        icon: stopIcons.get(stop.busStopCode)!,
        keyboard: true,
        riseOnHover: true,
        riseOffset: 200,
        title: accessibilityLabel,
        zIndexOffset: 100,
      });
      stopMarker.on("click", () => onSelectStopRef.current(stop));
      stopMarker.on("add", () => {
        const element = stopMarker.getElement();
        if (!element || configuredElements.has(element)) {
          return;
        }
        configuredElements.add(element);
        element.setAttribute("aria-label", accessibilityLabel);
        element.setAttribute("role", "button");
        element.setAttribute("tabindex", "0");
        element.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          onSelectStopRef.current(stop);
        });
      });
      clusterGroup.addLayer(stopMarker);
    });

    clusterGroup.addTo(map);
    return () => {
      clusterGroup.off("clusterclick", handleClusterClick);
      clusterGroup.clearLayers();
      map.removeLayer(clusterGroup);
    };
  }, [
    highContrast,
    map,
    palette.routeOutline,
    palette.stopOutline,
    palette.stopSelected,
    palette.textOnMarker,
    stopIcons,
    stops,
  ]);

  return null;
}

function MapViewportController({
  viewport,
  routeStops,
  routeFitKey,
  routeFitPadding,
  reducedMotion,
  onMove,
  onViewportChange,
}: {
  viewport: JourneyMapViewport;
  routeStops: JourneyMapCoordinate[];
  routeFitKey: number;
  routeFitPadding: JourneyMapProps["routeFitPadding"];
  reducedMotion: boolean;
  onMove: () => void;
  onViewportChange: (viewport: JourneyMapViewport) => void;
}) {
  const applyingViewportRef = useRef(false);
  const userGestureRef = useRef(false);
  const appliedRouteFitKeyRef = useRef(0);
  const map = useMapEvents({
    dragstart: () => {
      if (applyingViewportRef.current) {
        return;
      }
      userGestureRef.current = true;
      onMove();
    },
    zoomstart: () => {
      if (applyingViewportRef.current) {
        return;
      }
      userGestureRef.current = true;
      onMove();
    },
    moveend: () => {
      if (applyingViewportRef.current) {
        applyingViewportRef.current = false;
        return;
      }
      if (!userGestureRef.current) {
        return;
      }
      userGestureRef.current = false;
      const center = map.getCenter();
      onViewportChange({
        bearing: viewport.bearing,
        center: {
          latitude: center.lat,
          longitude: center.lng,
        },
        pitch: viewport.pitch,
        zoom: map.getZoom(),
      });
    },
  });
  const fitRouteToVisibleMap = useCallback(() => {
    if (routeFitKey <= 0 || routeStops.length < 2) {
      return;
    }
    applyingViewportRef.current = true;
    const bounds = latLngBounds(routeStops.map(toLatLng));
    map.fitBounds(bounds, {
      animate: !reducedMotion,
      duration: reducedMotion ? 0 : 0.45,
      maxZoom: 18,
      paddingTopLeft: [routeFitPadding.left, routeFitPadding.top],
      paddingBottomRight: [routeFitPadding.right, routeFitPadding.bottom],
    });
  }, [map, reducedMotion, routeFitKey, routeFitPadding, routeStops]);

  useEffect(() => {
    const currentCenter = map.getCenter();
    const nextZoom = clampZoom(viewport.zoom);
    const moved =
      Math.abs(currentCenter.lat - viewport.center.latitude) > 0.000001 ||
      Math.abs(currentCenter.lng - viewport.center.longitude) > 0.000001;
    const zoomed = Math.abs(map.getZoom() - nextZoom) > 0.01;
    if (!moved && !zoomed) {
      return;
    }
    applyingViewportRef.current = true;
    map.flyTo(toLatLng(viewport.center), nextZoom, {
      animate: !reducedMotion,
      duration: reducedMotion ? 0 : 0.45,
    });
  }, [
    map,
    reducedMotion,
    viewport.center.latitude,
    viewport.center.longitude,
    viewport.zoom,
  ]);

  useEffect(() => {
    if (
      routeFitKey <= 0 ||
      routeFitKey === appliedRouteFitKeyRef.current ||
      routeStops.length < 2
    ) {
      return;
    }
    appliedRouteFitKeyRef.current = routeFitKey;
    fitRouteToVisibleMap();
  }, [
    fitRouteToVisibleMap,
    routeFitKey,
    routeStops,
  ]);

  useEffect(() => {
    if (routeFitKey <= 0 || routeStops.length < 2) {
      return undefined;
    }
    map.on("resize", fitRouteToVisibleMap);
    return () => {
      map.off("resize", fitRouteToVisibleMap);
    };
  }, [fitRouteToVisibleMap, map, routeFitKey, routeStops.length]);

  return null;
}

function MapResizeController() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    let animationFrame = 0;
    const invalidate = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() =>
        map.invalidateSize({ animate: false, pan: false }),
      );
    };
    invalidate();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(invalidate);
      observer.observe(container);
      return () => {
        cancelAnimationFrame(animationFrame);
        observer.disconnect();
      };
    }

    window.addEventListener("resize", invalidate);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", invalidate);
    };
  }, [map]);

  return null;
}

export function JourneyMap({
  stops,
  recommendedStopCode: preferredRecommendedStopCode,
  selectedStop,
  currentLocation,
  viewport,
  layers,
  routeStops,
  routeMobilityMode,
  routeWarnings = [],
  routeFitKey,
  routeFitPadding,
  destination,
  destinationAccessibilityLabel,
  activeVehicle,
  palette,
  highContrast,
  lightMode,
  locationPulseKey,
  reducedMotion,
  providerRetryKey,
  fallback,
  onLayout,
  onMove,
  onProviderAvailabilityChange,
  onViewportChange,
  onSelectStop,
  onFocusCluster,
}: JourneyMapProps) {
  const [providerState, setProviderState] =
    useState<ProviderState>("INITIALIZING");
  const tileErrorCountRef = useRef(0);
  const tileLoadedRef = useRef(false);
  const nearestStopCode = useMemo(
    () =>
      stops.reduce<(typeof stops)[number] | null>(
        (nearest, stop) =>
          !nearest || stop.distanceMeters < nearest.distanceMeters
            ? stop
            : nearest,
        null,
      )?.busStopCode ?? null,
    [stops],
  );
  const recommendedStopCode = preferredRecommendedStopCode ?? nearestStopCode;

  useEffect(() => {
    tileErrorCountRef.current = 0;
    tileLoadedRef.current = false;
    setProviderState("INITIALIZING");
    if (__DEV__ && process.env.NODE_ENV !== "test") {
      console.info("[Map] OpenStreetMap initialization started", {
        attempt: providerRetryKey,
        customTileProvider: Boolean(
          process.env.EXPO_PUBLIC_MAP_TILE_URL?.trim(),
        ),
      });
    }
  }, [providerRetryKey]);

  useEffect(() => {
    onProviderAvailabilityChange(providerState === "READY");
  }, [onProviderAvailabilityChange, providerState]);

  useEffect(() => {
    if (providerState !== "INITIALIZING") {
      return undefined;
    }
    const timeout = setTimeout(() => {
      if (__DEV__ && process.env.NODE_ENV !== "test") {
        console.error("[Map] OpenStreetMap initialization timed out");
      }
      setProviderState("ERROR");
    }, MAP_INITIALIZATION_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [providerRetryKey, providerState]);

  const handleTileLoad = useCallback(() => {
    if (tileLoadedRef.current) {
      return;
    }
    tileLoadedRef.current = true;
    setProviderState("READY");
    if (__DEV__ && process.env.NODE_ENV !== "test") {
      console.info("[Map] OpenStreetMap tiles ready");
    }
  }, []);

  const handleTileError = useCallback(() => {
    tileErrorCountRef.current += 1;
    if (tileLoadedRef.current || tileErrorCountRef.current < 3) {
      return;
    }
    if (__DEV__ && process.env.NODE_ENV !== "test") {
      console.error("[Map] OpenStreetMap tile loading failed", {
        failedTiles: tileErrorCountRef.current,
      });
    }
    setProviderState("ERROR");
  }, []);

  const stopIcons = useMemo(
    () =>
      new Map(
        stops.map((stop) => {
          const selected = stop.busStopCode === selectedStop?.busStopCode;
          const recommended = stop.busStopCode === recommendedStopCode;
          const kind = selected
            ? "selected"
            : recommended
              ? "recommended"
              : "default";
          return [
            stop.busStopCode,
            stopMarkerIcon({
              fill: selected
                ? palette.stopSelected
                : recommended
                  ? palette.stopRecommended
                  : palette.stopDefault,
              glyphColor: palette.textOnMarker,
              kind,
              size: selected ? 30 : recommended ? 23 : 18,
              stroke: palette.stopOutline,
              strokeWidth: highContrast ? 4 : selected ? 3 : 2,
            }),
          ];
        }),
      ),
    [
      highContrast,
      palette.stopDefault,
      palette.textOnMarker,
      palette.stopOutline,
      palette.stopRecommended,
      palette.stopSelected,
      recommendedStopCode,
      selectedStop?.busStopCode,
      stops,
    ],
  );
  const clusteredStops = useMemo(
    () =>
      stops.filter(
        (stop) =>
          stop.busStopCode !== selectedStop?.busStopCode &&
          stop.busStopCode !== recommendedStopCode,
      ),
    [recommendedStopCode, selectedStop?.busStopCode, stops],
  );
  const priorityStops = useMemo(
    () =>
      stops.filter(
        (stop) =>
          !(
            destination &&
            stop.busStopCode === selectedStop?.busStopCode &&
            Math.abs(destination.latitude - stop.latitude) < 0.000001 &&
            Math.abs(destination.longitude - stop.longitude) < 0.000001
          ) &&
          (stop.busStopCode === selectedStop?.busStopCode ||
            stop.busStopCode === recommendedStopCode),
      ),
    [destination, recommendedStopCode, selectedStop?.busStopCode, stops],
  );
  const className = [
    "goassist-leaflet-map",
    lightMode ? "goassist-leaflet-light" : "goassist-leaflet-dark",
    highContrast ? "goassist-leaflet-high-contrast" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <View
      style={[styles.container, { backgroundColor: palette.background }]}
      onLayout={(event) =>
        onLayout({
          height: event.nativeEvent.layout.height,
          width: event.nativeEvent.layout.width,
        })
      }
    >
      {providerState !== "ERROR" ? (
        <MapContainer
          key={providerRetryKey}
          className={className}
          center={toLatLng(viewport.center)}
          zoom={clampZoom(viewport.zoom)}
          minZoom={MIN_MAP_ZOOM}
          maxZoom={MAX_MAP_ZOOM}
          maxBounds={[
            [1.05, 103.45],
            [1.55, 104.2],
          ]}
          maxBoundsViscosity={0.8}
          zoomControl={false}
          attributionControl={false}
          keyboard
          preferCanvas={false}
          style={{ height: "100%", width: "100%" }}
        >
          <AttributionControl position="topright" prefix={false} />
          <TileLayer
            url={WEB_TILE_URL}
            attribution={WEB_TILE_ATTRIBUTION}
            minZoom={MIN_MAP_ZOOM}
            maxZoom={MAX_MAP_ZOOM}
            eventHandlers={{
              tileerror: handleTileError,
              tileload: handleTileLoad,
            }}
          />
          <MapViewportController
            viewport={viewport}
            routeStops={routeStops}
            routeFitKey={routeFitKey}
            routeFitPadding={routeFitPadding}
            reducedMotion={reducedMotion}
            onMove={onMove}
            onViewportChange={onViewportChange}
          />
          <MapResizeController />
          <ClusterAccessibilityController />

          {layers.walkingRoute && routeStops.length > 1 ? (
            <>
              <Polyline
                className="goassist-walking-route-outline"
                positions={routeStops.map(toLatLng)}
                pathOptions={{
                  color: palette.routeOutline,
                  lineCap: "round",
                  lineJoin: "round",
                  opacity: 0.96,
                  weight: highContrast ? 11 : 9,
                }}
              />
              <Polyline
                className={
                  routeMobilityMode === "WHEELCHAIR"
                    ? "goassist-wheelchair-route-primary"
                    : "goassist-walking-route-primary"
                }
                positions={routeStops.map(toLatLng)}
                pathOptions={{
                  color: palette.routePrimary,
                  dashArray:
                    routeMobilityMode === "WHEELCHAIR" ? "14 7" : undefined,
                  lineCap: "round",
                  lineJoin: "round",
                  opacity: 1,
                  weight: highContrast ? 7 : 5,
                }}
              />
            </>
          ) : null}

          {layers.walkingRoute
            ? routeWarnings.map((warning, index) => (
                <Marker
                  key={`${warning.label}-${index}`}
                  position={toLatLng(warning.coordinate)}
                  icon={accessibilityWarningIcon(palette)}
                  title={`Accessibility warning: ${warning.label}`}
                  keyboard
                  zIndexOffset={780}
                />
              ))
            : null}

          {layers.busStops ? (
            <>
              <ClusteredStopMarkers
                stops={clusteredStops}
                stopIcons={stopIcons}
                palette={palette}
                highContrast={highContrast}
                onSelectStop={onSelectStop}
                onFocusCluster={onFocusCluster}
              />
              {priorityStops.map((stop) => {
                const selected = stop.busStopCode === selectedStop?.busStopCode;
                const label = selected
                  ? "Selected bus stop"
                  : "Recommended bus stop";
                return (
                  <AccessibleMarker
                    key={`priority-${stop.busStopCode}`}
                    position={toLatLng(stop)}
                    icon={stopIcons.get(stop.busStopCode)!}
                    accessibilityLabel={`${label} ${stop.description}, ${stop.roadName}, stop ${stop.busStopCode}`}
                    zIndexOffset={selected ? 650 : 500}
                    onPress={() => onSelectStop(stop)}
                  />
                );
              })}
            </>
          ) : null}

          {currentLocation ? (
            <>
              {currentLocation.accuracyMeters !== undefined &&
              Number.isFinite(currentLocation.accuracyMeters) &&
              currentLocation.accuracyMeters > 0 ? (
                <Circle
                  center={toLatLng(currentLocation)}
                  radius={currentLocation.accuracyMeters}
                  pathOptions={{
                    color: palette.currentLocation,
                    fillColor: palette.currentLocationHalo,
                    fillOpacity: 0.2,
                    opacity: 0.72,
                    weight: highContrast ? 3 : 2,
                  }}
                />
              ) : null}
              <AccessibleMarker
                position={toLatLng(currentLocation)}
                icon={userLocationIcon(
                  palette,
                  highContrast,
                  currentLocation.headingDegrees,
                  locationPulseKey,
                )}
                accessibilityLabel={headingAccessibilityLabel(
                  currentLocation.headingDegrees,
                )}
                zIndexOffset={1100}
              />
            </>
          ) : null}

          {destination ? (
            <AccessibleMarker
              position={toLatLng(destination)}
              icon={destinationIcon(palette, highContrast)}
              accessibilityLabel={
                destinationAccessibilityLabel ?? "Selected journey destination"
              }
              zIndexOffset={1050}
            />
          ) : null}

          {activeVehicle ? (
            <AccessibleMarker
              position={toLatLng(activeVehicle.coordinate)}
              icon={vehicleIcon(activeVehicle.serviceNo, palette, highContrast)}
              accessibilityLabel={`Service ${activeVehicle.serviceNo}, current vehicle position`}
              zIndexOffset={900}
            />
          ) : null}
        </MapContainer>
      ) : (
        fallback
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 240,
    overflow: "hidden",
    position: "relative",
  },
});
