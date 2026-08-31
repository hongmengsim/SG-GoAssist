import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BusFront, Check, Star } from "lucide-react-native";
import MapView, {
  Circle,
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  type MapStyleElement,
  type Region,
} from "react-native-maps";
import type { NearbyBusStop } from "@buspass/shared";
import type {
  NativeJourneyMapProps,
  NativeMapCoordinate,
} from "./NativeJourneyMap.types";

type StopCluster = {
  key: string;
  center: NativeMapCoordinate;
  stops: NearbyBusStop[];
};

function longitudeDeltaForZoom(zoom: number) {
  return Math.max(0.0014, Math.min(0.18, 360 / 2 ** zoom));
}

function regionForViewport(
  viewport: NativeJourneyMapProps["viewport"],
  aspectRatio: number,
): Region {
  const longitudeDelta = longitudeDeltaForZoom(viewport.zoom);
  return {
    latitude: viewport.center.latitude,
    longitude: viewport.center.longitude,
    latitudeDelta: longitudeDelta * aspectRatio,
    longitudeDelta,
  };
}

function zoomForRegion(region: Region) {
  return Math.max(2, Math.min(20, Math.log2(360 / region.longitudeDelta)));
}

function clusterStops(
  stops: NearbyBusStop[],
  selectedStopCode: string | undefined,
  recommendedStopCode: string | undefined,
  zoom: number,
): StopCluster[] {
  const cellSize = Math.max(0.00035, 0.0028 * 2 ** (15 - zoom));
  const groups = new Map<string, NearbyBusStop[]>();

  stops.forEach((stop) => {
    if (
      stop.busStopCode === selectedStopCode ||
      stop.busStopCode === recommendedStopCode
    ) {
      return;
    }
    const key = `${Math.round(stop.latitude / cellSize)}:${Math.round(
      stop.longitude / cellSize,
    )}`;
    const group = groups.get(key) ?? [];
    group.push(stop);
    groups.set(key, group);
  });

  return Array.from(groups.entries()).map(([key, groupedStops]) => ({
    key,
    center: {
      latitude:
        groupedStops.reduce((sum, stop) => sum + stop.latitude, 0) /
        groupedStops.length,
      longitude:
        groupedStops.reduce((sum, stop) => sum + stop.longitude, 0) /
        groupedStops.length,
    },
    stops: groupedStops,
  }));
}

function nativeMapStyle(
  lightMode: boolean,
  highContrast: boolean,
): MapStyleElement[] {
  if (highContrast) {
    return [
      {
        elementType: "geometry",
        stylers: [{ color: lightMode ? "#FFFFFF" : "#090C0D" }],
      },
      {
        elementType: "labels.text.fill",
        stylers: [{ color: lightMode ? "#000000" : "#FFFFFF" }],
      },
      {
        elementType: "labels.text.stroke",
        stylers: [{ color: lightMode ? "#FFFFFF" : "#000000" }],
      },
      {
        featureType: "water",
        elementType: "geometry",
        stylers: [{ color: lightMode ? "#BDEBFA" : "#102B34" }],
      },
    ];
  }

  if (lightMode) {
    return [];
  }

  return [
    { elementType: "geometry", stylers: [{ color: "#172B32" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#DDF7FB" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#071216" }] },
    {
      featureType: "road",
      elementType: "geometry",
      stylers: [{ color: "#31505A" }],
    },
    {
      featureType: "water",
      elementType: "geometry",
      stylers: [{ color: "#123746" }],
    },
  ];
}

export function NativeJourneyMap({
  stops,
  recommendedStopCode,
  selectedStop,
  currentLocation,
  viewport,
  layers,
  routeStops,
  routeMobilityMode,
  destination,
  activeVehicle,
  palette,
  highContrast,
  lightMode,
  providerRetryKey,
  fallback,
  onLayout,
  onMove,
  onProviderAvailabilityChange,
  onViewportChange,
  onSelectStop,
  onFocusCluster,
}: NativeJourneyMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const userGestureRef = useRef(false);
  const [providerReady, setProviderReady] = useState(false);
  const [providerTimedOut, setProviderTimedOut] = useState(false);
  const [layout, setLayout] = useState({ height: 720, width: 390 });
  const aspectRatio = layout.height / Math.max(layout.width, 1);
  const initialRegion = useMemo(
    () => regionForViewport(viewport, aspectRatio),
    [],
  );
  const recommendedStop = useMemo(
    () =>
      stops.find(
        (stop) =>
          stop.busStopCode === recommendedStopCode &&
          stop.busStopCode !== selectedStop?.busStopCode,
      ) ?? null,
    [recommendedStopCode, selectedStop?.busStopCode, stops],
  );
  const clusters = useMemo(
    () =>
      clusterStops(
        stops,
        selectedStop?.busStopCode,
        recommendedStopCode,
        viewport.zoom,
      ),
    [recommendedStopCode, selectedStop?.busStopCode, stops, viewport.zoom],
  );

  useEffect(() => {
    onProviderAvailabilityChange(providerReady && !providerTimedOut);
  }, [onProviderAvailabilityChange, providerReady, providerTimedOut]);

  useEffect(() => {
    setProviderReady(false);
    setProviderTimedOut(false);
    userGestureRef.current = false;
    if (providerRetryKey > 0 && __DEV__ && process.env.NODE_ENV !== "test") {
      console.info("[Map] native retry started", {
        apiKeyConfigured: Boolean(
          process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim(),
        ),
        attempt: providerRetryKey,
      });
    }
  }, [providerRetryKey]);

  useEffect(() => {
    if (providerReady) {
      return undefined;
    }
    const timeout = setTimeout(() => {
      if (__DEV__ && process.env.NODE_ENV !== "test") {
        console.error("[Map] native initialization timed out", {
          apiKeyConfigured: Boolean(
            process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim(),
          ),
          attempt: providerRetryKey,
        });
      }
      setProviderTimedOut(true);
    }, 12_000);
    return () => clearTimeout(timeout);
  }, [providerReady, providerRetryKey]);

  useEffect(() => {
    if (!providerReady) {
      return;
    }
    mapRef.current?.setCamera({
      center: viewport.center,
      heading: viewport.bearing,
      pitch: viewport.pitch,
      zoom: viewport.zoom,
    });
  }, [
    providerReady,
    viewport.bearing,
    viewport.center.latitude,
    viewport.center.longitude,
    viewport.pitch,
    viewport.zoom,
  ]);

  if (providerTimedOut) {
    return <View style={styles.container}>{fallback}</View>;
  }

  return (
    <View
      style={[styles.container, { backgroundColor: palette.background }]}
      onLayout={(event) => {
        const nextLayout = {
          height: event.nativeEvent.layout.height,
          width: event.nativeEvent.layout.width,
        };
        setLayout(nextLayout);
        onLayout(nextLayout);
      }}
    >
      <MapView
        key={providerRetryKey}
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        customMapStyle={nativeMapStyle(lightMode, highContrast)}
        loadingEnabled
        moveOnMarkerPress={false}
        pitchEnabled
        rotateEnabled
        showsCompass={false}
        showsMyLocationButton={false}
        showsUserLocation={false}
        toolbarEnabled={false}
        onMapReady={() => {
          setProviderTimedOut(false);
          setProviderReady(true);
          if (__DEV__ && process.env.NODE_ENV !== "test") {
            console.info("[Map] native initialization ready");
          }
        }}
        onPanDrag={() => {
          userGestureRef.current = true;
        }}
        onRegionChangeComplete={(region) => {
          if (!userGestureRef.current) {
            return;
          }
          userGestureRef.current = false;
          const nextCenter = {
            latitude: region.latitude,
            longitude: region.longitude,
          };
          const fallbackViewport = {
            bearing: viewport.bearing,
            center: nextCenter,
            pitch: viewport.pitch,
            zoom: zoomForRegion(region),
          };
          const map = mapRef.current;
          if (!map) {
            onViewportChange(fallbackViewport);
            return;
          }
          void map
            .getCamera()
            .then((camera) =>
              onViewportChange({
                bearing: camera.heading ?? viewport.bearing,
                center: nextCenter,
                pitch: camera.pitch ?? viewport.pitch,
                zoom: camera.zoom ?? fallbackViewport.zoom,
              }),
            )
            .catch(() => onViewportChange(fallbackViewport));
        }}
      >
        {layers.walkingRoute && routeStops.length > 1 ? (
          <>
            <Polyline
              coordinates={routeStops}
              strokeColor={palette.routeOutline}
              strokeWidth={highContrast ? 11 : 9}
              zIndex={499}
            />
            <Polyline
              coordinates={routeStops}
              strokeColor={palette.routePrimary}
              strokeWidth={highContrast ? 7 : 5}
              lineDashPattern={
                routeMobilityMode === "WHEELCHAIR" ? [14, 7] : undefined
              }
              zIndex={500}
            />
          </>
        ) : null}

        {layers.busStops
          ? clusters.map((cluster) => {
              if (cluster.stops.length > 1) {
                return (
                  <Marker
                    key={`cluster-${cluster.key}`}
                    coordinate={cluster.center}
                    accessibilityLabel={`Cluster of ${cluster.stops.length} nearby bus stops`}
                    onPress={() => onFocusCluster(cluster.center)}
                    tracksViewChanges={false}
                    zIndex={600}
                  >
                    <View
                      style={[
                        styles.clusterMarker,
                        {
                          backgroundColor: palette.stopSelected,
                          borderColor: palette.routeOutline,
                        },
                        highContrast && styles.highContrastMarker,
                      ]}
                    >
                      <Text
                        style={[
                          styles.clusterText,
                          { color: palette.textOnMarker },
                        ]}
                      >
                        {cluster.stops.length}
                      </Text>
                    </View>
                  </Marker>
                );
              }

              const stop = cluster.stops[0];
              return (
                <Marker
                  key={stop.busStopCode}
                  coordinate={stop}
                  accessibilityLabel={`${stop.description}, bus stop ${stop.busStopCode}`}
                  onPress={() => onSelectStop(stop)}
                  tracksViewChanges={false}
                  zIndex={550}
                >
                  <View
                    style={[
                      styles.stopMarker,
                      {
                        backgroundColor: palette.stopDefault,
                        borderColor: palette.stopOutline,
                      },
                      highContrast && styles.highContrastMarker,
                    ]}
                  >
                    <BusFront
                      color={palette.textOnMarker}
                      size={26}
                      strokeWidth={3}
                    />
                  </View>
                </Marker>
              );
            })
          : null}

        {layers.busStops && recommendedStop ? (
          <Marker
            coordinate={recommendedStop}
            accessibilityLabel={`Recommended bus stop. ${recommendedStop.description}, bus stop ${recommendedStop.busStopCode}`}
            onPress={() => onSelectStop(recommendedStop)}
            tracksViewChanges={false}
            zIndex={700}
          >
            <View
              style={[
                styles.recommendedStopMarker,
                {
                  backgroundColor: palette.stopRecommended,
                  borderColor: palette.stopOutline,
                },
                highContrast && styles.highContrastMarker,
              ]}
            >
              <BusFront
                color={palette.textOnMarker}
                size={29}
                strokeWidth={3}
              />
              <View
                style={[
                  styles.stopStateBadge,
                  { backgroundColor: palette.stopOutline },
                ]}
              >
                <Star color="#FFFFFF" fill="#FFFFFF" size={11} />
              </View>
            </View>
          </Marker>
        ) : null}

        {selectedStop ? (
          <Marker
            coordinate={selectedStop}
            accessibilityLabel={`Selected bus stop. ${selectedStop.description}, bus stop ${selectedStop.busStopCode}`}
            onPress={() => onSelectStop(selectedStop)}
            tracksViewChanges={false}
            zIndex={800}
          >
            <View
              style={[
                styles.selectedStopMarker,
                {
                  backgroundColor: palette.stopSelected,
                  borderColor: palette.stopOutline,
                },
                highContrast && styles.highContrastMarker,
              ]}
            >
              <BusFront
                color={palette.textOnMarker}
                size={31}
                strokeWidth={3}
              />
              <View
                style={[
                  styles.stopStateBadge,
                  { backgroundColor: palette.stopOutline },
                ]}
              >
                <Check color="#FFFFFF" size={12} strokeWidth={4} />
              </View>
            </View>
          </Marker>
        ) : null}

        {currentLocation ? (
          <>
            <Circle
              center={currentLocation}
              radius={Math.max(24, currentLocation.accuracyMeters ?? 35)}
              fillColor={palette.currentLocationHalo}
              strokeColor={palette.currentLocation}
              strokeWidth={highContrast ? 3 : 2}
              zIndex={700}
            />
            <Marker
              coordinate={currentLocation}
              accessibilityLabel="Your current location"
              tracksViewChanges={false}
              zIndex={900}
            >
              <View
                style={[
                  styles.userMarker,
                  {
                    backgroundColor: palette.currentLocation,
                    borderColor: palette.currentLocationOutline,
                  },
                  highContrast && styles.highContrastMarker,
                ]}
              />
            </Marker>
          </>
        ) : null}

        {destination ? (
          <Marker
            coordinate={destination}
            accessibilityLabel="Selected journey destination"
            pinColor={palette.stopSelected}
            tracksViewChanges={false}
            zIndex={750}
          />
        ) : null}

        {activeVehicle ? (
          <Marker
            coordinate={activeVehicle.coordinate}
            accessibilityLabel={`Service ${activeVehicle.serviceNo}, current vehicle position`}
            tracksViewChanges={false}
            zIndex={950}
          >
            <View
              style={[
                styles.vehicleMarker,
                {
                  backgroundColor: palette.routePrimary,
                  borderColor: palette.routeOutline,
                },
                highContrast && styles.highContrastMarker,
              ]}
            >
              <Text
                style={[
                  styles.vehicleMarkerText,
                  { color: palette.textOnMarker },
                ]}
              >
                {activeVehicle.serviceNo}
              </Text>
            </View>
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 240,
    overflow: "hidden",
  },
  stopMarker: {
    alignItems: "center",
    borderRadius: 22,
    borderWidth: 3,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  recommendedStopMarker: {
    alignItems: "center",
    borderRadius: 25,
    borderWidth: 3,
    height: 50,
    justifyContent: "center",
    position: "relative",
    width: 50,
  },
  selectedStopMarker: {
    alignItems: "center",
    borderRadius: 27,
    borderWidth: 3,
    height: 54,
    justifyContent: "center",
    position: "relative",
    width: 54,
  },
  stopStateBadge: {
    alignItems: "center",
    borderColor: "#FFFFFF",
    borderRadius: 9,
    borderWidth: 2,
    height: 18,
    justifyContent: "center",
    position: "absolute",
    right: -3,
    top: -3,
    width: 18,
  },
  userMarker: {
    borderRadius: 11,
    borderWidth: 3,
    height: 22,
    width: 22,
  },
  clusterMarker: {
    alignItems: "center",
    borderRadius: 24,
    borderWidth: 3,
    height: 48,
    justifyContent: "center",
    minWidth: 48,
    paddingHorizontal: 6,
  },
  clusterText: {
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 21,
  },
  vehicleMarker: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 2,
    justifyContent: "center",
    minHeight: 32,
    minWidth: 42,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  vehicleMarkerText: {
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 17,
  },
  highContrastMarker: {
    borderWidth: 4,
  },
});
