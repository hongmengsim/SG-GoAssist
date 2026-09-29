import type { NearbyBusStop } from "@buspass/shared";
import type { ReactNode } from "react";
import type { PresentationSizes } from "../accessibility/presentationSizes";

export type JourneyMapCoordinate = {
  latitude: number;
  longitude: number;
};

export type JourneyMapViewport = {
  center: JourneyMapCoordinate;
  zoom: number;
  bearing: number;
  pitch: number;
};

export type JourneyMapPalette = {
  background: string;
  currentLocation: string;
  currentLocationHalo: string;
  currentLocationLabelSurface: string;
  currentLocationLabelText: string;
  currentLocationOutline: string;
  routeOutline: string;
  routePrimary: string;
  stopDefault: string;
  stopOutline: string;
  stopRecommended: string;
  stopSelected: string;
  textOnMarker: string;
};

export type JourneyMapProps = {
  presentationSizes?: PresentationSizes;
  stops: NearbyBusStop[];
  stopDensity?: "PRIORITIZED" | "ALL";
  recommendedStopCode?: string;
  recommendedStopCallout?: {
    label: string;
    distanceLabel: string;
    accessibilitySymbol: "ACCESSIBLE" | "PROVISIONAL" | "STANDARD";
  };
  selectedStop: NearbyBusStop | null;
  currentLocation:
    | (JourneyMapCoordinate & {
        accuracyMeters?: number;
        headingDegrees?: number;
      })
    | null;
  viewport: JourneyMapViewport;
  layers: {
    busStops: boolean;
    walkingRoute: boolean;
  };
  routeStops: JourneyMapCoordinate[];
  routeMobilityMode?: "WALKING" | "WHEELCHAIR";
  routeWarnings?: Array<{
    coordinate: JourneyMapCoordinate;
    label: string;
  }>;
  routeFitKey: number;
  routeFitPadding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  destination: JourneyMapCoordinate | null;
  destinationAccessibilityLabel?: string;
  activeVehicle: {
    coordinate: JourneyMapCoordinate;
    serviceNo: string;
  } | null;
  palette: JourneyMapPalette;
  highContrast: boolean;
  lightMode: boolean;
  locationPulseKey: number;
  reducedMotion: boolean;
  providerRetryKey: number;
  fallback: ReactNode;
  onLayout: (layout: { width: number; height: number }) => void;
  onMove: () => void;
  onProviderAvailabilityChange: (ready: boolean) => void;
  onViewportChange: (viewport: JourneyMapViewport) => void;
  onSelectStop: (stop: NearbyBusStop) => void;
  onFocusCluster: (center: JourneyMapCoordinate) => void;
};
