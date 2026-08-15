import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  Accessibility,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bell,
  BusFront,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleHelp,
  CircleQuestionMark,
  CircleX,
  Clock,
  Compass,
  DoorOpen,
  Footprints,
  Home,
  List,
  LocateFixed,
  Map as MapIcon,
  MapPinned,
  MapPin,
  Navigation,
  RefreshCw,
  Route,
  Search,
  Settings,
  SlidersHorizontal,
  Undo2,
  User,
  Volume2,
  type LucideIcon,
} from "lucide-react-native";
import type {
  AccessibilityRequirements,
  AppAccessibilityPreferences,
  AssistanceRequestStatus,
  AssistanceType,
  Bus,
  ArrivalBus,
  BusStopArrivalsResponse,
  JourneyPhase,
  NearbyBusStop,
  NearbyBusStopsResponse,
  PassengerProfile,
  RouteStop,
  StatusUpdateMessage,
  VerificationMethod,
  VehicleStatus,
} from "@buspass/shared";
import { assistanceTypesForPhase } from "@buspass/shared";
import {
  cancelAssistanceRequest,
  createAssistanceRequest,
  fetchBusStopArrivals,
  findNearbyBusStops,
} from "./src/api/assistanceApi";
import { subscribeToRequestStatus } from "./src/api/statusSocket";
import * as Location from "expo-location";

const brandLogo = require("./assets/applogo.png");
const optionIcons = {
  wheelchairAssistance: require("./assets/wheelchair-assistance.png"),
  busIdentification: require("./assets/bus-identification.png"),
  increasedDuration: require("./assets/increased-duration.png"),
  screenReader: require("./assets/screen-reader.png"),
  repeatAnnouncements: require("./assets/repeat_announcements.png"),
  hapticAlerts: require("./assets/haptic_alerts.png"),
  largeText: require("./assets/large-text.png"),
  highContrast: require("./assets/high-contrast.png"),
};
type TabIconName = "home" | "journey" | "assist" | "profile";

type Screen =
  | "AUTH"
  | "PROFILE"
  | "LOCATION"
  | "STOP"
  | "BUS"
  | "ACCESSIBILITY"
  | "CONFIRM"
  | "STATUS"
  | "ONBOARD"
  | "ALIGHTING_STOP"
  | "COMPLETED";

type AppTab = "HOME" | "JOURNEY" | "ASSISTANCE" | "PROFILE";
type MapLandmark = {
  id: string;
  name: string;
  category: "building" | "station" | "hospital" | "park" | "crossing";
  tier: 1 | 2 | 3;
  latitude: number;
  longitude: number;
  relatedStopCodes: string[];
};
type MapLayerKey = "busStops" | "selectedService" | "landmarks" | "walkingRoute" | "accessibility";
type MapLayers = Record<MapLayerKey, boolean>;
type BottomSheetState = "HIDDEN_PEEK" | "COLLAPSED" | "MEDIUM" | "EXPANDED";
type UsefulBottomSheetState = Exclude<BottomSheetState, "HIDDEN_PEEK">;

const iconSizes = {
  small: 19,
  standard: 24,
  large: 30,
  hero: 38,
};

const APP_ICONS = {
  home: Home,
  journey: Route,
  assist: Accessibility,
  profile: User,
  locate: LocateFixed,
  nearby: List,
  more: SlidersHorizontal,
  search: Search,
  route: Route,
  back: ArrowLeft,
  expand: ChevronUp,
  collapse: ChevronDown,
} satisfies Record<string, LucideIcon>;

function appIcon(name: keyof typeof APP_ICONS | string): LucideIcon {
  const Icon = APP_ICONS[name as keyof typeof APP_ICONS];
  if (Icon) {
    return Icon;
  }
  if (__DEV__) {
    console.warn(`Missing icon mapping: ${name}`);
  }
  return CircleHelp;
}

const defaultRequirements: AccessibilityRequirements = {
  wheelchairRamp: false,
  busAudioIdentification: false,
  extendedDwellTime: false,
};

const defaultAppPreferences: AppAccessibilityPreferences = {
  screenReaderOptimised: true,
  hapticAlerts: true,
  largeText: false,
  highContrast: false,
  repeatAudio: true,
  themeMode: "light",
};
const defaultMapLayers: MapLayers = {
  busStops: true,
  selectedService: true,
  landmarks: true,
  walkingRoute: true,
  accessibility: false,
};

const localPreferencesKey = "sg-goassist.preferences.v1";
const destination = "Kent Ridge Terminal";
const boardingStop = "Changi Airport Terminal 1";
const kentRidgeRouteStops: RouteStop[] = [
  {
    sequence: 0,
    busStopCode: "18301",
    roadName: "Kent Ridge Cres",
    description: "Kent Ridge Crescent",
    latitude: 1.29398,
    longitude: 103.77104,
  },
  {
    sequence: 1,
    busStopCode: "18321",
    roadName: "Kent Ridge Cres",
    description: "Opp Heng Mui Keng Terrace",
    latitude: 1.29295,
    longitude: 103.77508,
  },
  {
    sequence: 2,
    busStopCode: "18331",
    roadName: "Science Dr 2",
    description: "Science Drive",
    latitude: 1.29528,
    longitude: 103.7782,
  },
  {
    sequence: 3,
    busStopCode: "18341",
    roadName: "Science Dr 2",
    description: "Opp Science Drive",
    latitude: 1.29612,
    longitude: 103.78072,
  },
  {
    sequence: 4,
    busStopCode: "19011",
    roadName: "Kent Ridge Cres",
    description: "Kent Ridge Terminal",
    latitude: 1.2942,
    longitude: 103.7711,
  },
];
const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};
const radius = {
  sm: 6,
  md: 8,
  pill: 999,
};
const borders = {
  default: 2,
  selected: 4,
  highContrast: 4,
};
const typography = {
  pageTitle: 30,
  sectionTitle: 24,
  cardTitle: 20,
  body: 17,
  secondary: 15,
  badge: 14,
};
const touchTarget = {
  min: 48,
  comfortable: 56,
};
const manualStopLookup = {
  latitude: 1.2942,
  longitude: 103.7711,
  accuracyMeters: 0,
};
const nearbyStopsCacheMs = 5 * 60 * 1000;
const arrivalsCacheMs = 20 * 1000;
const maxRenderedMapStops = 8;
const enableCameraDebugLogs = false;
const mapViewportPaddingPercent = 12;
const minimumMapSpanMeters = 260;
const searchAreaThresholdMeters = 180;
const mapZoomLimits = {
  min: 13,
  journeyMin: 14,
  fullRouteMin: 12,
  max: 19,
};
const bottomNavigationHeight = 66;
const mapOverlayMargin = 12;
const rightToolbarWidth = 64;
const mapTopControlGap = 8;
const mapBottomSheetHeights: Record<BottomSheetState, number> = {
  HIDDEN_PEEK: 58,
  COLLAPSED: 96,
  MEDIUM: 330,
  EXPANDED: 560,
};
type ViewportSource =
  | "USER_LOCATION"
  | "USER_PAN"
  | "SEARCH_RESULT"
  | "SELECTED_STOP"
  | "ROUTE"
  | "ACTIVE_JOURNEY"
  | "FULL_ROUTE"
  | "DESTINATION_FOCUS";
type MapViewport = {
  center: MapCoordinate;
  zoom: number;
  bearing: number;
  pitch: number;
  mode: ViewportSource;
};
type CameraCommand =
  | "locateUser"
  | "initialLocation"
  | "manualPan"
  | "focusStop"
  | "fitWalkingRoute"
  | "fitFullRoute"
  | "searchResult"
  | "resetMap"
  | "northUp";
type NearbySearchOrigin = {
  center: MapCoordinate & { accuracyMeters?: number };
  label: string;
  source: ViewportSource;
};
const orientationLandmarks: MapLandmark[] = [
  {
    id: "university-hall",
    name: "University Hall",
    category: "building",
    tier: 1,
    latitude: 1.29455,
    longitude: 103.77138,
    relatedStopCodes: ["18301", "18309"],
  },
  {
    id: "kent-ridge-crescent-crossing",
    name: "Kent Ridge Crescent crossing",
    category: "crossing",
    tier: 1,
    latitude: 1.29408,
    longitude: 103.77128,
    relatedStopCodes: ["18301", "18309"],
  },
  {
    id: "nus-park",
    name: "NUS green",
    category: "park",
    tier: 2,
    latitude: 1.29348,
    longitude: 103.77265,
    relatedStopCodes: ["18321"],
  },
  {
    id: "kent-ridge-mrt",
    name: "Kent Ridge MRT",
    category: "station",
    tier: 1,
    latitude: 1.29318,
    longitude: 103.78408,
    relatedStopCodes: ["19011"],
  },
];
const colors = {
  background: "#0F2024",
  surface: "#183238",
  lightSurface: "#23474E",
  primary: "#86C5DA",
  primaryDark: "#102A30",
  primarySoft: "#A8D9E5",
  highlight: "#86C5DA",
  success: "#A8D9B8",
  text: "#F7FAFA",
  muted: "#C5D3D6",
  metadata: "#C5D3D6",
  body: "#F7FAFA",
  border: "#719097",
  error: "#EF8585",
  disabledBackground: "#2E464C",
  disabledBorder: "#719097",
  disabledText: "#C5D3D6",
  focusIndicator: "#8DD6E8",
  surfaceSecondary: "#23474E",
  textOnPrimary: "#102A30",
  location: "#8DD6E8",
  textOnLocation: "#102A30",
  accessible: "#A8D9B8",
  textOnAccessible: "#102A30",
  warning: "#F5C65A",
  textOnWarning: "#102A30",
  assistance: "#B9A9E8",
  textOnAssistance: "#17202B",
  danger: "#EF8585",
  textOnDanger: "#251010",
};

const lightTheme = {
  background: "#F7FAFA",
  surface: "#FFFFFF",
  surfaceSecondary: "#E5ECEE",
  text: "#203438",
  textSecondary: "#52676C",
  primary: "#0B6670",
  primaryStrong: "#12343B",
  textOnPrimary: "#FFFFFF",
  location: "#86C5DA",
  textOnLocation: "#102A30",
  accessible: "#CDE8D5",
  textOnAccessible: "#102A30",
  warning: "#F5B942",
  textOnWarning: "#102A30",
  assistance: "#6B5CA5",
  textOnAssistance: "#FFFFFF",
  danger: "#B83F3F",
  textOnDanger: "#FFFFFF",
  border: "#A9BABE",
};

const visualThemes = {
  light: {
    colors: {
      backgroundPrimary: "#F7FAFA",
      backgroundSecondary: "#EEF6F7",
      surfacePrimary: "#FFFFFF",
      surfaceRaised: "#F2F7F8",
      textPrimary: "#203438",
      textSecondary: "#52676C",
      textMuted: "#60767B",
      textDisabled: "#6F858A",
      iconPrimary: "#0B6670",
      iconSecondary: "#52676C",
      iconSelected: "#FFFFFF",
      iconDisabled: "#6F858A",
      iconOnAccent: "#FFFFFF",
      selectedSurface: "#0B6670",
      borderDefault: "#A9BABE",
      borderStrong: "#486269",
      actionPrimary: "#0B6670",
      actionPrimaryText: "#FFFFFF",
      actionSecondary: "#E5ECEE",
      locationCurrent: "#0B6F8A",
      stopDefault: "#0B6670",
      stopRecommended: "#0B6F8A",
      stopSelected: "#0B6670",
      destination: "#6B5CA5",
      statusSuccess: "#2F7A46",
      statusAttention: "#A56A00",
      statusError: "#B83F3F",
      statusInformation: "#0B6F8A",
      routePrimary: "#0B6F8A",
      routeAccessible: "#2F7A46",
      focusIndicator: "#0B6F8A",
      map: {
        background: "#DCE9E7",
        land: "#E7F0EE",
        grid: "rgba(65, 98, 101, 0.18)",
        park: "#BFDCC8",
        water: "#B7DDE8",
        building: "#D2DDDE",
        majorRoad: "#FFFFFF",
        minorRoad: "#F8FAFA",
        roadBorder: "#B3BEC0",
        label: "#385258",
        labelSecondary: "#52676C",
        floatingSurface: "#FFFFFF",
        floatingBorder: "#8BA7AA",
        overlaySurface: "#FFFFFF",
        overlaySurfaceElevated: "#F2F7F8",
        overlayBorder: "#8BA7AA",
        controlSurface: "#FFFFFF",
        controlBorder: "#8BA7AA",
        controlIcon: "#0B6670",
        sheetSurface: "#FFFFFF",
        sheetBorder: "#A9BABE",
        navigationSurface: "#FFFFFF",
        navigationDivider: "#A9BABE",
        currentLocation: "#0B6F8A",
        currentLocationHalo: "rgba(11, 111, 138, 0.16)",
        currentLocationOutline: "#FFFFFF",
        stopDefault: "#0B6670",
        stopRecommended: "#0B6F8A",
        stopSelected: "#0B6670",
        stopSurface: "#FFFFFF",
        stopOutline: "#FFFFFF",
        destination: "#6B5CA5",
        selectionAccent: "#0B6670",
        routePrimary: "#0B6F8A",
        routeOutline: "rgba(255, 255, 255, 0.92)",
        handle: "#6F858A",
      },
    },
  },
  dark: {
    colors: {
      backgroundPrimary: "#081316",
      backgroundSecondary: "#102227",
      surfacePrimary: "#182D33",
      surfaceRaised: "#203B43",
      textPrimary: "#F4FAFB",
      textSecondary: "#C8D9DD",
      textMuted: "#9EB3B8",
      textDisabled: "#A7BABF",
      iconPrimary: "#E8F6F8",
      iconSecondary: "#B7D0D5",
      iconSelected: "#EFFFFF",
      iconDisabled: "#9FB3B8",
      iconOnAccent: "#021B20",
      selectedSurface: "#0F4E5A",
      borderDefault: "#4E6A71",
      borderStrong: "#9FC0C8",
      actionPrimary: "#62D4E8",
      actionPrimaryText: "#021B20",
      actionSecondary: "#23474E",
      locationCurrent: "#8DD6E8",
      stopDefault: "#86C5DA",
      stopRecommended: "#8DD6E8",
      stopSelected: "#86C5DA",
      destination: "#B9A9E8",
      statusSuccess: "#A8D9B8",
      statusAttention: "#F5C65A",
      statusError: "#EF8585",
      statusInformation: "#8DD6E8",
      routePrimary: "#8DD6E8",
      routeAccessible: "#A8D9B8",
      focusIndicator: "#8DD6E8",
      map: {
        background: "#0A171A",
        land: "#122428",
        grid: "rgba(198, 222, 226, 0.11)",
        park: "#163326",
        water: "#0F2A36",
        building: "#1B3036",
        majorRoad: "#3F5961",
        minorRoad: "#263C43",
        roadBorder: "#5D7780",
        label: "#D8E8EB",
        labelSecondary: "#ADC5CB",
        floatingSurface: "#1B3036",
        floatingBorder: "#527078",
        overlaySurface: "#1B3036",
        overlaySurfaceElevated: "#263F47",
        overlayBorder: "#5D7A83",
        controlSurface: "#1D353C",
        controlBorder: "#5E7B84",
        controlIcon: "#DDF7FB",
        sheetSurface: "#203941",
        sheetBorder: "#6E8A93",
        navigationSurface: "#14282E",
        navigationDivider: "#4F6C74",
        currentLocation: "#9EDDEA",
        currentLocationHalo: "rgba(158, 221, 234, 0.18)",
        currentLocationOutline: "#17262A",
        stopDefault: "#7FBCCA",
        stopRecommended: "#A2D9E4",
        stopSelected: "#9EDDEA",
        stopSurface: "#223236",
        stopOutline: "#17262A",
        destination: "#C8B9F2",
        selectionAccent: "#62D4E8",
        routePrimary: "#7ADAE9",
        routeOutline: "#132125",
        handle: "#B8CDD2",
      },
    },
  },
  highContrastLight: {
    colors: {
      backgroundPrimary: "#FFFFFF",
      backgroundSecondary: "#F4F7F8",
      surfacePrimary: "#FFFFFF",
      surfaceRaised: "#F0F5F6",
      textPrimary: "#000000",
      textSecondary: "#1B1B1B",
      textMuted: "#333333",
      textDisabled: "#4A4A4A",
      iconPrimary: "#000000",
      iconSecondary: "#1B1B1B",
      iconSelected: "#FFFFFF",
      iconDisabled: "#4A4A4A",
      iconOnAccent: "#FFFFFF",
      selectedSurface: "#074B6A",
      borderDefault: "#000000",
      borderStrong: "#000000",
      actionPrimary: "#074B6A",
      actionPrimaryText: "#FFFFFF",
      actionSecondary: "#EAF2F4",
      locationCurrent: "#074B6A",
      stopDefault: "#074B6A",
      stopRecommended: "#074B6A",
      stopSelected: "#063D58",
      destination: "#3E2C76",
      statusSuccess: "#145A2B",
      statusAttention: "#7A4A00",
      statusError: "#8F1E1E",
      statusInformation: "#074B6A",
      routePrimary: "#074B6A",
      routeAccessible: "#145A2B",
      focusIndicator: "#000000",
      map: {
        background: "#FFFFFF",
        land: "#FFFFFF",
        grid: "rgba(0, 0, 0, 0.22)",
        park: "#DCEEDF",
        water: "#D5EEF5",
        building: "#EEEEEE",
        majorRoad: "#FFFFFF",
        minorRoad: "#E8E8E8",
        roadBorder: "#000000",
        label: "#000000",
        labelSecondary: "#1B1B1B",
        floatingSurface: "#FFFFFF",
        floatingBorder: "#000000",
        overlaySurface: "#FFFFFF",
        overlaySurfaceElevated: "#F0F5F6",
        overlayBorder: "#000000",
        controlSurface: "#FFFFFF",
        controlBorder: "#000000",
        controlIcon: "#031E2B",
        sheetSurface: "#FFFFFF",
        sheetBorder: "#000000",
        navigationSurface: "#FFFFFF",
        navigationDivider: "#000000",
        currentLocation: "#074B6A",
        currentLocationHalo: "rgba(7, 75, 106, 0.18)",
        currentLocationOutline: "#000000",
        stopDefault: "#074B6A",
        stopRecommended: "#063D58",
        stopSelected: "#031E2B",
        stopSurface: "#FFFFFF",
        stopOutline: "#000000",
        destination: "#3E2C76",
        selectionAccent: "#031E2B",
        routePrimary: "#074B6A",
        routeOutline: "#FFFFFF",
        handle: "#000000",
      },
    },
  },
  highContrastDark: {
    colors: {
      backgroundPrimary: "#050505",
      backgroundSecondary: "#111111",
      surfacePrimary: "#181818",
      surfaceRaised: "#242424",
      textPrimary: "#FFFFFF",
      textSecondary: "#F0F0F0",
      textMuted: "#D8D8D8",
      textDisabled: "#DADADA",
      iconPrimary: "#FFFFFF",
      iconSecondary: "#F0F0F0",
      iconSelected: "#000000",
      iconDisabled: "#DADADA",
      iconOnAccent: "#000000",
      selectedSurface: "#9FF2FF",
      borderDefault: "#FFFFFF",
      borderStrong: "#FFFFFF",
      actionPrimary: "#7FE8FF",
      actionPrimaryText: "#001B22",
      actionSecondary: "#242424",
      locationCurrent: "#7FE8FF",
      stopDefault: "#7FE8FF",
      stopRecommended: "#7FE8FF",
      stopSelected: "#FFFFFF",
      destination: "#D8CCFF",
      statusSuccess: "#A9F0BA",
      statusAttention: "#FFD45E",
      statusError: "#FF9A9A",
      statusInformation: "#7FE8FF",
      routePrimary: "#FFFFFF",
      routeAccessible: "#A9F0BA",
      focusIndicator: "#FFFFFF",
      map: {
        background: "#06090A",
        land: "#0D1113",
        grid: "rgba(255, 255, 255, 0.08)",
        park: "#101710",
        water: "#0B1420",
        building: "#15191B",
        majorRoad: "#5C6367",
        minorRoad: "#2E3437",
        roadBorder: "#FFFFFF",
        label: "#FFFFFF",
        labelSecondary: "#E4E4E4",
        floatingSurface: "#171C1F",
        floatingBorder: "#FFFFFF",
        overlaySurface: "#171C1F",
        overlaySurfaceElevated: "#2F373B",
        overlayBorder: "#FFFFFF",
        controlSurface: "#171C1F",
        controlBorder: "#FFFFFF",
        controlIcon: "#FFFFFF",
        sheetSurface: "#171C1F",
        sheetBorder: "#FFFFFF",
        navigationSurface: "#111517",
        navigationDivider: "#FFFFFF",
        currentLocation: "#7FE8FF",
        currentLocationHalo: "rgba(127, 232, 255, 0.22)",
        currentLocationOutline: "#FFFFFF",
        stopDefault: "#7FE8FF",
        stopRecommended: "#FFFFFF",
        stopSelected: "#FFFFFF",
        stopSurface: "#06090A",
        stopOutline: "#FFFFFF",
        destination: "#D8CCFF",
        selectionAccent: "#FFFFFF",
        routePrimary: "#7FE8FF",
        routeOutline: "#000000",
        handle: "#FFFFFF",
      },
    },
  },
} as const;

function resolveVisualTheme(lightMode: boolean, highContrast: boolean) {
  if (highContrast && lightMode) {
    return visualThemes.highContrastLight;
  }
  if (highContrast) {
    return visualThemes.highContrastDark;
  }
  return lightMode ? visualThemes.light : visualThemes.dark;
}

const profileTimestamp = new Date().toISOString();
const demoProfiles: PassengerProfile[] = [
  {
    profileId: "demo-visual",
    displayName: "Visual Guidance Profile",
    email: "visual.demo@sg-goassist.local",
    verificationStatus: "VERIFIED",
    verificationMethod: "DEMO_CREDENTIAL",
    verifiedCredentialLast4: "4821",
    verifiedAt: profileTimestamp,
    assistanceDefaults: {
      wheelchairRamp: false,
      busAudioIdentification: true,
      extendedDwellTime: false,
    },
    appPreferences: {
      screenReaderOptimised: true,
      hapticAlerts: true,
      largeText: true,
      highContrast: true,
      repeatAudio: true,
      themeMode: "light",
    },
    createdAt: profileTimestamp,
    updatedAt: profileTimestamp,
  },
];

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.container}>
            <BrandHeader highContrast={false} />
            <Text style={styles.errorText}>The app could not start.</Text>
            <Text style={styles.bodyText}>{this.state.error.message}</Text>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <SgGoAssistApp />
    </AppErrorBoundary>
  );
}

function SgGoAssistApp() {
  const { width } = useWindowDimensions();
  const isCompactWidth = width < 380;
  const [screen, setScreen] = useState<Screen>("LOCATION");
  const [profiles, setProfiles] = useState<PassengerProfile[]>(demoProfiles);
  const [activeProfile, setActiveProfile] = useState<PassengerProfile | null>(null);
  const [isEditingProfileNeeds, setIsEditingProfileNeeds] = useState(false);
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [verificationMethod, setVerificationMethod] =
    useState<VerificationMethod>("DEMO_CREDENTIAL");
  const [credentialLast4, setCredentialLast4] = useState("");
  const [requirements, setRequirements] = useState(defaultRequirements);
  const [journeyRequirements, setJourneyRequirements] = useState(defaultRequirements);
  const [appPreferences, setAppPreferences] = useState(defaultAppPreferences);
  const [nearbyStops, setNearbyStops] = useState<NearbyBusStop[]>([]);
  const [selectedStop, setSelectedStop] = useState<NearbyBusStop | null>(null);
  const [selectedLandmarkId, setSelectedLandmarkId] = useState<string | null>(null);
  const [mapViewMode, setMapViewMode] = useState<"MAP" | "LIST">("MAP");
  const [bottomSheetState, setBottomSheetState] = useState<BottomSheetState>("COLLAPSED");
  const [lastExpandedSheetState, setLastExpandedSheetState] =
    useState<UsefulBottomSheetState>("COLLAPSED");
  const [stopSearchQuery, setStopSearchQuery] = useState("");
  const [mapLayers, setMapLayers] = useState<MapLayers>(defaultMapLayers);
  const [mapManuallyMoved, setMapManuallyMoved] = useState(false);
  const [viewportSource, setViewportSource] = useState<ViewportSource>("USER_LOCATION");
  const [mapCameraMode, setMapCameraMode] = useState<ViewportSource>("USER_LOCATION");
  const [mapViewport, setMapViewport] = useState<MapViewport>({
    center: manualStopLookup,
    zoom: 15,
    bearing: 0,
    pitch: 0,
    mode: "USER_LOCATION",
  });
  const [lastStopQueryOrigin, setLastStopQueryOrigin] = useState<NearbySearchOrigin | null>(null);
  const [nearbySearchOrigin, setNearbySearchOrigin] = useState<NearbySearchOrigin>({
    center: manualStopLookup,
    label: "Nearby bus stops",
    source: "USER_LOCATION",
  });
  const [directionsActive, setDirectionsActive] = useState(false);
  const [followMode, setFollowMode] = useState(false);
  const [mapRotationEnabled, setMapRotationEnabled] = useState(false);
  const [mapHeadingDegrees, setMapHeadingDegrees] = useState(24);
  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
  } | null>(null);
  const [arrivingBuses, setArrivingBuses] = useState<ArrivalBus[]>([]);
  const [selectedBus, setSelectedBus] = useState<Bus | null>(null);
  const [selectedArrival, setSelectedArrival] = useState<ArrivalBus | null>(null);
  const [journeyPhase, setJourneyPhase] = useState<JourneyPhase>("DISCOVERY");
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [selectedAlightingStop, setSelectedAlightingStop] = useState<RouteStop | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [requestStatus, setRequestStatus] = useState<AssistanceRequestStatus | null>(null);
  const [confirmingCancelRequest, setConfirmingCancelRequest] = useState(false);
  const [vehicleStatus, setVehicleStatus] = useState<VehicleStatus | null>(null);
  const [events, setEvents] = useState<StatusUpdateMessage[]>([]);
  const [visualAlert, setVisualAlert] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nearbyStopsCacheRef = useRef(
    new Map<string, { timestamp: number; result: NearbyBusStopsResponse }>()
  );
  const arrivalsCacheRef = useRef(
    new Map<string, { timestamp: number; result: BusStopArrivalsResponse }>()
  );
  const stopsRequestRef = useRef<{ id: number; controller: AbortController | null }>({
    id: 0,
    controller: null,
  });
  const arrivalsRequestRef = useRef<{ id: number; controller: AbortController | null }>({
    id: 0,
    controller: null,
  });
  const lastLocationResultRef = useRef<{
    timestamp: number;
    coords: { latitude: number; longitude: number; accuracyMeters?: number };
  } | null>(null);
  const initialCameraAppliedRef = useRef(false);
  const cameraIntentIdRef = useRef(0);

  const assistanceTypes = useMemo(
    () => assistanceTypesForPhase(journeyRequirements, "BOARDING"),
    [journeyRequirements]
  );
  const alightingAssistanceTypes = useMemo(
    () => assistanceTypesForPhase(requirements, "ALIGHTING"),
    [requirements]
  );
  const selectedNeeds = useMemo(
    () => assistanceTypes.map(readableAssistanceType).join(", "),
    [assistanceTypes]
  );
  const currentRouteStop = routeStops[currentStopIndex] ?? null;
  const nextRouteStop = routeStops[currentStopIndex + 1] ?? null;
  const plannedRouteStops = useMemo(
    () => routeStopsForBus(selectedBus, selectedStop, selectedArrival),
    [selectedArrival, selectedBus, selectedStop]
  );
  const selectedAlightingStopIndex = routeStopIndex(routeStops, selectedAlightingStop);
  const stopsRemaining = stopsRemainingToDestination(
    routeStops,
    currentStopIndex,
    selectedAlightingStop
  );
  const destinationApproaching =
    stopsRemaining !== null && stopsRemaining > 1 && stopsRemaining <= 2;
  const selectedStopIsNext =
    Boolean(selectedAlightingStop && nextRouteStop) &&
    selectedAlightingStop?.busStopCode === nextRouteStop?.busStopCode;
  const selectedStopReached =
    Boolean(selectedAlightingStop && currentRouteStop) &&
    selectedAlightingStop?.busStopCode === currentRouteStop?.busStopCode;
  const visibleStops = useMemo(() => {
    const query = stopSearchQuery.trim().toLowerCase();
    if (!query) {
      return nearbyStops;
    }

    return nearbyStops.filter((stop) => {
      const stopText = [stop.description, stop.roadName, stop.busStopCode]
        .join(" ")
        .toLowerCase();
      const serviceText = busServicesForStop(stop).join(" ").toLowerCase();
      const landmarkMatch = orientationLandmarks.some(
        (landmark) =>
          landmark.relatedStopCodes.includes(stop.busStopCode) &&
          [landmark.name, landmark.category].join(" ").toLowerCase().includes(query)
      );
      return stopText.includes(query) || serviceText.includes(query) || landmarkMatch;
    });
  }, [nearbyStops, stopSearchQuery]);
  const updateBottomSheetState = useCallback((state: BottomSheetState) => {
    setBottomSheetState(state);
    if (state !== "HIDDEN_PEEK") {
      setLastExpandedSheetState(state);
    }
  }, []);
  const runCameraCommand = useCallback(
    (
      command: CameraCommand,
      mode: ViewportSource,
      update: (current: MapViewport) => MapViewport
    ) => {
      cameraIntentIdRef.current += 1;
      if (__DEV__ && enableCameraDebugLogs) {
        console.info(`CAMERA: ${command}`, { mode });
      }
      setMapViewport((current) => {
        const next = update(current);
        return {
          ...next,
          zoom: clampMapZoom(next.zoom, mode),
          mode,
        };
      });
      setViewportSource(mode);
      setMapCameraMode(mode);
      setMapManuallyMoved(mode === "USER_PAN");
    },
    []
  );
  const visibleLandmarks = useMemo(() => {
    const stopCodes = new Set(visibleStops.map((stop) => stop.busStopCode));
    const query = stopSearchQuery.trim().toLowerCase();
    return orientationLandmarks.filter((landmark) => {
      const relatedToVisibleStop = landmark.relatedStopCodes.some((code) => stopCodes.has(code));
      const queryMatch = [landmark.name, landmark.category].join(" ").toLowerCase().includes(query);
      return landmark.tier <= 2 && (relatedToVisibleStop || Boolean(query && queryMatch));
    });
  }, [stopSearchQuery, visibleStops]);
  const selectedLandmark = useMemo(
    () =>
      selectedLandmarkId
        ? orientationLandmarks.find((landmark) => landmark.id === selectedLandmarkId) ?? null
        : selectedStop
          ? orientationLandmarks.find((landmark) =>
              landmark.relatedStopCodes.includes(selectedStop.busStopCode)
            ) ?? null
          : null,
    [selectedLandmarkId, selectedStop]
  );
  const searchThisAreaVisible = useMemo(() => {
    if (viewportSource !== "USER_PAN" || !lastStopQueryOrigin) {
      return false;
    }
    return distanceBetweenCoordinates(mapViewport.center, lastStopQueryOrigin.center) > searchAreaThresholdMeters;
  }, [lastStopQueryOrigin, mapViewport.center, viewportSource]);
  const selectStopForBoarding = useCallback((stop: NearbyBusStop) => {
    setSelectedStop(stop);
    setSelectedLandmarkId(null);
    updateBottomSheetState("MEDIUM");
    setDirectionsActive(false);
    setFollowMode(false);
    runCameraCommand("focusStop", "SELECTED_STOP", (current) => ({
      ...current,
      center: stop,
      zoom: 17,
    }));
    AccessibilityInfo.announceForAccessibility(`Selected bus stop, ${stop.description}.`);
  }, [runCameraCommand, updateBottomSheetState]);
  const markMapMoved = useCallback(() => {
    runCameraCommand("manualPan", "USER_PAN", (current) => ({
      ...current,
      center: {
        latitude: current.center.latitude + 0.0038,
        longitude: current.center.longitude + 0.0108,
        accuracyMeters: 0,
      },
      zoom: clampMapZoom(current.zoom - 1, "USER_PAN"),
      bearing: current.bearing,
      pitch: current.pitch,
    }));
    setFollowMode(false);
  }, [runCameraCommand]);
  const recenterStopMap = useCallback(() => {
    runCameraCommand("locateUser", "USER_LOCATION", (current) => ({
      ...current,
      center: currentLocation ?? manualStopLookup,
      zoom: clampMapZoom(Math.max(15, current.zoom), "USER_LOCATION"),
      bearing: 0,
      pitch: 0,
    }));
    setFollowMode(false);
  }, [currentLocation, runCameraCommand]);
  const confirmSelectedStop = useCallback(() => {
    if (selectedStop) {
      confirmBusStop(selectedStop);
    }
  }, [selectedStop]);
  const hearSelectedStop = useCallback(() => {
    if (selectedStop) {
      AccessibilityInfo.announceForAccessibility(stopAnnouncement(selectedStop));
    }
  }, [selectedStop]);
  const startDirections = useCallback(() => {
    if (!selectedStop) {
      return;
    }
    setDirectionsActive(true);
    updateBottomSheetState("EXPANDED");
    setFollowMode(false);
    setViewportSource("ROUTE");
    setMapCameraMode("ROUTE");
    AccessibilityInfo.announceForAccessibility(firstMoveInstruction(selectedStop, selectedLandmark));
  }, [selectedLandmark, selectedStop, updateBottomSheetState]);
  const toggleFollowMode = useCallback(() => {
    setFollowMode((current) => !current);
    runCameraCommand("locateUser", "USER_LOCATION", (current) => ({ ...current }));
  }, [runCameraCommand]);
  const showWholeRoute = useCallback(() => {
    setDirectionsActive(true);
    setMapManuallyMoved(false);
    runCameraCommand("fitWalkingRoute", "ROUTE", (current) => ({
      ...current,
      center: selectedStop ?? current.center,
      zoom: clampMapZoom(15, "ROUTE"),
    }));
  }, [runCameraCommand, selectedStop]);
  const rotateMap = useCallback(() => {
    setMapRotationEnabled((current) => {
      const enabled = !current;
      setMapViewport((viewport) => ({
        ...viewport,
        bearing: enabled ? (viewport.bearing === 0 ? 35 : viewport.bearing) : 0,
        mode: viewport.mode,
      }));
      return enabled;
    });
  }, []);
  const resetMapNorth = useCallback(() => {
    setMapRotationEnabled(false);
    setMapHeadingDegrees(0);
    runCameraCommand("northUp", mapCameraMode, (current) => ({ ...current, bearing: 0, pitch: 0 }));
  }, [mapCameraMode, runCameraCommand]);
  const resetMapView = useCallback(() => {
    setMapRotationEnabled(false);
    setMapLayers(defaultMapLayers);
    setFollowMode(false);
    const mode = selectedStop ? "SELECTED_STOP" : "USER_LOCATION";
    runCameraCommand("resetMap", mode, (current) => ({
      ...current,
      center: selectedStop ?? currentLocation ?? manualStopLookup,
      zoom: selectedStop ? 17 : 15,
      bearing: 0,
      pitch: 0,
    }));
  }, [currentLocation, runCameraCommand, selectedStop]);
  const viewFullRoute = useCallback(() => {
    setFollowMode(false);
    runCameraCommand("fitFullRoute", "FULL_ROUTE", (current) => ({
      ...current,
      center: selectedStop ?? selectedLandmark ?? current.center,
      zoom: mapZoomLimits.fullRouteMin,
    }));
  }, [runCameraCommand, selectedLandmark, selectedStop]);
  const hearDirections = useCallback(() => {
    if (selectedStop) {
      AccessibilityInfo.announceForAccessibility(routeAnnouncement(selectedStop, selectedLandmark));
    }
  }, [selectedLandmark, selectedStop]);
  const selectLandmark = useCallback((landmark: MapLandmark) => {
    setSelectedLandmarkId(landmark.id);
    setSelectedStop(null);
    setDirectionsActive(false);
    setFollowMode(false);
    runCameraCommand("searchResult", "SEARCH_RESULT", (current) => ({
      ...current,
      center: landmark,
      zoom: 16,
    }));
    AccessibilityInfo.announceForAccessibility(`${landmark.name}. Nearby bus stops are shown.`);
  }, [runCameraCommand]);
  const sessionId = activeProfile?.profileId ?? "demo-passenger-session";
  const activeTab = getActiveTab(screen);
  const resolvedThemeMode = appPreferences.themeMode;
  const lightMode = resolvedThemeMode === "light";
  const highContrastDark = appPreferences.highContrast && !lightMode;
  const highContrastLight = appPreferences.highContrast && lightMode;

  useEffect(() => {
    const saved = readSavedPreferences();
    if (!saved) {
      return;
    }

    setRequirements(saved.assistanceDefaults);
    setJourneyRequirements(saved.assistanceDefaults);
    setAppPreferences(saved.appPreferences);
  }, []);

  useEffect(() => {
    savePreferencesLocally({
      assistanceDefaults: requirements,
      appPreferences,
    });
  }, [appPreferences, requirements]);

  useEffect(() => {
    if (!visualAlert) {
      return undefined;
    }

    const timeout = setTimeout(
      () => setVisualAlert(null),
      requirements.extendedDwellTime ? 6000 : 3200
    );
    return () => clearTimeout(timeout);
  }, [requirements.extendedDwellTime, visualAlert]);

  useEffect(() => {
    if (!requestId) {
      return;
    }

    return subscribeToRequestStatus(
      requestId,
      (message) => {
        setEvents((current) => [message, ...current]);

        if (message.type === "REQUEST_STATUS") {
          setRequestStatus(message.status);
          if (message.status === "ACKNOWLEDGED") {
            notifyPassenger(
              `Your assistance request is confirmed for Service ${message.busService}. You do not need to request again.`,
              Haptics.NotificationFeedbackType.Success
            );
          }
        }

        if (message.type === "VEHICLE_STATUS") {
          setVehicleStatus(message.status);
          if (message.status === "APPROACHING") {
            notifyPassenger(
              `Your bus is approaching. Service ${message.busService} will arrive soon.`,
              Haptics.NotificationFeedbackType.Warning,
              2
            );
          }
          if (message.status === "ARRIVED") {
            notifyPassenger(
              `Your bus is here. Service ${message.busService} is at the stop.`,
              Haptics.NotificationFeedbackType.Success
            );
          }
        }
      },
      () => setError("We are having trouble updating live bus status. Your request is still saved.")
    );
  }, [appPreferences.hapticAlerts, requestId]);

  function notifyPassenger(
    message: string,
    feedbackType: Haptics.NotificationFeedbackType,
    vibrationCount = 1
  ) {
    setVisualAlert(message);
    AccessibilityInfo.announceForAccessibility(message);
    if (appPreferences.hapticAlerts) {
      Haptics.notificationAsync(feedbackType);
      if (vibrationCount > 1) {
        setTimeout(() => Haptics.notificationAsync(feedbackType), 500);
      }
    }
  }

  function announceCurrentJourney() {
    if (
      selectedBus &&
      (journeyPhase === "ONBOARD" ||
        journeyPhase === "DESTINATION_APPROACHING" ||
        journeyPhase === "DESTINATION_NEXT" ||
        journeyPhase === "DISEMBARKING" ||
        journeyPhase === "ALIGHTING")
    ) {
      const announcement = [
        `On Service ${selectedBus.busService}.`,
        nextRouteStop ? `Next stop: ${nextRouteStop.description}.` : "Final stop.",
        selectedAlightingStop ? `Destination: ${selectedAlightingStop.description}.` : "Destination not selected.",
        stopsRemaining === null
          ? undefined
          : stopsRemaining === 0
            ? "This is your stop."
            : stopsRemaining === 1
              ? "Your stop is next."
              : `${stopsRemaining} stops remaining.`,
      ]
        .filter(Boolean)
        .join(" ");
      setVisualAlert(announcement);
      AccessibilityInfo.announceForAccessibility(announcement);
      return;
    }

    const announcement = [
      selectedBus ? `Bus ${selectedBus.busService} selected.` : undefined,
      selectedArrival
        ? `Arriving in approximately ${Math.ceil(selectedArrival.etaSeconds / 60)} minutes.`
        : undefined,
      selectedArrival?.destination ? `Towards ${selectedArrival.destination}.` : undefined,
      selectedStop
        ? `Boarding from bus stop ${selectedStop.busStopCode}, ${selectedStop.description}.`
        : undefined,
      selectedNeeds ? `Assistance selected: ${selectedNeeds}.` : undefined,
      requestStatus ? `${requestStatusLabel(requestStatus)}.` : undefined,
      vehicleStatus ? `${vehicleStatusLabel(vehicleStatus)}.` : undefined,
    ]
      .filter(Boolean)
      .join(" ");

    if (announcement) {
      setVisualAlert(announcement);
      AccessibilityInfo.announceForAccessibility(announcement);
    }
  }

  function createProfile() {
    const displayName = authName.trim() || "Passenger";
    const email = authEmail.trim().toLowerCase() || `${Date.now()}@sg-goassist.local`;
    const now = new Date().toISOString();
    const profile: PassengerProfile = {
      profileId: `profile-${Date.now()}`,
      displayName,
      email,
      verificationStatus: "UNVERIFIED",
      assistanceDefaults: requirements,
      appPreferences,
      createdAt: now,
      updatedAt: now,
    };

    setProfiles((current) => [profile, ...current]);
    applyProfile(profile, "PROFILE");
  }

  function applyProfile(profile: PassengerProfile, nextScreen: Screen = "PROFILE") {
    setActiveProfile(profile);
    setIsEditingProfileNeeds(false);
    setRequirements(profile.assistanceDefaults);
    if (!selectedBus || requestStatus) {
      setJourneyRequirements(profile.assistanceDefaults);
    }
    setAppPreferences(profile.appPreferences);
    setScreen(nextScreen);
    AccessibilityInfo.announceForAccessibility(`Signed in as ${profile.displayName}.`);
  }

  function saveActiveProfile() {
    if (!activeProfile) {
      return;
    }

    const updatedProfile: PassengerProfile = {
      ...activeProfile,
      assistanceDefaults: requirements,
      appPreferences,
      updatedAt: new Date().toISOString(),
    };

    setActiveProfile(updatedProfile);
    setProfiles((current) =>
      current.map((profile) =>
        profile.profileId === updatedProfile.profileId ? updatedProfile : profile
      )
    );
    setVisualAlert("Preferences saved");
    if (appPreferences.hapticAlerts) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    AccessibilityInfo.announceForAccessibility("Preferences saved.");
    setIsEditingProfileNeeds(false);
  }

  function signOut() {
    setActiveProfile(null);
    setIsEditingProfileNeeds(false);
    setRequirements(defaultRequirements);
    setJourneyRequirements(defaultRequirements);
    setAppPreferences(defaultAppPreferences);
    setVerificationMethod("DEMO_CREDENTIAL");
    setCredentialLast4("");
    setVisualAlert(null);
    setScreen("PROFILE");
    AccessibilityInfo.announceForAccessibility("Signed out. Profile settings cleared.");
  }

  function verifyActiveProfile() {
    if (!activeProfile) {
      return;
    }

    const trimmedCredential = credentialLast4.trim();
    const now = new Date().toISOString();
    const verified = verificationMethod === "DEMO_CREDENTIAL" || trimmedCredential === "4821";
    const updatedProfile: PassengerProfile = {
      ...activeProfile,
      verificationStatus: verified ? "VERIFIED" : "PENDING",
      verificationMethod,
      verifiedCredentialLast4: trimmedCredential || undefined,
      verifiedAt: verified ? now : undefined,
      updatedAt: now,
    };

    setActiveProfile(updatedProfile);
    setProfiles((current) =>
      current.map((profile) =>
        profile.profileId === updatedProfile.profileId ? updatedProfile : profile
      )
    );
    setVisualAlert(
      verified
        ? "Accessibility profile verified."
        : "Verification pending. You can still use journey accessibility features."
    );
    AccessibilityInfo.announceForAccessibility(
      verified
        ? "Accessibility profile verified."
        : "Verification pending. You can still use journey accessibility features."
    );
  }

  function openTab(tab: AppTab) {
    if (tab === "HOME") {
      setScreen("LOCATION");
      return;
    }
    if (tab === "JOURNEY") {
      if (
        journeyPhase === "ONBOARD" ||
        journeyPhase === "DESTINATION_APPROACHING" ||
        journeyPhase === "DESTINATION_NEXT" ||
        journeyPhase === "DISEMBARKING" ||
        journeyPhase === "ALIGHTING"
      ) {
        setScreen("ONBOARD");
        return;
      }
      if (journeyPhase === "COMPLETED") {
        setScreen("COMPLETED");
        return;
      }
      if (requestId) {
        setScreen("STATUS");
        return;
      }
      if (selectedBus) {
        setScreen("CONFIRM");
        return;
      }
      if (nearbyStops.length === 0) {
        void loadManualStops();
      }
      setScreen("STOP");
      return;
    }
    if (tab === "ASSISTANCE") {
      setScreen("ACCESSIBILITY");
      return;
    }
    setScreen("PROFILE");
    setIsEditingProfileNeeds(false);
  }

  function returnToCurrentJourney() {
    openTab("JOURNEY");
  }

  function useUsualAssistanceForJourney() {
    setJourneyRequirements(requirements);
    setVisualAlert("Using your saved assistance for this journey.");
    AccessibilityInfo.announceForAccessibility("Using your saved assistance for this journey.");
  }

  function saveJourneyAssistanceAsDefault() {
    setRequirements(journeyRequirements);
    if (activeProfile) {
      const updatedProfile: PassengerProfile = {
        ...activeProfile,
        assistanceDefaults: journeyRequirements,
        updatedAt: new Date().toISOString(),
      };
      setActiveProfile(updatedProfile);
      setProfiles((current) =>
        current.map((profile) =>
          profile.profileId === updatedProfile.profileId ? updatedProfile : profile
        )
      );
    }
    setVisualAlert("Saved these assistance choices for future journeys.");
    AccessibilityInfo.announceForAccessibility("Saved these assistance choices for future journeys.");
  }

  function nearbyStopsCacheKey(payload: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
  }) {
    return `${payload.latitude.toFixed(4)}:${payload.longitude.toFixed(4)}:${Math.round(
      payload.accuracyMeters ?? 0
    )}`;
  }

  function applyNearbyStopsResult(
    result: NearbyBusStopsResponse,
    options: {
      preserveSelection?: boolean;
      keepViewport?: boolean;
      updateCamera?: boolean;
      originLabel?: string;
      viewportSource?: ViewportSource;
    } = {}
  ) {
    setNearbyStops(result.stops);
    if (!options.preserveSelection) {
      setSelectedStop(null);
      setSelectedLandmarkId(null);
      setDirectionsActive(false);
      setFollowMode(false);
    }
    const queryCenter = {
      latitude: result.debug.latitude,
      longitude: result.debug.longitude,
      accuracyMeters: result.debug.accuracyMeters,
    };
    const source = options.viewportSource ?? "USER_LOCATION";
    const origin = {
      center: queryCenter,
      label: options.originLabel ?? "Nearby bus stops",
      source,
    };
    setLastStopQueryOrigin(origin);
    setNearbySearchOrigin(origin);
    if (options.updateCamera && !options.keepViewport) {
      runCameraCommand(
        source === "USER_LOCATION" ? "initialLocation" : "searchResult",
        source,
        (current) => ({
          ...current,
          center: queryCenter,
          zoom: source === "USER_LOCATION" ? 15 : clampMapZoom(current.zoom, source),
        })
      );
      if (source === "USER_LOCATION") {
        initialCameraAppliedRef.current = true;
      }
    }
    if (source === "USER_LOCATION") {
      setCurrentLocation(queryCenter);
    }
    setMapViewMode("MAP");
    if (source === "USER_PAN") {
      setMapManuallyMoved(false);
    }
    setScreen("STOP");
  }

  async function loadNearbyStopsFor(
    payload: { latitude: number; longitude: number; accuracyMeters?: number },
    options: {
      useCache: boolean;
      announce: boolean;
      preserveSelection?: boolean;
      keepViewport?: boolean;
      updateCamera?: boolean;
      originLabel?: string;
      viewportSource?: ViewportSource;
    }
  ) {
    const cacheKey = nearbyStopsCacheKey(payload);
    const cached = nearbyStopsCacheRef.current.get(cacheKey);
    const now = Date.now();

    if (options.useCache && cached && now - cached.timestamp < nearbyStopsCacheMs) {
      applyNearbyStopsResult(cached.result, options);
      if (options.announce) {
        AccessibilityInfo.announceForAccessibility(
          `${cached.result.stops.length} nearby bus stops found. Please confirm your bus stop.`
        );
      }
      return cached.result;
    }

    stopsRequestRef.current.controller?.abort();
    const controller = new AbortController();
    const requestId = stopsRequestRef.current.id + 1;
    stopsRequestRef.current = { id: requestId, controller };

    const result = await findNearbyBusStops(payload, controller.signal);
    if (requestId !== stopsRequestRef.current.id) {
      return null;
    }

    nearbyStopsCacheRef.current.set(cacheKey, { timestamp: Date.now(), result });
    applyNearbyStopsResult(result, options);
    if (options.announce) {
      AccessibilityInfo.announceForAccessibility(
        `${result.stops.length} nearby bus stops found. Please confirm your bus stop.`
      );
    }
    return result;
  }

  async function findMyBusStop() {
    setIsLoading(true);
    setLoadingMessage("Finding nearby bus stops...");
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setError("We can't use your current location. You can still choose a bus stop manually.");
        await loadManualStops();
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }).then((freshPosition) => {
        const coords = {
          latitude: freshPosition.coords.latitude,
          longitude: freshPosition.coords.longitude,
          accuracyMeters: freshPosition.coords.accuracy ?? undefined,
        };
        const cachedPosition = { timestamp: Date.now(), coords };
        lastLocationResultRef.current = cachedPosition;
        return cachedPosition;
      });
      const result = await loadNearbyStopsFor(position.coords, {
        useCache: true,
        announce: true,
        originLabel: "Nearby bus stops",
        viewportSource: "USER_LOCATION",
        updateCamera: !initialCameraAppliedRef.current || mapCameraMode === "USER_LOCATION",
      });
      if (!result) {
        return;
      }

      if (result.stops.length === 0) {
        setError("We couldn't confidently identify a nearby bus stop.");
        setNearbyStops([]);
        setScreen("STOP");
        return;
      }
    } catch (apiError) {
      if (apiError instanceof DOMException && apiError.name === "AbortError") {
        return;
      }
        setError("We couldn't determine your location.");
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  }

  async function loadManualStops() {
    setIsLoading(true);
    setLoadingMessage("Loading nearby bus stops...");
    setError(null);
    try {
      await loadNearbyStopsFor(manualStopLookup, {
        useCache: true,
        announce: false,
        originLabel: "Nearby bus stops",
        viewportSource: "USER_LOCATION",
        updateCamera: !initialCameraAppliedRef.current,
      });
    } catch (apiError) {
      if (apiError instanceof DOMException && apiError.name === "AbortError") {
        return;
      }
      setError(apiError instanceof Error ? apiError.message : "Unable to load bus stops.");
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  }

  async function confirmBusStop(stop = selectedStop) {
    if (!stop) {
      return;
    }

    setSelectedStop(stop);
    setSelectedArrival(null);
    setSelectedBus(null);
    setArrivingBuses([]);
    setScreen("BUS");
    setIsLoading(true);
    setLoadingMessage("Loading buses arriving here...");
    setError(null);
    try {
      arrivalsRequestRef.current.controller?.abort();
      const cached = arrivalsCacheRef.current.get(stop.busStopCode);
      const cachedIsFresh = cached && Date.now() - cached.timestamp < arrivalsCacheMs;
      const requestId = arrivalsRequestRef.current.id + 1;

      if (cachedIsFresh) {
        const flattened = cached.result.services.flatMap((service) => service.buses);
        setArrivingBuses(flattened);
        setIsLoading(false);
        setLoadingMessage(null);
        return;
      }

      const controller = new AbortController();
      arrivalsRequestRef.current = { id: requestId, controller };
      const arrivals = await fetchBusStopArrivals(stop.busStopCode, controller.signal);
      if (requestId !== arrivalsRequestRef.current.id) {
        return;
      }
      arrivalsCacheRef.current.set(stop.busStopCode, { timestamp: Date.now(), result: arrivals });
      const flattened = arrivals.services.flatMap((service) => service.buses);
      setArrivingBuses(flattened);
      if (flattened.length === 0) {
        setError("Bus arrival information is temporarily unavailable.");
      }
    } catch (apiError) {
      if (apiError instanceof DOMException && apiError.name === "AbortError") {
        return;
      }
      setError(
        "Bus arrival information is temporarily unavailable. Your stop is selected; try refreshing arrivals in a moment."
      );
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  }

  function selectArrival(arrival: ArrivalBus) {
    if (!selectedStop) {
      return;
    }

    setSelectedArrival(arrival);
    setJourneyRequirements(requirements);
    setRequestId(null);
    setRequestStatus(null);
    setEvents([]);
    setVehicleStatus(null);
    setSelectedBus({
      busId: arrival.busId,
      busService: arrival.serviceNo,
      routeNumber: arrival.serviceNo,
      currentStop: selectedStop.description,
      nextStop: arrival.destination,
      isAccessible: arrival.wheelchairAccessible,
      wheelchairSpaces: arrival.wheelchairAccessible ? 1 : 0,
      latitude: selectedStop.latitude,
      longitude: selectedStop.longitude,
      estimatedArrivalSeconds: arrival.etaSeconds,
    });
    const selectedRoute = routeStopsForBus(
      {
        busId: arrival.busId,
        busService: arrival.serviceNo,
        routeNumber: arrival.serviceNo,
        currentStop: selectedStop.description,
        nextStop: arrival.destination,
        isAccessible: arrival.wheelchairAccessible,
        wheelchairSpaces: arrival.wheelchairAccessible ? 1 : 0,
        latitude: selectedStop.latitude,
        longitude: selectedStop.longitude,
        estimatedArrivalSeconds: arrival.etaSeconds,
      },
      selectedStop,
      arrival
    );
    setRouteStops(selectedRoute);
    setCurrentStopIndex(0);
    setSelectedAlightingStop(defaultAlightingStopForRoute(selectedRoute));
    setJourneyPhase("PLANNING");
    setScreen("ACCESSIBILITY");
    AccessibilityInfo.announceForAccessibility(
      `Bus ${arrival.serviceNo} selected. Towards ${arrival.destination}. Arriving in approximately ${Math.ceil(
        arrival.etaSeconds / 60
      )} minutes.`
    );
  }

  async function submitRequest() {
    if (!selectedBus || !selectedStop || assistanceTypes.length === 0 || isLoading) {
      return;
    }

    setIsLoading(true);
    setLoadingMessage("Sending assistance request...");
    setError(null);
    try {
      const response = await createAssistanceRequest({
        sessionId,
        busService: selectedBus.busService,
        busId: selectedBus.busId,
        boardingStop: selectedStop.busStopCode,
        destination: selectedArrival?.destination ?? destination,
        stopCode: selectedStop.busStopCode,
        assistanceTypes,
        source: "MOBILE_APP",
        boardingOrAlighting: "BOARDING",
        accessibilityVerificationStatus: activeProfile?.verificationStatus,
        verificationMethod: activeProfile?.verificationMethod,
      });

      setRequestId(response.requestId);
      setRequestStatus(response.status);
      setEvents([
        {
          type: "REQUEST_STATUS",
          requestId: response.requestId,
          status: response.status,
          timestamp: response.createdAt,
          assistanceTypes,
          source: "MOBILE_APP",
          busId: selectedBus.busId,
          busService: selectedBus.busService,
          message: response.duplicateOfRequestId
            ? "Ramp assistance is already requested for this bus."
            : `The bus has received your request for ${selectedNeeds}. You do not need to request again.`,
        },
      ]);
      setJourneyPhase("WAITING_FOR_BUS");
      setScreen("STATUS");
    } catch (apiError) {
      setError(`We could not confirm your assistance request for Service ${selectedBus.busService}. Please try again.`);
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  }

  async function cancelRequest() {
    if (!requestId) {
      return;
    }

    setConfirmingCancelRequest(false);
    setIsLoading(true);
    setLoadingMessage("Cancelling assistance request...");
    setError(null);
    try {
      await cancelAssistanceRequest(requestId);
    } catch {
      setError("We could not cancel the request. Your original assistance request may still be active.");
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  }

  async function locateCurrentPosition() {
    const cameraIntentId = cameraIntentIdRef.current + 1;
    cameraIntentIdRef.current = cameraIntentId;
    setIsLoading(true);
    setLoadingMessage("Finding your location...");
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setError("Location is off. Enable location to centre the map on where you are.");
        setScreen("STOP");
        return;
      }

      const recentLocation = lastLocationResultRef.current;
      const position =
        recentLocation && Date.now() - recentLocation.timestamp < 30_000
          ? recentLocation
          : await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            }).then((freshPosition) => {
              const coords = {
                latitude: freshPosition.coords.latitude,
                longitude: freshPosition.coords.longitude,
                accuracyMeters: freshPosition.coords.accuracy ?? undefined,
              };
              const cachedPosition = { timestamp: Date.now(), coords };
              lastLocationResultRef.current = cachedPosition;
              return cachedPosition;
            });

      if (cameraIntentId !== cameraIntentIdRef.current) {
        setCurrentLocation(position.coords);
        return;
      }
      setCurrentLocation(position.coords);
      runCameraCommand("locateUser", "USER_LOCATION", (current) => ({
        ...current,
        center: position.coords,
        zoom: 15,
        bearing: 0,
        pitch: 0,
      }));
      setFollowMode(false);
      AccessibilityInfo.announceForAccessibility("Map centred on your current location.");
    } catch (apiError) {
      setError("We couldn't find your location. Try again or search manually.");
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  }

  async function showNearbyStopsInArea() {
    const source = selectedLandmark
      ? "SEARCH_RESULT"
      : selectedStop
        ? "SELECTED_STOP"
        : mapManuallyMoved || viewportSource === "USER_PAN"
          ? "USER_PAN"
          : currentLocation
            ? "USER_LOCATION"
            : "SEARCH_RESULT";
    const origin =
      selectedLandmark ?? selectedStop ?? (source === "USER_PAN" ? mapViewport.center : currentLocation) ?? mapViewport.center ?? manualStopLookup;
    const originLabel =
      source === "USER_LOCATION"
        ? "Nearby bus stops"
        : selectedLandmark
          ? `Bus stops near ${selectedLandmark.name}`
          : selectedStop
            ? `Bus stops near ${selectedStop.description}`
            : "Bus stops in this area";
    setIsLoading(true);
    setLoadingMessage("Finding bus stops nearby...");
    setError(null);
    try {
      const result = await loadNearbyStopsFor(origin, {
        useCache: true,
        announce: true,
        preserveSelection: Boolean(selectedStop),
        keepViewport: true,
        originLabel,
        viewportSource: source,
      });
      if (!result) {
        return;
      }
      if (source !== "USER_LOCATION") {
        setMapManuallyMoved(false);
      }
      updateBottomSheetState("MEDIUM");
      if (mapManuallyMoved || !currentLocation) {
        AccessibilityInfo.announceForAccessibility("Bus stops in this area are shown.");
      }
    } catch (apiError) {
      if (apiError instanceof DOMException && apiError.name === "AbortError") {
        return;
      }
      setError("Couldn't load bus stops in this area. Try again or search for a stop.");
      setScreen("STOP");
      updateBottomSheetState("MEDIUM");
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  }

  function askToCancelRequest() {
    setConfirmingCancelRequest(true);
    AccessibilityInfo.announceForAccessibility(
      "Cancel assistance request? Your bus may no longer receive your accessibility request."
    );
  }

  function enterOnboardMode() {
    if (!selectedBus) {
      return;
    }

    const route = routeStopsForBus(selectedBus, selectedStop, selectedArrival);
    setRouteStops(route);
    setCurrentStopIndex(0);
    setSelectedAlightingStop((current) => current ?? defaultAlightingStopForRoute(route));
    setJourneyPhase("ONBOARD");
    setScreen("ONBOARD");
    notifyPassenger(
      `You are onboard Bus ${selectedBus.busService} towards ${selectedArrival?.destination ?? selectedBus.nextStop}.`,
      Haptics.NotificationFeedbackType.Success
    );
  }

  function chooseAlightingStop(stop: RouteStop) {
    setSelectedAlightingStop(stop);
    if (journeyPhase === "ONBOARD" || journeyPhase === "DESTINATION_APPROACHING" || journeyPhase === "DESTINATION_NEXT" || journeyPhase === "DISEMBARKING" || journeyPhase === "ALIGHTING") {
      setScreen("ONBOARD");
    }
    AccessibilityInfo.announceForAccessibility(`${stop.description} selected as your alighting stop.`);
  }

  function simulateNextStop() {
    if (currentStopIndex >= routeStops.length - 1) {
      return;
    }

    const nextIndex = currentStopIndex + 1;
    const nextStop = routeStops[nextIndex];
    setCurrentStopIndex(nextIndex);

    if (selectedAlightingStop?.busStopCode === nextStop.busStopCode) {
      setJourneyPhase("DISEMBARKING");
      notifyPassenger(
        `This is your stop. ${nextStop.description}.`,
        Haptics.NotificationFeedbackType.Success
      );
      return;
    }

    const followingStop = routeStops[nextIndex + 1];
    if (selectedAlightingStop && followingStop?.busStopCode === selectedAlightingStop.busStopCode) {
      setJourneyPhase("DESTINATION_NEXT");
      notifyPassenger(
        `Your stop is next. ${selectedAlightingStop.description}.`,
        Haptics.NotificationFeedbackType.Warning
      );
      return;
    }

    const remainingAfterMove = stopsRemainingToDestination(routeStops, nextIndex, selectedAlightingStop);
    if (remainingAfterMove !== null && remainingAfterMove <= 2) {
      setJourneyPhase("DESTINATION_APPROACHING");
      notifyPassenger(
        `${remainingAfterMove} stops remaining before ${selectedAlightingStop?.description}.`,
        Haptics.NotificationFeedbackType.Warning
      );
      return;
    }

    setJourneyPhase("ONBOARD");
  }

  function themedHeadingStyle() {
    return [
      styles.heading,
      lightMode && lightStyles.text,
      highContrastDark && styles.highContrastText,
      highContrastLight && lightStyles.highContrastText,
    ];
  }

  function themedPanelStyle() {
    return [
      styles.statusPanel,
      lightMode && lightStyles.surface,
      highContrastDark && styles.highContrastControl,
      highContrastLight && lightStyles.highContrastControl,
    ];
  }

  function themedBodyStyle() {
    return [
      styles.bodyText,
      appPreferences.largeText && styles.largeBody,
      lightMode && lightStyles.bodyText,
      highContrastDark && styles.highContrastMutedText,
      highContrastLight && lightStyles.highContrastMutedText,
    ];
  }

  function themedLabelStyle() {
    return [
      styles.statusLabel,
      lightMode && lightStyles.mutedText,
      highContrastDark && styles.highContrastMutedText,
      highContrastLight && lightStyles.highContrastMutedText,
    ];
  }

  function themedValueStyle() {
    return [
      styles.statusValue,
      lightMode && lightStyles.text,
      highContrastDark && styles.highContrastText,
      highContrastLight && lightStyles.highContrastText,
    ];
  }

  async function requestDisembarkation() {
    if (!selectedBus || !selectedAlightingStop || isLoading) {
      setError("Choose where to get off before requesting disembarkation.");
      setScreen("ALIGHTING_STOP");
      return;
    }

    if (alightingAssistanceTypes.length === 0) {
      setJourneyPhase("DISEMBARKING");
      setVisualAlert(`Your request to alight at ${selectedAlightingStop.description} is ready.`);
      AccessibilityInfo.announceForAccessibility(
        `Request to alight at ${selectedAlightingStop.description} prepared.`
      );
      return;
    }

    setIsLoading(true);
    setLoadingMessage("Sending alighting assistance request...");
    setError(null);
    try {
      const response = await createAssistanceRequest({
        sessionId,
        busService: selectedBus.busService,
        busId: selectedBus.busId,
        boardingStop: selectedStop?.busStopCode ?? currentRouteStop?.busStopCode ?? "ONBOARD",
        destination: selectedAlightingStop.description,
        stopCode: selectedAlightingStop.busStopCode,
        assistanceTypes: alightingAssistanceTypes,
        source: "MOBILE_APP",
        boardingOrAlighting: "ALIGHTING",
        accessibilityVerificationStatus: activeProfile?.verificationStatus,
        verificationMethod: activeProfile?.verificationMethod,
      });

      setRequestId(response.requestId);
      setRequestStatus(response.status);
      setConfirmingCancelRequest(false);
      setJourneyPhase("DISEMBARKING");
      setEvents((current) => [
        {
          type: "REQUEST_STATUS",
          requestId: response.requestId,
          status: response.status,
          timestamp: response.createdAt,
          assistanceTypes: alightingAssistanceTypes,
          source: "MOBILE_APP",
          busId: selectedBus.busId,
          busService: selectedBus.busService,
          message: "Alighting assistance request sent.",
        },
        ...current,
      ]);
      setVisualAlert(
        `Alighting assistance requested for ${selectedAlightingStop.description}: ${alightingAssistanceTypes
          .map(readableAssistanceType)
          .join(", ")}.`
      );
    } catch {
      setError("We couldn't send your alighting assistance request.");
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  }

  function endJourney() {
    setJourneyPhase("COMPLETED");
    setScreen("COMPLETED");
    AccessibilityInfo.announceForAccessibility("Journey completed.");
  }

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        lightMode && lightStyles.safeArea,
        highContrastDark && styles.highContrastSafeArea,
        highContrastLight && lightStyles.highContrastSafeArea,
      ]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          isCompactWidth && styles.compactContainer,
          screen === "STOP" && styles.mapWorkspaceContainer,
        ]}
      >
        {screen !== "STOP" ? (
          <BrandHeader
            highContrast={appPreferences.highContrast}
            lightMode={lightMode}
            compact={isCompactWidth || screen !== "LOCATION"}
          />
        ) : null}
        {activeProfile && screen !== "STOP" && (
          <View style={[styles.profileBar, lightMode && lightStyles.surface]}>
            <Text style={[styles.profileName, lightMode && lightStyles.text]}>
              {activeProfile.displayName}
            </Text>
            <PassengerDefaultsIcons
              requirements={requirements}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
              compact
            />
          </View>
        )}

        {(screen === "AUTH" || (screen === "PROFILE" && !activeProfile)) && (
          <View style={styles.section}>
            <SectionHeader
              eyebrow="Profile"
              title="Your SG GoAssist profile"
              highContrast={appPreferences.highContrast}
              lightMode={lightMode}
            />
            <Text style={themedBodyStyle()}>
              Save your assistance needs for easier, safer and more independent bus journeys.
            </Text>
            <AppearanceSwitch
              themeMode={appPreferences.themeMode}
              highContrast={appPreferences.highContrast}
              largeText={appPreferences.largeText}
              onToggle={() =>
                setAppPreferences((current) => ({
                  ...current,
                  themeMode: current.themeMode === "light" ? "dark" : "light",
                }))
              }
            />
            <View style={themedPanelStyle()}>
              <Text style={themedLabelStyle()}>Designed for accessible journeys</Text>
              <Text style={themedValueStyle()}>Guided with care</Text>
              <Text style={themedBodyStyle()}>
                SG GoAssist helps less-abled passengers travel with confidence by making bus journeys easier, safer and more independent.
              </Text>
              <Text style={themedBodyStyle()}>
                Current app support: {appPreferencesLabel(appPreferences)}
              </Text>
            </View>
            <View
              style={[
                styles.createProfilePanel,
                lightMode && lightStyles.createProfilePanel,
                highContrastDark && styles.highContrastControl,
                highContrastLight && lightStyles.highContrastControl,
              ]}
            >
              <Text style={themedHeadingStyle()}>
                Create Profile
              </Text>
              <LabeledInput
                label="Name"
                value={authName}
                onChangeText={setAuthName}
                placeholder="Passenger name"
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
              />
              <LabeledInput
                label="Email"
                value={authEmail}
                onChangeText={setAuthEmail}
                placeholder="name@example.com"
                keyboardType="email-address"
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
              />
              <PrimaryButton
                label="Create profile"
                onPress={createProfile}
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
              />
            </View>
            <Text style={themedHeadingStyle()}>
              Saved Profiles
            </Text>
            {profiles.map((profile) => (
              <Pressable
                key={profile.profileId}
                accessibilityRole="button"
                accessibilityLabel={`Sign in as ${profile.displayName}. Assistance defaults: ${requirementsLabel(
                  profile.assistanceDefaults
                )}.`}
                onPress={() => applyProfile(profile, "PROFILE")}
                style={[styles.busCard, lightMode && lightStyles.surface]}
              >
                <Text style={[styles.busTitle, lightMode && lightStyles.text]}>{profile.displayName}</Text>
                <Text style={themedBodyStyle()}>{profile.email}</Text>
                <Text style={themedBodyStyle()}>
                  Verification: {verificationStatusLabel(profile)}
                </Text>
                <PassengerDefaultsIcons
                  requirements={profile.assistanceDefaults}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
              </Pressable>
            ))}
          </View>
        )}

        {screen === "PROFILE" && activeProfile && (
          <View style={styles.section}>
            <SectionHeader
              eyebrow="Profile"
              title="My profile"
              highContrast={appPreferences.highContrast}
              lightMode={lightMode}
            />
            <View style={themedPanelStyle()}>
              <Text style={themedLabelStyle()}>Account</Text>
              <Text style={themedValueStyle()}>{activeProfile.displayName}</Text>
              <Text style={themedBodyStyle()}>{activeProfile.email}</Text>
              <Text style={themedBodyStyle()}>
                Verification: {verificationStatusLabel(activeProfile)}
              </Text>
              <PassengerDefaultsIcons
                requirements={activeProfile.assistanceDefaults}
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
              />
              <Text style={themedBodyStyle()}>
                App support: {appPreferencesLabel(activeProfile.appPreferences)}
              </Text>
            </View>
            <AppearanceSwitch
              themeMode={appPreferences.themeMode}
              highContrast={appPreferences.highContrast}
              largeText={appPreferences.largeText}
              onToggle={() =>
                setAppPreferences((current) => ({
                  ...current,
                  themeMode: current.themeMode === "light" ? "dark" : "light",
                }))
              }
            />
            {!isEditingProfileNeeds && (
              <>
                <PrimaryButton
                  label="Edit accessibility preferences"
                  icon={Settings}
                  onPress={() => setIsEditingProfileNeeds(true)}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
              </>
            )}
            {!isEditingProfileNeeds && activeProfile.verificationStatus !== "VERIFIED" && (
              <View style={[styles.summaryRow, lightMode && lightStyles.surface]}>
                <Text style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}>Accessibility Verification</Text>
                <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>Verify eligibility separately from your needs</Text>
                <Text style={themedBodyStyle()}>
                  Demo verification accepts the built-in credential. Card numbers are mocked for the prototype.
                </Text>
                <VerificationMethodPicker
                  selectedMethod={verificationMethod}
                  onSelect={setVerificationMethod}
                />
                <LabeledInput
                  label="Credential last 4 digits"
                  value={credentialLast4}
                  onChangeText={setCredentialLast4}
                  placeholder="4821"
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
                <PrimaryButton
                  label="Verify accessibility profile"
                  onPress={verifyActiveProfile}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
              </View>
            )}
            {!isEditingProfileNeeds && activeProfile.verificationStatus === "VERIFIED" && (
              <View style={[styles.summaryRow, lightMode && lightStyles.surface]}>
                <Text style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}>Accessibility Verification</Text>
                <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>Verified accessibility user</Text>
                <Text style={themedBodyStyle()}>
                  Method: {readableVerificationMethod(activeProfile.verificationMethod)}
                </Text>
                <Text style={themedBodyStyle()}>
                  Credential: {activeProfile.verifiedCredentialLast4 ? `**** ${activeProfile.verifiedCredentialLast4}` : "Demo credential"}
                </Text>
              </View>
            )}
            {isEditingProfileNeeds && (
              <>
                <Text style={themedHeadingStyle()}>
                  Your usual assistance
                </Text>
                <Text style={themedBodyStyle()}>
                  These choices will be preselected when you start a journey. They do not send a request.
                </Text>
                <AssistancePreferenceToggles
                  requirements={requirements}
                  appPreferences={appPreferences}
                  resolvedThemeMode={resolvedThemeMode}
                  setRequirements={setRequirements}
                />
                <Text style={themedHeadingStyle()}>
                  Display and feedback preferences
                </Text>
                <Text style={themedBodyStyle()}>
                  Display and feedback settings apply throughout GoAssist.
                </Text>
                <AppPreferenceToggles
                  appPreferences={appPreferences}
                  resolvedThemeMode={resolvedThemeMode}
                  setAppPreferences={setAppPreferences}
                />
                <PrimaryButton
                  label="Save needs"
                  onPress={saveActiveProfile}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
                <SecondaryButton
                  label="Cancel editing"
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                  onPress={() => {
                    setRequirements(activeProfile.assistanceDefaults);
                    setAppPreferences(activeProfile.appPreferences);
                    setIsEditingProfileNeeds(false);
                  }}
                />
              </>
            )}
            <SecondaryButton
              label="Continue journey"
              onPress={() => setScreen("LOCATION")}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
            <SecondaryButton
              label="Sign out"
              onPress={signOut}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
          </View>
        )}

        {screen === "LOCATION" && (
          <View style={styles.section}>
            <SectionHeader
              eyebrow="Home"
              title={selectedBus || selectedStop ? "Active journey" : "Find your bus"}
              highContrast={appPreferences.highContrast}
              lightMode={lightMode}
            />
            {(selectedBus ||
              selectedStop ||
              requestId ||
              journeyPhase === "ONBOARD" ||
              journeyPhase === "DESTINATION_APPROACHING" ||
              journeyPhase === "DESTINATION_NEXT" ||
              journeyPhase === "DISEMBARKING" ||
              journeyPhase === "ALIGHTING") ? (
              <View style={[styles.summaryRow, lightMode && lightStyles.surface]}>
                <Text style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}>
                  Continue journey
                </Text>
                <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>
                  {selectedBus
                    ? `Service ${selectedBus.busService}`
                    : selectedStop
                      ? selectedStop.description
                      : "Journey in progress"}
                </Text>
                {selectedArrival ? (
                  <Text style={themedBodyStyle()}>
                    Towards {selectedArrival.destination}, arriving in about {Math.ceil(selectedArrival.etaSeconds / 60)} min.
                  </Text>
                ) : null}
                {requestId ? (
                  <Text style={themedBodyStyle()}>
                    Assistance: {requestStatusLabel(requestStatus)}.
                  </Text>
                ) : null}
                <PrimaryButton
                  label="Return to journey"
                  icon={Route}
                  onPress={returnToCurrentJourney}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
                {selectedBus ? (
                  <SecondaryButton
                    label="View assistance"
                    icon={Accessibility}
                    onPress={() => setScreen("ACCESSIBILITY")}
                    lightMode={lightMode}
                    highContrast={appPreferences.highContrast}
                  />
                ) : null}
              </View>
            ) : null}
            <Text style={themedBodyStyle()}>
              Use your location to find nearby bus stops.
            </Text>
            <Text style={themedBodyStyle()}>
              You will always choose the stop and bus yourself.
            </Text>
            <PrimaryButton
              label="Use my location"
              icon={LocateFixed}
              accessibilityHint="Find nearby bus stops using your current location."
              onPress={findMyBusStop}
              disabled={isLoading}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
            <SecondaryButton
              label="Select bus stop manually"
              icon={List}
              accessibilityHint="Opens a list of nearby bus stops."
              onPress={loadManualStops}
              disabled={isLoading}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
            <SecondaryButton
              label="Repeat guidance"
              icon={Volume2}
              accessibilityHint={
                selectedBus || selectedStop
                  ? "Repeats the latest spoken journey information."
                  : "No journey guidance is available yet."
              }
              onPress={announceCurrentJourney}
              disabled={!appPreferences.repeatAudio || (!selectedBus && !selectedStop)}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
          </View>
        )}

        {screen === "STOP" && (
          <MapFirstStopScreen
            stops={visibleStops}
            selectedStop={selectedStop}
            selectedLandmark={selectedLandmark}
            landmarks={visibleLandmarks}
            currentLocation={currentLocation}
            mapViewport={mapViewport}
            layers={mapLayers}
            mapManuallyMoved={mapManuallyMoved}
            searchThisAreaVisible={searchThisAreaVisible}
            nearbyHeading={nearbySearchOrigin.label}
            directionsActive={directionsActive}
            followMode={followMode}
            rotationEnabled={mapRotationEnabled}
            hasSelectedService={Boolean(selectedBus)}
            headingDegrees={mapHeadingDegrees}
            query={stopSearchQuery}
            bottomSheetState={bottomSheetState}
            lastExpandedSheetState={lastExpandedSheetState}
            nearbyLoading={isLoading}
            nearbyError={error}
            largeText={appPreferences.largeText}
            lightMode={lightMode}
            highContrast={appPreferences.highContrast}
            onChangeQuery={(query) => {
              setStopSearchQuery(query);
              setSelectedLandmarkId(null);
              updateBottomSheetState(query.trim() ? "MEDIUM" : bottomSheetState);
            }}
            onSelectStop={selectStopForBoarding}
            onSelectLandmark={selectLandmark}
            onMoveMap={markMapMoved}
            onRecenter={recenterStopMap}
            onLocateMap={locateCurrentPosition}
            onRefreshLocation={showNearbyStopsInArea}
            onSearchForStop={() => setStopSearchQuery("")}
            onShowRoute={showWholeRoute}
            onRotateMap={rotateMap}
            onResetMap={resetMapView}
            onViewFullRoute={viewFullRoute}
            onToggleFollow={toggleFollowMode}
            onToggleLayer={(layer) =>
              setMapLayers((current) => ({ ...current, [layer]: !current[layer] }))
            }
            onResetHeading={resetMapNorth}
            onDirections={startDirections}
            onStopDirections={() => setDirectionsActive(false)}
            onClearSelectedStop={() => {
              setSelectedStop(null);
              setDirectionsActive(false);
              updateBottomSheetState("COLLAPSED");
            }}
            onExitMap={() => setScreen("LOCATION")}
            onConfirm={confirmSelectedStop}
            onHear={hearSelectedStop}
            onHearDirections={hearDirections}
            onSetBottomSheetState={updateBottomSheetState}
          />
        )}

        {screen === "ACCESSIBILITY" && (
          <View style={styles.section}>
            <SectionHeader
              eyebrow="Assistance"
              title="Assist"
              highContrast={appPreferences.highContrast}
              lightMode={lightMode}
            />
            {!selectedBus ? (
              <View style={[styles.summaryRow, lightMode && lightStyles.surface]}>
                <Text style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}>
                  Get assistance during your journey
                </Text>
                <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>
                  {selectedStop ? `Boarding at ${selectedStop.description}` : "No bus selected yet"}
                </Text>
                <PassengerDefaultsIcons
                  requirements={requirements}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
                <Text style={themedBodyStyle()}>
                  {selectedStop
                    ? "Choose a bus before requesting assistance. Your usual assistance will be ready when a bus is selected."
                    : "Your saved assistance will be preselected when you choose a bus."}
                </Text>
                <PrimaryButton
                  label={selectedStop ? "Choose a bus" : "Start a journey"}
                  icon={Route}
                  onPress={() => selectedStop ? setScreen("BUS") : openTab("JOURNEY")}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
                <SecondaryButton
                  label="Edit saved preferences"
                  icon={Settings}
                  onPress={() => {
                    setIsEditingProfileNeeds(true);
                    setScreen("PROFILE");
                  }}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
              </View>
            ) : selectedBus &&
              (journeyPhase === "ONBOARD" ||
                journeyPhase === "DESTINATION_APPROACHING" ||
                journeyPhase === "DESTINATION_NEXT" ||
                journeyPhase === "DISEMBARKING" ||
                journeyPhase === "ALIGHTING") ? (
              <View style={[styles.summaryRow, lightMode && lightStyles.surface]}>
                <Text style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}>
                  On Service {selectedBus.busService}
                </Text>
                <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>
                  Destination: {selectedAlightingStop?.description ?? "Choose destination"}
                </Text>
                <Text style={themedBodyStyle()}>
                  {stopsRemaining === null
                    ? "Choose a destination to start disembarking guidance."
                    : stopsRemaining === 0
                      ? "This is your stop."
                      : stopsRemaining === 1
                        ? "Your stop is next."
                        : `${stopsRemaining} stops remaining.`}
                </Text>
                <AssistanceSummaryList
                  requirements={requirements}
                  status={requestStatus}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
                <PrimaryButton
                  label="Request disembarking assistance"
                  icon={DoorOpen}
                  onPress={requestDisembarkation}
                  disabled={!selectedAlightingStop || isLoading}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
                <SecondaryButton
                  label="Back to onboard journey"
                  icon={BusFront}
                  onPress={() => setScreen("ONBOARD")}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
              </View>
            ) : requestId ? (
              <View style={[styles.summaryRow, lightMode && lightStyles.surface]}>
                <Text style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}>Current assistance</Text>
                <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>
                  {requestStatusLabel(requestStatus)} for Service {selectedBus.busService}
                </Text>
                <AssistanceSummaryList
                  requirements={journeyRequirements}
                  status={requestStatus}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
                <Text style={themedBodyStyle()}>
                  These are active request details for this journey, not saved profile settings.
                </Text>
                <SecondaryButton
                  label="Repeat journey status"
                  icon={Volume2}
                  onPress={announceCurrentJourney}
                  disabled={!appPreferences.repeatAudio}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
                <SecondaryButton
                  label="View full status"
                  icon={BadgeCheck}
                  onPress={() => setScreen("STATUS")}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
              </View>
            ) : activeProfile ? (
              <>
                <View style={[styles.summaryRow, lightMode && lightStyles.surface]}>
                  <Text style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}>
                    Service {selectedBus.busService}
                  </Text>
                  <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>
                    {selectedStop?.description ?? selectedBus.currentStop}
                  </Text>
                  {selectedArrival ? (
                    <Text style={themedBodyStyle()}>
                      Arriving in about {Math.ceil(selectedArrival.etaSeconds / 60)} min.
                    </Text>
                  ) : null}
                </View>
                <Text style={themedHeadingStyle()}>Assistance for this bus</Text>
                <AssistancePreferenceToggles
                  requirements={journeyRequirements}
                  appPreferences={appPreferences}
                  resolvedThemeMode={resolvedThemeMode}
                  setRequirements={setJourneyRequirements}
                />
                <Text style={themedBodyStyle()}>
                  Using your saved preferences. Changes here apply only to this journey unless you save them.
                </Text>
                <SecondaryButton
                  label="Use my usual assistance"
                  icon={RefreshCw}
                  onPress={useUsualAssistanceForJourney}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
                <SecondaryButton
                  label="Save these choices for future journeys"
                  icon={CircleCheck}
                  onPress={saveJourneyAssistanceAsDefault}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
                <PrimaryButton
                  label="Request assistance"
                  icon={CircleCheck}
                  onPress={submitRequest}
                  disabled={assistanceTypes.length === 0 || isLoading}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
              </>
            ) : (
              <View style={[styles.summaryRow, lightMode && lightStyles.surface]}>
                <Text style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}>Bus Assistance</Text>
                <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>Profile required</Text>
                <Text style={themedBodyStyle()}>
                  Create or sign in to a profile before requesting bus-side assistance.
                </Text>
                <SecondaryButton
                  label="Go to profile"
                  onPress={() => setScreen("PROFILE")}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
              </View>
            )}
          </View>
        )}

        {screen === "BUS" && (
          <View style={styles.section}>
            <SectionHeader
              eyebrow="Journey"
              title="Choose your bus"
              highContrast={appPreferences.highContrast}
              lightMode={lightMode}
            />
            {selectedStop && (
              <View style={[styles.summaryRow, lightMode && lightStyles.surface]}>
                <Text style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}>Boarding at</Text>
                <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>
                  {selectedStop.description}
                </Text>
                <Text style={themedBodyStyle()}>Bus Stop {selectedStop.busStopCode}</Text>
                <SecondaryButton
                  label="Change stop"
                  icon={MapPin}
                  onPress={() => {
                    setSelectedArrival(null);
                    setSelectedBus(null);
                    setScreen("STOP");
                    updateBottomSheetState("MEDIUM");
                  }}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
              </View>
            )}
            <Text style={themedBodyStyle()}>Which bus are you taking?</Text>
            {arrivingBuses.map((bus) => (
              <BusArrivalCard
                key={`${bus.busId}-${bus.arrivalSlot}`}
                bus={bus}
                selected={selectedArrival?.busId === bus.busId}
                onPress={() => selectArrival(bus)}
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
              />
            ))}
            <SecondaryButton
              label="Repeat selected bus"
              icon={Volume2}
              onPress={announceCurrentJourney}
              disabled={!selectedArrival || !appPreferences.repeatAudio}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
            <PrimaryButton
              label={activeProfile ? "Choose assistance" : "Set app accessibility"}
              icon={activeProfile ? CircleCheck : Settings}
              onPress={() => setScreen("ACCESSIBILITY")}
              disabled={!selectedArrival}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
          </View>
        )}

        {screen === "CONFIRM" && selectedBus && (
          <View style={styles.section}>
            <SectionHeader
              eyebrow="Assistance"
              title="Request assistance?"
              highContrast={appPreferences.highContrast}
              lightMode={lightMode}
            />
            <SummaryRow
              label="Bus"
              value={`${selectedBus.busService} (${selectedBus.busId})`}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
            <SummaryRow
              label="Boarding stop"
              value={
                selectedStop
                  ? `${selectedStop.busStopCode} - ${selectedStop.description}, ${selectedStop.roadName}`
                  : boardingStop
              }
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
            <SummaryRow
              label="Destination"
              value={selectedAlightingStop?.description ?? selectedArrival?.destination ?? destination}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
            <View style={[styles.summaryRow, lightMode && lightStyles.surface]}>
              <View style={styles.iconTitleRow}>
                <MapPinned
                  size={22}
                  color={controlIconColor({ active: true, lightMode, highContrast: appPreferences.highContrast })}
                  strokeWidth={2.75}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                <Text style={themedLabelStyle()}>Where are you getting off?</Text>
              </View>
              <Text style={themedBodyStyle()}>
                Choose your destination now so GoAssist can count down stops after boarding.
              </Text>
              {plannedRouteStops.slice(1).map((stop) => (
                <AlightingStopRow
                  key={`confirm-${stop.sequence}-${stop.busStopCode}`}
                  stop={stop}
                  selected={selectedAlightingStop?.sequence === stop.sequence}
                  onPress={() => chooseAlightingStop(stop)}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
              ))}
            </View>
            <SummaryRow
              label="Assistance"
              value={selectedNeeds}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
            <SecondaryButton
              label="Repeat request summary"
              icon={Volume2}
              onPress={announceCurrentJourney}
              disabled={!appPreferences.repeatAudio}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
            <PrimaryButton
              label="Confirm request"
              icon={CircleCheck}
              onPress={submitRequest}
              disabled={isLoading}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
          </View>
        )}

        {screen === "STATUS" && selectedBus && (
          <View style={styles.section}>
            <SectionHeader
              eyebrow="Status"
              title={vehicleStatus === "ARRIVED" ? "Your bus is here" : "Assistance status"}
              highContrast={appPreferences.highContrast}
              lightMode={lightMode}
            />
            <View
              style={[
                styles.statusPanel,
                lightMode && lightStyles.surface,
                highContrastDark && styles.highContrastControl,
                highContrastLight && lightStyles.highContrastControl,
                (vehicleStatus === "APPROACHING" || vehicleStatus === "ARRIVED") &&
                  styles.journeyAlertPanel,
              ]}
              accessible
              accessibilityLabel={`Assistance status ${requestStatusLabel(
                requestStatus
              )}. ${vehicleStatusLabel(vehicleStatus)}.`}
            >
              <View style={styles.iconTitleRow}>
                <BadgeCheck
                  size={24}
                  color={controlIconColor({
                    active: requestStatus === "ACKNOWLEDGED",
                    lightMode,
                    highContrast: appPreferences.highContrast,
                  })}
                  strokeWidth={2.75}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                <Text style={themedLabelStyle()}>Assistance</Text>
              </View>
              <Text style={themedValueStyle()}>{requestStatusLabel(requestStatus)}</Text>
              <Text style={themedBodyStyle()}>{selectedNeeds} requested for Service {selectedBus.busService}.</Text>
              {selectedStop ? (
                <Text style={themedBodyStyle()}>
                  Please wait at {selectedStop.description}, Stop {selectedStop.busStopCode}.
                </Text>
              ) : null}
              {requestStatus === "ACKNOWLEDGED" && (
                <Text style={[styles.confirmationText, lightMode && lightStyles.text]}>
                  The bus has received your request. No further action is required.
                </Text>
              )}
              <Text style={themedBodyStyle()}>Every spoken update is also displayed on this screen.</Text>
              <Text style={themedBodyStyle()}>
                {appPreferences.hapticAlerts ? "Haptic alerts are enabled." : "Haptic alerts are off."}
              </Text>
              <View style={styles.iconTitleRow}>
                <BusFront
                  size={24}
                  color={controlIconColor({
                    active: vehicleStatus === "APPROACHING" || vehicleStatus === "ARRIVED",
                    lightMode,
                    highContrast: appPreferences.highContrast,
                  })}
                  strokeWidth={2.75}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                <Text style={themedLabelStyle()}>Bus</Text>
              </View>
              <Text style={themedValueStyle()}>{vehicleStatusLabel(vehicleStatus)}</Text>
            </View>

            {requestStatus === "ACKNOWLEDGED" && (
              confirmingCancelRequest ? (
                <View style={[styles.summaryRow, lightMode && lightStyles.surface]}>
                  <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>
                    Cancel assistance request?
                  </Text>
                  <Text style={themedBodyStyle()}>
                    Only cancel if you no longer need this assistance.
                  </Text>
                  <SecondaryButton
                    label="Keep request"
                    icon={CircleCheck}
                    onPress={() => setConfirmingCancelRequest(false)}
                    disabled={isLoading}
                    lightMode={lightMode}
                    highContrast={appPreferences.highContrast}
                  />
                  <SecondaryButton
                    label="Yes, cancel request"
                    icon={CircleX}
                    onPress={cancelRequest}
                    disabled={isLoading}
                    lightMode={lightMode}
                    highContrast={appPreferences.highContrast}
                  />
                </View>
              ) : (
                <SecondaryButton label="Cancel request" icon={CircleX} onPress={askToCancelRequest} disabled={isLoading} lightMode={lightMode} highContrast={appPreferences.highContrast} />
              )
            )}

            {(vehicleStatus === "ARRIVED" || requestStatus === "ACKNOWLEDGED") && (
              <PrimaryButton
                label="I'm onboard"
                icon={BusFront}
                accessibilityHint="Enter onboard journey mode after boarding."
                onPress={enterOnboardMode}
                disabled={isLoading}
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
              />
            )}

            <SecondaryButton
              label="Repeat journey status"
              icon={Volume2}
              onPress={announceCurrentJourney}
              disabled={!appPreferences.repeatAudio}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />

            {requestStatus === "FAILED" && (
              <PrimaryButton label="Retry" icon={RefreshCw} onPress={submitRequest} disabled={isLoading} lightMode={lightMode} highContrast={appPreferences.highContrast} />
            )}

            {events.map((event) => (
              <View key={`${event.type}-${event.timestamp}`} style={[styles.eventRow, lightMode && lightStyles.surface]}>
                <Text style={[styles.eventStatus, lightMode && lightStyles.text]}>{eventLabel(event)}</Text>
                <Text style={themedBodyStyle()}>{new Date(event.timestamp).toLocaleTimeString()}</Text>
              </View>
            ))}
          </View>
        )}

        {screen === "ONBOARD" && selectedBus && (
          <OnboardJourneyScreen
            appPreferences={appPreferences}
            selectedBus={selectedBus}
            destination={selectedArrival?.destination ?? selectedBus.nextStop}
            currentStop={currentRouteStop}
            nextStop={nextRouteStop}
            routeStops={routeStops}
            currentStopIndex={currentStopIndex}
            selectedAlightingStop={selectedAlightingStop}
            selectedAlightingStopIndex={selectedAlightingStopIndex}
            stopsRemaining={stopsRemaining}
            destinationApproaching={destinationApproaching}
            alightingAssistanceTypes={alightingAssistanceTypes}
            selectedStopIsNext={selectedStopIsNext}
            selectedStopReached={selectedStopReached}
            journeyPhase={journeyPhase}
            onChangeStop={() => setScreen("ALIGHTING_STOP")}
            onSetDestination={chooseAlightingStop}
            onRequestDisembarkation={requestDisembarkation}
            onRepeat={announceCurrentJourney}
            onSimulateNextStop={simulateNextStop}
            onEndJourney={endJourney}
          />
        )}

        {screen === "ALIGHTING_STOP" && (
          <View style={styles.section}>
            <SectionHeader
              eyebrow="On board"
              title="Choose where to get off"
              highContrast={appPreferences.highContrast}
              lightMode={lightMode}
            />
            {routeStops.slice(currentStopIndex + 1).map((stop) => (
              <AlightingStopRow
                key={stop.busStopCode}
                stop={stop}
                selected={selectedAlightingStop?.busStopCode === stop.busStopCode}
                onPress={() => chooseAlightingStop(stop)}
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
              />
            ))}
            <SecondaryButton label="Back to onboard journey" onPress={() => setScreen("ONBOARD")} lightMode={lightMode} highContrast={appPreferences.highContrast} />
          </View>
        )}

        {screen === "COMPLETED" && (
          <View style={styles.section}>
            <SectionHeader
              eyebrow="Journey"
              title="Journey completed"
              highContrast={appPreferences.highContrast}
              lightMode={lightMode}
            />
            <View style={themedPanelStyle()}>
              <Text style={themedLabelStyle()}>You have arrived</Text>
              <Text style={themedValueStyle()}>
                {selectedAlightingStop?.description ?? "Destination"}
              </Text>
              <Text style={themedBodyStyle()}>Your journey has ended.</Text>
            </View>
            <PrimaryButton
              label="Find another bus"
              onPress={() => {
                setJourneyPhase("DISCOVERY");
                setRequestId(null);
                setRequestStatus(null);
                setVehicleStatus(null);
                setSelectedBus(null);
                setSelectedArrival(null);
                setSelectedAlightingStop(null);
                setRouteStops([]);
                setCurrentStopIndex(0);
                setScreen("LOCATION");
              }}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
          </View>
        )}

        {isLoading && screen !== "STOP" && (
          <LoadingState
            message={loadingMessage ?? "Loading..."}
            lightMode={lightMode}
            highContrast={appPreferences.highContrast}
          />
        )}
        {error && screen !== "STOP" && (
          <ErrorState
            title={screen === "BUS" ? "Arrival info unavailable" : undefined}
            message={error}
            primaryActionLabel={
              screen === "LOCATION" || screen === "BUS" ? "Try again" : undefined
            }
            onPrimaryAction={
              screen === "LOCATION"
                ? findMyBusStop
                : screen === "BUS" && selectedStop
                  ? () => confirmBusStop(selectedStop)
                  : undefined
            }
            secondaryActionLabel={screen === "LOCATION" ? "Select stop manually" : undefined}
            onSecondaryAction={screen === "LOCATION" ? loadManualStops : undefined}
            lightMode={lightMode}
            highContrast={appPreferences.highContrast}
          />
        )}
      </ScrollView>
      {visualAlert ? (
        <StatusToast
          message={visualAlert}
          highContrast={appPreferences.highContrast}
          lightMode={lightMode}
          largeText={appPreferences.largeText}
          onDismiss={() => setVisualAlert(null)}
        />
      ) : null}
      <TabBar
        activeTab={activeTab}
        hasSelectedBus={Boolean(selectedBus)}
        hasRequest={Boolean(requestId)}
        lightMode={lightMode}
        highContrast={appPreferences.highContrast}
        compact={isCompactWidth}
        onSelect={openTab}
      />
    </SafeAreaView>
  );
}

const ToggleRow = memo(function ToggleRow({
  label,
  description,
  enabled,
  highContrast = false,
  largeText = false,
  lightMode = false,
  variant = "default",
  iconSource,
  iconSize,
  preserveIconColors = false,
  customIcon,
  onPress,
}: {
  label: string;
  description: string;
  enabled: boolean;
  highContrast?: boolean;
  largeText?: boolean;
  lightMode?: boolean;
  variant?: "default" | "assistance" | "phone";
  iconSource?: ImageSourcePropType;
  iconSize?: number;
  preserveIconColors?: boolean;
  customIcon?: React.ReactNode;
  onPress: () => void;
}) {
  const isAssistance = variant === "assistance";
  const isPhone = variant === "phone";
  const stateLabel = enabled ? "Selected" : "Not selected";

  function handlePress() {
    onPress();
    AccessibilityInfo.announceForAccessibility(`${label} turned ${enabled ? "off" : "on"}.`);
  }

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      accessibilityLabel={label}
      accessibilityHint={description}
      onPress={handlePress}
      style={[
        styles.toggleRow,
        isAssistance && styles.assistanceOption,
        isPhone && styles.phoneOption,
        enabled && styles.selectedToggleRow,
        enabled && isAssistance && styles.selectedAssistanceOption,
        enabled && isPhone && styles.selectedPhoneOption,
        lightMode && lightStyles.toggleRow,
        lightMode && enabled && lightStyles.selectedToggleRow,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && !lightMode && enabled && styles.highContrastSelectedControl,
        highContrast && lightMode && lightStyles.highContrastControl,
        highContrast && lightMode && enabled && lightStyles.highContrastSelectedControl,
      ]}
    >
      <View style={styles.toggleHeaderRow}>
        <View style={styles.optionVisualGroup}>
          <View
            style={[
              styles.optionIcon,
              isAssistance && styles.assistanceIcon,
              isPhone && styles.phoneIcon,
              enabled && styles.selectedOptionIcon,
              lightMode && lightStyles.optionIcon,
              lightMode && enabled && lightStyles.selectedOptionIcon,
              highContrast && styles.highContrastIndicator,
              highContrast && enabled && styles.highContrastSelectedIndicator,
            ]}
          >
            {customIcon ? (
              customIcon
            ) : iconSource ? (
              <Image
                source={iconSource}
                style={[
                  preserveIconColors ? styles.optionIconImageOriginal : styles.optionIconImage,
                  enabled && !preserveIconColors && styles.selectedOptionIconImage,
                  enabled && !preserveIconColors && lightMode && lightStyles.selectedOptionIconImage,
                  highContrast && styles.highContrastOptionIconImage,
                  highContrast && lightMode && lightStyles.highContrastOptionIconImage,
                  iconSize ? { height: iconSize, width: iconSize } : undefined,
                ]}
                resizeMode="contain"
                accessible={false}
              />
            ) : (
              <Text
                style={[
                  styles.optionIconText,
                  enabled && styles.selectedOptionIconText,
                  lightMode && lightStyles.text,
                  lightMode && enabled && lightStyles.selectedOptionIconText,
                  highContrast && !lightMode && styles.highContrastText,
                  highContrast && lightMode && lightStyles.highContrastText,
                ]}
              >
                Aa
              </Text>
            )}
          </View>
        </View>
        <View style={styles.toggleTextGroup}>
          <Text
            style={[
              styles.toggleText,
              largeText && styles.largeBody,
              lightMode && lightStyles.text,
              highContrast && !lightMode && styles.highContrastText,
              highContrast && lightMode && lightStyles.highContrastText,
              highContrast && enabled && styles.highContrastSelectedText,
            ]}
          >
            {label}
          </Text>
          <Text
            style={[
              styles.bodyText,
              largeText && styles.largeBody,
              lightMode && lightStyles.bodyText,
              highContrast && !lightMode && styles.highContrastMutedText,
              highContrast && lightMode && lightStyles.highContrastMutedText,
              highContrast && enabled && styles.highContrastSelectedText,
            ]}
          >
            {description}
          </Text>
        </View>
      </View>
      <View style={styles.selectionRow}>
        <View
          style={[
            styles.selectionIndicator,
            enabled && styles.selectedSelectionIndicator,
            lightMode && lightStyles.selectionIndicator,
            lightMode && enabled && lightStyles.selectedSelectionIndicator,
            highContrast && styles.highContrastIndicator,
            highContrast && enabled && styles.highContrastSelectedIndicator,
          ]}
        >
          {enabled ? (
            <View style={styles.selectionCheck} accessible={false}>
              <View
                style={[
                  styles.selectionCheckShort,
                  lightMode && lightStyles.selectionCheckMark,
                  highContrast && styles.highContrastSelectionCheckMark,
                ]}
              />
              <View
                style={[
                  styles.selectionCheckLong,
                  lightMode && lightStyles.selectionCheckMark,
                  highContrast && styles.highContrastSelectionCheckMark,
                ]}
              />
            </View>
          ) : null}
        </View>
        <Text
          style={[
            styles.selectionStatus,
            enabled && styles.selectedSelectionStatus,
            lightMode && lightStyles.mutedText,
            lightMode && enabled && lightStyles.selectedSelectionStatus,
            highContrast && !lightMode && styles.highContrastMutedText,
            highContrast && lightMode && lightStyles.highContrastMutedText,
            highContrast && enabled && styles.highContrastSelectedText,
          ]}
        >
          {stateLabel}
        </Text>
      </View>
    </Pressable>
  );
});

const PassengerDefaultsIcons = memo(function PassengerDefaultsIcons({
  requirements,
  lightMode,
  highContrast,
  compact = false,
}: {
  requirements: AccessibilityRequirements;
  lightMode: boolean;
  highContrast: boolean;
  compact?: boolean;
}) {
  const metadata: Record<
    AssistanceType,
    { label: string; icon: ImageSourcePropType; preserveIconColors?: boolean }
  > = {
    WHEELCHAIR_RAMP: {
      label: "Wheelchair ramp",
      icon: optionIcons.wheelchairAssistance,
    },
    BUS_AUDIO_IDENTIFICATION: {
      label: "Bus identification",
      icon: optionIcons.busIdentification,
    },
    EXTENDED_DWELL_TIME: {
      label: "More boarding time",
      icon: optionIcons.increasedDuration,
    },
  };
  const defaults = requirementsToAssistanceTypes(requirements).map((type) => metadata[type]);
  const label = requirementsLabel(requirements);

  return (
    <View
      style={[styles.defaultsIconGroup, compact && styles.compactDefaultsIconGroup]}
      accessible
      accessibilityLabel={`Passenger defaults: ${label}.`}
    >
      {!compact && (
        <Text
          style={[
            styles.defaultsIconLabel,
            lightMode && lightStyles.mutedText,
            highContrast && !lightMode && styles.highContrastMutedText,
            highContrast && lightMode && lightStyles.highContrastMutedText,
          ]}
        >
          Passenger defaults
        </Text>
      )}
      {defaults.length > 0 ? (
        <View style={[styles.defaultsIconRow, compact && styles.compactDefaultsIconRow]}>
          {defaults.map((item) => (
            <View
              key={item.label}
              style={[
                styles.defaultsIconChip,
                compact && styles.compactDefaultsIconBadge,
                lightMode && lightStyles.defaultsIconChip,
                highContrast && !lightMode && styles.highContrastControl,
                highContrast && lightMode && lightStyles.highContrastControl,
                highContrast && lightMode && lightStyles.highContrastDefaultsIconChip,
              ]}
            >
              <Image
                source={item.icon}
                style={[
                  item.preserveIconColors ? styles.defaultsIconImageOriginal : styles.defaultsIconImage,
                  highContrast && lightMode && lightStyles.highContrastDefaultsIconImage,
                ]}
                resizeMode="contain"
                accessible={false}
              />
              {!compact && (
                <Text
                  style={[
                    styles.defaultsIconText,
                    lightMode && lightStyles.text,
                    highContrast && !lightMode && styles.highContrastText,
                    highContrast && lightMode && lightStyles.highContrastText,
                  ]}
                >
                  {item.label}
                </Text>
              )}
            </View>
          ))}
        </View>
      ) : compact ? null : (
        <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
          No bus assistance defaults
        </Text>
      )}
    </View>
  );
});

function AssistanceSummaryList({
  requirements,
  status,
  lightMode,
  highContrast,
}: {
  requirements: AccessibilityRequirements;
  status: AssistanceRequestStatus | null;
  lightMode: boolean;
  highContrast: boolean;
}) {
  const metadata: Record<AssistanceType, { label: string; icon: ImageSourcePropType }> = {
    WHEELCHAIR_RAMP: {
      label: "Wheelchair ramp",
      icon: optionIcons.wheelchairAssistance,
    },
    BUS_AUDIO_IDENTIFICATION: {
      label: "Bus identification",
      icon: optionIcons.busIdentification,
    },
    EXTENDED_DWELL_TIME: {
      label: "More boarding time",
      icon: optionIcons.increasedDuration,
    },
  };
  const items = requirementsToAssistanceTypes(requirements).map((type) => metadata[type]);
  const statusText = status === "ACKNOWLEDGED" ? "Confirmed" : requestStatusLabel(status);

  if (items.length === 0) {
    return (
      <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
        No assistance selected for this journey.
      </Text>
    );
  }

  return (
    <View style={styles.assistanceSummaryList}>
      {items.map((item) => (
        <View
          key={item.label}
          style={[
            styles.assistanceSummaryRow,
            lightMode && lightStyles.landmarkSearchResult,
            highContrast && !lightMode && styles.highContrastControl,
            highContrast && lightMode && lightStyles.highContrastControl,
          ]}
        >
          <Image
            source={item.icon}
            style={styles.defaultsIconImage}
            resizeMode="contain"
            accessible={false}
          />
          <View style={styles.landmarkSearchTextGroup}>
            <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>{item.label}</Text>
            <Text style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}>{statusText}</Text>
          </View>
          <CircleCheck
            size={iconSizes.standard}
            color={controlIconColor({ active: status === "ACKNOWLEDGED", lightMode, highContrast })}
            strokeWidth={2.75}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </View>
      ))}
    </View>
  );
}

function BoardingTimeIcon({
  selected,
  highContrast,
  lightMode,
}: {
  selected: boolean;
  highContrast: boolean;
  lightMode: boolean;
}) {
  const iconColor = highContrast
    ? lightMode && !selected
      ? "#000000"
      : "#FFFFFF"
    : lightMode && !selected
      ? lightTheme.primary
      : selected
        ? colors.textOnPrimary
        : colors.primary;

  return (
    <View style={styles.boardingTimeIcon} accessible={false}>
      <View style={[styles.boardingTimeClock, { borderColor: iconColor }]}>
        <View style={[styles.boardingTimeHourHand, { backgroundColor: iconColor }]} />
        <View style={[styles.boardingTimeMinuteHand, { backgroundColor: iconColor }]} />
      </View>
      <View style={[styles.boardingTimePlusHorizontal, { backgroundColor: iconColor }]} />
      <View style={[styles.boardingTimePlusVertical, { backgroundColor: iconColor }]} />
    </View>
  );
}

function AppearanceSwitch({
  themeMode,
  highContrast,
  largeText,
  onToggle,
}: {
  themeMode: AppAccessibilityPreferences["themeMode"];
  highContrast: boolean;
  largeText: boolean;
  onToggle: () => void;
}) {
  const lightMode = themeMode === "light";
  const nextMode = lightMode ? "dark" : "light";

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: !lightMode }}
      accessibilityLabel="Dark mode"
      accessibilityHint="Switches appearance between light and dark mode."
      onPress={() => {
        onToggle();
        AccessibilityInfo.announceForAccessibility(`${nextMode} mode selected.`);
      }}
      style={[
        styles.themeSwitchCard,
        lightMode && lightStyles.themeSwitchCard,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
      ]}
    >
      <View style={styles.appearanceHeader}>
        <Text
          style={[
            styles.toggleText,
            largeText && styles.largeBody,
            lightMode && lightStyles.text,
            highContrast && !lightMode && styles.highContrastText,
            highContrast && lightMode && lightStyles.highContrastText,
          ]}
        >
          Appearance
        </Text>
        <Text
          style={[
            styles.bodyText,
            largeText && styles.largeBody,
            lightMode && lightStyles.bodyText,
            highContrast && !lightMode && styles.highContrastMutedText,
            highContrast && lightMode && lightStyles.highContrastMutedText,
          ]}
        >
          {lightMode ? "Light mode" : "Dark mode"}
        </Text>
      </View>
      <View style={styles.appearanceSwitchRow}>
        <View
          style={[
            styles.modeLabel,
            lightMode && lightStyles.modeLabel,
            lightMode && styles.selectedModeLabel,
            lightMode && lightStyles.selectedModeLabel,
          ]}
        >
          <SunIcon selected={lightMode} highContrast={highContrast} lightMode={lightMode} />
          <Text
            style={[
              styles.modeLabelText,
              lightMode && styles.selectedModeLabelText,
              lightMode && lightStyles.text,
              lightMode && lightStyles.selectedModeLabelText,
              highContrast && !lightMode && styles.highContrastText,
              highContrast && lightMode && lightStyles.highContrastText,
            ]}
          >
            Light
          </Text>
        </View>
        <View style={[styles.modeSwitchTrack, !lightMode && styles.modeSwitchTrackDark]}>
          <View style={[styles.modeSwitchThumb, !lightMode && styles.modeSwitchThumbDark]} />
        </View>
        <View
          style={[
            styles.modeLabel,
            lightMode && lightStyles.modeLabel,
            !lightMode && styles.selectedModeLabel,
          ]}
        >
          <MoonIcon selected={!lightMode} highContrast={highContrast} lightMode={lightMode} />
          <Text
            style={[
              styles.modeLabelText,
              !lightMode && styles.selectedModeLabelText,
              lightMode && lightStyles.text,
              highContrast && !lightMode && styles.highContrastText,
              highContrast && lightMode && lightStyles.highContrastText,
            ]}
          >
            Dark
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function SunIcon({
  selected,
  highContrast,
  lightMode,
}: {
  selected: boolean;
  highContrast: boolean;
  lightMode: boolean;
}) {
  const sunAccent = highContrast
    ? lightMode
      ? "#000000"
      : "#FFFFFF"
    : lightMode
      ? lightTheme.warning
      : "#8F6F34";
  const sunPartStyle = { backgroundColor: sunAccent };

  return (
    <View
      style={[
        styles.sunIcon,
        selected && styles.selectedModeIcon,
        lightMode && lightStyles.modeIcon,
        selected && styles.selectedSunIcon,
        selected && lightMode && lightStyles.selectedSunIcon,
        highContrast && styles.highContrastIndicator,
        highContrast && lightMode && lightStyles.highContrastIndicator,
      ]}
      accessible={false}
    >
      <View style={[styles.sunRay, styles.sunRayTop, sunPartStyle]} />
      <View style={[styles.sunRay, styles.sunRayBottom, sunPartStyle]} />
      <View style={[styles.sunRay, styles.sunRayLeft, sunPartStyle]} />
      <View style={[styles.sunRay, styles.sunRayRight, sunPartStyle]} />
      <View style={[styles.sunRay, styles.sunRayTopLeft, sunPartStyle]} />
      <View style={[styles.sunRay, styles.sunRayTopRight, sunPartStyle]} />
      <View style={[styles.sunRay, styles.sunRayBottomLeft, sunPartStyle]} />
      <View style={[styles.sunRay, styles.sunRayBottomRight, sunPartStyle]} />
      <View style={[styles.sunCore, sunPartStyle]} />
    </View>
  );
}

function MoonIcon({
  selected,
  highContrast,
  lightMode,
}: {
  selected: boolean;
  highContrast: boolean;
  lightMode: boolean;
}) {
  return (
    <View
      style={[
        styles.moonIcon,
        selected && styles.selectedModeIcon,
        lightMode && lightStyles.modeIcon,
        lightMode && styles.moonIconFrame,
        highContrast && styles.highContrastIndicator,
        selected && styles.selectedMoonIcon,
      ]}
      accessible={false}
    >
      <View style={[styles.moonInner, selected && styles.selectedMoonInner]} />
      <View
        style={[
          styles.moonCutout,
          lightMode && lightStyles.moonCutout,
          selected && styles.selectedMoonCutout,
        ]}
      />
    </View>
  );
}

function AssistancePreferenceToggles({
  requirements,
  appPreferences,
  resolvedThemeMode,
  setRequirements,
}: {
  requirements: AccessibilityRequirements;
  appPreferences: AppAccessibilityPreferences;
  resolvedThemeMode: "light" | "dark";
  setRequirements: React.Dispatch<React.SetStateAction<AccessibilityRequirements>>;
}) {
  return (
    <>
      <ToggleRow
        label="Mobility Assistance"
        description="Request wheelchair ramp"
        enabled={requirements.wheelchairRamp}
        highContrast={appPreferences.highContrast}
        largeText={appPreferences.largeText}
        lightMode={resolvedThemeMode === "light"}
        variant="assistance"
        iconSource={optionIcons.wheelchairAssistance}
        iconSize={38}
        onPress={() =>
          setRequirements((current) => ({
            ...current,
            wheelchairRamp: !current.wheelchairRamp,
          }))
        }
      />
      <ToggleRow
        label="More Boarding Time"
        description="Request additional time to board"
        enabled={requirements.extendedDwellTime}
        highContrast={appPreferences.highContrast}
        largeText={appPreferences.largeText}
        lightMode={resolvedThemeMode === "light"}
        variant="assistance"
        iconSource={optionIcons.increasedDuration}
        iconSize={40}
        onPress={() =>
          setRequirements((current) => ({
            ...current,
            extendedDwellTime: !current.extendedDwellTime,
          }))
        }
      />
      <ToggleRow
        label="Bus Identification Assistance"
        description="Receive assistance identifying the correct approaching bus"
        enabled={requirements.busAudioIdentification}
        highContrast={appPreferences.highContrast}
        largeText={appPreferences.largeText}
        lightMode={resolvedThemeMode === "light"}
        variant="assistance"
        iconSource={optionIcons.busIdentification}
        iconSize={37}
        onPress={() =>
          setRequirements((current) => ({
            ...current,
            busAudioIdentification: !current.busAudioIdentification,
          }))
        }
      />
    </>
  );
}

function AppPreferenceToggles({
  appPreferences,
  resolvedThemeMode,
  setAppPreferences,
}: {
  appPreferences: AppAccessibilityPreferences;
  resolvedThemeMode: "light" | "dark";
  setAppPreferences: React.Dispatch<React.SetStateAction<AppAccessibilityPreferences>>;
}) {
  return (
    <>
      <ToggleRow
        label="Screen-reader optimised"
        description="Use longer labels and spoken announcements"
        enabled={appPreferences.screenReaderOptimised}
        highContrast={appPreferences.highContrast}
        largeText={appPreferences.largeText}
        lightMode={resolvedThemeMode === "light"}
        variant="phone"
        iconSource={optionIcons.screenReader}
        iconSize={36}
        onPress={() =>
          setAppPreferences((current) => ({
            ...current,
            screenReaderOptimised: !current.screenReaderOptimised,
          }))
        }
      />
      <ToggleRow
        label="Repeat important announcements"
        description="Keep repeat buttons available for bus and journey guidance"
        enabled={appPreferences.repeatAudio}
        highContrast={appPreferences.highContrast}
        largeText={appPreferences.largeText}
        lightMode={resolvedThemeMode === "light"}
        variant="phone"
        iconSource={optionIcons.repeatAnnouncements}
        iconSize={37}
        onPress={() =>
          setAppPreferences((current) => ({
            ...current,
            repeatAudio: !current.repeatAudio,
          }))
        }
      />
      <ToggleRow
        label="Haptic alerts"
        description="Vibrate for acknowledgement, approach, and arrival"
        enabled={appPreferences.hapticAlerts}
        highContrast={appPreferences.highContrast}
        largeText={appPreferences.largeText}
        lightMode={resolvedThemeMode === "light"}
        variant="phone"
        iconSource={optionIcons.hapticAlerts}
        iconSize={36}
        onPress={() =>
          setAppPreferences((current) => ({
            ...current,
            hapticAlerts: !current.hapticAlerts,
          }))
        }
      />
      <ToggleRow
        label="Large text"
        description="Increase important text size on this phone"
        enabled={appPreferences.largeText}
        highContrast={appPreferences.highContrast}
        largeText={appPreferences.largeText}
        lightMode={resolvedThemeMode === "light"}
        variant="phone"
        iconSource={optionIcons.largeText}
        iconSize={38}
        onPress={() =>
          setAppPreferences((current) => ({
            ...current,
            largeText: !current.largeText,
          }))
        }
      />
      <ToggleRow
        label="High contrast"
        description="Use stronger contrast for visual alerts and controls"
        enabled={appPreferences.highContrast}
        highContrast={appPreferences.highContrast}
        largeText={appPreferences.largeText}
        lightMode={resolvedThemeMode === "light"}
        variant="phone"
        iconSource={optionIcons.highContrast}
        iconSize={36}
        onPress={() =>
          setAppPreferences((current) => ({
            ...current,
            highContrast: !current.highContrast,
          }))
        }
      />
    </>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  lightMode = false,
  highContrast = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "default" | "email-address";
  lightMode?: boolean;
  highContrast?: boolean;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text
        style={[
          styles.summaryLabel,
          lightMode && lightStyles.mutedText,
          highContrast && !lightMode && styles.highContrastMutedText,
          highContrast && lightMode && lightStyles.highContrastMutedText,
        ]}
      >
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={keyboardType === "email-address" ? "none" : "words"}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={lightMode ? "#536B70" : colors.metadata}
        style={[
          styles.textInput,
          lightMode && lightStyles.textInput,
          highContrast && !lightMode && styles.highContrastControl,
          highContrast && lightMode && lightStyles.highContrastControl,
        ]}
        value={value}
      />
    </View>
  );
}

function SectionHeader({
  eyebrow,
  title,
  highContrast = false,
  lightMode = false,
}: {
  eyebrow: string;
  title: string;
  highContrast?: boolean;
  lightMode?: boolean;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text
        style={[
          styles.eyebrow,
          lightMode && lightStyles.eyebrow,
          highContrast && !lightMode && styles.highContrastMutedText,
          highContrast && lightMode && lightStyles.highContrastMutedText,
        ]}
      >
        {eyebrow}
      </Text>
      <Text
        style={[
          styles.heading,
          lightMode && lightStyles.text,
          highContrast && !lightMode && styles.highContrastText,
          highContrast && lightMode && lightStyles.highContrastText,
        ]}
      >
        {title}
      </Text>
    </View>
  );
}

function BrandHeader({
  highContrast = false,
  lightMode = false,
  compact = false,
}: {
  highContrast?: boolean;
  lightMode?: boolean;
  compact?: boolean;
}) {
  return (
    <View
      style={[styles.brandHeader, compact && styles.compactBrandHeader]}
      accessible
      accessibilityRole="header"
      accessibilityLabel="SG GoAssist"
    >
      <Image
        source={brandLogo}
        style={[styles.brandLogoImage, compact && styles.compactBrandLogoImage]}
        resizeMode="contain"
        accessible={false}
      />
      <View style={styles.brandTextGroup}>
        <Text
          style={[
            styles.brandTitle,
            compact && styles.compactBrandTitle,
            lightMode && lightStyles.text,
            highContrast && !lightMode && styles.highContrastText,
            highContrast && lightMode && lightStyles.highContrastText,
          ]}
        >
          SG GoAssist
        </Text>
        {!compact ? (
          <Text
            style={[
              styles.brandSubtitle,
              lightMode && lightStyles.eyebrow,
              highContrast && !lightMode && styles.highContrastMutedText,
              highContrast && lightMode && lightStyles.highContrastMutedText,
            ]}
          >
            Accessible journeys. Guided with care.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function TabBar({
  activeTab,
  hasSelectedBus,
  hasRequest,
  lightMode,
  highContrast,
  compact,
  onSelect,
}: {
  activeTab: AppTab;
  hasSelectedBus: boolean;
  hasRequest: boolean;
  lightMode: boolean;
  highContrast: boolean;
  compact: boolean;
  onSelect: (tab: AppTab) => void;
}) {
  const theme = resolveVisualTheme(lightMode, highContrast);
  return (
    <View
      style={[
        styles.tabBar,
        {
          backgroundColor: theme.colors.map.navigationSurface,
          borderColor: theme.colors.map.navigationDivider,
        },
        compact && styles.compactTabBar,
        lightMode && lightStyles.tabBar,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
      ]}
    >
      <TabButton
        label="Home"
        icon="home"
        index={1}
        selected={activeTab === "HOME"}
        lightMode={lightMode}
        highContrast={highContrast}
        compact={compact}
        onPress={() => onSelect("HOME")}
      />
      <TabButton
        label="Journey"
        icon="journey"
        index={2}
        selected={activeTab === "JOURNEY"}
        stateDescription={hasSelectedBus ? "active journey" : "map ready"}
        lightMode={lightMode}
        highContrast={highContrast}
        compact={compact}
        onPress={() => onSelect("JOURNEY")}
      />
      <TabButton
        label="Assist"
        icon="assist"
        index={3}
        selected={activeTab === "ASSISTANCE"}
        stateDescription={hasRequest ? "assistance request active" : "preferences available"}
        lightMode={lightMode}
        highContrast={highContrast}
        compact={compact}
        onPress={() => onSelect("ASSISTANCE")}
      />
      <TabButton
        label="Profile"
        icon="profile"
        index={4}
        selected={activeTab === "PROFILE"}
        lightMode={lightMode}
        highContrast={highContrast}
        compact={compact}
        onPress={() => onSelect("PROFILE")}
      />
    </View>
  );
}

const BusStopCard = memo(function BusStopCard({
  stop,
  selected = false,
  onPress,
  lightMode = false,
  highContrast = false,
}: {
  stop: NearbyBusStop;
  selected?: boolean;
  onPress?: () => void;
  lightMode?: boolean;
  highContrast?: boolean;
}) {
  const walkingMinutes = Math.max(1, Math.round(stop.distanceMeters / 70));
  const services = busServicesForStop(stop);
  const recommended = stop.distanceMeters <= 80;
  const content = (
    <>
      <View style={styles.iconTitleRow}>
        <View style={[styles.componentIconBadge, lightMode && lightStyles.componentIconBadge]}>
          <MapPin
            size={19}
            color={lightMode ? lightTheme.primary : colors.primary}
            strokeWidth={2.75}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </View>
        <Text style={[styles.statusLabel, lightMode && lightStyles.mutedText]}>
          {selected ? "Your bus stop" : recommended ? "Recommended nearby stop" : "Nearby stop"}
        </Text>
      </View>
      <Text style={[styles.busTitle, lightMode && lightStyles.text]}>{stop.description}</Text>
      <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>{stop.roadName}</Text>
      <View style={styles.infoRow}>
        <Text style={[styles.infoPill, lightMode && lightStyles.infoPill]}>
          Bus Stop {stop.busStopCode}
        </Text>
        <Text style={[styles.infoPill, lightMode && lightStyles.infoPill]}>
          About {stop.distanceMeters} m away
        </Text>
        <Text style={[styles.infoPill, lightMode && lightStyles.infoPill]}>
          About {walkingMinutes} min walk
        </Text>
      </View>
      <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
        Services {services.join(", ")}
      </Text>
      {onPress ? (
        <View style={styles.actionHintRow}>
          {selected ? (
            <CircleCheck
              size={21}
              color={lightMode ? lightTheme.primaryStrong : colors.highlight}
              strokeWidth={2.75}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          ) : (
            <ArrowRight
              size={21}
              color={lightMode ? lightTheme.primaryStrong : colors.highlight}
              strokeWidth={2.75}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          )}
          <Text style={[styles.chooseStopHint, lightMode && lightStyles.selectedMapListToggleText]}>
            {selected ? "Selected stop" : "Choose this stop"}
          </Text>
        </View>
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View
        style={[
          styles.busCard,
          lightMode && lightStyles.surface,
          selected && styles.selectedCard,
          lightMode && selected && lightStyles.selectedCard,
          highContrast && !lightMode && styles.highContrastControl,
          highContrast && lightMode && lightStyles.highContrastControl,
        ]}
        accessible
        accessibilityLabel={stopAccessibilityLabel(stop)}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${recommended ? "Recommended stop. " : ""}${stop.description}, ${stop.roadName}, bus stop ${stop.busStopCode}, about ${stop.distanceMeters} metres away, about ${walkingMinutes} minutes walk. Services ${services.join(", ")}. Choose this stop.`}
      onPress={onPress}
      style={[
        styles.busCard,
        lightMode && lightStyles.surface,
        selected && styles.selectedCard,
        lightMode && selected && lightStyles.selectedCard,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
      ]}
    >
      {content}
    </Pressable>
  );
});

function BusArrivalCard({
  bus,
  selected,
  onPress,
  lightMode = false,
  highContrast = false,
}: {
  bus: ArrivalBus;
  selected: boolean;
  onPress: () => void;
  lightMode?: boolean;
  highContrast?: boolean;
}) {
  const etaMinutes = Math.ceil(bus.etaSeconds / 60);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Bus ${bus.serviceNo} towards ${bus.destination}, arriving in approximately ${etaMinutes} minutes, ${
        bus.wheelchairAccessible ? "wheelchair accessible" : "accessibility not indicated"
      }. Double tap to select bus.`}
      onPress={onPress}
      style={[
        styles.arrivalCard,
        lightMode && lightStyles.surface,
        selected && styles.selectedCard,
        lightMode && selected && lightStyles.selectedCard,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
      ]}
    >
      <View style={styles.arrivalTopRow}>
        <View style={styles.serviceNumberGroup}>
          <BusFront
            size={32}
            color={colors.primary}
            strokeWidth={2.5}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={styles.serviceNumber}>{bus.serviceNo}</Text>
        </View>
        <View style={styles.etaBlock}>
          <Text style={styles.etaNumber}>{etaMinutes}</Text>
          <Text style={styles.etaLabel}>MIN</Text>
        </View>
      </View>
      <Text style={[styles.destinationText, lightMode && lightStyles.text]}>{bus.destination}</Text>
      <View style={styles.infoRow}>
        <Text style={[styles.infoPill, lightMode && lightStyles.infoPill]}>
          {bus.wheelchairAccessible ? "Accessible" : "Accessibility not indicated"}
        </Text>
      </View>
      <Text style={styles.selectHint}>{selected ? "Selected bus" : "Select bus"}</Text>
    </Pressable>
  );
}

function OnboardJourneyScreen({
  appPreferences,
  selectedBus,
  destination,
  currentStop,
  nextStop,
  routeStops,
  currentStopIndex,
  selectedAlightingStop,
  selectedAlightingStopIndex,
  stopsRemaining,
  destinationApproaching,
  alightingAssistanceTypes,
  selectedStopIsNext,
  selectedStopReached,
  journeyPhase,
  onChangeStop,
  onSetDestination,
  onRequestDisembarkation,
  onRepeat,
  onSimulateNextStop,
  onEndJourney,
}: {
  appPreferences: AppAccessibilityPreferences;
  selectedBus: Bus;
  destination: string;
  currentStop: RouteStop | null;
  nextStop: RouteStop | null;
  routeStops: RouteStop[];
  currentStopIndex: number;
  selectedAlightingStop: RouteStop | null;
  selectedAlightingStopIndex: number;
  stopsRemaining: number | null;
  destinationApproaching: boolean;
  alightingAssistanceTypes: AssistanceType[];
  selectedStopIsNext: boolean;
  selectedStopReached: boolean;
  journeyPhase: JourneyPhase;
  onChangeStop: () => void;
  onSetDestination: (stop: RouteStop) => void;
  onRequestDisembarkation: () => void;
  onRepeat: () => void;
  onSimulateNextStop: () => void;
  onEndJourney: () => void;
}) {
  const [followJourney, setFollowJourney] = useState(true);
  const [showRouteStops, setShowRouteStops] = useState(false);
  const [showOnboardMore, setShowOnboardMore] = useState(false);
  const [previewKind, setPreviewKind] = useState<"BUS" | "STOP" | null>(null);
  const [selectedPreviewStop, setSelectedPreviewStop] = useState<RouteStop | null>(null);
  const [onboardViewport, setOnboardViewport] = useState<MapViewport>({
    center: currentStop ?? manualStopLookup,
    zoom: 15,
    bearing: 0,
    pitch: 0,
    mode: "ACTIVE_JOURNEY",
  });
  const lightMode = appPreferences.themeMode === "light";
  const highContrast = appPreferences.highContrast;
  const panelStyle = [
    styles.statusPanel,
    lightMode && lightStyles.surface,
    highContrast && !lightMode && styles.highContrastControl,
    highContrast && lightMode && lightStyles.highContrastControl,
  ];
  const labelStyle = [
    styles.statusLabel,
    lightMode && lightStyles.mutedText,
    highContrast && !lightMode && styles.highContrastMutedText,
    highContrast && lightMode && lightStyles.highContrastMutedText,
  ];
  const valueStyle = [
    styles.summaryValue,
    lightMode && lightStyles.text,
    highContrast && !lightMode && styles.highContrastText,
    highContrast && lightMode && lightStyles.highContrastText,
  ];
  const bodyStyle = [
    styles.bodyText,
    lightMode && lightStyles.bodyText,
    highContrast && !lightMode && styles.highContrastMutedText,
    highContrast && lightMode && lightStyles.highContrastMutedText,
  ];
  const destinationName = selectedAlightingStop?.description ?? "Choose destination";
  const stopsRemainingLabel =
    stopsRemaining === null
      ? "Choose a destination for stop countdown"
      : stopsRemaining === 0
        ? "You have arrived"
        : stopsRemaining === 1
          ? "Your stop is next"
          : `${stopsRemaining} stops remaining`;
  const onboardStatus =
    selectedStopReached
      ? "THIS IS YOUR STOP"
      : selectedStopIsNext || journeyPhase === "DESTINATION_NEXT"
        ? "YOUR STOP IS NEXT"
        : destinationApproaching || journeyPhase === "DESTINATION_APPROACHING"
          ? "Destination approaching"
          : "Onboard journey";
  const previewStopIndex = selectedPreviewStop ? routeStopIndex(routeStops, selectedPreviewStop) : -1;
  const previewStopsAhead = previewStopIndex >= 0 ? Math.max(0, previewStopIndex - currentStopIndex) : null;

  function previewBusPosition() {
    setPreviewKind("BUS");
    setSelectedPreviewStop(null);
  }

  function previewRouteStop(stop: RouteStop) {
    setPreviewKind("STOP");
    setSelectedPreviewStop(stop);
  }

  function setPreviewAsDestination() {
    if (!selectedPreviewStop) {
      return;
    }
    onSetDestination(selectedPreviewStop);
  }

  function moveMapManually() {
    setFollowJourney(false);
    setOnboardViewport((current) => ({
      ...current,
      zoom: clampMapZoom(current.zoom - 1, "USER_PAN"),
      mode: "USER_PAN",
    }));
  }

  function returnToJourney() {
    setFollowJourney(true);
    setPreviewKind("BUS");
    setSelectedPreviewStop(null);
    setOnboardViewport((current) => ({
      ...current,
      center: currentStop ?? current.center,
      zoom: clampMapZoom(15, "ACTIVE_JOURNEY"),
      mode: "ACTIVE_JOURNEY",
    }));
  }

  function rotateOnboardMap() {
    setFollowJourney(false);
    setOnboardViewport((current) => ({
      ...current,
      bearing: current.bearing === 0 ? 35 : 0,
      mode: "USER_PAN",
    }));
  }

  function resetOnboardNorth() {
    setOnboardViewport((current) => ({ ...current, bearing: 0, pitch: 0 }));
  }

  function viewOnboardJourney() {
    setFollowJourney(false);
    setOnboardViewport((current) => ({
      ...current,
      center: selectedAlightingStop ?? nextStop ?? currentStop ?? current.center,
      zoom: clampMapZoom(14, "ACTIVE_JOURNEY"),
      mode: "ACTIVE_JOURNEY",
    }));
  }

  function viewOnboardFullRoute() {
    setFollowJourney(false);
    setOnboardViewport((current) => ({
      ...current,
      center: selectedAlightingStop ?? current.center,
      zoom: mapZoomLimits.fullRouteMin,
      mode: "FULL_ROUTE",
    }));
  }

  function resetOnboardMap() {
    setFollowJourney(true);
    setPreviewKind("BUS");
    setSelectedPreviewStop(null);
    setOnboardViewport((current) => ({
      ...current,
      center: currentStop ?? current.center,
      zoom: 15,
      bearing: 0,
      pitch: 0,
      mode: "ACTIVE_JOURNEY",
    }));
  }

  return (
    <View style={styles.section}>
      <View
        style={styles.onboardHero}
        accessible
        accessibilityRole="header"
        accessibilityLabel={`On Service ${selectedBus.busService}. Next stop ${nextStop?.description ?? "final stop"}. Destination ${destinationName}. ${stopsRemainingLabel}.`}
      >
        <Text style={styles.onboardEyebrow}>{onboardStatus}</Text>
        <Text style={styles.onboardBus}>Service {selectedBus.busService}</Text>
        <Text style={styles.onboardDestination}>Next: {nextStop?.description ?? "Final stop"}</Text>
      </View>

      <OnboardJourneyMap
        selectedBus={selectedBus}
        currentStop={currentStop}
        nextStop={nextStop}
        routeStops={routeStops}
        currentStopIndex={currentStopIndex}
        destinationStop={selectedAlightingStop}
        destinationStopIndex={selectedAlightingStopIndex}
        selectedPreviewStop={selectedPreviewStop}
        followJourney={followJourney}
        viewport={onboardViewport}
        moreOpen={showOnboardMore}
        stopsRemaining={stopsRemaining}
        lightMode={lightMode}
        highContrast={highContrast}
        onPreviewBus={previewBusPosition}
        onPreviewStop={previewRouteStop}
        onMoveMap={moveMapManually}
        onReturnToJourney={returnToJourney}
        onViewStops={() => setShowRouteStops((visible) => !visible)}
        onMore={() => setShowOnboardMore((open) => !open)}
        onRotateMap={rotateOnboardMap}
        onResetNorth={resetOnboardNorth}
        onViewJourney={viewOnboardJourney}
        onViewFullRoute={viewOnboardFullRoute}
        onResetMap={resetOnboardMap}
      />

      <JourneyMapPreview
        previewKind={previewKind}
        selectedBus={selectedBus}
        selectedPreviewStop={selectedPreviewStop}
        currentStop={currentStop}
        nextStop={nextStop}
        destinationStop={selectedAlightingStop}
        previewStopIndex={previewStopIndex}
        currentStopIndex={currentStopIndex}
        previewStopsAhead={previewStopsAhead}
        stopsRemaining={stopsRemaining}
        lightMode={lightMode}
        highContrast={highContrast}
        onSetDestination={setPreviewAsDestination}
      />

      {(selectedStopIsNext || journeyPhase === "DESTINATION_NEXT") && !selectedStopReached && (
        <View style={styles.priorityPanel} accessible accessibilityRole="alert">
          <View style={styles.iconTitleRow}>
            <Bell
              size={24}
              color={colors.textOnAccessible}
              strokeWidth={2.75}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={styles.statusLabel}>YOUR STOP IS NEXT</Text>
          </View>
          <Text style={styles.statusValue}>{destinationName}</Text>
          <Text style={styles.bodyText}>Prepare to get off.</Text>
        </View>
      )}

      {selectedStopReached && (
        <View style={styles.priorityPanel} accessible accessibilityRole="alert">
          <View style={styles.iconTitleRow}>
            <DoorOpen
              size={24}
              color={colors.textOnAccessible}
              strokeWidth={2.75}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={styles.statusLabel}>THIS IS YOUR STOP</Text>
          </View>
          <Text style={styles.statusValue}>{destinationName}</Text>
          <Text style={styles.bodyText}>Disembark when it is safe.</Text>
        </View>
      )}

      <View style={panelStyle}>
        <View style={styles.iconTitleRow}>
          <Clock
            size={22}
            color={controlIconColor({ lightMode, highContrast })}
            strokeWidth={2.75}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={labelStyle}>On Service {selectedBus.busService}</Text>
        </View>
        <Text style={bodyStyle}>
          Current progress: {currentStop?.description ?? "Journey starting"}
        </Text>
        <View style={styles.iconTitleRow}>
          <Route
            size={22}
            color={controlIconColor({ lightMode, highContrast })}
            strokeWidth={2.75}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={labelStyle}>NEXT STOP</Text>
        </View>
        <Text style={valueStyle}>{nextStop?.description ?? "Final stop"}</Text>
        <View style={styles.iconTitleRow}>
          <MapPinned
            size={22}
            color={controlIconColor({ active: true, lightMode, highContrast })}
            strokeWidth={2.75}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={labelStyle}>Destination</Text>
        </View>
        <Text style={valueStyle}>{destinationName}</Text>
        <Text style={bodyStyle}>{stopsRemainingLabel}</Text>
      </View>

      {showRouteStops && (
      <View style={panelStyle}>
        <Text style={labelStyle}>Route progress</Text>
        <RouteProgressList
          routeStops={routeStops}
          currentStopIndex={currentStopIndex}
          destinationStopIndex={selectedAlightingStopIndex}
          lightMode={lightMode}
          highContrast={highContrast}
        />
      </View>
      )}

      <View style={panelStyle}>
        <Text style={labelStyle}>Disembarking assistance</Text>
        {alightingAssistanceTypes.length > 0 && (
          <Text style={bodyStyle}>
            {alightingAssistanceTypes.map(readableAssistanceType).join(", ")} will be requested for your selected stop.
          </Text>
        )}
        {alightingAssistanceTypes.length === 0 ? (
          <Text style={bodyStyle}>No disembarking assistance selected for this journey.</Text>
        ) : null}
        <SecondaryButton label={selectedAlightingStop ? "Change destination" : "Choose destination"} icon={Undo2} onPress={onChangeStop} lightMode={lightMode} highContrast={highContrast} />
      </View>

      <PrimaryButton
        label={selectedStopReached ? "I've left the bus" : "Request help to disembark"}
        icon={selectedStopReached ? DoorOpen : CircleCheck}
        accessibilityHint="Send passenger intent to alight. The bus remains responsible for safe operation."
        onPress={selectedStopReached ? onEndJourney : onRequestDisembarkation}
        variant="attention"
        lightMode={lightMode}
        highContrast={highContrast}
      />
      <SecondaryButton
        label="Repeat announcement"
        icon={Volume2}
        onPress={onRepeat}
        lightMode={lightMode}
        highContrast={highContrast}
      />
      {__DEV__ ? (
        <SecondaryButton
          label="Simulate next stop"
          icon={ArrowRight}
          accessibilityHint="Development control for onboard stop progress."
          onPress={onSimulateNextStop}
          disabled={!nextStop || journeyPhase === "COMPLETED"}
          lightMode={lightMode}
          highContrast={highContrast}
        />
      ) : null}
    </View>
  );
}

function OnboardJourneyMap({
  selectedBus,
  currentStop,
  nextStop,
  routeStops,
  currentStopIndex,
  destinationStop,
  destinationStopIndex,
  selectedPreviewStop,
  followJourney,
  viewport,
  moreOpen,
  stopsRemaining,
  lightMode,
  highContrast,
  onPreviewBus,
  onPreviewStop,
  onMoveMap,
  onReturnToJourney,
  onViewStops,
  onMore,
  onRotateMap,
  onResetNorth,
  onViewJourney,
  onViewFullRoute,
  onResetMap,
}: {
  selectedBus: Bus;
  currentStop: RouteStop | null;
  nextStop: RouteStop | null;
  routeStops: RouteStop[];
  currentStopIndex: number;
  destinationStop: RouteStop | null;
  destinationStopIndex: number;
  selectedPreviewStop: RouteStop | null;
  followJourney: boolean;
  viewport: MapViewport;
  moreOpen: boolean;
  stopsRemaining: number | null;
  lightMode: boolean;
  highContrast: boolean;
  onPreviewBus: () => void;
  onPreviewStop: (stop: RouteStop) => void;
  onMoveMap: () => void;
  onReturnToJourney: () => void;
  onViewStops: () => void;
  onMore: () => void;
  onRotateMap: () => void;
  onResetNorth: () => void;
  onViewJourney: () => void;
  onViewFullRoute: () => void;
  onResetMap: () => void;
}) {
  const routeEndIndex = destinationStopIndex >= 0 ? destinationStopIndex : routeStops.length - 1;
  const passedCount = Math.min(currentStopIndex, Math.max(routeEndIndex, 0));
  const progressLabel = `${passedCount} passed, ${stopsRemaining ?? "destination unset"} remaining`;
  const iconColor = controlIconColor({ lightMode, highContrast });
  const destinationName = destinationStop?.description ?? "destination not selected";

  return (
    <View
      style={[
        styles.onboardMapPanel,
        lightMode && lightStyles.surface,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
      ]}
      accessible
      accessibilityLabel={`Onboard journey map. Service ${selectedBus.busService}. Current stop ${currentStop?.description ?? "journey starting"}. Next stop ${nextStop?.description ?? "final stop"}. Destination ${destinationName}.`}
    >
      <View style={styles.mapPanelHeader}>
        <View style={styles.iconTitleRow}>
          <Route
            size={22}
            color={iconColor}
            strokeWidth={2.75}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={[styles.statusLabel, lightMode && lightStyles.mutedText]}>Journey map</Text>
        </View>
        <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>{progressLabel}</Text>
      </View>

      <View style={styles.onboardMapControls}>
        <SecondaryButton
          label={followJourney ? "Journey" : "Return to journey"}
          icon={followJourney ? Navigation : LocateFixed}
          onPress={followJourney ? onPreviewBus : onReturnToJourney}
          lightMode={lightMode}
          highContrast={highContrast}
        />
        <SecondaryButton label="View stops" icon={List} onPress={onViewStops} lightMode={lightMode} highContrast={highContrast} />
        <SecondaryButton label="More" icon={SlidersHorizontal} onPress={onMore} lightMode={lightMode} highContrast={highContrast} />
      </View>

      {viewport.bearing !== 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reset map to north"
          onPress={onResetNorth}
          style={[styles.onboardCompassControl, lightMode && lightStyles.mapSideControl]}
        >
          <Text style={[styles.mapCompassText, lightMode && lightStyles.text]}>N</Text>
          <Compass
            size={18}
            color={controlIconColor({ lightMode, highContrast })}
            strokeWidth={3}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </Pressable>
      ) : null}

      {moreOpen ? (
        <View style={[styles.onboardMorePanel, lightMode && lightStyles.surface]}>
          <SecondaryButton label="View journey" icon={Route} onPress={onViewJourney} lightMode={lightMode} highContrast={highContrast} />
          <SecondaryButton label="View full route" icon={MapIcon} onPress={onViewFullRoute} lightMode={lightMode} highContrast={highContrast} />
          <SecondaryButton label="Rotate map" icon={Compass} onPress={onRotateMap} lightMode={lightMode} highContrast={highContrast} />
          <SecondaryButton label="North up" icon={Compass} onPress={onResetNorth} lightMode={lightMode} highContrast={highContrast} />
          <SecondaryButton label="Reset map" icon={RefreshCw} onPress={onResetMap} lightMode={lightMode} highContrast={highContrast} />
          <SecondaryButton label="Move journey map manually" icon={MapIcon} onPress={onMoveMap} lightMode={lightMode} highContrast={highContrast} />
        </View>
      ) : null}

      {!followJourney && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Return to journey"
          onPress={onReturnToJourney}
          style={[styles.returnJourneyBanner, lightMode && lightStyles.selectedCard]}
        >
          <LocateFixed
            size={20}
            color={controlIconColor({ active: true, lightMode, highContrast })}
            strokeWidth={2.75}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={[styles.statusValue, lightMode && lightStyles.text]}>Return to journey</Text>
        </Pressable>
      )}

      <JourneyProgressIndicator
        routeStops={routeStops}
        currentStopIndex={currentStopIndex}
        destinationStopIndex={routeEndIndex}
        lightMode={lightMode}
      />

      <View style={styles.onboardMapCanvas}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Service ${selectedBus.busService} bus marker. Show journey position.`}
          onPress={onPreviewBus}
          style={[
            styles.journeyBusMarker,
            lightMode && lightStyles.journeyBusMarker,
            highContrast && styles.highContrastSelectedControl,
          ]}
        >
          <BusFront
            size={22}
            color={highContrast ? (lightMode ? "#000000" : "#FFFFFF") : colors.textOnPrimary}
            strokeWidth={2.75}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={styles.journeyBusMarkerText}>Bus {selectedBus.busService}</Text>
        </Pressable>

        {routeStops.map((stop, index) => {
          const passed = index < currentStopIndex;
          const current = index === currentStopIndex;
          const next = index === currentStopIndex + 1;
          const destination = index === destinationStopIndex;
          const afterDestination = destinationStopIndex >= 0 && index > destinationStopIndex;
          const previewed = selectedPreviewStop?.busStopCode === stop.busStopCode;
          const status = current ? "current" : next ? "next" : destination ? "destination" : passed ? "passed" : "upcoming";
          const MarkerIcon = destination ? MapPinned : current ? BusFront : MapPin;

          return (
            <Pressable
              key={`${stop.sequence}-${stop.busStopCode}-map`}
              accessibilityRole="button"
              accessibilityLabel={`Preview ${stop.description}, ${status} route stop`}
              onPress={() => onPreviewStop(stop)}
              style={[
                styles.journeyMapStopRow,
                previewed && styles.journeyMapStopRowSelected,
                lightMode && previewed && lightStyles.selectedCard,
              ]}
            >
              <View style={styles.journeyMapRail}>
                <View
                  style={[
                    styles.journeyMapLine,
                    passed && styles.journeyMapLineCompleted,
                    afterDestination && styles.journeyMapLineAfterDestination,
                  ]}
                />
                <View
                  style={[
                    styles.journeyMapStopMarker,
                    passed && styles.journeyMapStopMarkerPassed,
                    current && styles.journeyMapStopMarkerCurrent,
                    next && styles.journeyMapStopMarkerNext,
                    destination && styles.journeyMapStopMarkerDestination,
                    afterDestination && styles.journeyMapStopMarkerMuted,
                  ]}
                >
                  <MarkerIcon
                    size={18}
                    color={destination || current ? "#FFFFFF" : colors.text}
                    strokeWidth={2.75}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  />
                </View>
              </View>
              <View style={styles.journeyMapStopText}>
                <Text style={[styles.statusValue, lightMode && lightStyles.text]}>{stop.description}</Text>
                <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
                {destination ? "YOUR STOP" : status.toUpperCase()} · Stop {stop.busStopCode}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function JourneyProgressIndicator({
  routeStops,
  currentStopIndex,
  destinationStopIndex,
  lightMode,
}: {
  routeStops: RouteStop[];
  currentStopIndex: number;
  destinationStopIndex: number;
  lightMode: boolean;
}) {
  return (
    <View style={styles.journeyProgressBar} accessible accessibilityLabel={`Journey progress ${currentStopIndex} of ${destinationStopIndex} route stops completed`}>
      {routeStops.map((stop, index) => (
        <View
          key={`${stop.busStopCode}-progress`}
          style={[
            styles.journeyProgressCell,
            lightMode && lightStyles.journeyProgressCell,
            index <= currentStopIndex && styles.journeyProgressCellDone,
            index === destinationStopIndex && styles.journeyProgressCellDestination,
            index > destinationStopIndex && styles.journeyProgressCellMuted,
          ]}
        />
      ))}
    </View>
  );
}

function JourneyMapPreview({
  previewKind,
  selectedBus,
  selectedPreviewStop,
  currentStop,
  nextStop,
  destinationStop,
  previewStopIndex,
  currentStopIndex,
  previewStopsAhead,
  stopsRemaining,
  lightMode,
  highContrast,
  onSetDestination,
}: {
  previewKind: "BUS" | "STOP" | null;
  selectedBus: Bus;
  selectedPreviewStop: RouteStop | null;
  currentStop: RouteStop | null;
  nextStop: RouteStop | null;
  destinationStop: RouteStop | null;
  previewStopIndex: number;
  currentStopIndex: number;
  previewStopsAhead: number | null;
  stopsRemaining: number | null;
  lightMode: boolean;
  highContrast: boolean;
  onSetDestination: () => void;
}) {
  if (!previewKind) {
    return null;
  }
  const bodyStyle = [
    styles.bodyText,
    lightMode && lightStyles.bodyText,
    highContrast && !lightMode && styles.highContrastMutedText,
    highContrast && lightMode && lightStyles.highContrastMutedText,
  ];
  const previewIsDestination = selectedPreviewStop?.busStopCode === destinationStop?.busStopCode;
  const previewIsBehind = previewStopIndex >= 0 && previewStopIndex <= currentStopIndex;

  if (previewKind === "BUS") {
    return (
      <View style={[styles.journeyMapPreviewCard, lightMode && lightStyles.surface]}>
        <Text style={[styles.statusLabel, lightMode && lightStyles.mutedText]}>Journey position</Text>
        <Text style={[styles.statusValue, lightMode && lightStyles.text]}>Service {selectedBus.busService}</Text>
        <Text style={bodyStyle}>Current: {currentStop?.description ?? "Journey starting"}</Text>
        <Text style={bodyStyle}>Next: {nextStop?.description ?? "Final stop"}</Text>
        <Text style={bodyStyle}>Destination: {destinationStop?.description ?? "Choose destination"}</Text>
        <Text style={bodyStyle}>{stopsRemaining === null ? "Choose a destination" : `${stopsRemaining} stops remaining`}</Text>
      </View>
    );
  }

  if (!selectedPreviewStop) {
    return null;
  }

  return (
    <View style={[styles.journeyMapPreviewCard, lightMode && lightStyles.surface]}>
      <Text style={[styles.statusLabel, lightMode && lightStyles.mutedText]}>
        {previewIsDestination ? "Your destination" : "Stop preview"}
      </Text>
      <Text style={[styles.statusValue, lightMode && lightStyles.text]}>{selectedPreviewStop.description}</Text>
      <Text style={bodyStyle}>
        {previewStopsAhead === null
          ? "Route position unavailable"
          : previewStopsAhead === 0
            ? "You are here"
            : `${previewStopsAhead} stops ahead`}
      </Text>
      {!previewIsDestination && !previewIsBehind ? (
        <PrimaryButton label="Set as destination" icon={MapPinned} onPress={onSetDestination} lightMode={lightMode} highContrast={highContrast} />
      ) : null}
    </View>
  );
}

function RouteProgressList({
  routeStops,
  currentStopIndex,
  destinationStopIndex,
  lightMode,
  highContrast,
}: {
  routeStops: RouteStop[];
  currentStopIndex: number;
  destinationStopIndex: number;
  lightMode: boolean;
  highContrast: boolean;
}) {
  const textStyle = [
    styles.bodyText,
    lightMode && lightStyles.bodyText,
    highContrast && !lightMode && styles.highContrastMutedText,
    highContrast && lightMode && lightStyles.highContrastMutedText,
  ];
  return (
    <View accessible accessibilityLabel={routeProgressAnnouncement(routeStops, currentStopIndex, destinationStopIndex)}>
      {routeStops.map((stop, index) => {
        const passed = index < currentStopIndex;
        const current = index === currentStopIndex;
        const next = index === currentStopIndex + 1;
        const destinationStop = index === destinationStopIndex;
        const marker = passed ? "✓" : current ? "●" : destinationStop ? "◎" : "○";
        const label = current
          ? "CURRENT"
          : next
            ? "NEXT"
            : destinationStop
              ? "YOUR STOP"
              : passed
                ? "PASSED"
                : "UPCOMING";
        return (
          <View
            key={`${stop.sequence}-${stop.busStopCode}`}
            style={[
              styles.routeProgressRow,
              passed && styles.passedRouteProgressRow,
              current && styles.currentRouteProgressRow,
              destinationStop && styles.destinationRouteProgressRow,
              lightMode && lightStyles.surface,
            ]}
          >
            <Text style={[styles.routeProgressMarker, lightMode && lightStyles.text]}>{marker}</Text>
            <View style={styles.routeProgressTextGroup}>
              <Text style={[styles.statusValue, lightMode && lightStyles.text]}>{stop.description}</Text>
              <Text style={textStyle}>
                {label} · Stop {stop.busStopCode}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function StopSearch({
  query,
  onChangeQuery,
  largeText,
  lightMode,
  highContrast,
}: {
  query: string;
  onChangeQuery: (query: string) => void;
  largeText: boolean;
  lightMode: boolean;
  highContrast: boolean;
}) {
  const theme = resolveVisualTheme(lightMode, highContrast);
  const searchIconColor = theme.colors.map.controlIcon;
  const placeholder = largeText ? "Search stops" : "Search stops or places";
  return (
    <View
      style={[
        styles.stopSearchInputFrame,
        {
          backgroundColor: theme.colors.map.controlSurface,
          borderColor: theme.colors.map.controlBorder,
        },
        lightMode && lightStyles.textInput,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
      ]}
    >
      <Search
        size={24}
        color={searchIconColor}
        strokeWidth={2.75}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <TextInput
        accessibilityLabel="Search bus stop, service or place"
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textSecondary}
        value={query}
        onChangeText={onChangeQuery}
        numberOfLines={1}
        style={[
          styles.stopSearchInput,
          { color: theme.colors.textPrimary },
          largeText && styles.largeStopSearchInput,
          lightMode && lightStyles.textInputField,
          highContrast && !lightMode && styles.highContrastText,
          highContrast && lightMode && lightStyles.highContrastText,
        ]}
      />
      {query.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeQuery("")}
          hitSlop={8}
          style={styles.stopSearchClearButton}
        >
          <CircleX
            size={22}
            color={searchIconColor}
            strokeWidth={2.75}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </Pressable>
      ) : null}
    </View>
  );
}

function MapListToggle({
  value,
  onChange,
  lightMode,
  highContrast,
}: {
  value: "MAP" | "LIST";
  onChange: (value: "MAP" | "LIST") => void;
  lightMode: boolean;
  highContrast: boolean;
}) {
  return (
    <View
      style={[
        styles.mapListToggle,
        lightMode && lightStyles.mapListToggle,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
      ]}
    >
      {(["MAP", "LIST"] as const).map((mode) => {
        const active = value === mode;
        const Icon = mode === "MAP" ? MapIcon : List;
        return (
          <Pressable
            key={mode}
            accessibilityRole="button"
            accessibilityLabel={`${mode === "MAP" ? "Map" : "List"} view`}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(mode)}
            style={[
              styles.mapListToggleButton,
              active && styles.selectedMapListToggleButton,
              lightMode && lightStyles.mapListToggleButton,
              lightMode && active && lightStyles.selectedMapListToggleButton,
            ]}
          >
            <Icon
              size={20}
              color={controlIconColor({ active, lightMode, highContrast })}
              strokeWidth={2.75}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text
              style={[
                styles.mapListToggleText,
                active && styles.selectedMapListToggleText,
                lightMode && lightStyles.text,
                lightMode && active && lightStyles.selectedMapListToggleText,
                highContrast && !lightMode && styles.highContrastText,
                highContrast && lightMode && lightStyles.highContrastText,
                highContrast && active && styles.highContrastSelectedText,
              ]}
            >
              {mode === "MAP" ? "Map" : "List"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MapFirstStopScreen({
  stops,
  selectedStop,
  selectedLandmark,
  landmarks,
  currentLocation,
  mapViewport,
  layers,
  mapManuallyMoved,
  searchThisAreaVisible,
  nearbyHeading,
  directionsActive,
  followMode,
  rotationEnabled,
  hasSelectedService,
  headingDegrees,
  query,
  bottomSheetState,
  lastExpandedSheetState,
  nearbyLoading,
  nearbyError,
  largeText,
  lightMode,
  highContrast,
  onChangeQuery,
  onSelectStop,
  onSelectLandmark,
  onMoveMap,
  onRecenter,
  onLocateMap,
  onRefreshLocation,
  onSearchForStop,
  onShowRoute,
  onRotateMap,
  onResetMap,
  onViewFullRoute,
  onToggleFollow,
  onToggleLayer,
  onResetHeading,
  onDirections,
  onStopDirections,
  onClearSelectedStop,
  onExitMap,
  onConfirm,
  onHear,
  onHearDirections,
  onSetBottomSheetState,
}: {
  stops: NearbyBusStop[];
  selectedStop: NearbyBusStop | null;
  selectedLandmark: MapLandmark | null;
  landmarks: MapLandmark[];
  currentLocation: { latitude: number; longitude: number; accuracyMeters?: number } | null;
  mapViewport: MapViewport;
  layers: MapLayers;
  mapManuallyMoved: boolean;
  searchThisAreaVisible: boolean;
  nearbyHeading: string;
  directionsActive: boolean;
  followMode: boolean;
  rotationEnabled: boolean;
  hasSelectedService: boolean;
  headingDegrees: number;
  query: string;
  bottomSheetState: BottomSheetState;
  lastExpandedSheetState: UsefulBottomSheetState;
  nearbyLoading: boolean;
  nearbyError: string | null;
  largeText: boolean;
  lightMode: boolean;
  highContrast: boolean;
  onChangeQuery: (query: string) => void;
  onSelectStop: (stop: NearbyBusStop) => void;
  onSelectLandmark: (landmark: MapLandmark) => void;
  onMoveMap: () => void;
  onRecenter: () => void;
  onLocateMap: () => void;
  onRefreshLocation: () => void;
  onSearchForStop: () => void;
  onShowRoute: () => void;
  onRotateMap: () => void;
  onResetMap: () => void;
  onViewFullRoute: () => void;
  onToggleFollow: () => void;
  onToggleLayer: (layer: MapLayerKey) => void;
  onResetHeading: () => void;
  onDirections: () => void;
  onStopDirections: () => void;
  onClearSelectedStop: () => void;
  onExitMap: () => void;
  onConfirm: () => void;
  onHear: () => void;
  onHearDirections: () => void;
  onSetBottomSheetState: (state: BottomSheetState) => void;
}) {
  const [showMoreControls, setShowMoreControls] = useState(false);
  const theme = resolveVisualTheme(lightMode, highContrast);
  const sheetExpanded = bottomSheetState === "EXPANDED";
  const searchActive = query.trim().length > 0;
  const showAccessibilityNotice = layers.accessibility && !directionsActive && !showMoreControls;
  const overlayLayout = {
    paddingRight: rightToolbarWidth + mapOverlayMargin,
  };
  const backAccessibilityLabel = searchActive
    ? "Back to nearby bus stops"
    : directionsActive
      ? "Back to bus stop details"
      : selectedStop
        ? "Back to nearby bus stops"
        : bottomSheetState !== "COLLAPSED" && bottomSheetState !== "HIDDEN_PEEK"
          ? "Back to map"
          : "Back to previous view";
  const handleBack = () => {
    if (searchActive) {
      onChangeQuery("");
      onSetBottomSheetState(selectedStop ? "MEDIUM" : "COLLAPSED");
      return;
    }
    if (showMoreControls) {
      setShowMoreControls(false);
      return;
    }
    if (directionsActive) {
      onStopDirections();
      onSetBottomSheetState("MEDIUM");
      return;
    }
    if (selectedStop) {
      onClearSelectedStop();
      return;
    }
    if (bottomSheetState !== "COLLAPSED" && bottomSheetState !== "HIDDEN_PEEK") {
      onSetBottomSheetState("COLLAPSED");
      return;
    }
    onExitMap();
  };

  return (
    <View style={[styles.mapFirstScreen, { backgroundColor: theme.colors.map.background }]}>
      <NearbyStopsMap
        stops={stops}
        selectedStop={selectedStop}
        selectedLandmark={selectedLandmark}
        landmarks={landmarks}
        currentLocation={currentLocation}
        mapViewport={mapViewport}
        layers={layers}
        mapManuallyMoved={mapManuallyMoved}
        directionsActive={directionsActive}
        followMode={followMode}
        hasSelectedService={hasSelectedService}
        headingDegrees={headingDegrees}
        largeText={largeText}
        lightMode={lightMode}
        highContrast={highContrast}
        showInlineControls={false}
        onSelectStop={(stop) => {
          setShowMoreControls(false);
          onSelectStop(stop);
          onSetBottomSheetState("MEDIUM");
        }}
        onSelectLandmark={(landmark) => {
          setShowMoreControls(false);
          onSelectLandmark(landmark);
        }}
        onMoveMap={onMoveMap}
        onRecenter={onRecenter}
        onRefreshLocation={onRefreshLocation}
        onShowRoute={onShowRoute}
        onToggleFollow={onToggleFollow}
        onToggleLayer={onToggleLayer}
        onResetHeading={onResetHeading}
      />
      <View style={[styles.mapOverlayLayoutManager, overlayLayout]} pointerEvents="box-none">
        <View style={styles.mapTopControlRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backAccessibilityLabel}
            onPress={handleBack}
            hitSlop={4}
            style={[
              styles.mapBackButton,
              {
                backgroundColor: theme.colors.map.controlSurface,
                borderColor: theme.colors.map.controlBorder,
              },
              lightMode && lightStyles.mapBackButton,
              highContrast && !lightMode && styles.highContrastControl,
              highContrast && lightMode && lightStyles.highContrastControl,
            ]}
          >
            <ArrowLeft
              size={24}
              color={theme.colors.map.controlIcon}
              strokeWidth={2.9}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </Pressable>
          <View style={styles.mapSearchOverlay}>
            <StopSearch
              query={query}
              onChangeQuery={onChangeQuery}
              largeText={largeText}
              lightMode={lightMode}
              highContrast={highContrast}
            />
          </View>
        </View>
        {showAccessibilityNotice ? (
          <View
            accessibilityRole="text"
            accessibilityLabel="Accessibility information unavailable in this area"
            style={[
              styles.accessibilityMapNotice,
              {
                backgroundColor: theme.colors.map.overlaySurface,
                borderColor: theme.colors.map.overlayBorder,
              },
              highContrast && styles.highContrastControl,
            ]}
          >
            <Accessibility
              size={16}
              color={theme.colors.map.controlIcon}
              strokeWidth={2.8}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={[styles.accessibilityMapNoticeText, { color: theme.colors.textPrimary }]}>
              Accessibility information unavailable here
            </Text>
          </View>
        ) : null}
        {searchThisAreaVisible && !showMoreControls ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Find bus stops in the current map area"
            onPress={onRefreshLocation}
            style={[
              styles.mapFirstSearchAreaControl,
              {
                backgroundColor: theme.colors.map.controlSurface,
                borderColor: theme.colors.map.controlBorder,
              },
              lightMode && lightStyles.recenterControl,
              highContrast && !lightMode && styles.highContrastSelectedControl,
              highContrast && lightMode && lightStyles.highContrastSelectedControl,
            ]}
          >
            <Search
              size={17}
              color={controlIconColor({ active: true, lightMode, highContrast })}
              strokeWidth={3}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={[styles.mapControlText, lightMode && lightStyles.text, highContrast && styles.highContrastSelectedText]}>
              Search this area
            </Text>
          </Pressable>
        ) : null}
        {mapViewport.bearing !== 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reset map to north"
            onPress={onResetHeading}
            style={[
              styles.mapCompassControl,
              {
                backgroundColor: theme.colors.map.controlSurface,
                borderColor: theme.colors.map.controlBorder,
              },
              lightMode && lightStyles.mapSideControl,
              highContrast && !lightMode && styles.highContrastSelectedControl,
              highContrast && lightMode && lightStyles.highContrastSelectedControl,
            ]}
          >
            <Text style={[styles.mapCompassText, lightMode && lightStyles.text]}>N</Text>
            <Compass
              size={18}
              color={theme.colors.map.controlIcon}
              strokeWidth={3}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </Pressable>
        ) : null}
      </View>
      <MapSideControls
        selectedStop={selectedStop}
        sheetState={bottomSheetState}
        expanded={sheetExpanded}
        moreOpen={showMoreControls}
        lightMode={lightMode}
        highContrast={highContrast}
        onLocate={() => {
          onRecenter();
          onLocateMap();
        }}
        onNearby={() => {
          onRefreshLocation();
          onSetBottomSheetState("MEDIUM");
        }}
        onMap={() => {
          onSetBottomSheetState("COLLAPSED");
          onStopDirections();
          setShowMoreControls(false);
        }}
        onDirections={selectedStop ? onDirections : undefined}
        onMore={() => setShowMoreControls((current) => !current)}
      />
      {showMoreControls ? (
        <View
          pointerEvents="none"
          style={[
            styles.mapOptionsScrim,
            { backgroundColor: lightMode ? "rgba(14, 34, 39, 0.12)" : "rgba(0, 0, 0, 0.32)" },
            highContrast && !lightMode && styles.highContrastMapOptionsScrim,
          ]}
        />
      ) : null}
      {showMoreControls ? (
        <MapLayerQuickControls
          layers={layers}
          lightMode={lightMode}
          highContrast={highContrast}
          onToggleLayer={onToggleLayer}
          onResetHeading={onResetHeading}
          onRotateMap={onRotateMap}
          onResetMap={onResetMap}
          onShowRoute={onShowRoute}
          onViewFullRoute={onViewFullRoute}
          rotationEnabled={rotationEnabled}
          isNorthUp={mapViewport.bearing === 0}
          hasSelectedService={hasSelectedService}
          onClose={() => setShowMoreControls(false)}
          selectedStop={selectedStop}
        />
      ) : null}
      <MapBottomSheet
        stops={stops}
        selectedStop={selectedStop}
        selectedLandmark={selectedLandmark}
        query={query}
        nearbyHeading={nearbyHeading}
        landmarks={landmarks}
        nearbyLoading={nearbyLoading}
        nearbyError={nearbyError}
        state={showMoreControls ? "HIDDEN_PEEK" : bottomSheetState}
        lastExpandedState={lastExpandedSheetState}
        directionsActive={directionsActive}
        largeText={largeText}
        lightMode={lightMode}
        highContrast={highContrast}
        onSetState={onSetBottomSheetState}
        onSelectStop={onSelectStop}
        onSelectLandmark={onSelectLandmark}
        onRetryNearby={onRefreshLocation}
        onSearchForStop={onSearchForStop}
        onConfirm={onConfirm}
        onHear={onHear}
        onDirections={onDirections}
        onStopDirections={onStopDirections}
        onHearDirections={onHearDirections}
      />
    </View>
  );
}

function MapSideControls({
  selectedStop,
  sheetState,
  expanded,
  moreOpen,
  lightMode,
  highContrast,
  onLocate,
  onNearby,
  onMap,
  onDirections,
  onMore,
}: {
  selectedStop: NearbyBusStop | null;
  sheetState: BottomSheetState;
  expanded: boolean;
  moreOpen: boolean;
  lightMode: boolean;
  highContrast: boolean;
  onLocate: () => void;
  onNearby: () => void;
  onMap: () => void;
  onDirections?: () => void;
  onMore: () => void;
}) {
  const theme = resolveVisualTheme(lightMode, highContrast);
  const nearbyActive = sheetState !== "COLLAPSED" && sheetState !== "HIDDEN_PEEK";
  const controls = [
    { key: "locate", label: "Locate", accessibilityLabel: "Centre map on my current location", icon: LocateFixed, onPress: onLocate },
    ...(!expanded ? [{ key: "nearby", label: "Nearby", accessibilityLabel: "Show nearby bus stops in this area", icon: List, onPress: onNearby, active: nearbyActive }] : []),
    ...(selectedStop ? [{ key: "directions", label: "Route", accessibilityLabel: "Directions", icon: Route, onPress: onDirections }] : []),
    { key: "more", label: "More", icon: SlidersHorizontal, onPress: onMore, active: moreOpen },
  ];

  return (
    <View style={[styles.mapSideControls, expanded && styles.mapSideControlsExpanded]}>
      {controls.map(({ key, label, accessibilityLabel, icon: Icon, onPress, active }) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityState={{
            expanded: key === "more" ? moreOpen : undefined,
            selected:
              key === "nearby"
                ? nearbyActive
                : key === "map"
                  ? sheetState === "COLLAPSED" || sheetState === "HIDDEN_PEEK"
                  : undefined,
          }}
          onPress={onPress}
          style={[
            styles.mapSideControl,
            {
              backgroundColor: theme.colors.map.controlSurface,
              borderColor: theme.colors.map.controlBorder,
            },
            active && styles.activeMapSideControl,
            lightMode && lightStyles.mapSideControl,
            active && lightMode && lightStyles.activeMapSideControl,
            highContrast && !lightMode && styles.highContrastControl,
            highContrast && lightMode && lightStyles.highContrastControl,
            active && highContrast && !lightMode && styles.highContrastSelectedControl,
            active && highContrast && lightMode && lightStyles.highContrastSelectedControl,
            active && {
              backgroundColor: theme.colors.selectedSurface,
              borderColor: theme.colors.map.selectionAccent,
            },
          ]}
        >
          <Icon
            size={23}
            color={active ? theme.colors.iconSelected : theme.colors.map.controlIcon}
            strokeWidth={2.8}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text
            style={[
              styles.mapSideControlText,
              { color: theme.colors.textPrimary },
              lightMode && lightStyles.text,
              active && styles.selectedMapListToggleText,
              active && lightMode && lightStyles.selectedMapListToggleText,
              { color: active ? theme.colors.iconSelected : theme.colors.textPrimary },
            ]}
          >
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function MapLayerQuickControls({
  layers,
  selectedStop,
  lightMode,
  highContrast,
  onToggleLayer,
  onResetHeading,
  onRotateMap,
  onResetMap,
  onShowRoute,
  onViewFullRoute,
  rotationEnabled,
  isNorthUp,
  hasSelectedService,
  onClose,
}: {
  layers: MapLayers;
  selectedStop: NearbyBusStop | null;
  lightMode: boolean;
  highContrast: boolean;
  onToggleLayer: (layer: MapLayerKey) => void;
  onResetHeading: () => void;
  onRotateMap: () => void;
  onResetMap: () => void;
  onShowRoute: () => void;
  onViewFullRoute: () => void;
  rotationEnabled: boolean;
  isNorthUp: boolean;
  hasSelectedService: boolean;
  onClose: () => void;
}) {
  const theme = resolveVisualTheme(lightMode, highContrast);
  const announceUnavailable = (reason: string) => {
    AccessibilityInfo.announceForAccessibility(reason);
  };
  const layerRows: {
    layer: MapLayerKey;
    label: string;
    accessibilityLabel: string;
    icon: LucideIcon;
    disabled?: boolean;
    reason?: string;
  }[] = [
    { layer: "busStops", label: "Stops", accessibilityLabel: "Stops", icon: MapPin },
    {
      layer: "selectedService",
      label: "Bus",
      accessibilityLabel: "Bus vehicles",
      icon: BusFront,
      disabled: !hasSelectedService,
      reason: "Choose a bus service first",
    },
    { layer: "landmarks", label: "Places", accessibilityLabel: "Places", icon: MapPinned },
    {
      layer: "walkingRoute",
      label: "Route",
      accessibilityLabel: "Route",
      icon: Route,
      disabled: !selectedStop && !hasSelectedService,
      reason: "Select a stop or bus route first",
    },
    { layer: "accessibility", label: "Access", accessibilityLabel: "Accessibility information", icon: Accessibility },
  ];
  const actionRows = [
    {
      label: "View journey",
      accessibilityLabel: "View current journey",
      icon: Navigation,
      onPress: onShowRoute,
      disabled: !selectedStop && !hasSelectedService,
      reason: "Select a destination to view your journey",
    },
    {
      label: "View full route",
      accessibilityLabel: "View entire selected bus service route",
      icon: MapIcon,
      onPress: onViewFullRoute,
      disabled: !hasSelectedService,
      reason: "Choose a bus service first",
    },
  ];
  const orientationRows = [
    {
      label: "Rotate map",
      accessibilityLabel: `Rotate map, ${rotationEnabled ? "on" : "off"}`,
      icon: Compass,
      onPress: onRotateMap,
      state: rotationEnabled ? "ON" : "OFF",
    },
    {
      label: "North up",
      accessibilityLabel: "North up",
      icon: Compass,
      onPress: onResetHeading,
      disabled: isNorthUp,
      reason: "Map is already north up",
    },
    {
      label: "Reset map",
      accessibilityLabel: "Reset map view",
      icon: RefreshCw,
      onPress: onResetMap,
    },
  ];
  const runCameraAction = (action: () => void, disabled?: boolean, reason?: string) => {
    if (disabled && reason) {
      announceUnavailable(reason);
      return;
    }
    action();
    onClose();
  };
  return (
    <View
      style={[
        styles.mapMorePanel,
        {
          backgroundColor: theme.colors.map.overlaySurfaceElevated,
          borderColor: theme.colors.borderStrong,
        },
        lightMode && lightStyles.surface,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
      ]}
    >
      <ScrollView
        style={styles.mapMoreScroll}
        contentContainerStyle={styles.mapMoreContent}
        indicatorStyle={lightMode ? "black" : "white"}
      >
        <View style={styles.mapMoreHeader}>
          <Text style={[styles.mapMoreTitle, { color: theme.colors.textPrimary }]}>Map options</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close map options"
            onPress={onClose}
            hitSlop={8}
            style={styles.mapMoreCloseButton}
          >
            <CircleX size={20} color={theme.colors.map.controlIcon} strokeWidth={2.8} />
          </Pressable>
        </View>
        <Text style={[styles.mapMoreSectionTitle, { color: theme.colors.textSecondary }]}>MAP LAYERS</Text>
        {layerRows.map(({ layer, label, accessibilityLabel, icon: Icon, disabled, reason }) => {
          const active = layers[layer];
          const visibleActive = active && !disabled;
          return (
            <Pressable
              key={layer}
              accessibilityRole="switch"
              accessibilityLabel={`${accessibilityLabel}, map layer, ${disabled ? "disabled" : visibleActive ? "on" : "off"}`}
              accessibilityState={{ checked: visibleActive, disabled }}
              onPress={() => (disabled && reason ? announceUnavailable(reason) : onToggleLayer(layer))}
              style={[
                styles.mapMoreRow,
                {
                  borderColor: theme.colors.borderDefault,
                  backgroundColor: disabled
                    ? theme.colors.actionSecondary
                    : visibleActive
                      ? theme.colors.selectedSurface
                      : "transparent",
                },
                disabled && styles.disabledMapMoreControl,
              ]}
            >
              <Icon size={18} color={controlIconColor({ active: visibleActive, disabled, lightMode, highContrast })} strokeWidth={2.8} />
              <View style={styles.mapMoreLabelGroup}>
                <Text style={[styles.mapMoreControlText, { color: theme.colors.textPrimary }]}>{label}</Text>
                {disabled && reason ? (
                  <Text style={[styles.mapMoreReasonText, { color: theme.colors.textSecondary }]}>{reason}</Text>
                ) : null}
              </View>
              <View
                style={[
                  styles.mapMoreSwitch,
                  disabled && styles.mapMoreSwitchDisabled,
                  {
                    backgroundColor: visibleActive ? theme.colors.map.selectionAccent : theme.colors.map.overlaySurface,
                    borderColor: disabled
                      ? theme.colors.borderDefault
                      : visibleActive
                        ? theme.colors.map.selectionAccent
                        : theme.colors.borderStrong,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.mapMoreSwitchText,
                    { color: visibleActive ? theme.colors.actionPrimaryText : disabled ? theme.colors.textDisabled : theme.colors.textSecondary },
                    visibleActive && highContrast && styles.highContrastSelectedText,
                  ]}
                >
                  {visibleActive ? "ON" : "OFF"}
                </Text>
              </View>
            </Pressable>
          );
        })}
        <View style={[styles.mapMoreDivider, { backgroundColor: theme.colors.borderDefault }]} />
        <Text style={[styles.mapMoreSectionTitle, { color: theme.colors.textSecondary }]}>JOURNEY</Text>
        {actionRows.map(({ label, accessibilityLabel, icon: Icon, onPress, disabled, reason }) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ disabled }}
            onPress={() => runCameraAction(onPress, disabled, reason)}
            style={[
              styles.mapMoreRow,
              { borderColor: theme.colors.borderDefault },
              disabled && styles.disabledMapMoreControl,
            ]}
          >
            <Icon size={17} color={controlIconColor({ disabled, lightMode, highContrast })} strokeWidth={2.8} />
            <View style={styles.mapMoreLabelGroup}>
              <Text style={[styles.mapMoreControlText, { color: theme.colors.textPrimary }]}>{label}</Text>
              {disabled && reason ? (
                <Text style={[styles.mapMoreReasonText, { color: theme.colors.textSecondary }]}>{reason}</Text>
              ) : null}
            </View>
            <Text style={[styles.mapMoreStateText, { color: theme.colors.textSecondary }]}>›</Text>
          </Pressable>
        ))}
        <View style={[styles.mapMoreDivider, { backgroundColor: theme.colors.borderDefault }]} />
        <Text style={[styles.mapMoreSectionTitle, { color: theme.colors.textSecondary }]}>MAP VIEW</Text>
        {orientationRows.map(({ label, accessibilityLabel, icon: Icon, onPress, disabled, reason, state }) => (
          <Pressable
            key={label}
            accessibilityRole={label === "Rotate map" ? "switch" : "button"}
            accessibilityLabel={accessibilityLabel}
            accessibilityState={label === "Rotate map" ? { checked: rotationEnabled } : { disabled }}
            onPress={() => {
              if (label === "Rotate map") {
                onPress();
                return;
              }
              runCameraAction(onPress, disabled, reason);
            }}
            style={[
              styles.mapMoreRow,
              { borderColor: theme.colors.borderDefault },
              state === "ON" && {
                backgroundColor: theme.colors.selectedSurface,
              },
              disabled && styles.disabledMapMoreControl,
            ]}
          >
            <Icon size={17} color={controlIconColor({ active: state === "ON", disabled, lightMode, highContrast })} strokeWidth={2.8} />
            <View style={styles.mapMoreLabelGroup}>
              <Text style={[styles.mapMoreControlText, { color: theme.colors.textPrimary }]}>{label}</Text>
              {disabled && reason ? (
                <Text style={[styles.mapMoreReasonText, { color: theme.colors.textSecondary }]}>{reason}</Text>
              ) : null}
            </View>
            {state ? (
              <View
                style={[
                  styles.mapMoreSwitch,
                  {
                    backgroundColor: state === "ON" ? theme.colors.map.selectionAccent : theme.colors.map.overlaySurface,
                    borderColor: state === "ON" ? theme.colors.map.selectionAccent : theme.colors.borderStrong,
                  },
                ]}
              >
                <Text style={[styles.mapMoreSwitchText, { color: state === "ON" ? theme.colors.actionPrimaryText : theme.colors.textSecondary }]}>
                  {state}
                </Text>
              </View>
            ) : (
              <Text style={[styles.mapMoreStateText, { color: theme.colors.textSecondary }]}>›</Text>
            )}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function MapBottomSheet({
  stops,
  selectedStop,
  selectedLandmark,
  query,
  nearbyHeading,
  landmarks,
  nearbyLoading,
  nearbyError,
  state,
  lastExpandedState,
  directionsActive,
  largeText,
  lightMode,
  highContrast,
  onSetState,
  onSelectStop,
  onSelectLandmark,
  onRetryNearby,
  onSearchForStop,
  onConfirm,
  onHear,
  onDirections,
  onStopDirections,
  onHearDirections,
}: {
  stops: NearbyBusStop[];
  selectedStop: NearbyBusStop | null;
  selectedLandmark: MapLandmark | null;
  query: string;
  nearbyHeading: string;
  landmarks: MapLandmark[];
  nearbyLoading: boolean;
  nearbyError: string | null;
  state: BottomSheetState;
  lastExpandedState: UsefulBottomSheetState;
  directionsActive: boolean;
  largeText: boolean;
  lightMode: boolean;
  highContrast: boolean;
  onSetState: (state: BottomSheetState) => void;
  onSelectStop: (stop: NearbyBusStop) => void;
  onSelectLandmark: (landmark: MapLandmark) => void;
  onRetryNearby: () => void;
  onSearchForStop: () => void;
  onConfirm: () => void;
  onHear: () => void;
  onDirections: () => void;
  onStopDirections: () => void;
  onHearDirections: () => void;
}) {
  const [previewService, setPreviewService] = useState<string | null>(null);
  const theme = resolveVisualTheme(lightMode, highContrast);
  const sheetStyle =
    state === "HIDDEN_PEEK"
      ? styles.mapBottomSheetHiddenPeek
      : state === "EXPANDED"
      ? styles.mapBottomSheetExpanded
      : state === "MEDIUM"
        ? styles.mapBottomSheetMedium
        : styles.mapBottomSheetCollapsed;
  const headerActionState: BottomSheetState = state === "HIDDEN_PEEK" ? lastExpandedState : "HIDDEN_PEEK";
  const HeaderIcon = state === "HIDDEN_PEEK" ? APP_ICONS.expand : APP_ICONS.collapse;
  const headerAccessibilityLabel =
    state === "HIDDEN_PEEK"
      ? `Expand stop panel to ${lastExpandedState.toLowerCase()} height`
      : "Minimize stop panel";
  const walkingMinutes = selectedStop ? Math.max(1, Math.round(selectedStop.distanceMeters / 70)) : 0;
  const services = selectedStop ? busServicesForStop(selectedStop) : [];
  useEffect(() => {
    setPreviewService(null);
  }, [selectedStop?.busStopCode]);
  const showSearchResults = query.trim().length > 0;
  const nearbyState = resolveNearbyStopsState({
    loading: nearbyLoading,
    error: nearbyError,
    stopCount: stops.length,
    hasQuery: showSearchResults,
  });
  const shortNearbyState =
    !showSearchResults &&
    !selectedStop &&
    !directionsActive &&
    nearbyState !== "success";
  const effectiveSheetStyle =
    state === "HIDDEN_PEEK" ? sheetStyle : shortNearbyState ? styles.mapBottomSheetContentFit : sheetStyle;
  const collapsedNearbyHeading = nearbyHeading === "Nearby bus stops" ? "Nearby stops" : nearbyHeading;

  return (
    <View
      style={[
        styles.mapBottomSheet,
        {
          backgroundColor: theme.colors.map.sheetSurface,
          borderColor: theme.colors.map.sheetBorder,
        },
        effectiveSheetStyle,
        lightMode && lightStyles.mapBottomSheet,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
      ]}
      accessible
      accessibilityLabel={selectedStop ? `Selected stop ${selectedStop.description}` : "Nearby bus stops"}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={headerAccessibilityLabel}
        onPress={() => onSetState(headerActionState)}
        style={styles.mapBottomSheetHeader}
      >
        <View style={styles.sheetHeaderRow}>
          {state === "HIDDEN_PEEK" ? (
            <Text style={[styles.sheetPeekLabel, lightMode && lightStyles.text]}>
              {collapsedNearbyHeading}
            </Text>
          ) : null}
          <HeaderIcon
            size={iconSizes.small}
            color={controlIconColor({ active: true, lightMode, highContrast })}
            strokeWidth={highContrast ? 3.2 : 2.8}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </View>
      </Pressable>

      {state === "HIDDEN_PEEK" ? null : showSearchResults && !selectedStop ? (
        <ScrollView style={styles.mapBottomSheetScroll} contentContainerStyle={styles.mapBottomSheetContent}>
          <Text style={[styles.busTitle, largeText && styles.largeBody, lightMode && lightStyles.text]}>
            Search results
          </Text>
          <LandmarkSearchResults
            query={query}
            stops={stops}
            landmarks={landmarks}
            lightMode={lightMode}
            highContrast={highContrast}
            onSelectStop={(stop) => {
              onSelectStop(stop);
              onSetState("MEDIUM");
            }}
            onSelectLandmark={(landmark) => {
              onSelectLandmark(landmark);
              onSetState("MEDIUM");
            }}
          />
        </ScrollView>
      ) : directionsActive && selectedStop ? (
        <ScrollView style={styles.mapBottomSheetScroll} contentContainerStyle={styles.mapBottomSheetContent}>
          <Text style={[styles.statusLabel, lightMode && lightStyles.mutedText]}>Walking to</Text>
          <Text style={[styles.busTitle, largeText && styles.largeBody, lightMode && lightStyles.text]}>
            {selectedStop.description}
          </Text>
          <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>
            {selectedStop.distanceMeters} m · About {walkingMinutes} min walk
          </Text>
          <Text style={[styles.bodyText, largeText && styles.largeBody, lightMode && lightStyles.bodyText]}>
            {firstMoveInstruction(selectedStop, selectedLandmark)}
          </Text>
          <Text style={[styles.infoPill, styles.accessibleChip, lightMode && lightStyles.accessibleChip]}>
            Accessibility information unavailable
          </Text>
          <SecondaryButton label="Hear directions" icon={Volume2} onPress={onHearDirections} lightMode={lightMode} highContrast={highContrast} />
          <SecondaryButton label="Stop directions" icon={CircleX} onPress={onStopDirections} lightMode={lightMode} highContrast={highContrast} />
        </ScrollView>
      ) : selectedStop ? (
        <ScrollView style={styles.mapBottomSheetScroll} contentContainerStyle={styles.mapBottomSheetContent}>
          <View style={styles.iconTitleRow}>
            <MapPin size={26} color={controlIconColor({ active: true, lightMode, highContrast })} strokeWidth={2.8} />
            <View style={styles.landmarkSearchTextGroup}>
              {selectedStop.distanceMeters <= 80 ? (
                <Text style={[styles.statusLabel, lightMode && lightStyles.mutedText]}>Nearest stop</Text>
              ) : null}
              <Text style={[styles.busTitle, largeText && styles.largeBody, lightMode && lightStyles.text]}>
                {selectedStop.description}
              </Text>
              <Text style={[styles.bodyText, largeText && styles.largeBody, lightMode && lightStyles.bodyText]}>
                Bus Stop {selectedStop.busStopCode} · About {selectedStop.distanceMeters} m away
              </Text>
            </View>
          </View>
          <View style={styles.stopSheetSection}>
            <Text style={[styles.statusLabel, lightMode && lightStyles.mutedText]}>Services</Text>
            {services.length > 0 ? (
              <View style={styles.infoRow}>
                {services.slice(0, 4).map((service) => {
                  const selected = previewService === service;
                  return (
                    <Pressable
                      key={service}
                      accessibilityRole="button"
                      accessibilityLabel={`Preview Service ${service} at ${selectedStop.description}`}
                      accessibilityState={{ selected }}
                      onPress={() => setPreviewService(selected ? null : service)}
                      style={[
                        styles.stopServiceChip,
                        { borderColor: selected ? theme.colors.map.selectionAccent : theme.colors.borderDefault },
                        selected && styles.selectedStopServiceChip,
                        highContrast && styles.highContrastControl,
                      ]}
                    >
                      <BusFront
                        size={15}
                        color={controlIconColor({ active: selected, lightMode, highContrast })}
                        strokeWidth={2.8}
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                      />
                      <Text style={[styles.stopServiceChipText, { color: selected ? theme.colors.actionPrimary : theme.colors.textPrimary }]}>
                        {service}
                      </Text>
                    </Pressable>
                  );
                })}
                {services.length > 4 ? (
                  <Text style={[styles.infoPill, lightMode && lightStyles.infoPill]}>+ {services.length - 4} more</Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.serviceUnavailableBlock}>
                <Text style={[styles.bodyText, largeText && styles.largeBody, lightMode && lightStyles.bodyText]}>
                  Bus services couldn't be loaded.
                </Text>
                <SecondaryButton label="Try again" icon={RefreshCw} onPress={onRetryNearby} lightMode={lightMode} highContrast={highContrast} />
              </View>
            )}
          </View>
          {previewService ? (
            <View
              style={[
                styles.servicePreviewPanel,
                { borderColor: theme.colors.borderDefault, backgroundColor: theme.colors.map.overlaySurfaceElevated },
              ]}
              accessible
              accessibilityLabel={`Service ${previewService}. Live arrival unavailable before stop confirmation.`}
            >
              <Text style={[styles.statusLabel, lightMode && lightStyles.mutedText]}>Service {previewService}</Text>
              <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>Live arrival unavailable</Text>
              <Text style={[styles.bodyText, largeText && styles.largeBody, lightMode && lightStyles.bodyText]}>
                Choose this stop to load live arrivals for Service {previewService}.
              </Text>
            </View>
          ) : null}
          {state === "EXPANDED" ? (
            <>
              <Text style={[styles.statusLabel, lightMode && lightStyles.mutedText]}>Accessibility</Text>
              <View style={styles.infoRow}>
                <Text style={[styles.infoPill, lightMode && lightStyles.infoPill]}>
                  Stop accessibility information unavailable
                </Text>
              </View>
              {selectedLandmark ? (
                <>
                  <Text style={[styles.statusLabel, lightMode && lightStyles.mutedText]}>Nearby</Text>
                  <Text style={[styles.bodyText, largeText && styles.largeBody, lightMode && lightStyles.bodyText]}>
                    {selectedLandmark.name}
                  </Text>
                </>
              ) : null}
              <SecondaryButton label="Hear stop information" icon={Volume2} onPress={onHear} lightMode={lightMode} highContrast={highContrast} />
            </>
          ) : null}
          <SecondaryButton label="Directions" icon={Route} onPress={onDirections} lightMode={lightMode} highContrast={highContrast} />
          <PrimaryButton
            label={previewService ? `Choose stop and Service ${previewService}` : "Choose this stop"}
            icon={CircleCheck}
            onPress={onConfirm}
            lightMode={lightMode}
            highContrast={highContrast}
          />
        </ScrollView>
      ) : shortNearbyState ? (
        <ScrollView
          style={styles.mapBottomSheetScroll}
          contentContainerStyle={[styles.mapBottomSheetContent, styles.mapBottomSheetCompactContent]}
        >
          <Text style={[styles.mapBottomSheetTitle, largeText && styles.largeMapBottomSheetTitle, lightMode && lightStyles.text]}>
            {nearbyHeading}
          </Text>
          {nearbyState === "loading" ? (
            <NearbySheetState
              title="Finding stops near you..."
              message="This should only take a moment."
              icon={RefreshCw}
              lightMode={lightMode}
              highContrast={highContrast}
            />
          ) : nearbyState === "network-error" || nearbyState === "service-error" ? (
            <NearbySheetState
              title="Couldn't load nearby stops"
              message="Check your connection and try again."
              icon={CircleQuestionMark}
              primaryActionLabel="Try again"
              onPrimaryAction={onRetryNearby}
              secondaryActionLabel="Search stops"
              onSecondaryAction={onSearchForStop}
              tone="error"
              lightMode={lightMode}
              highContrast={highContrast}
            />
          ) : nearbyState === "location-uncertain" || nearbyState === "location-denied" ? (
            <NearbySheetState
              title={nearbyState === "location-denied" ? "Location is off" : "Location may be approximate"}
              message={
                nearbyState === "location-denied"
                  ? "You can still search for a bus stop or place."
                  : "We couldn't confidently find a nearby bus stop."
              }
              icon={LocateFixed}
              primaryActionLabel="Try location again"
              onPrimaryAction={onRetryNearby}
              secondaryActionLabel="Search stops"
              onSecondaryAction={onSearchForStop}
              tone="info"
              lightMode={lightMode}
              highContrast={highContrast}
            />
          ) : (
            <NearbySheetState
              title={showSearchResults ? "No matching stops found" : "No stops found"}
              message={showSearchResults ? "Try another stop, road or place." : "Move the map or search another place."}
              icon={Search}
              primaryActionLabel="Search stops"
              onPrimaryAction={onSearchForStop}
              lightMode={lightMode}
              highContrast={highContrast}
            />
          )}
        </ScrollView>
      ) : (
        <ScrollView style={styles.mapBottomSheetScroll} contentContainerStyle={styles.mapBottomSheetContent}>
          <Text style={[styles.busTitle, largeText && styles.largeBody, lightMode && lightStyles.text]}>
            {nearbyHeading}
          </Text>
          {state === "COLLAPSED" ? (
            <Text style={[styles.bodyText, largeText && styles.largeBody, lightMode && lightStyles.bodyText]}>
              {stops.length} nearby
            </Text>
          ) : stops.length > 0 ? (
            <NearbyStopsList
              stops={state === "MEDIUM" ? stops.slice(0, 3) : stops}
              selectedStop={selectedStop}
              lightMode={lightMode}
              highContrast={highContrast}
              onSelectStop={(stop) => {
                onSelectStop(stop);
                onSetState("MEDIUM");
              }}
            />
          ) : (
            <Text style={[styles.bodyText, largeText && styles.largeBody, lightMode && lightStyles.bodyText]}>
              No nearby stops match your search. Try a stop code, road or landmark.
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const LandmarkSearchResults = memo(function LandmarkSearchResults({
  query,
  stops,
  landmarks,
  lightMode,
  highContrast,
  onSelectStop,
  onSelectLandmark,
}: {
  query: string;
  stops: NearbyBusStop[];
  landmarks: MapLandmark[];
  lightMode: boolean;
  highContrast: boolean;
  onSelectStop: (stop: NearbyBusStop) => void;
  onSelectLandmark: (landmark: MapLandmark) => void;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const matchingStops = stops.slice(0, 3);
  const matchingServices = Array.from(
    new Set(
      stops
        .flatMap((stop) => busServicesForStop(stop))
        .filter((service) => service.toLowerCase().includes(normalizedQuery))
    )
  ).slice(0, 4);
  const matchingLandmarks = landmarks
    .filter((landmark) => landmark.name.toLowerCase().includes(normalizedQuery))
    .slice(0, 2);
  const prioritizeServices = /^\d{1,3}[a-z]?$/i.test(query.trim()) && matchingServices.length > 0;

  if (matchingStops.length === 0 && matchingServices.length === 0 && matchingLandmarks.length === 0) {
    return (
      <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
        No results yet. Try a stop name, stop code, service number or place.
      </Text>
    );
  }

  return (
    <View style={styles.landmarkSearchResults}>
      {prioritizeServices && matchingServices.length > 0 ? (
        <>
          <Text style={[styles.searchGroupLabel, lightMode && lightStyles.mutedText]}>Bus Services</Text>
          {matchingServices.map((service) => {
            const stop = stops.find((candidate) => busServicesForStop(candidate).includes(service));
            if (!stop) {
              return null;
            }
            return (
              <Pressable
                key={service}
                accessibilityRole="button"
                accessibilityLabel={`Service ${service}. First matching stop ${stop.description}. Show on map.`}
                onPress={() => onSelectStop(stop)}
                style={[
                  styles.landmarkSearchResult,
                  lightMode && lightStyles.landmarkSearchResult,
                  highContrast && !lightMode && styles.highContrastControl,
                  highContrast && lightMode && lightStyles.highContrastControl,
                ]}
              >
                <Text style={[styles.landmarkIconText, lightMode && lightStyles.landmarkText]}>{service}</Text>
                <View style={styles.landmarkSearchTextGroup}>
                  <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>Service {service}</Text>
                  <Text style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}>
                    Serves {stop.description}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </>
      ) : null}
      {matchingStops.length > 0 ? (
        <Text style={[styles.searchGroupLabel, lightMode && lightStyles.mutedText]}>Bus Stops</Text>
      ) : null}
      {matchingStops.map((stop) => (
        <Pressable
          key={stop.busStopCode}
          accessibilityRole="button"
          accessibilityLabel={`${stop.description}, bus stop ${stop.busStopCode}, ${stop.distanceMeters} metres away. Show on map.`}
          onPress={() => onSelectStop(stop)}
          style={[
            styles.landmarkSearchResult,
            lightMode && lightStyles.landmarkSearchResult,
            highContrast && !lightMode && styles.highContrastControl,
            highContrast && lightMode && lightStyles.highContrastControl,
          ]}
        >
          <Text style={[styles.landmarkIconText, lightMode && lightStyles.landmarkText]}>BUS</Text>
          <View style={styles.landmarkSearchTextGroup}>
            <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>{stop.description}</Text>
            <Text style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}>
              Stop {stop.busStopCode} - {stop.distanceMeters} m - {busServicesForStop(stop).join(", ")}
            </Text>
          </View>
        </Pressable>
      ))}
      {!prioritizeServices && matchingServices.length > 0 ? (
        <Text style={[styles.searchGroupLabel, lightMode && lightStyles.mutedText]}>Bus Services</Text>
      ) : null}
      {!prioritizeServices && matchingServices.map((service) => {
        const stop = stops.find((candidate) => busServicesForStop(candidate).includes(service));
        if (!stop) {
          return null;
        }
        return (
          <Pressable
            key={service}
            accessibilityRole="button"
            accessibilityLabel={`Service ${service}. First matching stop ${stop.description}. Show on map.`}
            onPress={() => onSelectStop(stop)}
            style={[
              styles.landmarkSearchResult,
              lightMode && lightStyles.landmarkSearchResult,
              highContrast && !lightMode && styles.highContrastControl,
              highContrast && lightMode && lightStyles.highContrastControl,
            ]}
          >
            <Text style={[styles.landmarkIconText, lightMode && lightStyles.landmarkText]}>{service}</Text>
            <View style={styles.landmarkSearchTextGroup}>
              <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>Service {service}</Text>
              <Text style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}>
                Serves {stop.description}
              </Text>
            </View>
          </Pressable>
        );
      })}
      {matchingLandmarks.length > 0 ? (
        <Text style={[styles.searchGroupLabel, lightMode && lightStyles.mutedText]}>Places</Text>
      ) : null}
      {matchingLandmarks.map((landmark) => (
        <Pressable
          key={landmark.id}
          accessibilityRole="button"
          accessibilityLabel={`${landmark.name}. Landmark. Show nearby bus stops.`}
          onPress={() => onSelectLandmark(landmark)}
          style={[
            styles.landmarkSearchResult,
            lightMode && lightStyles.landmarkSearchResult,
            highContrast && !lightMode && styles.highContrastControl,
            highContrast && lightMode && lightStyles.highContrastControl,
          ]}
        >
          <Text style={[styles.landmarkIconText, lightMode && lightStyles.landmarkText]}>
            {landmarkIcon(landmark)}
          </Text>
          <View style={styles.landmarkSearchTextGroup}>
            <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>{landmark.name}</Text>
            <Text style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}>
              Nearby bus stops shown on map
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
});

type NearbyStopsUiState =
  | "loading"
  | "success"
  | "empty"
  | "location-uncertain"
  | "location-denied"
  | "network-error"
  | "service-error";

function resolveNearbyStopsState({
  loading,
  error,
  stopCount,
}: {
  loading: boolean;
  error: string | null;
  stopCount: number;
  hasQuery: boolean;
}): NearbyStopsUiState {
  if (loading) {
    return "loading";
  }

  if (error) {
    const normalized = error.toLowerCase();
    if (normalized.includes("permission") || normalized.includes("can't use your current location")) {
      return "location-denied";
    }
    if (normalized.includes("confidently") || normalized.includes("approximate")) {
      return "location-uncertain";
    }
    if (normalized.includes("network") || normalized.includes("connection") || normalized.includes("fetch")) {
      return "network-error";
    }
    return "service-error";
  }

  return stopCount > 0 ? "success" : "empty";
}

function NearbySheetState({
  title,
  message,
  icon: Icon,
  primaryActionLabel,
  secondaryActionLabel,
  onPrimaryAction,
  onSecondaryAction,
  tone = "neutral",
  lightMode,
  highContrast,
}: {
  title: string;
  message: string;
  icon: LucideIcon;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  tone?: "neutral" | "info" | "error";
  lightMode: boolean;
  highContrast: boolean;
}) {
  const theme = resolveVisualTheme(lightMode, highContrast);
  const iconColor =
    tone === "error"
      ? theme.colors.statusError
      : tone === "info"
        ? theme.colors.statusInformation
        : controlIconColor({ lightMode, highContrast });
  const PrimaryActionIcon =
    primaryActionLabel?.toLowerCase().includes("search")
      ? Search
      : primaryActionLabel?.toLowerCase().includes("location")
        ? LocateFixed
        : RefreshCw;

  return (
    <View
      style={[
        styles.nearbyStatePanel,
        tone === "info" && styles.nearbyInfoStatePanel,
        tone === "error" && styles.nearbyErrorStatePanel,
        lightMode && lightStyles.nearbyStatePanel,
      ]}
      accessibilityRole={tone === "error" ? "alert" : undefined}
      accessible
      accessibilityLabel={`${title}. ${message}`}
    >
      <View style={styles.nearbyStateTitleRow}>
        <Icon size={24} color={iconColor} strokeWidth={2.75} />
        <View style={styles.landmarkSearchTextGroup}>
          <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>{title}</Text>
          <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>{message}</Text>
        </View>
      </View>
      {primaryActionLabel && onPrimaryAction ? (
        <SecondaryButton
          label={primaryActionLabel}
          icon={PrimaryActionIcon}
          onPress={onPrimaryAction}
          lightMode={lightMode}
          highContrast={highContrast}
        />
      ) : null}
      {secondaryActionLabel && onSecondaryAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={secondaryActionLabel}
          onPress={onSecondaryAction}
          style={styles.nearbyStateTextAction}
        >
          <Search
            size={20}
            color={controlIconColor({ lightMode, highContrast })}
            strokeWidth={2.75}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={[styles.secondaryButtonText, lightMode && lightStyles.secondaryButtonText]}>
            {secondaryActionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const NearbyStopsMap = memo(function NearbyStopsMap({
  stops,
  selectedStop,
  selectedLandmark,
  landmarks,
  currentLocation,
  mapViewport,
  layers,
  mapManuallyMoved,
  directionsActive,
  followMode,
  hasSelectedService,
  headingDegrees,
  largeText,
  lightMode,
  highContrast,
  showInlineControls = true,
  onSelectStop,
  onSelectLandmark,
  onMoveMap,
  onRecenter,
  onRefreshLocation,
  onShowRoute,
  onToggleFollow,
  onToggleLayer,
  onResetHeading,
}: {
  stops: NearbyBusStop[];
  selectedStop: NearbyBusStop | null;
  selectedLandmark: MapLandmark | null;
  landmarks: MapLandmark[];
  currentLocation: { latitude: number; longitude: number; accuracyMeters?: number } | null;
  mapViewport: MapViewport;
  layers: MapLayers;
  mapManuallyMoved: boolean;
  directionsActive: boolean;
  followMode: boolean;
  hasSelectedService: boolean;
  headingDegrees: number;
  largeText: boolean;
  lightMode: boolean;
  highContrast: boolean;
  showInlineControls?: boolean;
  onSelectStop: (stop: NearbyBusStop) => void;
  onSelectLandmark: (landmark: MapLandmark) => void;
  onMoveMap: () => void;
  onRecenter: () => void;
  onRefreshLocation: () => void;
  onShowRoute: () => void;
  onToggleFollow: () => void;
  onToggleLayer: (layer: MapLayerKey) => void;
  onResetHeading: () => void;
}) {
  const theme = resolveVisualTheme(lightMode, highContrast);
  const [expandedCluster, setExpandedCluster] = useState(false);
  const mapTileCells = useMemo(
    () => Array.from({ length: 12 }).map((_, index) => <View key={index} style={styles.mapTileCell} />),
    []
  );
  const visibleStops = useMemo(() => stops.slice(0, maxRenderedMapStops), [stops]);
  const mapProjection = useMemo(() => {
    const coordinates: MapCoordinate[] = [
      mapViewport.center,
      ...(currentLocation ? [currentLocation] : []),
      ...visibleStops,
      ...landmarks,
    ];
    if (selectedStop) {
      coordinates.push(selectedStop);
    }
    if (selectedLandmark) {
      coordinates.push(selectedLandmark);
    }
    return createMapProjection(coordinates, mapViewport.center);
  }, [
    currentLocation?.latitude,
    currentLocation?.longitude,
    mapViewport.center.latitude,
    mapViewport.center.longitude,
    landmarks,
    selectedLandmark,
    selectedStop,
    visibleStops,
  ]);
  const positionedStops = useMemo(() => {
    return visibleStops.map((stop, index) => {
      const fallbackAngle = (index / Math.max(stops.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const projected = mapProjection.project(stop);
      const hasDistinctCoordinate = stop.latitude !== currentLocation?.latitude || stop.longitude !== currentLocation?.longitude;
      return {
        stop,
        left: hasDistinctCoordinate ? projected.left : (`${50 + Math.cos(fallbackAngle) * 18}%` as const),
        top: hasDistinctCoordinate ? projected.top : (`${50 + Math.sin(fallbackAngle) * 18}%` as const),
        x: hasDistinctCoordinate ? projected.x : 50 + Math.cos(fallbackAngle) * 18,
        y: hasDistinctCoordinate ? projected.y : 50 + Math.sin(fallbackAngle) * 18,
      };
    });
  }, [currentLocation?.latitude, currentLocation?.longitude, mapProjection, stops.length, visibleStops]);
  const positionedLandmarks = useMemo(() => {
    return landmarks.slice(0, 6).map((landmark) => {
      const projected = mapProjection.project(landmark);
      return {
        landmark,
        left: projected.left,
        top: projected.top,
      };
    });
  }, [landmarks, mapProjection]);
  const selectedPosition = useMemo(
    () => positionedStops.find(({ stop }) => stop.busStopCode === selectedStop?.busStopCode),
    [positionedStops, selectedStop?.busStopCode]
  );
  const currentPosition = useMemo(
    () => mapProjection.project(currentLocation ?? manualStopLookup),
    [currentLocation?.latitude, currentLocation?.longitude, mapProjection]
  );
  const accuracyDiameter = Math.max(
    48,
    Math.min(150, Math.round(((currentLocation?.accuracyMeters ?? 35) / mapProjection.scaleMeters) * 72))
  );
  const closeClusterStops = useMemo(
    () =>
      positionedStops.filter(
        ({ stop }, index) =>
          index > 0 &&
          stop.distanceMeters < 80 &&
          stop.busStopCode !== selectedStop?.busStopCode
      ),
    [positionedStops, selectedStop?.busStopCode]
  );
  const shouldClusterCloseStops = closeClusterStops.length > 1 && !expandedCluster;
  const clusteredStopCodes = useMemo(
    () =>
      new Set(
        shouldClusterCloseStops ? closeClusterStops.map(({ stop }) => stop.busStopCode) : []
      ),
    [closeClusterStops, shouldClusterCloseStops]
  );
  const clusterPosition = closeClusterStops[0] ?? null;

  return (
    <View
      style={[
        styles.stopMapPanel,
        !showInlineControls && styles.mapFirstPanel,
        {
          backgroundColor: theme.colors.map.background,
          borderColor: theme.colors.map.overlayBorder,
        },
        lightMode && lightStyles.stopMapPanel,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
      ]}
      accessible
      accessibilityLabel={`Nearby bus stop map. ${stops.length} stops shown.`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Move map manually"
        accessibilityHint="Pan or zoom the nearby bus stop map."
        onPress={onMoveMap}
        style={[
          styles.mapCanvas,
          {
            backgroundColor: theme.colors.map.background,
            borderColor: theme.colors.map.overlayBorder,
          },
          !showInlineControls && styles.mapFirstCanvas,
          mapManuallyMoved && styles.mapCanvasMoved,
        ]}
      >
        <View style={styles.mapTileGrid}>
          {mapTileCells.map((cell) =>
            React.cloneElement(cell, {
              style: [styles.mapTileCell, { borderColor: theme.colors.map.grid }],
            })
          )}
        </View>
        <View style={[styles.mapLandPatch, { backgroundColor: theme.colors.map.land }]} />
        <View style={[styles.mapBuildingPatch, { backgroundColor: theme.colors.map.building }]} />
        <View style={[styles.mapParkPatch, { backgroundColor: theme.colors.map.park }]} />
        <View style={[styles.mapWaterPatch, { backgroundColor: theme.colors.map.water }]} />
        <View
          style={[
            styles.mapRoadMajor,
            { backgroundColor: theme.colors.map.majorRoad, borderColor: theme.colors.map.roadBorder },
          ]}
        />
        <View
          style={[
            styles.mapRoadMinorOne,
            { backgroundColor: theme.colors.map.minorRoad, borderColor: theme.colors.map.roadBorder },
          ]}
        />
        <View
          style={[
            styles.mapRoadMinorTwo,
            { backgroundColor: theme.colors.map.minorRoad, borderColor: theme.colors.map.roadBorder },
          ]}
        />
        <Text style={[styles.mapRoadLabel, { color: theme.colors.map.label }, largeText && styles.largeBody]}>
          Kent Ridge Cres
        </Text>
        {layers.landmarks && positionedLandmarks.map(({ landmark, left, top }) => {
          const destination = selectedLandmark?.id === landmark.id;
          return (
            <Pressable
              key={landmark.id}
              accessibilityRole="button"
              accessibilityLabel={`${landmark.name}. ${landmark.category} landmark.`}
              onPress={() => onSelectLandmark(landmark)}
              style={[
                styles.landmarkMarker,
                { left, top },
                destination && styles.destinationLandmarkMarker,
                lightMode && lightStyles.landmarkMarker,
                destination && lightMode && lightStyles.destinationLandmarkMarker,
                highContrast && styles.highContrastMapStopMarker,
              ]}
            >
              <Text style={[styles.landmarkIconText, lightMode && lightStyles.landmarkText]}>
                {landmarkIcon(landmark)}
              </Text>
              <Text
                style={[
                  styles.landmarkLabel,
                  lightMode && lightStyles.landmarkLabel,
                  destination && styles.destinationLandmarkLabel,
                ]}
              >
                {landmark.name}
              </Text>
            </Pressable>
          );
        })}
        <View
          style={[
            styles.accuracyRadius,
            {
              backgroundColor: theme.colors.map.currentLocationHalo,
              borderColor: theme.colors.map.currentLocation,
              borderRadius: accuracyDiameter / 2,
              height: accuracyDiameter,
              left: currentPosition.left,
              marginLeft: -accuracyDiameter / 2,
              marginTop: -accuracyDiameter / 2,
              top: currentPosition.top,
              width: accuracyDiameter,
            },
            Boolean(currentLocation?.accuracyMeters && currentLocation.accuracyMeters > 100) &&
              styles.largeAccuracyRadius,
            highContrast && styles.highContrastAccuracyRadius,
          ]}
          accessible={false}
        />
        {selectedPosition && layers.walkingRoute ? (
          <>
            <View
              style={[
                styles.selectedStopRoute,
                directionsActive && styles.activeWalkingRoute,
                {
                  left: selectedPosition.left,
                  top: selectedPosition.top,
                  backgroundColor: theme.colors.map.routePrimary,
                  borderColor: theme.colors.map.routeOutline,
                },
                lightMode && lightStyles.selectedStopRoute,
                highContrast && styles.highContrastSelectedStopRoute,
              ]}
              accessible={false}
            >
              <Text style={styles.selectedStopRouteText}>
                {selectedPosition.stop.distanceMeters} m
              </Text>
            </View>
            {directionsActive && layers.walkingRoute ? (
              <View
                style={[
                  styles.routeArrow,
                  {
                    left: selectedPosition.left,
                    top: selectedPosition.top,
                  },
                  lightMode && lightStyles.routeArrow,
                  { backgroundColor: theme.colors.map.routePrimary, borderColor: theme.colors.map.routeOutline },
                  highContrast && styles.highContrastRouteArrow,
                ]}
                accessible={false}
              >
                <Text style={styles.routeArrowText}>›</Text>
              </View>
            ) : null}
          </>
        ) : null}
        {layers.selectedService && hasSelectedService && selectedPosition ? (
          <View
            style={[
              styles.serviceBusMarker,
              {
                left: selectedPosition.left,
                top: selectedPosition.top,
                backgroundColor: theme.colors.actionPrimary,
                borderColor: theme.colors.map.routeOutline,
              },
              lightMode && lightStyles.serviceBusMarker,
              highContrast && styles.highContrastMapStopMarker,
            ]}
            accessibilityRole="image"
            accessibilityLabel="Selected bus service shown near your chosen stop."
          >
            <BusFront
              size={22}
              color={controlIconColor({ active: true, lightMode, highContrast })}
              strokeWidth={3}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </View>
        ) : null}
        <View
          style={[
            styles.currentLocationMarker,
            { left: currentPosition.left, top: currentPosition.top },
            highContrast && styles.highContrastCurrentLocationMarker,
          ]}
          accessibilityRole="image"
          accessibilityLabel="Your current location."
        >
          <View
            style={[
              styles.headingCone,
              { transform: [{ rotate: `${headingDegrees}deg` }] },
              lightMode && lightStyles.headingCone,
            ]}
          />
          <View
            style={[
              styles.currentLocationDot,
              {
                backgroundColor: theme.colors.locationCurrent,
                borderColor: theme.colors.map.currentLocationOutline,
              },
            ]}
          />
          <Text
            style={[
              styles.currentLocationText,
              {
                backgroundColor: theme.colors.map.overlaySurface,
                borderColor: theme.colors.map.overlayBorder,
                color: theme.colors.textPrimary,
              },
            ]}
          >
            You
          </Text>
        </View>
        {layers.busStops && shouldClusterCloseStops && clusterPosition ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${closeClusterStops.length} nearby bus stops. Activate to view individual stops.`}
            accessibilityHint="Expands nearby bus stops that are close together."
            onPress={() => {
              setExpandedCluster(true);
              onMoveMap();
            }}
            style={[
              styles.stopClusterMarker,
              {
                left: clusterPosition.left,
                top: clusterPosition.top,
                backgroundColor: theme.colors.map.overlaySurfaceElevated,
                borderColor: theme.colors.map.stopRecommended,
              },
              lightMode && lightStyles.stopClusterMarker,
              highContrast && styles.highContrastMapStopMarker,
            ]}
          >
            <Text style={[styles.stopClusterCount, lightMode && lightStyles.stopClusterCount]}>
              {closeClusterStops.length}
            </Text>
            <Text style={[styles.stopClusterLabel, lightMode && lightStyles.stopClusterLabel]}>
              stops
            </Text>
          </Pressable>
        ) : null}
        {positionedStops.map(({ stop, left, top }, index) => {
          if (clusteredStopCodes.has(stop.busStopCode)) {
            return null;
          }
          const selected = selectedStop?.busStopCode === stop.busStopCode;
          if (!layers.busStops && !selected) {
            return null;
          }
          const nearest = index === 0 && !selectedStop;
          const clustered = expandedCluster && index > 0 && stop.distanceMeters < 80;
          return (
            <Pressable
              key={stop.busStopCode}
              accessibilityRole="button"
              accessibilityLabel={`${selected ? "Selected bus stop. " : ""}${stop.description}, bus stop ${stop.busStopCode}, ${stop.distanceMeters} metres away.`}
              accessibilityState={{ selected }}
              onPress={() => onSelectStop(stop)}
              style={[
                styles.mapStopMarker,
                { left, top },
                lightMode && lightStyles.mapStopMarker,
                clustered && styles.clusteredMapStopMarker,
                nearest && styles.nearestMapStopMarker,
                selectedStop && !selected && styles.dimmedMapStopMarker,
                selected && styles.selectedMapStopMarker,
                selected && lightMode && lightStyles.selectedMapStopMarker,
                highContrast && styles.highContrastMapStopMarker,
                selected && highContrast && styles.highContrastSelectedMapStopMarker,
                selected && {
                  backgroundColor: `${theme.colors.map.selectionAccent}22`,
                  borderColor: theme.colors.map.selectionAccent,
                },
              ]}
            >
              <BusStopMarkerIcon
                selected={selected}
                nearest={nearest}
                mapTheme={theme.colors.map}
              />
              {nearest ? (
                <Text style={[styles.nearestStopLabel, lightMode && lightStyles.nearestStopLabel]}>
                  Nearest
                </Text>
              ) : null}
              {selected ? (
                <Text style={[styles.mapStopMarkerLabel, lightMode && lightStyles.mapStopMarkerLabel]}>
                  {stop.busStopCode}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
        {showInlineControls ? (
        <View style={styles.mapControlGroup}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Re-centre map on my current location."
            accessibilityHint="Refreshes your current coordinates and recentres the map."
            onPress={() => {
              onRecenter();
              onRefreshLocation();
            }}
            style={[
              styles.recenterControl,
              lightMode && lightStyles.recenterControl,
              highContrast && !lightMode && styles.highContrastSelectedControl,
              highContrast && lightMode && lightStyles.highContrastSelectedControl,
            ]}
          >
            <LocateFixed
              size={29}
              color={controlIconColor({ lightMode, highContrast })}
              strokeWidth={2.8}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Return map to north-up orientation."
            accessibilityHint="Resets the map compass heading."
            onPress={onResetHeading}
            style={[
              styles.recenterControl,
              lightMode && lightStyles.recenterControl,
              highContrast && !lightMode && styles.highContrastSelectedControl,
              highContrast && lightMode && lightStyles.highContrastSelectedControl,
            ]}
          >
            <Compass
              size={29}
              color={controlIconColor({ lightMode, highContrast })}
              strokeWidth={2.8}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </Pressable>
        </View>
        ) : null}
        {showInlineControls ? (
        <View style={styles.layerControlGroup}>
          {([
            ["busStops", "Stops", MapPin],
            ["selectedService", "Bus", BusFront],
            ["landmarks", "POI", MapPinned],
            ["walkingRoute", "Route", Footprints],
            ["accessibility", "Access", Accessibility],
          ] as const).map(([layer, label, Icon]) => {
            const active = layers[layer];
            return (
              <Pressable
                key={layer}
                accessibilityRole="switch"
                accessibilityLabel={`${label} map layer`}
                accessibilityState={{ checked: active }}
                onPress={() => onToggleLayer(layer)}
                style={[
                  styles.layerControl,
                  active && styles.activeLayerControl,
                  lightMode && lightStyles.layerControl,
                  active && lightMode && lightStyles.activeLayerControl,
                  highContrast && !lightMode && styles.highContrastControl,
                  highContrast && lightMode && lightStyles.highContrastControl,
                  active && highContrast && !lightMode && styles.highContrastSelectedControl,
                  active && highContrast && lightMode && lightStyles.highContrastSelectedControl,
                ]}
              >
                <Icon
                  size={16}
                  color={controlIconColor({ active, lightMode, highContrast })}
                  strokeWidth={3}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                <Text
                  style={[
                    styles.layerControlText,
                    active && styles.activeLayerControlText,
                    lightMode && lightStyles.text,
                    active && lightMode && lightStyles.activeLayerControlText,
                    highContrast && active && styles.highContrastSelectedText,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        ) : null}
        {showInlineControls && directionsActive ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show whole route."
            accessibilityHint="Frames your current location, walking route and selected stop."
            onPress={onShowRoute}
            style={[
              styles.showRouteControl,
              lightMode && lightStyles.recenterControl,
              highContrast && !lightMode && styles.highContrastSelectedControl,
              highContrast && lightMode && lightStyles.highContrastSelectedControl,
            ]}
          >
            <Navigation
              size={20}
              color={controlIconColor({ active: true, lightMode, highContrast })}
              strokeWidth={2.8}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={[styles.mapControlText, lightMode && lightStyles.text, highContrast && styles.highContrastSelectedText]}>
              Route
            </Text>
          </Pressable>
        ) : null}
        {showInlineControls && selectedStop ? (
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Follow Me"
            accessibilityState={{ checked: followMode }}
            accessibilityHint="When on, the map follows your current location until you manually pan."
            onPress={onToggleFollow}
            style={[
              styles.followControl,
              followMode && styles.activeFollowControl,
              lightMode && lightStyles.recenterControl,
              highContrast && !lightMode && styles.highContrastSelectedControl,
              highContrast && lightMode && lightStyles.highContrastSelectedControl,
            ]}
          >
            <Text style={[styles.mapControlText, lightMode && lightStyles.text]}>
              {followMode ? "Following" : "Follow"}
            </Text>
          </Pressable>
        ) : null}
        {showInlineControls && mapManuallyMoved ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search this area."
            accessibilityHint="Loads bus stops around the current map area."
            onPress={onRefreshLocation}
            style={[
              styles.searchAreaControl,
              lightMode && lightStyles.recenterControl,
              highContrast && !lightMode && styles.highContrastSelectedControl,
              highContrast && lightMode && lightStyles.highContrastSelectedControl,
            ]}
          >
            <Text style={[styles.mapControlText, lightMode && lightStyles.text]}>
              Search this area
            </Text>
          </Pressable>
        ) : null}
        <View style={[styles.mapScale, lightMode && lightStyles.mapScale]} accessible={false}>
          <View style={[styles.mapScaleLine, lightMode && lightStyles.mapScaleLine]} />
          <Text style={[styles.mapScaleText, lightMode && lightStyles.mutedText]}>
            {mapProjection.scaleMeters} m
          </Text>
        </View>
      </Pressable>
    </View>
  );
});

function BusStopMarkerIcon({
  selected,
  nearest,
  mapTheme,
}: {
  selected: boolean;
  nearest: boolean;
  mapTheme: ReturnType<typeof resolveVisualTheme>["colors"]["map"];
}) {
  const markerColor = selected
    ? mapTheme.stopSelected
    : nearest
      ? mapTheme.stopRecommended
      : mapTheme.stopDefault;
  const markerSurface = selected ? markerColor : mapTheme.stopSurface;
  const markerDetail = selected ? mapTheme.stopOutline : markerColor;
  return (
    <View style={styles.busStopGlyph} accessible={false}>
      <View
        style={[
          styles.busStopGlyphBody,
          nearest && styles.nearestBusStopGlyphBody,
          selected && styles.selectedBusStopGlyphBody,
          {
            backgroundColor: markerSurface,
            borderColor: markerColor,
          },
        ]}
      >
        <View
          style={[
            styles.busStopGlyphWindow,
            nearest && styles.nearestBusStopGlyphWindow,
            selected && styles.selectedBusStopGlyphWindow,
            { backgroundColor: markerDetail },
          ]}
        />
        <View style={styles.busStopGlyphWheels}>
          <View
            style={[
              styles.busStopGlyphWheel,
              nearest && styles.nearestBusStopGlyphWheel,
              selected && styles.selectedBusStopGlyphWheel,
              { backgroundColor: markerDetail },
            ]}
          />
          <View
            style={[
              styles.busStopGlyphWheel,
              nearest && styles.nearestBusStopGlyphWheel,
              selected && styles.selectedBusStopGlyphWheel,
              { backgroundColor: markerDetail },
            ]}
          />
        </View>
      </View>
      <View
        style={[
          styles.busStopGlyphPointer,
          nearest && styles.nearestBusStopGlyphPointer,
          selected && styles.selectedBusStopGlyphPointer,
          { borderTopColor: markerColor },
        ]}
      />
    </View>
  );
}

const NearbyStopsList = memo(function NearbyStopsList({
  stops,
  selectedStop,
  lightMode,
  highContrast,
  onSelectStop,
}: {
  stops: NearbyBusStop[];
  selectedStop: NearbyBusStop | null;
  lightMode: boolean;
  highContrast: boolean;
  onSelectStop: (stop: NearbyBusStop) => void;
}) {
  return (
    <View style={styles.nearbyStopsList}>
      {stops.map((stop) => (
        <BusStopCard
          key={stop.busStopCode}
          stop={stop}
          selected={selectedStop?.busStopCode === stop.busStopCode}
          onPress={() => onSelectStop(stop)}
          lightMode={lightMode}
          highContrast={highContrast}
        />
      ))}
    </View>
  );
});

const SelectedStopCard = memo(function SelectedStopCard({
  stop,
  lightMode,
  highContrast,
  largeText,
  directionsActive,
  landmark,
  onConfirm,
  onHear,
  onDirections,
  onHearDirections,
}: {
  stop: NearbyBusStop;
  lightMode: boolean;
  highContrast: boolean;
  largeText: boolean;
  directionsActive: boolean;
  landmark: MapLandmark | null;
  onConfirm: () => void;
  onHear: () => void;
  onDirections: () => void;
  onHearDirections: () => void;
}) {
  const walkingMinutes = Math.max(1, Math.round(stop.distanceMeters / 70));
  const services = busServicesForStop(stop);
  const firstInstruction = firstMoveInstruction(stop, landmark);
  return (
    <View
      style={[
        styles.selectedStopSheet,
        lightMode && lightStyles.selectedStopSheet,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
      ]}
      accessible
      accessibilityLabel={`Selected bus stop, ${stop.description}, bus stop ${stop.busStopCode}, approximately ${stop.distanceMeters} metres away.`}
    >
      <View style={styles.sheetHandle} />
      <Text style={[styles.busTitle, largeText && styles.largeBody, lightMode && lightStyles.text]}>
        {stop.description}
      </Text>
      <Text style={[styles.bodyText, largeText && styles.largeBody, lightMode && lightStyles.bodyText]}>
        Bus Stop {stop.busStopCode}
      </Text>
      <Text style={[styles.bodyText, largeText && styles.largeBody, lightMode && lightStyles.bodyText]}>
        {stop.distanceMeters} m away - ~{walkingMinutes} min walk
      </Text>
      {landmark ? (
        <Text style={[styles.bodyText, largeText && styles.largeBody, lightMode && lightStyles.bodyText]}>
          Near {landmark.name}
        </Text>
      ) : null}
      <View style={[styles.directionsSummary, lightMode && lightStyles.directionsSummary]}>
        <Text style={[styles.statusLabel, lightMode && lightStyles.mutedText]}>
          Walking to Stop {stop.busStopCode}
        </Text>
        <Text style={[styles.summaryValue, largeText && styles.largeBody, lightMode && lightStyles.text]}>
          {stop.distanceMeters} m - ~{walkingMinutes} min walk
        </Text>
        <Text style={[styles.bodyText, largeText && styles.largeBody, lightMode && lightStyles.bodyText]}>
          ↑ {firstInstruction}
        </Text>
        {directionsActive ? (
          <Text style={[styles.infoPill, styles.accessibleChip, lightMode && lightStyles.accessibleChip]}>
            Accessible route data incomplete
          </Text>
        ) : null}
      </View>
      <Text style={[styles.statusLabel, lightMode && lightStyles.mutedText]}>Bus Services</Text>
      <View style={styles.infoRow}>
        {services.map((service) => (
          <Text
            key={service}
            style={[
              styles.infoPill,
              styles.serviceChip,
              lightMode && lightStyles.infoPill,
              lightMode && lightStyles.serviceChip,
            ]}
          >
            {service}{service === "191" ? "  3 min" : ""}
          </Text>
        ))}
      </View>
      <Text style={[styles.statusLabel, lightMode && lightStyles.mutedText]}>
        Accessibility
      </Text>
      <View style={styles.infoRow}>
        <Text
          style={[
            styles.infoPill,
            styles.accessibleChip,
            lightMode && lightStyles.accessibleChip,
          ]}
        >
          Accessible boarding
        </Text>
        <Text
          style={[
            styles.infoPill,
            lightMode && lightStyles.infoPill,
          ]}
        >
          Route accessibility unavailable
        </Text>
      </View>
      <SecondaryButton
        label={directionsActive ? "Hear directions" : "Directions"}
        icon={directionsActive ? Volume2 : Route}
        accessibilityHint="Announces the selected bus stop name, code, distance and services."
        onPress={directionsActive ? onHearDirections : onDirections}
        lightMode={lightMode}
        highContrast={highContrast}
      />
      <SecondaryButton
        label="I can't find this stop"
        icon={CircleQuestionMark}
        accessibilityHint="Repeats the first direction and keeps nearby stops available."
        onPress={onHearDirections}
        lightMode={lightMode}
        highContrast={highContrast}
      />
      <SecondaryButton
        label="Hear stop information"
        icon={Volume2}
        accessibilityHint="Announces the selected bus stop name, code, distance and services."
        onPress={onHear}
        lightMode={lightMode}
        highContrast={highContrast}
      />
      <PrimaryButton
        label="Use this as my boarding stop"
        icon={CircleCheck}
        accessibilityHint={`Confirm ${stop.description} as my boarding stop.`}
        onPress={onConfirm}
        lightMode={lightMode}
        highContrast={highContrast}
      />
    </View>
  );
});
function AlightingStopRow({
  stop,
  selected,
  onPress,
  lightMode = false,
  highContrast = false,
}: {
  stop: RouteStop;
  selected: boolean;
  onPress: () => void;
  lightMode?: boolean;
  highContrast?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${stop.description}. ${selected ? "Selected" : "Not selected"}. Double tap to choose this alighting stop.`}
      onPress={onPress}
      style={[
        styles.busCard,
        lightMode && lightStyles.surface,
        selected && styles.selectedCard,
        lightMode && selected && lightStyles.selectedCard,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
      ]}
    >
      <Text style={[styles.busTitle, lightMode && lightStyles.text]}>{stop.description}</Text>
      <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>Bus Stop {stop.busStopCode}</Text>
      <Text style={styles.selectHint}>{selected ? "Selected stop" : "Select stop"}</Text>
    </Pressable>
  );
}

function TabButton({
  label,
  icon,
  index,
  selected,
  stateDescription,
  disabled = false,
  lightMode,
  highContrast,
  compact,
  onPress,
}: {
  label: string;
  icon: TabIconName;
  index: number;
  selected: boolean;
  stateDescription?: string;
  disabled?: boolean;
  lightMode: boolean;
  highContrast: boolean;
  compact: boolean;
  onPress: () => void;
}) {
  const Icon = appIcon(icon);
  const theme = resolveVisualTheme(lightMode, highContrast);
  const iconColor = tabIconColor({ selected, disabled, lightMode, highContrast });
  const iconSize = compact ? iconSizes.standard : 25;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, tab, ${selected ? "selected, " : ""}${stateDescription ? `${stateDescription}, ` : ""}${index} of 4`}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.tabButton,
        compact && styles.compactTabButton,
        lightMode && lightStyles.tabButton,
        selected && styles.selectedTabButton,
        lightMode && selected && lightStyles.selectedTabButton,
        disabled && styles.disabledTabButton,
        lightMode && disabled && lightStyles.disabledTabButton,
      ]}
    >
      <View
        style={[
          styles.tabIconBadge,
          compact && styles.compactTabIconBadge,
          lightMode && lightStyles.tabIconBadge,
          selected && styles.selectedTabIconBadge,
          lightMode && selected && lightStyles.selectedTabIconBadge,
          disabled && styles.disabledTabIconBadge,
          lightMode && disabled && lightStyles.disabledTabIconBadge,
          {
            backgroundColor: selected
              ? theme.colors.selectedSurface
              : disabled
                ? theme.colors.actionSecondary
                : theme.colors.map.navigationSurface,
            borderColor: selected ? theme.colors.map.selectionAccent : theme.colors.map.navigationDivider,
          },
        ]}
      >
        <Icon
          size={iconSize}
          color={iconColor}
          strokeWidth={highContrast || selected ? 3 : 2.65}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        {icon === "assist" && stateDescription === "assistance request active" ? (
          <View
            style={[
              styles.tabStatusDot,
              lightMode && lightStyles.tabStatusDot,
            ]}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        ) : null}
      </View>
      <Text
        style={[
          styles.tabButtonText,
          compact && styles.compactTabButtonText,
          lightMode && lightStyles.tabButtonText,
          selected && styles.selectedTabButtonText,
          lightMode && selected && lightStyles.selectedTabButtonText,
          highContrast && !lightMode && styles.highContrastText,
          highContrast && lightMode && lightStyles.highContrastText,
          disabled && styles.disabledTabButtonText,
          lightMode && disabled && lightStyles.disabledTabButtonText,
          {
            color: disabled
              ? theme.colors.textDisabled
              : selected
                ? theme.colors.textPrimary
                : theme.colors.textSecondary,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SelectedIcon() {
  return (
    <View style={styles.selectedIcon}>
      <View style={styles.selectedIconShort} />
      <View style={styles.selectedIconLong} />
    </View>
  );
}

function VerificationMethodPicker({
  selectedMethod,
  onSelect,
}: {
  selectedMethod: VerificationMethod;
  onSelect: (method: VerificationMethod) => void;
}) {
  const methods: Array<{ method: VerificationMethod; label: string }> = [
    { method: "DEMO_CREDENTIAL", label: "Demo" },
    { method: "PWD_CONCESSION_CARD", label: "PWD card" },
    { method: "SENIOR_CONCESSION_CARD", label: "Senior card" },
  ];

  return (
    <View style={styles.methodPicker}>
      {methods.map((item) => (
        <Pressable
          key={item.method}
          accessibilityRole="button"
          accessibilityState={{ selected: selectedMethod === item.method }}
          onPress={() => onSelect(item.method)}
          style={[
            styles.methodButton,
            selectedMethod === item.method && styles.selectedMethodButton,
          ]}
        >
          <Text
            style={[
              styles.methodButtonText,
              selectedMethod === item.method && styles.selectedMethodButtonText,
            ]}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function StatusToast({
  message,
  highContrast = false,
  lightMode = false,
  largeText = false,
  onDismiss,
}: {
  message: string;
  highContrast?: boolean;
  lightMode?: boolean;
  largeText?: boolean;
  onDismiss: () => void;
}) {
  const theme = resolveVisualTheme(lightMode, highContrast);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Dismisses this confirmation."
      onPress={onDismiss}
      style={[
        styles.statusToast,
        {
          backgroundColor: lightMode ? theme.colors.surfacePrimary : theme.colors.surfaceRaised,
          borderColor: highContrast ? theme.colors.borderStrong : theme.colors.statusSuccess,
        },
        highContrast && lightMode && styles.highContrastLightToast,
        highContrast && !lightMode && styles.highContrastDarkToast,
      ]}
      accessible
      accessibilityLabel={message}
    >
      <CircleCheck
        size={22}
        color={highContrast && !lightMode ? theme.colors.iconPrimary : theme.colors.statusSuccess}
        strokeWidth={highContrast ? 3.2 : 2.8}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text
        style={[
          styles.statusToastText,
          { color: theme.colors.textPrimary },
          largeText && styles.largeStatusToastText,
        ]}
      >
        {message}
      </Text>
    </Pressable>
  );
}

function LoadingState({
  message,
  lightMode = false,
  highContrast = false,
}: {
  message: string;
  lightMode?: boolean;
  highContrast?: boolean;
}) {
  return (
    <View
      style={[
        styles.feedbackPanel,
        lightMode && lightStyles.surface,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
      ]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={message}
      accessibilityState={{ busy: true }}
    >
      <ActivityIndicator size="large" accessibilityLabel={message} />
      <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>{message}</Text>
    </View>
  );
}

function ErrorState({
  title = "Something went wrong",
  message,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
  lightMode = false,
  highContrast = false,
}: {
  title?: string;
  message: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  lightMode?: boolean;
  highContrast?: boolean;
}) {
  return (
    <View style={styles.errorPanel} accessible accessibilityRole="alert" accessibilityLabel={message}>
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorText}>{message}</Text>
      {primaryActionLabel && onPrimaryAction && (
        <PrimaryButton
          label={primaryActionLabel}
          onPress={onPrimaryAction}
          lightMode={lightMode}
          highContrast={highContrast}
        />
      )}
      {secondaryActionLabel && onSecondaryAction && (
        <SecondaryButton
          label={secondaryActionLabel}
          onPress={onSecondaryAction}
          lightMode={lightMode}
          highContrast={highContrast}
        />
      )}
    </View>
  );
}

function controlIconColor({
  active = false,
  disabled = false,
  lightMode,
  highContrast,
}: {
  active?: boolean;
  disabled?: boolean;
  lightMode: boolean;
  highContrast: boolean;
}) {
  const theme = resolveVisualTheme(lightMode, highContrast);
  if (disabled) {
    return theme.colors.iconDisabled;
  }
  if (highContrast) {
    return active && !lightMode ? theme.colors.iconSelected : theme.colors.iconPrimary;
  }
  if (active) {
    return theme.colors.iconSelected;
  }
  return theme.colors.iconPrimary;
}

function tabIconColor({
  selected,
  disabled,
  lightMode,
  highContrast,
}: {
  selected: boolean;
  disabled: boolean;
  lightMode: boolean;
  highContrast: boolean;
}) {
  const theme = resolveVisualTheme(lightMode, highContrast);
  const iconDisabled = theme.colors.iconDisabled;
  const iconSelected = theme.colors.iconSelected;
  const iconSecondary = theme.colors.iconSecondary;
  if (highContrast) {
    if (disabled) {
      return iconDisabled;
    }
    return selected ? iconSelected : iconSecondary;
  }
  if (disabled) {
    return iconDisabled;
  }
  if (selected) {
    return iconSelected;
  }
  return iconSecondary;
}

function PrimaryButton({
  label,
  icon,
  accessibilityHint,
  onPress,
  disabled = false,
  variant = "default",
  lightMode = false,
  highContrast = false,
}: {
  label: string;
  icon?: LucideIcon;
  accessibilityHint?: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "default" | "attention";
  lightMode?: boolean;
  highContrast?: boolean;
}) {
  const Icon = icon;
  const iconColor = disabled
    ? colors.disabledText
    : highContrast
      ? lightMode
        ? "#000000"
        : "#FFFFFF"
      : variant === "attention"
        ? colors.textOnWarning
        : colors.textOnPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.primaryButton,
        lightMode && lightStyles.primaryButton,
        highContrast && !lightMode && styles.highContrastSelectedControl,
        highContrast && lightMode && lightStyles.highContrastSelectedControl,
        variant === "attention" && styles.attentionButton,
        disabled && styles.disabledButton,
      ]}
    >
      {Icon ? (
        <Icon
          size={24}
          color={iconColor}
          strokeWidth={2.75}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
      <Text
        style={[
          styles.primaryButtonText,
          lightMode && lightStyles.primaryButtonText,
          highContrast && !lightMode && styles.highContrastSelectedText,
          highContrast && lightMode && styles.highContrastSelectedText,
          variant === "attention" && styles.attentionButtonText,
          disabled && styles.disabledButtonText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SecondaryButton({
  label,
  icon,
  accessibilityHint,
  onPress,
  disabled = false,
  lightMode = false,
  highContrast = false,
}: {
  label: string;
  icon?: LucideIcon;
  accessibilityHint?: string;
  onPress: () => void;
  disabled?: boolean;
  lightMode?: boolean;
  highContrast?: boolean;
}) {
  const Icon = icon;
  const iconColor = disabled
    ? colors.disabledText
    : highContrast
      ? lightMode
        ? "#000000"
        : "#FFFFFF"
      : lightMode
        ? lightTheme.primaryStrong
        : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.secondaryButton,
        lightMode && lightStyles.secondaryButton,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
        disabled && styles.disabledButton,
      ]}
    >
      {Icon ? (
        <Icon
          size={24}
          color={iconColor}
          strokeWidth={2.75}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
      <Text
        style={[
          styles.secondaryButtonText,
          lightMode && lightStyles.secondaryButtonText,
          highContrast && !lightMode && styles.highContrastText,
          highContrast && lightMode && lightStyles.highContrastText,
          disabled && styles.disabledButtonText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryRow({
  label,
  value,
  lightMode = false,
  highContrast = false,
}: {
  label: string;
  value: string;
  lightMode?: boolean;
  highContrast?: boolean;
}) {
  return (
    <View
      style={[
        styles.summaryRow,
        lightMode && lightStyles.surface,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
      ]}
    >
      <Text style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}>{label}</Text>
      <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>{value}</Text>
    </View>
  );
}

function requirementsToAssistanceTypes(requirements: AccessibilityRequirements): AssistanceType[] {
  const types: AssistanceType[] = [];
  if (requirements.wheelchairRamp) {
    types.push("WHEELCHAIR_RAMP");
  }
  if (requirements.busAudioIdentification) {
    types.push("BUS_AUDIO_IDENTIFICATION");
  }
  if (requirements.extendedDwellTime) {
    types.push("EXTENDED_DWELL_TIME");
  }
  return types;
}

function buildFallbackRouteStops(
  selectedStop: NearbyBusStop | null,
  fallbackDestination: string
): RouteStop[] {
  const origin: RouteStop = selectedStop
    ? { ...selectedStop, sequence: 0 }
    : {
        sequence: 0,
        busStopCode: "CURRENT",
        roadName: "Current route",
        description: "Current stop",
        latitude: 0,
        longitude: 0,
      };

  return [
    origin,
    {
      sequence: 1,
      busStopCode: "NEXT",
      roadName: "Current route",
      description: fallbackDestination,
      latitude: origin.latitude,
      longitude: origin.longitude,
    },
  ];
}

function routeStopsForBus(bus: Bus | null, selectedStop: NearbyBusStop | null, arrival: ArrivalBus | null) {
  if (bus?.busService === "95") {
    return kentRidgeRouteStops;
  }
  return buildFallbackRouteStops(selectedStop, arrival?.destination ?? destination);
}

function defaultAlightingStopForRoute(route: RouteStop[]) {
  return route[Math.max(1, route.length - 2)] ?? route[route.length - 1] ?? null;
}

function routeStopIndex(routeStops: RouteStop[], stop: RouteStop | null) {
  if (!stop) {
    return -1;
  }
  return routeStops.findIndex((candidate) => candidate.sequence === stop.sequence);
}

function stopsRemainingToDestination(
  routeStops: RouteStop[],
  currentStopIndex: number,
  selectedDestinationStop: RouteStop | null
) {
  const destinationIndex = routeStopIndex(routeStops, selectedDestinationStop);
  if (destinationIndex < 0) {
    return null;
  }
  return Math.max(0, destinationIndex - currentStopIndex);
}

function routeProgressAnnouncement(
  routeStops: RouteStop[],
  currentStopIndex: number,
  destinationStopIndex: number
) {
  const nextStop = routeStops[currentStopIndex + 1];
  const destinationStop = routeStops[destinationStopIndex];
  const remaining =
    destinationStopIndex >= 0 ? Math.max(0, destinationStopIndex - currentStopIndex) : null;
  return [
    nextStop ? `Next stop, ${nextStop.description}.` : "Final stop.",
    destinationStop ? `Destination, ${destinationStop.description}.` : "Destination not selected.",
    remaining === null
      ? undefined
      : remaining === 1
        ? "Your stop is next."
        : remaining === 0
          ? "This is your stop."
          : `${remaining} stops remaining.`,
  ]
    .filter(Boolean)
    .join(" ");
}

type MapCoordinate = {
  latitude: number;
  longitude: number;
};

type MapProjection = {
  left: `${number}%`;
  top: `${number}%`;
  x: number;
  y: number;
};

function createMapProjection(points: MapCoordinate[], viewportCenter: MapCoordinate = manualStopLookup) {
  const usablePoints = points.length > 0 ? points : [manualStopLookup];
  const centerLatitude = viewportCenter.latitude;
  const metersPerLatitudeDegree = 111320;
  const metersPerLongitudeDegree =
    metersPerLatitudeDegree * Math.max(0.2, Math.cos(toRadians(centerLatitude)));
  const viewportCenterProjected = {
    x: viewportCenter.longitude * metersPerLongitudeDegree,
    y: viewportCenter.latitude * metersPerLatitudeDegree,
  };
  const projected = usablePoints.map((point) => ({
    x: point.longitude * metersPerLongitudeDegree,
    y: point.latitude * metersPerLatitudeDegree,
  }));
  const maxDeltaX = Math.max(
    ...projected.map((point) => Math.abs(point.x - viewportCenterProjected.x)),
    minimumMapSpanMeters / 2
  );
  const maxDeltaY = Math.max(
    ...projected.map((point) => Math.abs(point.y - viewportCenterProjected.y)),
    minimumMapSpanMeters / 2
  );
  const spanX = Math.max(maxDeltaX * 2, minimumMapSpanMeters);
  const spanY = Math.max(maxDeltaY * 2, minimumMapSpanMeters);
  const centerX = viewportCenterProjected.x;
  const centerY = viewportCenterProjected.y;
  const paddedSpanX = spanX / (1 - (mapViewportPaddingPercent * 2) / 100);
  const paddedSpanY = spanY / (1 - (mapViewportPaddingPercent * 2) / 100);
  const leftX = centerX - paddedSpanX / 2;
  const topY = centerY + paddedSpanY / 2;

  function project(point: MapCoordinate): MapProjection {
    const x = point.longitude * metersPerLongitudeDegree;
    const y = point.latitude * metersPerLatitudeDegree;
    const left = Math.max(6, Math.min(94, ((x - leftX) / paddedSpanX) * 100));
    const top = Math.max(8, Math.min(88, ((topY - y) / paddedSpanY) * 100));
    return {
      left: `${left}%` as `${number}%`,
      top: `${top}%` as `${number}%`,
      x: left,
      y: top,
    };
  }

  const scaleMeters = chooseMapScaleMeters(Math.max(spanX, spanY));
  return { project, scaleMeters };
}

function distanceBetweenCoordinates(a: MapCoordinate, b: MapCoordinate) {
  const earthRadiusMeters = 6_371_000;
  const deltaLatitude = toRadians(b.latitude - a.latitude);
  const deltaLongitude = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function chooseMapScaleMeters(spanMeters: number) {
  if (spanMeters <= 220) {
    return 50;
  }
  if (spanMeters <= 520) {
    return 100;
  }
  return 250;
}

function minimumZoomForMode(mode: ViewportSource) {
  if (mode === "FULL_ROUTE") {
    return mapZoomLimits.fullRouteMin;
  }
  if (mode === "ACTIVE_JOURNEY" || mode === "ROUTE" || mode === "DESTINATION_FOCUS") {
    return mapZoomLimits.journeyMin;
  }
  return mapZoomLimits.min;
}

function clampMapZoom(zoom: number, mode: ViewportSource) {
  return Math.max(minimumZoomForMode(mode), Math.min(mapZoomLimits.max, zoom));
}

function toRadians(degrees: number) {
  return degrees * (Math.PI / 180);
}

function readSavedPreferences():
  | {
      assistanceDefaults: AccessibilityRequirements;
      appPreferences: AppAccessibilityPreferences;
    }
  | null {
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(localPreferencesKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<{
      assistanceDefaults: AccessibilityRequirements;
      appPreferences: AppAccessibilityPreferences;
    }>;

    return {
      assistanceDefaults: {
        ...defaultRequirements,
        ...parsed.assistanceDefaults,
      },
      appPreferences: {
        ...defaultAppPreferences,
        ...parsed.appPreferences,
      },
    };
  } catch {
    return null;
  }
}

function savePreferencesLocally(preferences: {
  assistanceDefaults: AccessibilityRequirements;
  appPreferences: AppAccessibilityPreferences;
}) {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(localPreferencesKey, JSON.stringify(preferences));
  } catch {
    // Local preference persistence should never block the journey flow.
  }
}

function getLocalStorage(): Storage | null {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
    return null;
  }

  return globalThis.localStorage;
}

function readableAssistanceType(type: AssistanceType) {
  const labels: Record<AssistanceType, string> = {
    WHEELCHAIR_RAMP: "Wheelchair ramp",
    BUS_AUDIO_IDENTIFICATION: "Bus identification assistance",
    EXTENDED_DWELL_TIME: "More boarding time",
  };
  return labels[type];
}

function requirementsLabel(requirements: AccessibilityRequirements) {
  const labels = requirementsToAssistanceTypes(requirements).map(readableAssistanceType);
  return labels.length > 0 ? labels.join(", ") : "No bus assistance defaults";
}

function appPreferencesLabel(preferences: AppAccessibilityPreferences) {
  const labels = [
    preferences.screenReaderOptimised ? "screen-reader guidance" : undefined,
    preferences.hapticAlerts ? "haptics" : undefined,
    preferences.largeText ? "large text" : undefined,
    preferences.highContrast ? "high contrast" : undefined,
    preferences.repeatAudio ? "repeat announcements" : undefined,
    `${preferences.themeMode} mode`,
  ].filter(Boolean);

  return labels.length > 0 ? labels.join(", ") : "standard display and alerts";
}

function verificationStatusLabel(profile: PassengerProfile) {
  if (profile.verificationStatus === "VERIFIED") {
    return `Verified by ${readableVerificationMethod(profile.verificationMethod)}`;
  }
  if (profile.verificationStatus === "PENDING") {
    return "Pending review";
  }
  return "Unverified";
}

function requestStatusLabel(status: AssistanceRequestStatus | null) {
  if (status === "ACKNOWLEDGED") {
    return "Assistance confirmed";
  }
  if (status === "CANCELLED") {
    return "Assistance cancelled";
  }
  if (status === "FAILED") {
    return "Request not sent";
  }
  return "Sending request";
}

function vehicleStatusLabel(status: VehicleStatus | null) {
  if (status === "APPROACHING") {
    return "Your bus is approaching";
  }
  if (status === "ARRIVED") {
    return "Your bus is here";
  }
  if (status === "DEPARTED") {
    return "Your bus has left the stop";
  }
  return "Waiting for bus";
}

function readableVerificationMethod(method?: VerificationMethod) {
  const labels: Record<VerificationMethod, string> = {
    DEMO_CREDENTIAL: "demo credential",
    PWD_CONCESSION_CARD: "PWD concession card",
    SENIOR_CONCESSION_CARD: "senior concession card",
  };

  return method ? labels[method] : "not selected";
}

function getActiveTab(screen: Screen): AppTab {
  if (screen === "STOP" || screen === "BUS") {
    return "JOURNEY";
  }
  if (screen === "ONBOARD" || screen === "ALIGHTING_STOP" || screen === "COMPLETED") {
    return "JOURNEY";
  }
  if (screen === "ACCESSIBILITY" || screen === "CONFIRM") {
    return "ASSISTANCE";
  }
  if (screen === "STATUS") {
    return "ASSISTANCE";
  }
  if (screen === "PROFILE" || screen === "AUTH") {
    return "PROFILE";
  }
  return "HOME";
}

function eventLabel(event: StatusUpdateMessage) {
  if (event.type === "REQUEST_STATUS") {
    return `${requestStatusLabel(event.status)} (${readableSource(event.source)})`;
  }
  if (event.type === "VEHICLE_STATUS") {
    return `Service ${event.busService}: ${vehicleStatusLabel(event.status)}`;
  }
  return event.announcement;
}

function readableSource(source: string) {
  const labels: Record<string, string> = {
    MOBILE_APP: "mobile app",
    PHYSICAL_BUTTON: "physical button",
    RFID: "RFID",
    AUTOMATIC_DETECTION: "automatic detection",
  };
  return labels[source] ?? source;
}

function stopAccessibilityLabel(stop: NearbyBusStop) {
  return `You appear to be at bus stop ${stop.busStopCode}, ${stop.description}, ${stop.roadName}, approximately ${stop.distanceMeters} metres away.`;
}

function busServicesForStop(stop: NearbyBusStop) {
  const knownServices: Record<string, string[]> = {
    "18301": ["95", "151", "A1", "A2"],
    "18321": ["95", "151", "A1"],
    "18331": ["95", "151", "183"],
    "18341": ["151", "183", "188", "200"],
    "19011": ["95", "A1", "A2"],
    "19019": ["95", "200"],
  };

  return knownServices[stop.busStopCode] ?? [];
}

function landmarkIcon(landmark: MapLandmark) {
  const icons: Record<MapLandmark["category"], string> = {
    building: "▣",
    station: "M",
    hospital: "+",
    park: "○",
    crossing: "╋",
  };
  return icons[landmark.category];
}

function firstMoveInstruction(stop: NearbyBusStop, landmark: MapLandmark | null) {
  if (landmark?.category === "crossing") {
    return `Head towards ${landmark.name} on ${stop.roadName}.`;
  }
  if (landmark) {
    return `Head towards ${stop.roadName}, using ${landmark.name} as your landmark.`;
  }
  return `Head towards ${stop.roadName}.`;
}

function routeAnnouncement(stop: NearbyBusStop, landmark: MapLandmark | null) {
  const walkingMinutes = Math.max(1, Math.round(stop.distanceMeters / 70));
  return [
    `Walking to bus stop ${stop.busStopCode}, ${stop.description}.`,
    `${stop.distanceMeters} metres, approximately ${walkingMinutes} minutes.`,
    firstMoveInstruction(stop, landmark),
    landmark ? `Look for ${landmark.name} nearby.` : undefined,
    `Look for bus stop ${stop.busStopCode} before confirming this is your stop.`,
  ]
    .filter(Boolean)
    .join(" ");
}

function stopAnnouncement(stop: NearbyBusStop) {
  const services = busServicesForStop(stop).join(", ");
  return `${stop.description}, bus stop ${stop.busStopCode}, approximately ${stop.distanceMeters} metres away. Services ${services}.`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  highContrastSafeArea: {
    backgroundColor: "#000000",
  },
  container: {
    padding: spacing.xl,
    paddingBottom: 170,
    gap: spacing.lg,
  },
  mapWorkspaceContainer: {
    gap: 0,
    padding: 0,
    paddingBottom: 0,
  },
  compactContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 132,
    gap: 16,
  },
  appTitle: {
    color: colors.text,
    fontSize: typography.pageTitle,
    fontWeight: "800",
  },
  brandHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
  },
  compactBrandHeader: {
    gap: 10,
  },
  brandLogoImage: {
    height: 84,
    width: 84,
  },
  compactBrandLogoImage: {
    height: 64,
    width: 64,
  },
  brandMark: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.primarySoft,
    borderRadius: 18,
    borderWidth: 1,
    height: 74,
    justifyContent: "center",
    overflow: "hidden",
    width: 74,
  },
  brandOuterArc: {
    borderColor: colors.primary,
    borderRadius: 30,
    borderTopWidth: 4,
    height: 56,
    position: "absolute",
    top: 10,
    width: 56,
  },
  brandSignalLarge: {
    borderColor: colors.primarySoft,
    borderRadius: 20,
    borderTopWidth: 4,
    height: 18,
    position: "absolute",
    top: 8,
    width: 32,
  },
  brandSignalSmall: {
    borderColor: colors.primarySoft,
    borderRadius: 14,
    borderTopWidth: 4,
    height: 12,
    position: "absolute",
    top: 20,
    width: 22,
  },
  brandLeftHand: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    bottom: 5,
    height: 34,
    left: 7,
    position: "absolute",
    transform: [{ rotate: "-32deg" }],
    width: 17,
  },
  brandRightHand: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    bottom: 5,
    height: 34,
    position: "absolute",
    right: 7,
    transform: [{ rotate: "32deg" }],
    width: 17,
  },
  brandBusBody: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderRadius: 8,
    height: 30,
    justifyContent: "space-between",
    paddingHorizontal: 6,
    paddingTop: 6,
    position: "absolute",
    top: 28,
    width: 34,
  },
  brandBusWindow: {
    backgroundColor: colors.surface,
    borderRadius: 4,
    height: 10,
    width: 22,
  },
  brandBusLights: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 24,
  },
  brandBusLight: {
    backgroundColor: colors.surface,
    borderRadius: 4,
    height: 5,
    width: 7,
  },
  brandWheels: {
    flexDirection: "row",
    gap: 18,
    position: "absolute",
    top: 55,
  },
  brandWheel: {
    backgroundColor: colors.primaryDark,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  brandPinShape: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 10,
    bottom: 6,
    height: 20,
    justifyContent: "center",
    position: "absolute",
    width: 20,
  },
  brandPinDot: {
    backgroundColor: colors.surface,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  brandRouteLeft: {
    backgroundColor: colors.primarySoft,
    borderRadius: 10,
    bottom: 2,
    height: 5,
    left: 25,
    position: "absolute",
    transform: [{ rotate: "-12deg" }],
    width: 20,
  },
  brandRouteRight: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    bottom: 2,
    height: 5,
    position: "absolute",
    right: 24,
    transform: [{ rotate: "12deg" }],
    width: 20,
  },
  brandTextGroup: {
    flex: 1,
  },
  brandTitle: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "900",
  },
  compactBrandTitle: {
    fontSize: 27,
    lineHeight: 32,
  },
  brandSubtitle: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0,
  },
  compactBrandSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 18,
    lineHeight: 26,
  },
  section: {
    gap: 14,
  },
  profileBar: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "space-between",
    padding: 14,
  },
  profileName: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 20,
    fontWeight: "800",
  },
  defaultsIconGroup: {
    gap: 8,
  },
  compactDefaultsIconGroup: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  defaultsIconLabel: {
    color: colors.metadata,
    fontSize: 15,
    fontWeight: "800",
  },
  defaultsIconRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  compactDefaultsIconRow: {
    justifyContent: "flex-end",
  },
  defaultsIconChip: {
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.assistance,
    borderRadius: 8,
    borderWidth: 2,
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  compactDefaultsIconBadge: {
    borderRadius: 8,
    height: 42,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 6,
    paddingVertical: 6,
    width: 42,
  },
  defaultsIconImage: {
    height: 28,
    tintColor: colors.assistance,
    width: 28,
  },
  defaultsIconImageOriginal: {
    height: 28,
    width: 28,
  },
  defaultsIconText: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
  },
  assistanceSummaryList: {
    gap: 8,
  },
  assistanceSummaryRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  createProfilePanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: borders.default,
    gap: spacing.md,
    padding: spacing.lg,
  },
  themeSwitchCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: borders.default,
    gap: spacing.md,
    padding: spacing.lg,
  },
  themeSwitchTextGroup: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  appearanceHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "space-between",
  },
  appearanceSwitchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
  },
  modeLabel: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: borders.default,
    flex: 1,
    gap: 8,
    minHeight: 92,
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  selectedModeLabel: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.primary,
    borderWidth: borders.selected,
  },
  modeLabelText: {
    color: colors.text,
    fontSize: typography.secondary,
    fontWeight: "900",
  },
  selectedModeLabelText: {
    color: "#FFFFFF",
  },
  highContrastSelectedText: {
    color: "#000000",
  },
  modeSwitchTrack: {
    backgroundColor: colors.primary,
    borderColor: colors.border,
    borderRadius: 17,
    borderWidth: 2,
    height: 34,
    justifyContent: "center",
    paddingHorizontal: 3,
    width: 58,
  },
  modeSwitchTrackDark: {
    alignItems: "flex-end",
    backgroundColor: colors.lightSurface,
  },
  modeSwitchThumb: {
    backgroundColor: colors.primaryDark,
    borderRadius: 12,
    height: 24,
    width: 24,
  },
  modeSwitchThumbDark: {
    backgroundColor: colors.highlight,
  },
  sunIcon: {
    alignItems: "center",
    backgroundColor: colors.lightSurface,
    borderColor: colors.primary,
    borderRadius: 22,
    borderWidth: 2,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  sunCore: {
    backgroundColor: colors.warning,
    borderRadius: 9,
    height: 18,
    width: 18,
  },
  selectedSunCore: {
    backgroundColor: colors.warning,
  },
  selectedSunIcon: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.primary,
  },
  selectedSunRay: {
    backgroundColor: colors.warning,
  },
  sunRay: {
    backgroundColor: colors.highlight,
    borderRadius: 2,
    position: "absolute",
  },
  sunRayTop: {
    height: 7,
    top: 5,
    width: 3,
  },
  sunRayBottom: {
    bottom: 5,
    height: 7,
    width: 3,
  },
  sunRayLeft: {
    height: 3,
    left: 5,
    width: 7,
  },
  sunRayRight: {
    height: 3,
    right: 5,
    width: 7,
  },
  sunRayTopLeft: {
    height: 3,
    left: 9,
    top: 9,
    transform: [{ rotate: "45deg" }],
    width: 7,
  },
  sunRayTopRight: {
    height: 3,
    right: 9,
    top: 9,
    transform: [{ rotate: "-45deg" }],
    width: 7,
  },
  sunRayBottomLeft: {
    bottom: 9,
    height: 3,
    left: 9,
    transform: [{ rotate: "-45deg" }],
    width: 7,
  },
  sunRayBottomRight: {
    bottom: 9,
    height: 3,
    right: 9,
    transform: [{ rotate: "45deg" }],
    width: 7,
  },
  moonIcon: {
    alignItems: "center",
    backgroundColor: colors.lightSurface,
    borderColor: colors.primary,
    borderRadius: 22,
    borderWidth: 2,
    height: 44,
    justifyContent: "center",
    overflow: "hidden",
    width: 44,
  },
  moonIconFrame: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  moonInner: {
    backgroundColor: colors.primary,
    borderRadius: 13,
    height: 26,
    left: 8,
    position: "absolute",
    top: 6,
    width: 26,
  },
  selectedMoonInner: {
    backgroundColor: colors.primaryDark,
  },
  selectedMoonIcon: {
    backgroundColor: "transparent",
    borderColor: colors.primaryDark,
  },
  selectedMoonCutout: {
    backgroundColor: colors.surfaceSecondary,
  },
  moonCutout: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    height: 24,
    left: 17,
    position: "absolute",
    top: 4,
    width: 24,
  },
  selectedModeIcon: {
    borderColor: colors.primaryDark,
  },
  tabBar: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderTopWidth: 1,
    bottom: 0,
    borderRadius: 0,
    borderWidth: 0,
    flexDirection: "row",
    gap: 0,
    left: 0,
    minHeight: 66,
    paddingHorizontal: 4,
    paddingTop: 3,
    paddingBottom: 4,
    position: "absolute",
    right: 0,
  },
  compactTabBar: {
    gap: 4,
    padding: 4,
  },
  tabButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 4,
    flex: 1,
    gap: 2,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  compactTabButton: {
    gap: 2,
    minHeight: 54,
    paddingHorizontal: 3,
    paddingVertical: 6,
  },
  selectedTabButton: {
    backgroundColor: "transparent",
    borderBottomColor: colors.primary,
    borderBottomWidth: 3,
  },
  disabledTabButton: {
    backgroundColor: "transparent",
  },
  tabButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  compactTabButtonText: {
    fontSize: 12,
    lineHeight: 15,
  },
  tabIconBadge: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 8,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  compactTabIconBadge: {
    height: 30,
    width: 36,
  },
  tabLogoImage: {
    height: 32,
    width: 38,
  },
  compactTabLogoImage: {
    height: 28,
    width: 34,
  },
  selectedTabLogoImage: {
    height: 34,
    width: 40,
  },
  compactSelectedTabLogoImage: {
    height: 30,
    width: 36,
  },
  disabledTabLogoImage: {
    opacity: 0.72,
  },
  selectedTabIconBadge: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    borderRadius: 14,
    borderWidth: 1,
    height: 36,
    width: 44,
  },
  tabStatusDot: {
    backgroundColor: colors.success,
    borderColor: colors.surface,
    borderRadius: 999,
    borderWidth: 2,
    height: 10,
    position: "absolute",
    right: 2,
    top: 0,
    width: 10,
  },
  disabledTabIconBadge: {
    backgroundColor: "transparent",
  },
  tabIconText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 16,
    textAlign: "center",
  },
  selectedTabIconText: {
    color: colors.highlight,
  },
  selectedIcon: {
    height: 18,
    position: "relative",
    width: 22,
  },
  selectedIconShort: {
    backgroundColor: colors.highlight,
    borderRadius: 2,
    height: 4,
    left: 3,
    position: "absolute",
    top: 10,
    transform: [{ rotate: "45deg" }],
    width: 9,
  },
  selectedIconLong: {
    backgroundColor: colors.highlight,
    borderRadius: 2,
    height: 4,
    left: 9,
    position: "absolute",
    top: 8,
    transform: [{ rotate: "-45deg" }],
    width: 15,
  },
  homeIcon: {
    alignItems: "center",
    height: 22,
    justifyContent: "flex-end",
    width: 24,
  },
  homeRoof: {
    borderColor: colors.primarySoft,
    borderRightWidth: 4,
    borderTopWidth: 4,
    height: 16,
    position: "absolute",
    top: 1,
    transform: [{ rotate: "-45deg" }],
    width: 16,
  },
  homeBody: {
    backgroundColor: colors.primarySoft,
    borderRadius: 2,
    height: 11,
    width: 16,
  },
  navBusIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 4,
    height: 22,
    justifyContent: "space-between",
    padding: 4,
    width: 22,
  },
  navBusWindow: {
    backgroundColor: colors.primaryDark,
    borderRadius: 2,
    height: 7,
    width: 13,
  },
  navBusLights: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 14,
  },
  navBusLight: {
    backgroundColor: colors.primaryDark,
    borderRadius: 2,
    height: 4,
    width: 4,
  },
  assistIcon: {
    alignItems: "center",
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  assistIconVertical: {
    backgroundColor: colors.primarySoft,
    borderRadius: 2,
    height: 20,
    position: "absolute",
    width: 5,
  },
  assistIconHorizontal: {
    backgroundColor: colors.primarySoft,
    borderRadius: 2,
    height: 5,
    position: "absolute",
    width: 20,
  },
  profileIcon: {
    alignItems: "center",
    height: 22,
    justifyContent: "flex-end",
    width: 22,
  },
  profileIconHead: {
    backgroundColor: colors.primarySoft,
    borderRadius: 6,
    height: 11,
    marginBottom: 2,
    width: 11,
  },
  profileIconBody: {
    backgroundColor: colors.primarySoft,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    height: 8,
    width: 18,
  },
  tabSelectedText: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: "800",
  },
  tabUnavailableText: {
    color: "#95A9AE",
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
  },
  selectedTabButtonText: {
    color: colors.primary,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  disabledTabButtonText: {
    color: "#AFC1C5",
  },
  sectionHeader: {
    gap: 4,
  },
  eyebrow: {
    color: colors.primarySoft,
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  heading: {
    color: colors.text,
    fontSize: typography.sectionTitle,
    fontWeight: "800",
  },
  toggleRow: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: borders.default,
    gap: spacing.md,
    minHeight: 92,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  assistanceOption: {
    borderColor: colors.primary,
  },
  phoneOption: {
    borderColor: colors.metadata,
  },
  selectedToggleRow: {
    borderWidth: borders.selected,
  },
  selectedAssistanceOption: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.primary,
  },
  selectedPhoneOption: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.primary,
  },
  toggleHeaderRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 14,
  },
  optionVisualGroup: {
    alignItems: "center",
    gap: 8,
  },
  optionIcon: {
    alignItems: "center",
    backgroundColor: colors.lightSurface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: borders.default,
    height: touchTarget.comfortable,
    justifyContent: "center",
    width: touchTarget.comfortable,
  },
  assistanceIcon: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primarySoft,
  },
  phoneIcon: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryDark,
  },
  selectedOptionIcon: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionIconText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
  },
  optionIconImage: {
    height: 36,
    tintColor: colors.primary,
    width: 36,
  },
  selectedOptionIconImage: {
    tintColor: colors.primaryDark,
  },
  optionIconImageOriginal: {
    height: 36,
    width: 36,
  },
  boardingTimeIcon: {
    height: 38,
    position: "relative",
    width: 38,
  },
  boardingTimeClock: {
    borderRadius: 13,
    borderWidth: 4,
    height: 27,
    left: 1,
    position: "absolute",
    top: 2,
    width: 27,
  },
  boardingTimeHourHand: {
    borderRadius: 2,
    height: 10,
    left: 10,
    position: "absolute",
    top: 4,
    width: 4,
  },
  boardingTimeMinuteHand: {
    borderRadius: 2,
    height: 4,
    left: 11,
    position: "absolute",
    top: 12,
    width: 9,
  },
  boardingTimePlusHorizontal: {
    borderRadius: 2,
    height: 5,
    position: "absolute",
    right: 1,
    top: 27,
    width: 17,
  },
  boardingTimePlusVertical: {
    borderRadius: 2,
    height: 17,
    position: "absolute",
    right: 7,
    top: 21,
    width: 5,
  },
  selectedOptionIconText: {
    color: "#ffffff",
  },
  selectionIndicator: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 2,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  selectedSelectionIndicator: {
    backgroundColor: colors.highlight,
    borderColor: colors.highlight,
  },
  highContrastIndicator: {
    borderColor: "#ffffff",
    borderWidth: 3,
  },
  highContrastSelectedIndicator: {
    backgroundColor: "#000000",
    borderColor: colors.focusIndicator,
    borderWidth: 4,
  },
  highContrastControl: {
    backgroundColor: "#000000",
    borderColor: "#ffffff",
    borderWidth: 3,
  },
  highContrastSelectedControl: {
    backgroundColor: "#7BE8FF",
    borderColor: colors.focusIndicator,
    borderWidth: 4,
  },
  highContrastOptionIconImage: {
    tintColor: "#B8F7FF",
  },
  selectionIndicatorText: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 28,
  },
  selectionCheck: {
    height: 22,
    marginLeft: -2,
    marginTop: -2,
    position: "relative",
    width: 27,
  },
  selectionCheckShort: {
    backgroundColor: colors.primaryDark,
    borderRadius: 2,
    height: 4,
    left: 4,
    position: "absolute",
    top: 13,
    transform: [{ rotate: "45deg" }],
    width: 12,
  },
  selectionCheckLong: {
    backgroundColor: colors.primaryDark,
    borderRadius: 2,
    height: 4,
    left: 12,
    position: "absolute",
    top: 11,
    transform: [{ rotate: "-45deg" }],
    width: 18,
  },
  highContrastSelectionCheckMark: {
    backgroundColor: "#ffffff",
  },
  selectedSelectionIndicatorText: {
    color: colors.primaryDark,
  },
  toggleTextGroup: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  toggleText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
  selectionStatus: {
    color: colors.metadata,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 24,
  },
  selectedSelectionStatus: {
    color: colors.highlight,
  },
  selectionRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginLeft: 70,
    minHeight: 44,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: 10,
    minHeight: 60,
    justifyContent: "center",
    padding: spacing.lg,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: radius.md,
    borderWidth: borders.default,
    flexDirection: "row",
    gap: 10,
    minHeight: 60,
    justifyContent: "center",
    padding: spacing.lg,
  },
  disabledButton: {
    backgroundColor: colors.disabledBackground,
    borderColor: colors.disabledBorder,
  },
  attentionButton: {
    backgroundColor: colors.warning,
    borderColor: colors.textOnWarning,
    borderWidth: borders.default,
  },
  disabledButtonText: {
    color: colors.disabledText,
  },
  primaryButtonText: {
    color: colors.textOnPrimary,
    fontSize: 19,
    fontWeight: "800",
    textAlign: "center",
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "800",
    textAlign: "center",
  },
  buttonIcon: {
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 26,
  },
  primaryButtonIcon: {
    color: colors.textOnPrimary,
  },
  secondaryButtonIcon: {
    color: colors.primary,
  },
  busCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: borders.default,
    gap: 4,
    padding: spacing.lg,
  },
  iconTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  componentIconBadge: {
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.primary,
    borderRadius: 8,
    borderWidth: 2,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  componentIconText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: "900",
  },
  actionHintRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  actionHintIcon: {
    color: colors.highlight,
    fontSize: 19,
    fontWeight: "900",
  },
  stopSearchInputFrame: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 52,
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  stopSearchInput: {
    backgroundColor: "transparent",
    borderWidth: 0,
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 8,
  },
  largeStopSearchInput: {
    fontSize: 20,
    minHeight: 56,
  },
  stopSearchClearButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    minWidth: 48,
  },
  landmarkSearchResults: {
    gap: spacing.sm,
  },
  searchGroupLabel: {
    color: colors.metadata,
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  landmarkSearchResult: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: borders.default,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: touchTarget.comfortable,
    padding: spacing.md,
  },
  landmarkSearchTextGroup: {
    flex: 1,
    gap: 2,
  },
  mapListToggle: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 2,
    flexDirection: "row",
    gap: 6,
    padding: 6,
  },
  mapListToggleButton: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
  },
  selectedMapListToggleButton: {
    backgroundColor: colors.primary,
  },
  mapListToggleText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  selectedMapListToggleText: {
    color: colors.textOnPrimary,
  },
  mapFirstScreen: {
    borderRadius: 0,
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    position: "relative",
  },
  mapOverlayLayoutManager: {
    gap: mapTopControlGap,
    left: mapOverlayMargin,
    position: "absolute",
    right: mapOverlayMargin,
    top: mapOverlayMargin,
    zIndex: 12,
  },
  mapTopControlRow: {
    alignItems: "stretch",
    flexDirection: "row",
    gap: 8,
    minWidth: 0,
  },
  mapSearchOverlay: {
    flex: 1,
    minWidth: 0,
  },
  mapFirstSearchAreaControl: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 16,
  },
  mapBackButton: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    height: 52,
    justifyContent: "center",
    minHeight: 52,
    minWidth: 52,
    width: 52,
  },
  mapFirstTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 2,
  },
  mapFirstSubtitle: {
    color: colors.metadata,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
    marginBottom: 8,
  },
  mapSearchResultsOverlay: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 2,
    marginTop: 8,
    maxHeight: 260,
    padding: 10,
  },
  mapSideControls: {
    gap: 8,
    position: "absolute",
    right: mapOverlayMargin,
    top: 92,
    width: rightToolbarWidth,
    zIndex: 11,
  },
  mapOptionsScrim: {
    bottom: bottomNavigationHeight,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 13,
  },
  highContrastMapOptionsScrim: {
    backgroundColor: "rgba(0, 0, 0, 0.42)",
  },
  mapSideControlsExpanded: {
    top: 92,
  },
  mapCompassControl: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 2,
    height: 44,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
  },
  mapCompassText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 14,
  },
  mapSideControl: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.location,
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
    height: 58,
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: 4,
    paddingVertical: 5,
    width: rightToolbarWidth,
  },
  activeMapSideControl: {
    backgroundColor: "#0F4E5A",
    borderColor: colors.highlight,
  },
  disabledMapSideControl: {
    backgroundColor: colors.disabledBackground,
    borderColor: colors.disabledBorder,
  },
  mapSideControlText: {
    color: colors.text,
    fontSize: 9,
    fontWeight: "800",
    lineHeight: 12,
    textAlign: "center",
  },
  mapMorePanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    bottom: bottomNavigationHeight + 10,
    left: 14,
    maxHeight: "64%",
    padding: 10,
    position: "absolute",
    right: rightToolbarWidth + mapOverlayMargin + 8,
    zIndex: 14,
  },
  mapMoreScroll: {
    flexGrow: 0,
  },
  mapMoreContent: {
    gap: 5,
    paddingBottom: 4,
  },
  mapMoreHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 36,
  },
  mapMoreCloseButton: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  mapMoreTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 20,
    paddingHorizontal: 4,
  },
  mapMoreSectionTitle: {
    color: colors.metadata,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 13,
    paddingHorizontal: 4,
    paddingTop: 3,
  },
  mapMoreDivider: {
    height: 1,
    marginVertical: 4,
    opacity: 0.7,
  },
  mapMoreRow: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 0,
    flexDirection: "row",
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  activeMapMoreRow: {
    backgroundColor: "#0F4E5A",
  },
  disabledMapMoreControl: {
    backgroundColor: "rgba(127, 140, 145, 0.12)",
  },
  mapMoreLabelGroup: {
    flex: 1,
    minWidth: 0,
  },
  mapMoreControlText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 16,
  },
  mapMoreReasonText: {
    color: colors.metadata,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 14,
  },
  mapMoreStateText: {
    color: colors.metadata,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 18,
    minWidth: 22,
    textAlign: "right",
  },
  mapMoreSwitch: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 28,
    minWidth: 48,
    paddingHorizontal: 8,
  },
  mapMoreSwitchOn: {
    backgroundColor: colors.highlight,
  },
  mapMoreSwitchDisabled: {
    opacity: 0.82,
  },
  mapMoreSwitchText: {
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 13,
  },
  accessibilityMapNotice: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    alignSelf: "stretch",
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  accessibilityMapNoticeText: {
    color: colors.text,
    flex: 1,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
  },
  mapBottomSheet: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    bottom: bottomNavigationHeight,
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 10,
  },
  mapBottomSheetCollapsed: {
    maxHeight: mapBottomSheetHeights.COLLAPSED,
    minHeight: 92,
  },
  mapBottomSheetHiddenPeek: {
    maxHeight: mapBottomSheetHeights.HIDDEN_PEEK + 4,
    minHeight: mapBottomSheetHeights.HIDDEN_PEEK,
  },
  mapBottomSheetContentFit: {
    maxHeight: 248,
    minHeight: 0,
  },
  mapBottomSheetMedium: {
    maxHeight: mapBottomSheetHeights.MEDIUM,
    minHeight: 250,
  },
  mapBottomSheetExpanded: {
    maxHeight: mapBottomSheetHeights.EXPANDED,
    minHeight: 430,
  },
  mapBottomSheetHeader: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
    paddingBottom: 7,
    paddingHorizontal: 18,
    paddingTop: 7,
  },
  sheetHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 24,
  },
  sheetPeekLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18,
  },
  mapBottomSheetScroll: {
    flexGrow: 0,
  },
  mapBottomSheetContent: {
    gap: 10,
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  mapBottomSheetCompactContent: {
    paddingBottom: 20,
  },
  mapBottomSheetTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22,
  },
  largeMapBottomSheetTitle: {
    fontSize: 20,
    lineHeight: 26,
  },
  nearbyStatePanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  nearbyStateTextAction: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 4,
  },
  nearbyStateTitleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  nearbyInfoStatePanel: {
    backgroundColor: "rgba(81, 207, 232, 0.12)",
    borderColor: colors.focusIndicator,
  },
  nearbyErrorStatePanel: {
    backgroundColor: "rgba(239, 133, 133, 0.12)",
    borderColor: colors.error,
  },
  stopMapPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 2,
    padding: 12,
  },
  mapFirstPanel: {
    borderRadius: 8,
    height: "100%",
    padding: 0,
  },
  locationWarning: {
    backgroundColor: "rgba(245, 198, 90, 0.18)",
    borderColor: colors.warning,
    borderRadius: 8,
    borderWidth: 1,
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  locationWarningTitle: {
    color: colors.warning,
    fontSize: 16,
    fontWeight: "900",
  },
  mapMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
    marginBottom: 8,
  },
  mapMetaText: {
    color: colors.metadata,
    fontSize: 13,
    fontWeight: "800",
  },
  mapCanvas: {
    backgroundColor: "#DCE9E7",
    borderColor: "#8BA7AA",
    borderRadius: 8,
    borderWidth: 2,
    height: 370,
    overflow: "hidden",
    position: "relative",
  },
  mapFirstCanvas: {
    borderRadius: 8,
    height: 720,
  },
  mapCanvasMoved: {
    borderColor: colors.highlight,
  },
  mapTileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    height: "100%",
    width: "100%",
  },
  mapTileCell: {
    borderColor: "rgba(65, 98, 101, 0.18)",
    borderRightWidth: 0.5,
    borderTopWidth: 0.5,
    height: "33.3333%",
    opacity: 0.24,
    width: "25%",
  },
  mapLandPatch: {
    borderRadius: 10,
    height: "100%",
    left: 0,
    opacity: 0.72,
    position: "absolute",
    top: 0,
    width: "100%",
  },
  mapBuildingPatch: {
    borderRadius: 6,
    height: "18%",
    left: "58%",
    opacity: 0.68,
    position: "absolute",
    top: "18%",
    transform: [{ rotate: "9deg" }],
    width: "24%",
  },
  mapParkPatch: {
    backgroundColor: "#BFDCC8",
    borderRadius: 8,
    height: "36%",
    left: "4%",
    position: "absolute",
    top: "7%",
    transform: [{ rotate: "-8deg" }],
    width: "42%",
    opacity: 0.62,
  },
  mapWaterPatch: {
    backgroundColor: "#B7DDE8",
    borderRadius: 8,
    bottom: "7%",
    height: "20%",
    position: "absolute",
    right: "-5%",
    transform: [{ rotate: "12deg" }],
    width: "40%",
    opacity: 0.62,
  },
  mapRoadMajor: {
    backgroundColor: "#FFFFFF",
    borderColor: "#B3BEC0",
    borderWidth: 2,
    height: 34,
    left: "-12%",
    position: "absolute",
    top: "48%",
    transform: [{ rotate: "-11deg" }],
    width: "126%",
  },
  mapRoadMinorOne: {
    backgroundColor: "#F8FAFA",
    borderColor: "#CAD4D6",
    borderWidth: 1,
    height: 22,
    left: "34%",
    position: "absolute",
    top: "-8%",
    transform: [{ rotate: "20deg" }],
    width: "9%",
  },
  mapRoadMinorTwo: {
    backgroundColor: "#F8FAFA",
    borderColor: "#CAD4D6",
    borderWidth: 1,
    height: 20,
    left: "0%",
    position: "absolute",
    top: "72%",
    transform: [{ rotate: "16deg" }],
    width: "70%",
  },
  mapRoadLabel: {
    color: "#385258",
    fontSize: 10,
    fontWeight: "500",
    left: "34%",
    position: "absolute",
    top: "42%",
    transform: [{ rotate: "-11deg" }],
  },
  accuracyRadius: {
    backgroundColor: "rgba(141, 214, 232, 0.10)",
    borderColor: "rgba(141, 214, 232, 0.18)",
    borderRadius: 54,
    borderWidth: 1,
    height: 108,
    left: "50%",
    marginLeft: -54,
    marginTop: -54,
    position: "absolute",
    top: "50%",
    width: 108,
  },
  largeAccuracyRadius: {
    borderWidth: 2,
  },
  highContrastAccuracyRadius: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderColor: "#000000",
  },
  currentLocationMarker: {
    alignItems: "center",
    backgroundColor: "transparent",
    height: 42,
    justifyContent: "center",
    left: "50%",
    marginLeft: -21,
    marginTop: -21,
    position: "absolute",
    top: "50%",
    width: 42,
    zIndex: 5,
  },
  headingCone: {
    borderBottomColor: colors.location,
    borderBottomWidth: 16,
    borderLeftColor: "transparent",
    borderLeftWidth: 8,
    borderRightColor: "transparent",
    borderRightWidth: 8,
    height: 0,
    opacity: 0,
    position: "absolute",
    top: -10,
    width: 0,
  },
  highContrastCurrentLocationMarker: {
    borderColor: "#000000",
  },
  currentLocationDot: {
    backgroundColor: colors.location,
    borderColor: colors.text,
    borderRadius: 8,
    borderWidth: 2,
    height: 16,
    width: 16,
  },
  currentLocationText: {
    color: colors.location,
    borderRadius: 4,
    borderWidth: 1,
    fontSize: 10,
    fontWeight: "900",
    marginTop: 2,
    overflow: "hidden",
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  serviceBusMarker: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderColor: colors.textOnPrimary,
    borderRadius: 18,
    borderWidth: 2,
    height: 36,
    justifyContent: "center",
    marginLeft: 14,
    marginTop: 18,
    position: "absolute",
    width: 36,
    zIndex: 4,
  },
  mapStopMarker: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: 8,
    borderWidth: 0,
    height: 48,
    justifyContent: "center",
    marginLeft: -24,
    marginTop: -24,
    minHeight: 48,
    minWidth: 48,
    position: "absolute",
    width: 48,
  },
  clusteredMapStopMarker: {
    transform: [{ translateX: 10 }, { translateY: -10 }],
  },
  nearestMapStopMarker: {
    zIndex: 3,
  },
  dimmedMapStopMarker: {
    opacity: 0.65,
  },
  selectedMapStopMarker: {
    backgroundColor: "rgba(134, 197, 218, 0.14)",
    borderColor: colors.primary,
    borderWidth: 2,
    borderRadius: 28,
    height: 56,
    marginLeft: -28,
    marginTop: -28,
    width: 56,
    zIndex: 2,
  },
  highContrastMapStopMarker: {
    backgroundColor: "#FFFFFF",
    borderColor: "#000000",
  },
  highContrastSelectedMapStopMarker: {
    backgroundColor: "#FFFF00",
    borderColor: "#000000",
  },
  mapStopMarkerText: {
    color: colors.textOnPrimary,
    fontSize: 24,
    fontWeight: "900",
  },
  selectedMapStopMarkerText: {
    fontSize: 26,
  },
  busStopGlyph: {
    alignItems: "center",
    justifyContent: "center",
  },
  busStopGlyphBody: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: 5,
    borderWidth: 2,
    height: 22,
    justifyContent: "space-around",
    paddingVertical: 3,
    width: 26,
  },
  nearestBusStopGlyphBody: {
    borderColor: colors.location,
  },
  selectedBusStopGlyphBody: {
    backgroundColor: colors.primary,
    borderColor: colors.textOnPrimary,
    height: 28,
    width: 34,
  },
  busStopGlyphWindow: {
    backgroundColor: colors.primary,
    borderRadius: 2,
    height: 8,
    width: 17,
  },
  selectedBusStopGlyphWindow: {
    backgroundColor: colors.textOnPrimary,
    width: 21,
  },
  busStopGlyphWheels: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 17,
  },
  busStopGlyphWheel: {
    backgroundColor: colors.primary,
    borderRadius: 3,
    height: 5,
    width: 5,
  },
  selectedBusStopGlyphWheel: {
    backgroundColor: colors.textOnPrimary,
  },
  busStopGlyphPointer: {
    borderLeftColor: "transparent",
    borderLeftWidth: 5,
    borderRightColor: "transparent",
    borderRightWidth: 5,
    borderTopColor: colors.primary,
    borderTopWidth: 7,
    height: 0,
    marginTop: -1,
    width: 0,
  },
  selectedBusStopGlyphPointer: {
    borderTopColor: colors.textOnPrimary,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
  },
  nearestBusStopGlyphWindow: {
    backgroundColor: colors.location,
  },
  nearestBusStopGlyphWheel: {
    backgroundColor: colors.location,
  },
  nearestBusStopGlyphPointer: {
    borderTopColor: colors.location,
  },
  nearestStopLabel: {
    backgroundColor: colors.surface,
    borderColor: colors.location,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.location,
    fontSize: 9,
    fontWeight: "900",
    paddingHorizontal: 4,
    position: "absolute",
    top: 36,
  },
  stopClusterMarker: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: radius.md,
    borderWidth: borders.default,
    height: 48,
    justifyContent: "center",
    marginLeft: -24,
    marginTop: -24,
    minHeight: 48,
    minWidth: 48,
    position: "absolute",
    width: 48,
    zIndex: 4,
  },
  stopClusterCount: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 21,
  },
  stopClusterLabel: {
    color: colors.metadata,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 12,
  },
  selectedStopRoute: {
    backgroundColor: colors.warning,
    borderRadius: 999,
    borderWidth: 2,
    height: 8,
    marginLeft: -55,
    marginTop: -2,
    opacity: 0.95,
    position: "absolute",
    transform: [{ rotate: "-35deg" }],
    width: 110,
    zIndex: 1,
  },
  activeWalkingRoute: {
    backgroundColor: colors.location,
    height: 9,
    opacity: 1,
    width: 126,
  },
  selectedStopRouteText: {
    color: colors.textOnWarning,
    fontSize: 10,
    fontWeight: "900",
    left: 36,
    position: "absolute",
    top: -16,
    transform: [{ rotate: "35deg" }],
  },
  highContrastSelectedStopRoute: {
    backgroundColor: "#FFFF00",
    height: 5,
    opacity: 1,
  },
  routeArrow: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderColor: colors.textOnPrimary,
    borderRadius: 14,
    borderWidth: 2,
    height: 28,
    justifyContent: "center",
    marginLeft: -2,
    marginTop: -34,
    position: "absolute",
    transform: [{ rotate: "-35deg" }],
    width: 28,
    zIndex: 3,
  },
  routeArrowText: {
    color: colors.textOnPrimary,
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 26,
  },
  highContrastRouteArrow: {
    backgroundColor: "#FFFF00",
    borderColor: "#000000",
  },
  landmarkMarker: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 1,
    marginLeft: -28,
    marginTop: -12,
    minWidth: 56,
    opacity: 0.72,
    paddingHorizontal: 4,
    paddingVertical: 2,
    position: "absolute",
    zIndex: 2,
  },
  destinationLandmarkMarker: {
    borderColor: colors.assistance,
    borderWidth: 2,
    opacity: 0.92,
  },
  landmarkIconText: {
    color: colors.metadata,
    fontSize: 12,
    fontWeight: "900",
  },
  landmarkLabel: {
    color: colors.metadata,
    fontSize: 8,
    fontWeight: "800",
    textAlign: "center",
  },
  destinationLandmarkLabel: {
    color: colors.text,
  },
  mapStopMarkerLabel: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: 6,
    borderWidth: 1,
    color: colors.text,
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 4,
    position: "absolute",
    top: 50,
  },
  recenterControl: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.location,
    borderRadius: 8,
    borderWidth: 3,
    bottom: 14,
    height: 54,
    justifyContent: "center",
    position: "absolute",
    right: 14,
    width: 54,
  },
  recenterControlText: {
    color: colors.location,
    fontSize: 30,
    fontWeight: "900",
  },
  recenterGlyph: {
    alignItems: "center",
    borderColor: colors.location,
    borderRadius: 14,
    borderWidth: 3,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  recenterGlyphDot: {
    backgroundColor: colors.location,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  showRouteControl: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.location,
    borderRadius: 8,
    borderWidth: 3,
    bottom: 76,
    height: 46,
    justifyContent: "center",
    position: "absolute",
    right: 14,
    width: 70,
  },
  followControl: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: 8,
    borderWidth: 2,
    bottom: 130,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 8,
    position: "absolute",
    right: 14,
    width: 86,
  },
  activeFollowControl: {
    backgroundColor: colors.primary,
  },
  searchAreaControl: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.surface,
    borderColor: colors.warning,
    borderRadius: 8,
    borderWidth: 2,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 10,
    position: "absolute",
    top: 12,
  },
  mapControlText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },
  mapControlGroup: {
    gap: 8,
    position: "absolute",
    right: 12,
    top: 12,
  },
  layerControlGroup: {
    bottom: 46,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    left: 12,
    maxWidth: "72%",
    position: "absolute",
  },
  layerControl: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 2,
    flexDirection: "row",
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  activeLayerControl: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  layerControlText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "900",
  },
  activeLayerControlText: {
    color: colors.primaryDark,
  },
  mapScale: {
    alignItems: "center",
    bottom: 16,
    left: 16,
    position: "absolute",
  },
  mapScaleLine: {
    backgroundColor: colors.metadata,
    height: 3,
    width: 46,
  },
  mapScaleText: {
    color: colors.metadata,
    fontSize: 10,
    fontWeight: "800",
  },
  nearbyStopsList: {
    gap: 10,
  },
  selectedStopSheet: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.highlight,
    borderRadius: radius.md,
    borderWidth: borders.selected,
    gap: spacing.md,
    padding: spacing.lg,
  },
  directionsSummary: {
    backgroundColor: colors.surface,
    borderColor: colors.location,
    borderRadius: radius.md,
    borderWidth: 2,
    gap: spacing.sm,
    padding: spacing.md,
  },
  sheetHandle: {
    alignSelf: "center",
    backgroundColor: colors.border,
    borderRadius: 2,
    height: 4,
    width: 88,
  },
  arrivalCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: borders.default,
    gap: spacing.md,
    padding: spacing.lg,
  },
  arrivalTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  serviceNumberGroup: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  serviceIcon: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: "900",
  },
  serviceNumber: {
    color: colors.primary,
    fontSize: 48,
    fontWeight: "900",
  },
  etaBlock: {
    alignItems: "center",
    backgroundColor: colors.warning,
    borderColor: colors.textOnWarning,
    borderRadius: 8,
    borderWidth: 2,
    minWidth: 82,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  etaNumber: {
    color: colors.textOnWarning,
    fontSize: 32,
    fontWeight: "900",
  },
  etaLabel: {
    color: colors.textOnWarning,
    fontSize: 13,
    fontWeight: "900",
  },
  destinationText: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 28,
  },
  infoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  infoPill: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  serviceChip: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.primary,
    color: colors.primary,
  },
  stopSheetSection: {
    gap: spacing.sm,
  },
  stopServiceChip: {
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: touchTarget.min,
    paddingHorizontal: 12,
  },
  selectedStopServiceChip: {
    backgroundColor: colors.primaryDark,
    borderWidth: 3,
  },
  stopServiceChipText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 20,
  },
  servicePreviewPanel: {
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  serviceUnavailableBlock: {
    gap: spacing.sm,
  },
  accessibleChip: {
    backgroundColor: colors.accessible,
    borderColor: colors.accessible,
    color: colors.textOnAccessible,
  },
  selectHint: {
    color: colors.highlight,
    fontSize: 16,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  chooseStopHint: {
    color: colors.highlight,
    fontSize: 17,
    fontWeight: "900",
  },
  selectedCard: {
    borderColor: colors.highlight,
    borderWidth: 4,
  },
  busTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
  },
  bodyText: {
    color: colors.body,
    fontSize: 17,
    lineHeight: 24,
  },
  summaryRow: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  summaryLabel: {
    color: colors.metadata,
    fontSize: 15,
    fontWeight: "700",
  },
  summaryValue: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "700",
    lineHeight: 26,
  },
  inputGroup: {
    gap: 6,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 2,
    color: colors.text,
    fontSize: 18,
    minHeight: 56,
    paddingHorizontal: 14,
  },
  methodPicker: {
    flexDirection: "row",
    gap: 8,
  },
  methodButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 2,
    flex: 1,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  selectedMethodButton: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  methodButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  selectedMethodButtonText: {
    color: "#ffffff",
  },
  statusPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryDark,
    borderRadius: 8,
    borderWidth: 3,
    gap: 8,
    padding: 18,
  },
  journeyAlertPanel: {
    backgroundColor: colors.warning,
    borderColor: colors.textOnWarning,
  },
  statusLabel: {
    color: colors.metadata,
    fontSize: 16,
    fontWeight: "700",
  },
  statusValue: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
  },
  confirmationText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 25,
  },
  eventRow: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  eventStatus: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  errorText: {
    color: colors.error,
    fontSize: 18,
    fontWeight: "700",
  },
  errorTitle: {
    color: colors.error,
    fontSize: 22,
    fontWeight: "900",
  },
  feedbackPanel: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  errorPanel: {
    backgroundColor: "rgba(239, 133, 133, 0.16)",
    borderColor: colors.danger,
    borderRadius: radius.md,
    borderWidth: 2,
    gap: spacing.md,
    padding: spacing.lg,
  },
  visualAlert: {
    backgroundColor: colors.assistance,
    borderColor: colors.textOnAssistance,
    borderRadius: 8,
    borderWidth: 3,
    gap: 6,
    padding: 16,
  },
  statusToast: {
    alignItems: "center",
    alignSelf: "center",
    borderRadius: 10,
    borderWidth: 1.5,
    flexDirection: "row",
    gap: 10,
    left: 18,
    maxWidth: 380,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 10,
    position: "absolute",
    right: 18,
    top: 78,
    zIndex: 30,
  },
  statusToastText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 20,
  },
  largeStatusToastText: {
    fontSize: 19,
    lineHeight: 24,
  },
  highContrastLightToast: {
    backgroundColor: "#FFFFFF",
    borderColor: "#000000",
    borderWidth: 2,
  },
  highContrastDarkToast: {
    backgroundColor: "#050505",
    borderColor: "#FFFFFF",
    borderWidth: 2,
  },
  visualAlertTitle: {
    color: colors.textOnAssistance,
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 30,
  },
  highContrastAlert: {
    backgroundColor: "#000000",
    borderColor: "#ffffff",
  },
  highContrastText: {
    color: "#ffffff",
  },
  highContrastMutedText: {
    color: colors.muted,
  },
  largeBody: {
    fontSize: 21,
    lineHeight: 29,
  },
  attentionButtonText: {
    color: colors.text,
  },
  onboardHero: {
    backgroundColor: colors.primaryDark,
    borderRadius: 8,
    gap: 6,
    padding: 20,
  },
  onboardEyebrow: {
    color: colors.highlight,
    fontSize: 18,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  onboardBus: {
    color: "#ffffff",
    fontSize: 42,
    fontWeight: "900",
  },
  onboardDestination: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 28,
  },
  priorityPanel: {
    backgroundColor: colors.accessible,
    borderColor: colors.textOnAccessible,
    borderRadius: 8,
    borderWidth: 3,
    gap: 8,
    padding: 18,
  },
  onboardMapPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 2,
    gap: 12,
    padding: 14,
    position: "relative",
  },
  mapPanelHeader: {
    gap: 4,
  },
  onboardMapControls: {
    gap: 8,
  },
  onboardCompassControl: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 2,
    height: 52,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 48,
    width: 52,
  },
  onboardMorePanel: {
    backgroundColor: colors.lightSurface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 2,
    gap: 8,
    padding: 10,
  },
  returnJourneyBanner: {
    alignItems: "center",
    backgroundColor: "rgba(79, 214, 198, 0.14)",
    borderColor: colors.primary,
    borderRadius: 8,
    borderWidth: 2,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  journeyProgressBar: {
    flexDirection: "row",
    gap: 5,
    minHeight: 12,
  },
  journeyProgressCell: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderColor: colors.border,
    borderRadius: 4,
    borderWidth: 1,
    flex: 1,
    height: 12,
  },
  journeyProgressCellDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  journeyProgressCellDestination: {
    backgroundColor: colors.location,
    borderColor: colors.location,
  },
  journeyProgressCellMuted: {
    opacity: 0.42,
  },
  onboardMapCanvas: {
    gap: 8,
  },
  journeyBusMarker: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.primaryDark,
    borderColor: colors.primary,
    borderRadius: 8,
    borderWidth: 2,
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  journeyBusMarkerText: {
    color: colors.textOnPrimary,
    fontSize: 17,
    fontWeight: "900",
  },
  journeyMapStopRow: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: 8,
    borderWidth: 2,
    flexDirection: "row",
    gap: 12,
    minHeight: 58,
    padding: 8,
  },
  journeyMapStopRowSelected: {
    backgroundColor: "rgba(79, 214, 198, 0.12)",
    borderColor: colors.primary,
  },
  journeyMapRail: {
    alignItems: "center",
    alignSelf: "stretch",
    justifyContent: "center",
    width: 34,
  },
  journeyMapLine: {
    backgroundColor: colors.border,
    bottom: -18,
    position: "absolute",
    top: -18,
    width: 4,
  },
  journeyMapLineCompleted: {
    backgroundColor: colors.primary,
  },
  journeyMapLineAfterDestination: {
    opacity: 0.34,
  },
  journeyMapStopMarker: {
    alignItems: "center",
    backgroundColor: colors.lightSurface,
    borderColor: colors.border,
    borderRadius: 17,
    borderWidth: 2,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  journeyMapStopMarkerPassed: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  journeyMapStopMarkerCurrent: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primary,
  },
  journeyMapStopMarkerNext: {
    borderColor: colors.warning,
    borderWidth: 3,
  },
  journeyMapStopMarkerDestination: {
    backgroundColor: colors.location,
    borderColor: colors.location,
  },
  journeyMapStopMarkerMuted: {
    opacity: 0.44,
  },
  journeyMapStopText: {
    flex: 1,
    gap: 2,
  },
  journeyMapPreviewCard: {
    backgroundColor: colors.lightSurface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 2,
    gap: 8,
    padding: 14,
  },
  routeProgressRow: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    padding: 10,
  },
  passedRouteProgressRow: {
    opacity: 0.62,
  },
  currentRouteProgressRow: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  destinationRouteProgressRow: {
    borderColor: colors.location,
    borderWidth: 2,
  },
  routeProgressMarker: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    minWidth: 28,
    textAlign: "center",
  },
  routeProgressTextGroup: {
    flex: 1,
    gap: 2,
  },
});

const lightStyles = StyleSheet.create({
  safeArea: {
    backgroundColor: lightTheme.background,
  },
  highContrastSafeArea: {
    backgroundColor: "#FFFFFF",
  },
  surface: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.border,
  },
  componentIconBadge: {
    backgroundColor: lightTheme.surfaceSecondary,
    borderColor: lightTheme.primary,
  },
  componentIconText: {
    color: lightTheme.primary,
  },
  selectedCard: {
    backgroundColor: lightTheme.surfaceSecondary,
    borderColor: lightTheme.primary,
  },
  infoPill: {
    backgroundColor: lightTheme.surfaceSecondary,
    borderColor: lightTheme.border,
    color: lightTheme.text,
  },
  serviceChip: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.primary,
    color: lightTheme.primary,
  },
  accessibleChip: {
    backgroundColor: lightTheme.accessible,
    borderColor: lightTheme.accessible,
    color: lightTheme.textOnAccessible,
  },
  themeSwitchCard: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.border,
  },
  defaultsIconChip: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.assistance,
  },
  createProfilePanel: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.border,
  },
  modeLabel: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.border,
  },
  selectedModeLabel: {
    backgroundColor: lightTheme.surfaceSecondary,
    borderColor: lightTheme.primary,
  },
  selectedModeLabelText: {
    color: "#082E35",
  },
  journeyProgressCell: {
    backgroundColor: lightTheme.surfaceSecondary,
    borderColor: lightTheme.border,
  },
  journeyBusMarker: {
    backgroundColor: lightTheme.primaryStrong,
    borderColor: lightTheme.primary,
  },
  modeIcon: {
    backgroundColor: lightTheme.surfaceSecondary,
    borderColor: lightTheme.primary,
  },
  selectedSunIcon: {
    backgroundColor: "#FFF3CF",
    borderColor: lightTheme.warning,
  },
  moonCutout: {
    backgroundColor: lightTheme.surfaceSecondary,
  },
  highContrastIndicator: {
    backgroundColor: "#FFFFFF",
    borderColor: "#000000",
    borderWidth: 3,
  },
  highContrastControl: {
    backgroundColor: "#FFFFFF",
    borderColor: "#000000",
    borderWidth: 2,
  },
  highContrastSelectedControl: {
    backgroundColor: "#074B6A",
    borderColor: "#000000",
    borderWidth: 4,
  },
  highContrastOptionIconImage: {
    tintColor: "#074B6A",
  },
  highContrastDefaultsIconChip: {
    borderColor: "#074B6A",
  },
  highContrastDefaultsIconImage: {
    tintColor: "#074B6A",
  },
  highContrastSwitchTrack: {
    backgroundColor: "#FFFFFF",
    borderColor: "#000000",
    borderWidth: 4,
  },
  visualAlert: {
    backgroundColor: "#EFEAFB",
    borderColor: lightTheme.assistance,
  },
  textInput: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.border,
    color: lightTheme.text,
  },
  textInputField: {
    color: lightTheme.text,
  },
  landmarkSearchResult: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.border,
  },
  nearbyStatePanel: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.border,
  },
  layerControl: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.border,
  },
  activeLayerControl: {
    backgroundColor: "#D7E2E5",
    borderColor: lightTheme.primary,
  },
  activeLayerControlText: {
    color: lightTheme.primaryStrong,
  },
  mapListToggle: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.border,
  },
  mapListToggleButton: {
    backgroundColor: lightTheme.surface,
  },
  selectedMapListToggleButton: {
    backgroundColor: lightTheme.primary,
  },
  selectedMapListToggleText: {
    color: lightTheme.textOnPrimary,
  },
  mapBottomSheet: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.border,
  },
  mapSideControl: {
    backgroundColor: "#FFFFFF",
    borderColor: lightTheme.location,
  },
  mapBackButton: {
    backgroundColor: "#FFFFFF",
    borderColor: lightTheme.border,
  },
  activeMapSideControl: {
    backgroundColor: lightTheme.primary,
    borderColor: lightTheme.primary,
  },
  stopMapPanel: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.border,
  },
  locationWarning: {
    backgroundColor: "#FFF3CF",
    borderColor: lightTheme.warning,
  },
  selectedStopSheet: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.primary,
  },
  directionsSummary: {
    backgroundColor: lightTheme.surfaceSecondary,
    borderColor: lightTheme.location,
  },
  recenterControl: {
    backgroundColor: "#FFFFFF",
    borderColor: lightTheme.location,
  },
  mapStopMarker: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  selectedMapStopMarker: {
    backgroundColor: "rgba(11, 102, 112, 0.16)",
    borderColor: lightTheme.primary,
  },
  nearestBusStopGlyphBody: {
    borderColor: lightTheme.location,
  },
  nearestBusStopGlyphWindow: {
    backgroundColor: lightTheme.location,
  },
  nearestBusStopGlyphWheel: {
    backgroundColor: lightTheme.location,
  },
  nearestBusStopGlyphPointer: {
    borderTopColor: lightTheme.location,
  },
  mapStopMarkerText: {
    color: lightTheme.primary,
  },
  selectedMapStopMarkerText: {
    color: lightTheme.textOnPrimary,
  },
  selectedBusStopGlyphBody: {
    borderColor: lightTheme.textOnPrimary,
  },
  selectedBusStopGlyphWindow: {
    backgroundColor: lightTheme.textOnPrimary,
  },
  selectedBusStopGlyphWheel: {
    backgroundColor: lightTheme.textOnPrimary,
  },
  selectedBusStopGlyphPointer: {
    borderTopColor: lightTheme.textOnPrimary,
  },
  selectedStopRoute: {
    backgroundColor: lightTheme.warning,
  },
  routeArrow: {
    backgroundColor: lightTheme.primary,
    borderColor: lightTheme.textOnPrimary,
  },
  serviceBusMarker: {
    backgroundColor: lightTheme.primary,
    borderColor: lightTheme.textOnPrimary,
  },
  headingCone: {
    borderBottomColor: lightTheme.location,
  },
  landmarkMarker: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.border,
  },
  destinationLandmarkMarker: {
    borderColor: lightTheme.assistance,
  },
  landmarkText: {
    color: lightTheme.textSecondary,
  },
  landmarkLabel: {
    color: lightTheme.textSecondary,
  },
  mapScale: {
    backgroundColor: "transparent",
  },
  mapScaleLine: {
    backgroundColor: lightTheme.textSecondary,
  },
  nearestStopLabel: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.location,
    color: lightTheme.textOnLocation,
  },
  stopClusterMarker: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.primary,
  },
  stopClusterCount: {
    color: lightTheme.primary,
  },
  stopClusterLabel: {
    color: lightTheme.textSecondary,
  },
  mapStopMarkerLabel: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.primary,
    color: lightTheme.text,
  },
  primaryButton: {
    backgroundColor: lightTheme.primary,
    borderColor: lightTheme.primary,
  },
  primaryButtonText: {
    color: "#FFFFFF",
  },
  secondaryButton: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.primary,
  },
  secondaryButtonText: {
    color: lightTheme.primary,
  },
  tabBar: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.border,
  },
  tabButton: {
    backgroundColor: "transparent",
  },
  selectedTabButton: {
    backgroundColor: "transparent",
    borderBottomColor: lightTheme.primary,
  },
  disabledTabButton: {
    backgroundColor: "transparent",
  },
  tabIconBadge: {
    backgroundColor: "transparent",
  },
  selectedTabIconBadge: {
    backgroundColor: "#D7E8EC",
    borderColor: lightTheme.primary,
  },
  tabStatusDot: {
    backgroundColor: "#2F7D45",
    borderColor: lightTheme.surface,
  },
  disabledTabIconBadge: {
    backgroundColor: "transparent",
  },
  tabButtonText: {
    color: lightTheme.text,
  },
  selectedTabButtonText: {
    color: lightTheme.primaryStrong,
  },
  disabledTabButtonText: {
    color: lightTheme.textSecondary,
  },
  tabSelectedText: {
    color: lightTheme.primaryStrong,
  },
  tabUnavailableText: {
    color: lightTheme.textSecondary,
  },
  toggleRow: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.border,
  },
  selectedToggleRow: {
    backgroundColor: "#D7E2E5",
    borderColor: "#7E969C",
  },
  optionIcon: {
    backgroundColor: lightTheme.surfaceSecondary,
    borderColor: lightTheme.border,
  },
  selectedOptionIcon: {
    backgroundColor: "#D7E2E5",
    borderColor: "#0B6670",
  },
  selectedOptionIconImage: {
    tintColor: "#0B6670",
  },
  selectionIndicator: {
    borderColor: lightTheme.border,
  },
  selectedSelectionIndicator: {
    backgroundColor: lightTheme.primary,
    borderColor: lightTheme.primary,
  },
  selectionCheckMark: {
    backgroundColor: "#FFFFFF",
  },
  text: {
    color: lightTheme.text,
  },
  highContrastText: {
    color: "#000000",
  },
  bodyText: {
    color: lightTheme.text,
  },
  highContrastMutedText: {
    color: "#111111",
  },
  mutedText: {
    color: lightTheme.textSecondary,
  },
  eyebrow: {
    color: lightTheme.primary,
  },
  selectedOptionIconText: {
    color: lightTheme.primaryStrong,
  },
  selectedSelectionIndicatorText: {
    color: "#FFFFFF",
  },
  selectedSelectionStatus: {
    color: lightTheme.primary,
  },
});
