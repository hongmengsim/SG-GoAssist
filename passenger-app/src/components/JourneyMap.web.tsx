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
import {
  resolvePresentationSizes,
  type PresentationSizes,
} from "../accessibility/presentationSizes";

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
  callout,
  fill,
  glyphColor,
  kind,
  stroke,
  size,
  strokeWidth,
  sizes,
}: {
  callout?: JourneyMapProps["recommendedStopCallout"];
  fill: string;
  glyphColor: string;
  kind: "default" | "recommended" | "selected";
  stroke: string;
  size: number;
  strokeWidth: number;
  sizes: PresentationSizes;
}) {
  const busGlyph = `<svg aria-hidden="true" viewBox="0 0 16 16" width="66%" height="66%" focusable="false"><path d="M4 2.5h8c.8 0 1.5.7 1.5 1.5v6.5c0 .6-.4 1-1 1H3.5c-.6 0-1-.4-1-1V4c0-.8.7-1.5 1.5-1.5Zm-.2 2v3.4h8.4V4.5H3.8Zm1 4.7a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Zm6.4 0a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8ZM4 11.5v1.3m8-1.3v1.3" fill="none" stroke="${glyphColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const stateBadge =
    kind === "selected"
      ? `<span data-marker-state="selected" style="align-items:center;background:${glyphColor};border:2px solid ${fill};border-radius:50%;box-sizing:border-box;color:${fill};display:flex;font:900 ${sizes.statusIcon}px/1 system-ui,sans-serif;height:${sizes.markerBadge}px;justify-content:center;position:absolute;right:-3px;top:-3px;width:${sizes.markerBadge}px">&#10003;</span>`
      : kind === "recommended"
        ? `<span data-marker-state="recommended" style="align-items:center;background:${glyphColor};border:2px solid ${fill};border-radius:50%;box-sizing:border-box;color:${fill};display:flex;font:900 ${sizes.statusIcon}px/1 system-ui,sans-serif;height:${sizes.markerBadge}px;justify-content:center;position:absolute;right:-3px;top:-3px;width:${sizes.markerBadge}px">&#9733;</span>`
        : "";
  const calloutSymbol =
    callout?.accessibilitySymbol === "ACCESSIBLE"
      ? "&#9855;"
      : callout?.accessibilitySymbol === "PROVISIONAL"
        ? "?"
        : "&#9733;";
  const calloutHtml = callout
    ? `<span class="goassist-recommended-stop-callout" style="font-size:${sizes.bodyText}px;--map-symbol:${sizes.statusIcon}px" title="${escapeHtml(callout.label)}"><span class="goassist-recommended-stop-symbol">${calloutSymbol}</span><span class="goassist-recommended-stop-label">${escapeHtml(callout.label)}</span><span class="goassist-recommended-stop-distance">${escapeHtml(callout.distanceLabel)}</span></span>`
    : "";
  const hitSize = Math.max(48, size);
  return divIcon({
    className: `goassist-leaflet-marker goassist-stop-marker goassist-stop-marker-${kind}`,
    html: `<span aria-hidden="true" data-marker-kind="${kind}" style="align-items:center;box-sizing:border-box;display:flex;justify-content:center;position:relative;width:${size}px;height:${size}px;border-radius:50%;background:${fill};border:${strokeWidth}px solid ${stroke};box-shadow:0 3px 9px rgba(6,37,41,.46);color:${glyphColor}">${busGlyph}${stateBadge}${calloutHtml}</span>`,
    iconAnchor: [hitSize / 2, hitSize / 2],
    iconSize: [hitSize, hitSize],
  });
}

function clusterRadiusForZoom(zoom: number) {
  if (zoom >= 17) {
    return 72;
  }
  if (zoom >= 15) {
    return 84;
  }
  return 96;
}

function stopClusterIcon(
  cluster: MarkerCluster,
  palette: JourneyMapPalette,
  highContrast: boolean,
) {
  const count = cluster.getChildCount();
  const size = count >= 10 ? 72 : 64;
  return divIcon({
    className: "goassist-leaflet-cluster",
    html: `<span aria-hidden="true" data-cluster-count="${count}" style="align-items:center;box-sizing:border-box;display:flex;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${palette.stopSelected};border:${highContrast ? 4 : 3}px solid ${palette.stopOutline};box-shadow:0 3px 9px rgba(6,37,41,.42);color:${palette.textOnMarker};font:900 20px/1 system-ui,sans-serif">${count}</span>`,
    iconAnchor: [size / 2, size / 2],
    iconSize: [size, size],
  });
}

function userLocationIcon(
  palette: JourneyMapPalette,
  highContrast: boolean,
  headingDegrees: number | undefined,
  pulseKey: number,
  sizes: PresentationSizes,
) {
  const headingAvailable =
    headingDegrees !== undefined && Number.isFinite(headingDegrees);
  const outlineWidth = highContrast ? 3.5 : 2.5;
  return divIcon({
    className: "goassist-leaflet-marker goassist-user-location-marker",
    html: `<span aria-hidden="true" class="goassist-user-puck${pulseKey > 0 ? " goassist-user-puck-pulsed" : ""}" style="width:${sizes.stopMarker}px;height:${sizes.stopMarker}px" data-location-pulse-key="${pulseKey}">${
      headingAvailable
        ? `<svg class="goassist-user-heading" data-user-heading="true" viewBox="0 0 44 44" style="transform:rotate(${headingDegrees}deg)" focusable="false"><path d="M22 1 L30 19 L22 16 L14 19 Z" fill="${palette.currentLocation}" stroke="${palette.currentLocationOutline}" stroke-width="${outlineWidth}" stroke-linejoin="round"/><path d="M22 4 L26 15 L22 13 L18 15 Z" fill="#FFFFFF" opacity=".92"/></svg>`
        : ""
    }<span class="goassist-user-puck-shadow"></span><span class="goassist-user-puck-outer" style="background:${palette.currentLocationOutline}"><span class="goassist-user-puck-halo"><span class="goassist-user-puck-core" style="background:${palette.currentLocation}"></span></span></span><span class="goassist-user-puck-pulse" style="border-color:${palette.currentLocation}"></span></span>`,
    iconAnchor: [sizes.stopMarker / 2, sizes.stopMarker / 2],
    iconSize: [sizes.stopMarker, sizes.stopMarker],
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
  sizes: PresentationSizes,
) {
  return divIcon({
    className: "goassist-leaflet-marker",
    html: `<span aria-hidden="true" style="box-sizing:border-box;display:block;width:${sizes.recommendedMarker}px;height:${sizes.stopMarker}px;padding:12px 4px;border-radius:8px;background:${palette.routePrimary};border:${highContrast ? 4 : 2}px solid ${palette.routeOutline};color:${palette.textOnMarker};font:900 ${sizes.buttonText}px/${Math.ceil(sizes.buttonText * 1.35)}px system-ui,sans-serif;text-align:center;box-shadow:0 2px 6px rgba(6,37,41,.35)">${escapeHtml(serviceNo)}</span>`,
    iconAnchor: [sizes.recommendedMarker / 2, sizes.stopMarker / 2],
    iconSize: [sizes.recommendedMarker, sizes.stopMarker],
  });
}

function destinationIcon(
  palette: JourneyMapPalette,
  highContrast: boolean,
  sizes: PresentationSizes,
) {
  return divIcon({
    className: "goassist-leaflet-marker goassist-destination-marker",
    html: `<span aria-hidden="true" class="goassist-destination-pin" style="width:${sizes.stopMarker}px;height:${sizes.stopMarker}px;background:${palette.stopSelected};border-color:${palette.stopOutline};border-width:${highContrast ? 4 : 3}px"><svg viewBox="0 0 24 24" focusable="false"><path d="M5 16V7c0-2 1.5-3 7-3s7 1 7 3v9m-14 0h14m-12 0v3m10-3v3M8 8h8M8 12h2m4 0h2" fill="none" stroke="${palette.textOnMarker}" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.3"/></svg></span>`,
    iconAnchor: [sizes.stopMarker / 2, sizes.stopMarker / 2],
    iconSize: [sizes.stopMarker, sizes.stopMarker],
  });
}

function accessibilityWarningIcon(
  palette: JourneyMapPalette,
  sizes: PresentationSizes,
) {
  return divIcon({
    className: "goassist-accessibility-warning-icon",
    html: `<span aria-hidden="true" style="width:${sizes.controlHeight}px;height:${sizes.controlHeight}px;font-size:${sizes.actionIcon}px;background:${escapeHtml(palette.routeOutline)};color:${escapeHtml(palette.textOnMarker)}">!</span>`,
    iconAnchor: [sizes.controlHeight / 2, sizes.controlHeight / 2],
    iconSize: [sizes.controlHeight, sizes.controlHeight],
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
  focusStop,
  sizes,
  viewport,
  routeStops,
  routeFitKey,
  routeFitPadding,
  reducedMotion,
  onMove,
  onViewportChange,
}: {
  focusStop: (JourneyMapCoordinate & { busStopCode: string }) | null;
  sizes: PresentationSizes;
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
  const manuallyMovedRef = useRef(false);
  const map = useMapEvents({
    dragstart: () => {
      if (applyingViewportRef.current) {
        return;
      }
      userGestureRef.current = true;
      manuallyMovedRef.current = true;
      onMove();
    },
    zoomstart: () => {
      if (applyingViewportRef.current) {
        return;
      }
      userGestureRef.current = true;
      manuallyMovedRef.current = true;
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
  useEffect(() => {
    if (!focusStop || manuallyMovedRef.current) return;
    let timer: ReturnType<typeof setTimeout>;
    const frameStop = () => {
      if (manuallyMovedRef.current) return;
      const mapRect = map.getContainer().getBoundingClientRect();
      const card = document
        .querySelector('[data-testid="recommended-stop-card"]')
        ?.getBoundingClientRect();
      if (!card) return;
      const toolbar = document
        .querySelector('[data-testid="map-side-control-stack"]')
        ?.getBoundingClientRect();
      const callout = map
        .getContainer()
        .querySelector(".goassist-recommended-stop-callout");
      const markerRect = callout
        ?.closest("[data-marker-kind]")
        ?.getBoundingClientRect();
      if (!markerRect) return;
      const point = {
        x: markerRect.left + markerRect.width / 2 - mapRect.left,
        y: markerRect.top + markerRect.height / 2 - mapRect.top,
      };
      const calloutHeight = callout?.getBoundingClientRect().height ?? 48;
      // Discovery uses the actual overlays, not the route-fitting padding:
      // the latter reserves space for a different, expanded directions sheet.
      const top =
        (toolbar?.bottom ?? mapRect.top) -
        mapRect.top +
        markerRect.height / 2 +
        calloutHeight +
        10;
      const bottom = card.top - mapRect.top - markerRect.height / 2 - 6;
      if (bottom < top) return;
      const x = Math.max(126, Math.min(mapRect.width - 126, point.x));
      const y = Math.max(top, Math.min(bottom, point.y));
      if (Math.abs(x - point.x) + Math.abs(y - point.y) > 1) {
        applyingViewportRef.current = true;
        map.panBy([point.x - x, point.y - y], { animate: false });
      }
    };
    const scheduleFrame = () => {
      clearTimeout(timer);
      timer = setTimeout(frameStop, 180);
    };
    map.on("moveend resize", scheduleFrame);
    scheduleFrame();
    return () => {
      clearTimeout(timer);
      map.off("moveend resize", scheduleFrame);
    };
  }, [
    map,
    focusStop?.busStopCode,
    routeFitPadding.bottom,
    sizes.recommendedMarker,
  ]);
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
  }, [fitRouteToVisibleMap, routeFitKey, routeStops]);

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

/** Keep the label inside the map without moving the passenger's map camera. */
function RecommendedCalloutLayout({ sizes }: { sizes: PresentationSizes }) {
  const map = useMap();
  useEffect(() => {
    let frame = 0;
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = map.getContainer().getBoundingClientRect();
        const toolbar = document
          .querySelector('[data-testid="map-side-control-stack"]')
          ?.getBoundingClientRect();
        const card = document
          .querySelector('[data-testid="recommended-stop-card"]')
          ?.getBoundingClientRect();
        map
          .getContainer()
          .querySelectorAll<HTMLElement>(".goassist-recommended-stop-callout")
          .forEach((label) => {
            label.style.marginLeft = "0px";
            label.style.marginTop = "0px";
            label.style.top = "auto";
            label.style.bottom = "calc(100% + 8px)";
            const above = label.getBoundingClientRect();
            if (toolbar && above.top < toolbar.bottom + 8) {
              label.style.top = "calc(100% + 12px)";
              label.style.bottom = "auto";
            }
            const rect = label.getBoundingClientRect();
            const shift =
              rect.left < bounds.left + 12
                ? bounds.left + 12 - rect.left
                : rect.right > bounds.right - 12
                  ? bounds.right - 12 - rect.right
                  : 0;
            label.style.marginLeft = `${shift}px`;
            if (card && rect.bottom > card.top - 8) {
              label.style.marginTop = `${Math.min(0, card.top - 8 - rect.bottom)}px`;
            }
          });
      });
    };
    const observer = new MutationObserver(place);
    observer.observe(map.getPanes().markerPane, {
      childList: true,
      subtree: true,
    });
    map.on("moveend zoomend resize", place);
    place();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      map.off("moveend zoomend resize", place);
    };
  }, [map, sizes.bodyText, sizes.recommendedMarker]);
  return null;
}

export function JourneyMap({
  presentationSizes: sizes = resolvePresentationSizes(),
  stops,
  stopDensity = "ALL",
  recommendedStopCode: preferredRecommendedStopCode,
  recommendedStopCallout,
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
  const providerFailureLoggedRef = useRef(false);
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
    providerFailureLoggedRef.current = false;
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
    onProviderAvailabilityChange(providerState !== "ERROR");
  }, [onProviderAvailabilityChange, providerState]);

  useEffect(() => {
    if (providerState !== "INITIALIZING") {
      return undefined;
    }
    const timeout = setTimeout(() => {
      if (
        __DEV__ &&
        process.env.NODE_ENV !== "test" &&
        !providerFailureLoggedRef.current
      ) {
        providerFailureLoggedRef.current = true;
        console.warn("[Map] OpenStreetMap unavailable; using offline map");
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

  const handleTileError = useCallback(
    (event?: LeafletEvent) => {
      const tileSource = (event as LeafletEvent & { tile?: HTMLImageElement })
        ?.tile?.src;
      // A data-URI tile is an intentional offline/test provider. Some browser
      // engines still emit tileerror for tiny placeholder images, but the map
      // itself remains fully functional and must not be replaced by fallback UI.
      if (tileSource?.startsWith("data:image/")) {
        handleTileLoad();
        return;
      }
      tileErrorCountRef.current += 1;
      if (tileLoadedRef.current || tileErrorCountRef.current < 3) {
        return;
      }
      if (
        __DEV__ &&
        process.env.NODE_ENV !== "test" &&
        !providerFailureLoggedRef.current
      ) {
        providerFailureLoggedRef.current = true;
        console.warn("[Map] OpenStreetMap unavailable; using offline map", {
          failedTiles: tileErrorCountRef.current,
        });
      }
      setProviderState("ERROR");
    },
    [handleTileLoad],
  );

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
              size: selected
                ? sizes.selectedMarker
                : recommended
                  ? sizes.recommendedMarker
                  : sizes.stopMarker,
              sizes,
              stroke: palette.stopOutline,
              strokeWidth: highContrast ? 4 : selected ? 3 : 2,
              callout: recommended ? recommendedStopCallout : undefined,
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
      recommendedStopCallout,
      selectedStop?.busStopCode,
      stops,
      sizes,
    ],
  );
  const clusteredStops = useMemo(
    () =>
      stopDensity === "ALL"
        ? stops.filter(
            (stop) =>
              stop.busStopCode !== selectedStop?.busStopCode &&
              stop.busStopCode !== recommendedStopCode,
          )
        : [],
    [recommendedStopCode, selectedStop?.busStopCode, stopDensity, stops],
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
          (stopDensity === "PRIORITIZED" ||
            stop.busStopCode === selectedStop?.busStopCode ||
            stop.busStopCode === recommendedStopCode),
      ),
    [
      destination,
      recommendedStopCode,
      selectedStop?.busStopCode,
      stopDensity,
      stops,
    ],
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
            focusStop={
              selectedStop ??
              stops.find((stop) => stop.busStopCode === recommendedStopCode) ??
              null
            }
            sizes={sizes}
            viewport={viewport}
            routeStops={routeStops}
            routeFitKey={routeFitKey}
            routeFitPadding={routeFitPadding}
            reducedMotion={reducedMotion}
            onMove={onMove}
            onViewportChange={onViewportChange}
          />
          <MapResizeController />
          <RecommendedCalloutLayout sizes={sizes} />
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
                  icon={accessibilityWarningIcon(palette, sizes)}
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
                  : stop.busStopCode === recommendedStopCode
                    ? "Recommended bus stop"
                    : "Nearby bus stop";
                return (
                  <AccessibleMarker
                    key={`priority-${stop.busStopCode}`}
                    position={toLatLng(stop)}
                    icon={stopIcons.get(stop.busStopCode)!}
                    accessibilityLabel={`${label} ${stop.description}, ${stop.roadName}, stop ${stop.busStopCode}`}
                    zIndexOffset={
                      selected || stop.busStopCode === recommendedStopCode
                        ? 1200
                        : 500
                    }
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
                  sizes,
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
              icon={destinationIcon(palette, highContrast, sizes)}
              accessibilityLabel={
                destinationAccessibilityLabel ?? "Selected journey destination"
              }
              zIndexOffset={1050}
            />
          ) : null}

          {activeVehicle ? (
            <AccessibleMarker
              position={toLatLng(activeVehicle.coordinate)}
              icon={vehicleIcon(
                activeVehicle.serviceNo,
                palette,
                highContrast,
                sizes,
              )}
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
