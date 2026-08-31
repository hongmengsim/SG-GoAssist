import React, {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Keyboard,
  Linking,
  Modal,
  type LayoutChangeEvent,
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Accessibility,
  AudioLines,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bell,
  BellRing,
  BusFront,
  Captions,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  CircleCheck,
  CircleHelp,
  CircleQuestionMark,
  CircleX,
  Clock,
  Compass,
  Contrast,
  DoorOpen,
  Ear,
  Eye,
  Footprints,
  Gauge,
  Languages,
  List,
  LocateFixed,
  Map as MapIcon,
  MapPinned,
  MapPin,
  MapPinCheck,
  MessageSquareText,
  Mountain,
  Moon as MoonGlyph,
  Navigation,
  RefreshCw,
  Route,
  ScanText,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sun as SunGlyph,
  Type,
  Timer,
  Touchpad,
  Undo2,
  User,
  Vibrate,
  Volume2,
  type LucideIcon,
} from "lucide-react-native";
import type {
  AccessibilityPreferences,
  AccessibilityRequirements,
  AccessibilityTextSize,
  AutonomousDriveState,
  VibrationAlertMode,
  AssistancePhase,
  AssistanceCaseState,
  AssistanceType,
  Bus,
  ArrivalBus,
  BusArrivalService,
  BusServiceRouteOption,
  BusStop,
  BusStopArrivalsResponse,
  BusStopServiceRoutesResponse,
  JourneyPhase,
  NearbyBusStop,
  NearbyBusStopsResponse,
  PassengerProfile,
  RouteStop,
  StatusUpdateMessage,
  VerificationMethod,
  VehicleStatus,
} from "@buspass/shared";
import {
  AssistanceRequestStatus,
  assistanceTypesForPhase,
  canTransitionAssistanceRequestStatus,
  canTransitionVehicleStatus,
} from "@buspass/shared";
import {
  BusStopRequestError,
  cancelAssistanceRequest,
  createAssistanceRequest,
  fetchBusStop,
  fetchBusStopArrivals,
  fetchBusStopServiceRoutes,
  fetchRegionalBusStops,
  findNearbyBusStops,
  requestPassengerOperatorHelp,
  searchBusStops,
} from "./src/api/assistanceApi";
import { subscribeToRequestStatus } from "./src/api/statusSocket";
import { FeatureIllustration } from "./src/components/FeatureIllustration";
import { CameraDirectionGuide } from "./src/components/CameraDirectionGuide";
import { JourneyMap } from "./src/components/JourneyMap";
import { JourneyVisualGuide } from "./src/components/JourneyVisualGuide";
import { ThemedSceneArtwork } from "./src/components/ThemedSceneArtwork";
import { DEFAULT_ZOOM } from "./src/mapConfig";
import {
  createFocusedAssistController,
  deriveFocusedAssistContext,
  type FocusedAssistController,
} from "./src/focusedAssist/FocusedAssistController";
import {
  createBusPresenceProvider,
  resolveCurrentStop,
} from "./src/focusedAssist/presenceProvider";
import type {
  BusAtStop,
  FocusedAssistContext,
  FocusedAssistRequestContext,
} from "./src/focusedAssist/types";
import {
  GuidanceService,
  type GuidanceEvent,
  type GuidanceHaptic,
  type GuidancePriority,
} from "./src/guidance/GuidanceService";
import { createSpeechAdapter } from "./src/guidance/createSpeechAdapter";
import {
  deriveJourneyVisualInstruction,
  type JourneyVisualInstruction,
} from "./src/guidance/visualJourneyGuidance";
import {
  VoiceAssistantController,
  type VoiceAssistantActions,
} from "./src/voiceAssistant/VoiceAssistantController";
import { VoiceAssistantPanel } from "./src/voiceAssistant/VoiceAssistantPanel";
import {
  shouldSuppressAssistantTts,
} from "./src/voiceAssistant/SpeechRecognitionProvider";
import { createSpeechRecognitionProvider } from "./src/voiceAssistant/createSpeechRecognitionProvider";
import { HybridAssistantTurnProvider } from "./src/voiceAssistant/AssistantTurnProvider";
import { developmentE2EAssistantGenerator } from "./src/voiceAssistant/E2EAssistantBridge";
import { OnDeviceAssistantRuntime } from "./src/voiceAssistant/OnDeviceAssistantRuntime";
import { useAssistantModelSmokeDeepLink } from "./src/voiceAssistant/assistantModelSmoke";
import {
  createAssistantDiagnosticPreview,
  submitAssistantDiagnostic,
  withdrawAssistantDiagnostics,
} from "./src/voiceAssistant/assistantDiagnostics";
import { normalizeAssistantLocale } from "./src/voiceAssistant/localization";
import type {
  AssistantContext,
  AssistantActionResult,
  AssistantRuntimeStatus,
  AssistantTurnResult,
} from "./src/voiceAssistant/types";
import { illustrations } from "./src/illustrations";
import {
  accessibilityPresetMatches,
  accessibilityRequirementsFromPreferences,
  defaultAccessibilityPreferences,
  isLargeText,
  mergeAccessibilityPreferences,
  parsePersistedAccessibilityPreferences,
  preferencesWithAssistanceRequirements,
  serializeAccessibilityPreferences,
  textSizeScale,
  toggleAccessibilityPreset,
  type AccessibilityPreset,
} from "./src/preferences/accessibilityPreferences";
import {
  type MobilityMode,
  type RouteStep,
  type RoutingProvider,
  RoutingProviderError,
  type WalkingRoute,
} from "./src/routing/RoutingProvider";
import { createRoutingProvider } from "./src/routing/AccessibleRoutingProvider";
import {
  calculateWalkingRouteProgress,
  distanceBetweenRoutingCoordinates,
  type WalkingRouteProgress,
} from "./src/routing/routeProgress";
import {
  createRouteMonitoringState,
  isWalkingLocationAccuracyLimited,
  updateRouteMonitoring,
  type RouteMonitoringState,
} from "./src/routing/routeMonitor";
import * as Location from "expo-location";
import { subscribeToDevelopmentE2ELocation } from "./src/E2ELocationBridge";

const brandLogo = require("./assets/applogo.png");
type TabIconName = "journey" | "assist" | "profile";

type Screen =
  | "AUTH"
  | "PROFILE"
  | "JOURNEY_IDLE"
  | "STOP"
  | "BUS"
  | "ACCESSIBILITY"
  | "CONFIRM"
  | "STATUS"
  | "ONBOARD"
  | "ALIGHTING_STOP";

type AppTab = "JOURNEY" | "ASSISTANCE" | "PROFILE";
type JourneyCompletionKind = "ENDED_EARLY" | "FINISHED";
type AccessibilityPreferenceSection =
  "MOBILITY" | "VISION" | "HEARING" | "JOURNEY_SUPPORT" | "INTERACTION";
type AccessibilityRuntimeValue = {
  largerControls: boolean;
  reducedMotion: boolean;
  textSize: AccessibilityTextSize;
  preserveViewport: (getAnchor: () => View | null, update: () => void) => void;
};
const AccessibilityRuntimeContext = createContext<AccessibilityRuntimeValue>({
  largerControls: false,
  reducedMotion: false,
  textSize: "STANDARD",
  preserveViewport: (_getAnchor, update) => update(),
});
export type JourneyNextAction = {
  step: number;
  title: string;
  detail: string;
};
type MapLandmark = {
  id: string;
  name: string;
  category: "building" | "station" | "hospital" | "park" | "crossing";
  tier: 1 | 2 | 3;
  latitude: number;
  longitude: number;
  relatedStopCodes: string[];
};
type MapLayerKey =
  | "busStops"
  | "selectedService"
  | "landmarks"
  | "walkingRoute"
  | "accessibility";
type MapLayers = Record<MapLayerKey, boolean>;
type SheetSnapState = "HIDDEN_PEEK" | "COLLAPSED" | "MEDIUM" | "EXPANDED";
type BottomSheetState = SheetSnapState;
type UsefulBottomSheetState = Exclude<BottomSheetState, "HIDDEN_PEEK">;
type JourneySheetMode =
  | "PLANNER"
  | "NEARBY"
  | "STOP_DETAILS"
  | "SERVICE_SELECTION"
  | "DESTINATION_SELECTION"
  | "ROUTE_OPTIONS"
  | "WALKING_TO_STOP"
  | "WAITING_FOR_BUS"
  | "ONBOARD"
  | "DESTINATION_NEXT";
type MapBottomSheetContent = JourneySheetMode;
type JourneySetupState =
  | "PLANNING"
  | "SELECTING_STOP"
  | "SELECTING_SERVICE"
  | "SELECTING_DESTINATION"
  | "REVIEWING_JOURNEY"
  | "ROUTE_SELECTION"
  | "JOURNEY_PREVIEW"
  | "WALKING_TO_STOP"
  | "WAITING_FOR_BUS"
  | "BUS_ARRIVING"
  | "BOARDING"
  | "ONBOARD"
  | "DESTINATION_APPROACHING"
  | "DESTINATION_NEXT"
  | "DISEMBARKING"
  | "WALKING_TO_DESTINATION"
  | "COMPLETED";
type JourneyPointType =
  "CURRENT_LOCATION" | "BUS_STOP" | "LANDMARK" | "SAVED_PLACE" | "MAP_LOCATION";
type JourneyPoint = {
  id: string;
  type: JourneyPointType;
  label: string;
  description?: string;
  coordinate: MapCoordinate;
  stop?: StaticSearchStop;
  landmark?: MapLandmark;
};
type JourneyLeg =
  | {
      type: "WALK";
      origin: JourneyPoint;
      destination: JourneyPoint;
      durationMinutes: number;
      distanceMeters: number;
      label: string;
    }
  | {
      type: "BUS";
      serviceNo: string;
      origin: JourneyPoint;
      destination: JourneyPoint;
      durationMinutes: number;
      stopCount: number;
      routeStops: RouteStop[];
      label: string;
    };
type JourneyAlternative = {
  id: string;
  title: string;
  recommendation: string;
  serviceNo: string;
  totalMinutes: number;
  walkingMinutes: number;
  stopCount: number;
  transferCount: number;
  badges: string[];
  boardingStop: NearbyBusStop;
  alightingStop: RouteStop;
  routeStops: RouteStop[];
  legs: JourneyLeg[];
  nextBusEtaSeconds: number | null;
  accessibilityKnown: boolean;
};
type JourneyPlannerState = {
  origin: JourneyPoint | null;
  destination: JourneyPoint | null;
  alternatives: JourneyAlternative[];
  selectedAlternativeId: string | null;
  recentDestinations: JourneyPoint[];
};
type TransportSearchMode = "DISCOVERY" | "ORIGIN" | "DESTINATION";
type BusServiceOption = {
  serviceNo: string;
  destination: string;
  buses: ArrivalBus[];
  arrivalUnavailable: boolean;
};
type DataLoadStatus = "IDLE" | "LOADING" | "SUCCESS" | "ERROR";
type PersistedActiveJourneyBase = {
  savedAt: string;
  selectedStop: NearbyBusStop;
  selectedServiceOption: BusServiceOption;
  selectedBus: Bus;
  selectedArrival: ArrivalBus | null;
  selectedAlightingStop: RouteStop | null;
  routeStops: RouteStop[];
  currentStopIndex: number;
  journeyPhase: JourneyPhase;
  journeySetupState: JourneySetupState;
  journeyRequirements: AccessibilityRequirements;
  requestId: string | null;
  caseId?: string | null;
  assistanceCaseState?: AssistanceCaseState | null;
  requestStatus: AssistanceRequestStatus | null;
  requestPhase?: AssistancePhase | null;
  vehicleStatus: VehicleStatus | null;
};
type PersistedActiveJourneyV1 = PersistedActiveJourneyBase & {
  version: 1;
};
type PersistedActiveJourney = PersistedActiveJourneyBase & {
  version: 2;
  visualGuidePhase: JourneyPhase;
  walkingRoute: WalkingRoute | null;
  guidanceMode: GuidanceMode;
};
type StaticSearchStop = BusStop;
type SearchStatus = "IDLE" | "SEARCHING" | "SUCCESS" | "EMPTY" | "ERROR";
type RegionalStopsStatus = "IDLE" | "LOADING" | "SUCCESS" | "ERROR";
type BusStopSearchResults = {
  stops: StaticSearchStop[];
  places: MapLandmark[];
  services: string[];
};
type BusStopSearchState = {
  isOpen: boolean;
  query: string;
  status: SearchStatus;
  results: BusStopSearchResults;
  requestId: number;
};

const iconSizes = {
  small: 19,
  standard: 24,
  large: 30,
  hero: 38,
};

const APP_ICONS = {
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

type FeatureGlyphSize = "small" | "medium" | "large";

function FeatureGlyph({
  icon: Icon,
  lightMode,
  highContrast,
  selected = false,
  size = "medium",
}: {
  icon: LucideIcon;
  lightMode: boolean;
  highContrast: boolean;
  selected?: boolean;
  size?: FeatureGlyphSize;
}) {
  const theme = resolveVisualTheme(lightMode, highContrast);
  const iconSize = size === "large" ? 30 : size === "small" ? 22 : 26;

  return (
    <View
      style={[
        styles.featureGlyph,
        size === "small" && styles.smallFeatureGlyph,
        size === "large" && styles.largeFeatureGlyph,
        selected && styles.selectedFeatureGlyph,
        {
          backgroundColor: selected
            ? theme.colors.actionPrimary
            : theme.colors.actionSecondary,
          borderColor: selected
            ? theme.colors.borderSelected
            : theme.colors.borderDefault,
          borderWidth: highContrast || selected ? 2 : 1,
        },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Icon
        size={iconSize}
        color={
          selected ? theme.colors.actionPrimaryText : theme.colors.iconPrimary
        }
        strokeWidth={highContrast || selected ? 3 : 2.7}
      />
    </View>
  );
}

const defaultRequirements = accessibilityRequirementsFromPreferences(
  defaultAccessibilityPreferences,
);
const defaultAppPreferences = defaultAccessibilityPreferences;
const defaultMapLayers: MapLayers = {
  busStops: true,
  selectedService: true,
  landmarks: true,
  walkingRoute: true,
  accessibility: false,
};

const localPreferencesKey = "sg-goassist.preferences.v1";
const localActiveJourneyKey = "sg-goassist.active-journey.v1";
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
const service151RouteStops: RouteStop[] = [
  {
    sequence: 0,
    busStopCode: "18139",
    roadName: "Lower Kent Ridge Rd",
    description: "Opp Yusof Ishak House",
    latitude: 1.29812,
    longitude: 103.77424,
  },
  {
    sequence: 1,
    busStopCode: "18341",
    roadName: "Kent Ridge Cres",
    description: "Central Library",
    latitude: 1.29618,
    longitude: 103.77331,
  },
  {
    sequence: 2,
    busStopCode: "18301",
    roadName: "Kent Ridge Cres",
    description: "Kent Ridge Crescent",
    latitude: 1.29398,
    longitude: 103.77104,
  },
  {
    sequence: 3,
    busStopCode: "19011",
    roadName: "Kent Ridge Cres",
    description: "Kent Ridge MRT",
    latitude: 1.2942,
    longitude: 103.7711,
  },
  {
    sequence: 4,
    busStopCode: "18121",
    roadName: "Lower Kent Ridge Rd",
    description: "NUH",
    latitude: 1.29369,
    longitude: 103.78382,
  },
  {
    sequence: 5,
    busStopCode: "18331",
    roadName: "Kent Ridge Cres",
    description: "University Hall",
    latitude: 1.29708,
    longitude: 103.77602,
  },
];
const service183RouteStops: RouteStop[] = [
  service151RouteStops[0],
  service151RouteStops[1],
  {
    sequence: 2,
    busStopCode: "18129",
    roadName: "Lower Kent Ridge Rd",
    description: "Opp NUH",
    latitude: 1.29394,
    longitude: 103.78428,
  },
  {
    sequence: 3,
    busStopCode: "15131",
    roadName: "Commonwealth Ave",
    description: "Buona Vista Stn Exit D",
    latitude: 1.30731,
    longitude: 103.79021,
  },
];
const service188RouteStops: RouteStop[] = [
  service151RouteStops[0],
  service151RouteStops[1],
  service151RouteStops[2],
  {
    sequence: 3,
    busStopCode: "17171",
    roadName: "Clementi Rd",
    description: "SIM HQ",
    latitude: 1.32951,
    longitude: 103.77612,
  },
];
const serviceRoutesByNumber: Record<string, RouteStop[]> = {
  "95": kentRidgeRouteStops,
  "151": service151RouteStops,
  "183": service183RouteStops,
  "188": service188RouteStops,
};
const additionalSearchStops: Array<Omit<StaticSearchStop, "services">> = [
  {
    busStopCode: "18309",
    roadName: "Kent Ridge Cres",
    description: "Opp Kent Ridge Crescent",
    latitude: 1.29429,
    longitude: 103.77125,
  },
  {
    busStopCode: "18311",
    roadName: "Prince George's Park",
    description: "Prince George's Park",
    latitude: 1.29485,
    longitude: 103.77158,
  },
  {
    busStopCode: "18339",
    roadName: "Kent Ridge Cres",
    description: "Opp University Hall",
    latitude: 1.29674,
    longitude: 103.77581,
  },
  {
    busStopCode: "18349",
    roadName: "Kent Ridge Cres",
    description: "Opp Central Library",
    latitude: 1.29572,
    longitude: 103.77318,
  },
  {
    busStopCode: "19019",
    roadName: "Kent Ridge Cres",
    description: "Opp Kent Ridge Terminal",
    latitude: 1.29447,
    longitude: 103.77135,
  },
  {
    busStopCode: "15139",
    roadName: "Commonwealth Ave",
    description: "Buona Vista Stn Exit C",
    latitude: 1.30692,
    longitude: 103.79056,
  },
  {
    busStopCode: "17179",
    roadName: "Clementi Rd",
    description: "Opp SIM HQ",
    latitude: 1.32915,
    longitude: 103.77574,
  },
];
const localSearchStops: StaticSearchStop[] = buildDemoSearchStops(
  serviceRoutesByNumber,
  additionalSearchStops,
);

function buildDemoSearchStops(
  routes: Record<string, RouteStop[]>,
  additional: Array<Omit<StaticSearchStop, "services">>,
): StaticSearchStop[] {
  const stops = new Map<string, StaticSearchStop>();
  for (const [serviceNo, routeStops] of Object.entries(routes)) {
    for (const stop of routeStops) {
      const existing = stops.get(stop.busStopCode);
      stops.set(stop.busStopCode, {
        busStopCode: stop.busStopCode,
        roadName: stop.roadName,
        description: stop.description,
        latitude: stop.latitude,
        longitude: stop.longitude,
        services: Array.from(
          new Set([...(existing?.services ?? []), serviceNo]),
        ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      });
    }
  }
  for (const stop of additional) {
    if (!stops.has(stop.busStopCode)) {
      stops.set(stop.busStopCode, { ...stop, services: [] });
    }
  }
  return [...stops.values()].sort((a, b) =>
    a.busStopCode.localeCompare(b.busStopCode),
  );
}
const emptySearchResults: BusStopSearchResults = {
  stops: [],
  places: [],
  services: [],
};
const emptyRouteStops: RouteStop[] = [];
const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};
const radius = {
  sm: 10,
  md: 16,
  pill: 999,
};
const borders = {
  default: 2,
  selected: 4,
  highContrast: 4,
};
const typography = {
  pageTitle: 30,
  sectionTitle: 28,
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
  latitude: 1.3521,
  longitude: 103.8198,
  accuracyMeters: 0,
};
const nearbyStopsCacheMs = 5 * 60 * 1000;
const arrivalsCacheMs = 20 * 1000;
const enableCameraDebugLogs = false;
const enableLocationDebugLogs = false;
const mapViewportPaddingPercent = 12;
const minimumMapSpanMeters = 260;
const searchAreaThresholdMeters = 180;
const mapZoomLimits = {
  min: 11,
  journeyMin: 14,
  fullRouteMin: 12,
  max: 19,
};
const bottomNavigationHeight = 86;
const mapOverlayMargin = 12;
const mapTopOverlayMargin = 18;
const rightToolbarWidth = 64;
const mapTopControlGap = 8;
const mapTopControlRowHeight = 52;
const contextualMapControlHeight = 44;
const mapCameraInsetSpacing = 12;
const mapLayerZ = {
  scrim: 24,
  overlays: 30,
  sideControls: 45,
  morePanel: 46,
  search: 34,
  sheet: 40,
  navigation: 50,
};
const mapBottomSheetHeights: Record<BottomSheetState, number> = {
  HIDDEN_PEEK: 0,
  COLLAPSED: 96,
  MEDIUM: 330,
  EXPANDED: 560,
};
const mapSideControlTopOffset = 190;
const defaultMapCanvasHeight = 720;
const defaultMapCanvasWidth = 390;
const mapTopOverlayHeight =
  mapTopOverlayMargin + mapTopControlRowHeight + mapCameraInsetSpacing;
const followUserMovementThresholdMeters = 28;
const minimumUsableMapDimension = 100;
const centerSafeZoneScale = 0.46;
const markerPriority = {
  USER_LOCATION: 100,
  DESTINATION_STOP: 95,
  BOARDING_STOP: 95,
  SELECTED_STOP: 90,
  ACTIVE_BUS: 90,
  NEXT_STOP: 85,
  NEAREST_STOP: 80,
  ROUTE_RELEVANT_STOP: 70,
  CLUSTER: 40,
  NORMAL_BUS_STOP: 30,
  PLACE_OR_POI: 10,
} as const;
type MarkerPriorityKey = keyof typeof markerPriority;
type ViewportSource =
  | "USER_LOCATION"
  | "USER_PAN"
  | "SEARCH_RESULT"
  | "SELECTED_STOP"
  | "ROUTE"
  | "ACTIVE_JOURNEY"
  | "FULL_ROUTE"
  | "DESTINATION_FOCUS"
  | "CLUSTER_EXPAND";
type CameraMode =
  | "FOLLOW_USER"
  | "MANUAL"
  | "SEARCH_RESULT"
  | "CLUSTER_FOCUS"
  | "STOP_FOCUS"
  | "ROUTE_FOCUS"
  | "FOLLOW_JOURNEY";
type MapInteractionMode =
  | "BROWSE"
  | "CHOOSE_ORIGIN_ON_MAP"
  | "CHOOSE_DESTINATION_ON_MAP"
  | "FOLLOW_USER"
  | "FOLLOW_JOURNEY";
type MapFollowState = "FREE" | "FOLLOW_USER" | "FOLLOW_USER_HEADING";
type MapViewport = {
  center: MapCoordinate;
  zoom: number;
  bearing: number;
  pitch: number;
  mode: ViewportSource;
};
type MapLayoutSize = {
  width: number;
  height: number;
};
type MapOverlayInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};
type UsableMapRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
type ScreenRect = UsableMapRect & {
  priority: MarkerPriorityKey;
};
type MapCameraGeometry = {
  centerSafeZone: UsableMapRect;
  insets: MapOverlayInsets;
  mapHeight: number;
  mapWidth: number;
  usableMapRect: UsableMapRect;
};
type ProviderViewportChange = Pick<
  MapViewport,
  "center" | "zoom" | "bearing" | "pitch"
>;
type CameraCommand =
  | "locateUser"
  | "initialLocation"
  | "followUser"
  | "manualPan"
  | "focusStop"
  | "selectStopReveal"
  | "fitWalkingRoute"
  | "fitFullRoute"
  | "searchResult"
  | "expandCluster"
  | "resetMap"
  | "northUp";
type NearbySearchOrigin = {
  center: MapCoordinate & { accuracyMeters?: number };
  label: string;
  source: ViewportSource;
};
const nativeGoogleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";
const nativeGoogleMapsApiKeyIsPlaceholder =
  /^(your|replace|example|placeholder)/i.test(nativeGoogleMapsApiKey) ||
  /google_maps_api_key/i.test(nativeGoogleMapsApiKey);
const nativeGoogleMapsConfigured =
  Boolean(nativeGoogleMapsApiKey) && !nativeGoogleMapsApiKeyIsPlaceholder;
const liveStatusErrorMessage =
  "We are having trouble updating live bus status. Your request is still saved.";
const focusedAssistLocationTimeoutMs = 8000;
const deviceLocationTimeoutMs = 8000;
const recentDeviceLocationMaxAgeMs = 30_000;
const lastKnownDeviceLocationMaxAgeMs = 5 * 60_000;
const lastKnownDeviceLocationAccuracyMeters = 1_000;

type DeviceLocationResult = {
  timestamp: number;
  coords: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    headingDegrees?: number;
  };
};

function settleWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("The request timed out.")),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function deviceLocationResult(
  position: Pick<Location.LocationObject, "coords" | "timestamp">,
): DeviceLocationResult {
  const { latitude, longitude } = position.coords;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error("The device returned invalid location coordinates.");
  }

  return {
    timestamp: Number.isFinite(position.timestamp)
      ? position.timestamp
      : Date.now(),
    coords: {
      latitude,
      longitude,
      accuracyMeters: position.coords.accuracy ?? undefined,
      headingDegrees:
        position.coords.heading !== null && position.coords.heading >= 0
          ? position.coords.heading
          : undefined,
    },
  };
}

async function getReliableDeviceLocation(
  recentLocation: DeviceLocationResult | null,
): Promise<DeviceLocationResult> {
  const now = Date.now();
  if (
    recentLocation &&
    now - recentLocation.timestamp < recentDeviceLocationMaxAgeMs
  ) {
    return recentLocation;
  }

  const lastKnownLocationPromise =
    typeof Location.getLastKnownPositionAsync === "function"
      ? Location.getLastKnownPositionAsync({
          maxAge: lastKnownDeviceLocationMaxAgeMs,
          requiredAccuracy: lastKnownDeviceLocationAccuracyMeters,
        }).catch(() => null)
      : Promise.resolve(null);

  try {
    const freshPosition = await settleWithin(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      deviceLocationTimeoutMs,
    );
    return deviceLocationResult(freshPosition);
  } catch (freshLocationError) {
    const lastKnownPosition = await lastKnownLocationPromise;
    if (lastKnownPosition) {
      return deviceLocationResult(lastKnownPosition);
    }
    if (
      recentLocation &&
      now - recentLocation.timestamp < lastKnownDeviceLocationMaxAgeMs
    ) {
      return recentLocation;
    }
    throw freshLocationError;
  }
}

function logMapConfiguration(stage: string) {
  if (__DEV__ && process.env.NODE_ENV !== "test") {
    console.info(`[Map] ${stage}`, {
      nativeGoogleMapsConfigured,
      platform: Platform.OS,
      webProvider: Platform.OS === "web" ? "OPENSTREETMAP" : undefined,
    });
  }
}

function shouldUseOpenStreetMapProvider(showInlineControls: boolean) {
  return (
    !showInlineControls &&
    Platform.OS === "web" &&
    typeof document !== "undefined"
  );
}

function shouldUseNativeMapsProvider(showInlineControls: boolean) {
  return (
    !showInlineControls && Platform.OS !== "web" && nativeGoogleMapsConfigured
  );
}

function shouldUseMapProvider(showInlineControls: boolean) {
  return (
    shouldUseOpenStreetMapProvider(showInlineControls) ||
    shouldUseNativeMapsProvider(showInlineControls)
  );
}

function mapConfigurationMessage() {
  return "We couldn't load the map right now.";
}

function mapTechnicalConfigurationMessage() {
  if (Platform.OS === "web" && typeof document === "undefined") {
    return "OpenStreetMap needs a browser document to render map tiles.";
  }
  if (Platform.OS !== "web" && !nativeGoogleMapsConfigured) {
    return "Native Google Maps could not be loaded. Check the native Maps SDK, billing, API key restrictions, and development-build configuration.";
  }
  return "The map renderer is unavailable on this platform.";
}
type LocationState =
  "loading" | "available" | "approximate" | "permission_denied" | "unavailable";
type DirectionsStatus =
  | "IDLE"
  | "NEEDS_LOCATION"
  | "LOADING"
  | "READY"
  | "ERROR"
  | "RATE_LIMITED"
  | "WHEELCHAIR_UNAVAILABLE"
  | "KNOWN_BARRIER";
type GuidanceStatus = "INACTIVE" | "ACTIVE" | "ARRIVED";
type GuidanceMode = "INACTIVE" | "PREVIEW" | "ACTIVE" | "ARRIVED";
type AccessibleStopRouteStatus =
  "CHECKING" | "AVAILABLE" | "LIMITED_DATA" | "UNAVAILABLE";

export function rankStopsForWheelchair(
  stops: NearbyBusStop[],
  routeStatuses: Record<string, AccessibleStopRouteStatus>,
  accessibleOnly = false,
) {
  const rank: Record<AccessibleStopRouteStatus, number> = {
    AVAILABLE: 0,
    LIMITED_DATA: 1,
    CHECKING: 2,
    UNAVAILABLE: 3,
  };
  const candidates = accessibleOnly
    ? stops.filter((stop) => {
        const status = routeStatuses[stop.busStopCode];
        return (
          status === "AVAILABLE" ||
          status === "LIMITED_DATA" ||
          status === "CHECKING"
        );
      })
    : stops;
  return [...candidates].sort((first, second) => {
    const firstStatus = routeStatuses[first.busStopCode];
    const secondStatus = routeStatuses[second.busStopCode];
    const accessibilityDifference =
      (firstStatus ? rank[firstStatus] : 4) -
      (secondStatus ? rank[secondStatus] : 4);
    return (
      accessibilityDifference || first.distanceMeters - second.distanceMeters
    );
  });
}
type NearbyStopsState =
  "idle" | "loading" | "success" | "empty" | "network_error" | "service_error";
type ConnectivityState = "online" | "offline" | "reconnecting";
type LocationPermissionState = "unknown" | "granted" | "denied";
type TransportDiscoveryState = {
  location: LocationState;
  locationPermission: LocationPermissionState;
  locationRequested: boolean;
  nearbyStops: NearbyBusStop[];
  nearbyStopsStatus: NearbyStopsState;
  connectivity: ConnectivityState;
  lastSuccessfulLocation:
    | (MapCoordinate & {
        accuracyMeters?: number;
        headingDegrees?: number;
      })
    | null;
};
type JourneyDiscoveryStatus = {
  title: string;
  message: string;
  tone: "info" | "error";
  primary?: string;
  secondary?: string;
};
type FindBusPanelState =
  | { kind: "IDLE" }
  | { kind: "LOCATING"; message: string }
  | { kind: "MAP_LOADING"; message: string }
  | { kind: "LOCATION_ERROR"; status: JourneyDiscoveryStatus }
  | { kind: "DISCOVERY_ERROR"; status: JourneyDiscoveryStatus }
  | { kind: "NOTICE"; status: JourneyDiscoveryStatus };
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
  destination: "#72C7F5",
  textOnDestination: "#051B22",
  danger: "#EF8585",
  textOnDanger: "#251010",
};

const lightTheme = {
  background: "#F3F8F8",
  surface: "#FFFFFF",
  surfaceSecondary: "#EAF2F3",
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
  destination: "#256E9E",
  textOnDestination: "#FFFFFF",
  danger: "#B83F3F",
  textOnDanger: "#FFFFFF",
  border: "#B7C9CC",
};

const visualThemes = {
  light: {
    colors: {
      backgroundPrimary: "#F3F8F8",
      backgroundSecondary: "#EAF4F4",
      surfacePrimary: "#FFFFFF",
      surfaceRaised: "#F6FAFA",
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
      actionSecondary: "#EAF2F3",
      surfaceInteractive: "#FFFFFF",
      surfaceSelected: "#0B6670",
      textOnSelected: "#FFFFFF",
      borderInteractive: "#86A7AD",
      borderSelected: "#0B6670",
      profileBadgeSurface: "#F2F8F9",
      profileBadgeBorder: "#0B6670",
      profileBadgeIcon: "#0B6670",
      profileBadgeText: "#203438",
      profileBadgeSelectedSurface: "#0B6670",
      profileBadgeSelectedBorder: "#0B6670",
      profileBadgeSelectedIcon: "#FFFFFF",
      locationCurrent: "#0B6F8A",
      busStopDefault: "#3F8F98",
      busStopSelected: "#0B6670",
      navigationSelected: "#0B6670",
      stopDefault: "#3F8F98",
      stopRecommended: "#0B6F8A",
      stopSelected: "#0B6670",
      destination: "#256E9E",
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
        controlText: "#203438",
        sheetSurface: "#FFFFFF",
        sheetBorder: "#A9BABE",
        navigationSurface: "#FFFFFF",
        navigationDivider: "#A9BABE",
        currentLocation: "#0B6F8A",
        currentLocationHalo: "rgba(11, 111, 138, 0.12)",
        currentLocationOutline: "#FFFFFF",
        currentLocationLabelSurface: "#FFFFFF",
        currentLocationLabelText: "#0B6670",
        stopDefault: "#3F8F98",
        stopRecommended: "#0B6F8A",
        stopSelected: "#0B6670",
        stopSurface: "#F7FBFC",
        stopOutline: "#FFFFFF",
        destination: "#256E9E",
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
      surfaceInteractive: "#203B43",
      surfaceSelected: "#0F4E5A",
      textOnSelected: "#EFFFFF",
      borderInteractive: "#6D8A92",
      borderSelected: "#62D4E8",
      profileBadgeSurface: "#203B43",
      profileBadgeBorder: "#62D4E8",
      profileBadgeIcon: "#9EDDEA",
      profileBadgeText: "#F4FAFB",
      profileBadgeSelectedSurface: "#0F4E5A",
      profileBadgeSelectedBorder: "#62D4E8",
      profileBadgeSelectedIcon: "#EFFFFF",
      locationCurrent: "#8DD6E8",
      busStopDefault: "#86C5DA",
      busStopSelected: "#DDF7FB",
      navigationSelected: "#62D4E8",
      stopDefault: "#86C5DA",
      stopRecommended: "#8DD6E8",
      stopSelected: "#86C5DA",
      destination: "#72C7F5",
      statusSuccess: "#A8D9B8",
      statusAttention: "#F5C65A",
      statusError: "#EF8585",
      statusInformation: "#8DD6E8",
      routePrimary: "#8DD6E8",
      routeAccessible: "#A8D9B8",
      focusIndicator: "#8DD6E8",
      map: {
        background: "#071216",
        land: "#13292F",
        grid: "rgba(210, 238, 242, 0.16)",
        park: "#184333",
        water: "#123746",
        building: "#223B43",
        majorRoad: "#6F8A92",
        minorRoad: "#435D65",
        roadBorder: "#98B4BB",
        label: "#D8E8EB",
        labelSecondary: "#ADC5CB",
        floatingSurface: "#213942",
        floatingBorder: "#7F9CA4",
        overlaySurface: "#213942",
        overlaySurfaceElevated: "#2B4650",
        overlayBorder: "#83A0A8",
        controlSurface: "#243F48",
        controlBorder: "#95B6BE",
        controlIcon: "#F2FEFF",
        controlText: "#F4FAFB",
        sheetSurface: "#213B44",
        sheetBorder: "#92B0B8",
        navigationSurface: "#172B32",
        navigationDivider: "#7C9AA3",
        currentLocation: "#B3F0FB",
        currentLocationHalo: "rgba(179, 240, 251, 0.12)",
        currentLocationOutline: "#F6FEFF",
        currentLocationLabelSurface: "#EFFFFF",
        currentLocationLabelText: "#06242C",
        stopDefault: "#8FD1DE",
        stopRecommended: "#B3F0FB",
        stopSelected: "#E2FCFF",
        stopSurface: "#263F47",
        stopOutline: "#DDF7FB",
        destination: "#8BD9FF",
        selectionAccent: "#84E6F6",
        routePrimary: "#A4F0FF",
        routeOutline: "#061115",
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
      surfaceInteractive: "#FFFFFF",
      surfaceSelected: "#074B6A",
      textOnSelected: "#FFFFFF",
      borderInteractive: "#000000",
      borderSelected: "#000000",
      profileBadgeSurface: "#FFFFFF",
      profileBadgeBorder: "#000000",
      profileBadgeIcon: "#074B6A",
      profileBadgeText: "#000000",
      profileBadgeSelectedSurface: "#074B6A",
      profileBadgeSelectedBorder: "#000000",
      profileBadgeSelectedIcon: "#FFFFFF",
      locationCurrent: "#074B6A",
      busStopDefault: "#074B6A",
      busStopSelected: "#031E2B",
      navigationSelected: "#074B6A",
      stopDefault: "#074B6A",
      stopRecommended: "#074B6A",
      stopSelected: "#063D58",
      destination: "#003C66",
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
        controlText: "#000000",
        sheetSurface: "#FFFFFF",
        sheetBorder: "#000000",
        navigationSurface: "#FFFFFF",
        navigationDivider: "#000000",
        currentLocation: "#074B6A",
        currentLocationHalo: "rgba(7, 75, 106, 0.12)",
        currentLocationOutline: "#000000",
        currentLocationLabelSurface: "#FFFFFF",
        currentLocationLabelText: "#000000",
        stopDefault: "#074B6A",
        stopRecommended: "#063D58",
        stopSelected: "#031E2B",
        stopSurface: "#FFFFFF",
        stopOutline: "#000000",
        destination: "#003C66",
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
      surfaceInteractive: "#181818",
      surfaceSelected: "#9FF2FF",
      textOnSelected: "#000000",
      borderInteractive: "#FFFFFF",
      borderSelected: "#FFFFFF",
      profileBadgeSurface: "#181818",
      profileBadgeBorder: "#7FE8FF",
      profileBadgeIcon: "#7FE8FF",
      profileBadgeText: "#FFFFFF",
      profileBadgeSelectedSurface: "#9FF2FF",
      profileBadgeSelectedBorder: "#FFFFFF",
      profileBadgeSelectedIcon: "#000000",
      locationCurrent: "#7FE8FF",
      busStopDefault: "#7FE8FF",
      busStopSelected: "#FFFFFF",
      navigationSelected: "#9FF2FF",
      stopDefault: "#7FE8FF",
      stopRecommended: "#7FE8FF",
      stopSelected: "#FFFFFF",
      destination: "#A7E6FF",
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
        controlText: "#FFFFFF",
        sheetSurface: "#171C1F",
        sheetBorder: "#FFFFFF",
        navigationSurface: "#111517",
        navigationDivider: "#FFFFFF",
        currentLocation: "#7FE8FF",
        currentLocationHalo: "rgba(127, 232, 255, 0.14)",
        currentLocationOutline: "#FFFFFF",
        currentLocationLabelSurface: "#FFFFFF",
        currentLocationLabelText: "#000000",
        stopDefault: "#7FE8FF",
        stopRecommended: "#FFFFFF",
        stopSelected: "#FFFFFF",
        stopSurface: "#06090A",
        stopOutline: "#FFFFFF",
        destination: "#A7E6FF",
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
    accessibilityPreferences: {
      ...defaultAccessibilityPreferences,
      audioBusIdentification: true,
      wheelchairRouting: false,
      avoidSteepSlopes: true,
      preferSmoothSurfaces: true,
      screenReaderOptimised: true,
      spokenGuidance: true,
      vibrationAlerts: "IMPORTANT",
      textSize: "LARGE",
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

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("SG GoAssist failed to render", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.container} accessibilityRole="alert" accessible>
            <BrandHeader highContrast={false} />
            <Text style={styles.errorText}>The app could not start.</Text>
            <Text style={styles.bodyText}>
              We couldn't open SG GoAssist right now. Please try again.
            </Text>
            <PrimaryButton
              label="Try again"
              icon={RefreshCw}
              onPress={() => this.setState({ error: null })}
              lightMode={false}
              highContrast={false}
            />
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  useAssistantModelSmokeDeepLink();
  return (
    <AppErrorBoundary>
      <SgGoAssistApp />
    </AppErrorBoundary>
  );
}

export function shouldStackJourneyEntry({
  width,
  fontScale,
  largeText,
}: {
  width: number;
  fontScale: number;
  largeText: boolean;
}) {
  return width < 340 || fontScale >= 1.2 || largeText;
}

export function shouldStackFeatureIllustration({
  width,
  fontScale,
  largeText,
}: {
  width: number;
  fontScale: number;
  largeText: boolean;
}) {
  return width < 360 || fontScale >= 1.2 || largeText;
}

export function shouldStackAccessibilityChoices({
  width,
  textSize,
}: {
  width: number;
  textSize: AccessibilityTextSize;
}) {
  return (
    width < 340 ||
    textSize === "EXTRA_LARGE" ||
    (textSize === "LARGE" && width < 390)
  );
}

export function shouldStackPreferenceSummary({
  width,
  textSize,
}: {
  width: number;
  textSize: AccessibilityTextSize;
}) {
  const minimumInlineWidth =
    textSize === "EXTRA_LARGE" ? 880 : textSize === "LARGE" ? 760 : 600;
  return width < minimumInlineWidth;
}

export function deriveJourneyNextAction({
  journeyPhase,
  selectedStopName,
  serviceNo,
  destinationName,
  nextStopName,
  walkingInstruction,
  wheelchairAssistance,
}: {
  journeyPhase: JourneyPhase;
  selectedStopName?: string;
  serviceNo?: string;
  destinationName?: string;
  nextStopName?: string;
  walkingInstruction?: string;
  wheelchairAssistance: boolean;
}): JourneyNextAction {
  if (journeyPhase === "COMPLETED") {
    return {
      step: 4,
      title: "Journey complete",
      detail: "You have left the bus.",
    };
  }
  if (journeyPhase === "DISEMBARKING" || journeyPhase === "ALIGHTING") {
    return {
      step: 4,
      title: "Alight when safe",
      detail: destinationName
        ? `Leave at ${destinationName}.`
        : "Follow the driver's safety instructions.",
    };
  }
  if (journeyPhase === "DESTINATION_NEXT") {
    return {
      step: 4,
      title: "Prepare to alight",
      detail: destinationName
        ? `${destinationName} is next.`
        : "Your stop is next.",
    };
  }
  if (journeyPhase === "DESTINATION_APPROACHING") {
    return {
      step: 4,
      title: "Get ready to alight",
      detail: destinationName
        ? `You are approaching ${destinationName}.`
        : "Your destination is approaching.",
    };
  }
  if (journeyPhase === "ONBOARD") {
    return {
      step: 4,
      title: "Stay onboard",
      detail: nextStopName
        ? `Next stop: ${nextStopName}.`
        : destinationName
          ? `Continue to ${destinationName}.`
          : "Follow your stop countdown.",
    };
  }
  if (
    journeyPhase === "WAITING_FOR_BUS" ||
    journeyPhase === "BUS_ARRIVING" ||
    journeyPhase === "BOARDING"
  ) {
    return {
      step: 2,
      title: serviceNo ? `Wait for Service ${serviceNo}` : "Wait for your bus",
      detail: wheelchairAssistance
        ? "Stay near the boarding point. Board after ramp assistance is ready."
        : selectedStopName
          ? `Wait at ${selectedStopName}.`
          : "Stay near the boarding point.",
    };
  }
  if (journeyPhase === "WALKING_TO_STOP") {
    return {
      step: 1,
      title: selectedStopName
        ? `Go to ${selectedStopName}`
        : "Go to your bus stop",
      detail:
        walkingInstruction ??
        "Follow the walking directions to your boarding stop.",
    };
  }
  if (serviceNo) {
    return {
      step: 2,
      title: `Review Service ${serviceNo}`,
      detail: destinationName
        ? `Confirm your journey to ${destinationName}.`
        : "Choose your destination and confirm the journey.",
    };
  }
  if (selectedStopName) {
    return {
      step: 1,
      title: "Choose a bus service",
      detail: `Boarding from ${selectedStopName}.`,
    };
  }
  return {
    step: 1,
    title: "Choose your bus stop",
    detail: "Use your location, search, or select a stop manually.",
  };
}

function createPlatformHapticAdapter() {
  if (Platform.OS === "web") {
    const browserNavigator = (
      globalThis as typeof globalThis & {
        navigator?: { vibrate?: (pattern: number | number[]) => boolean };
      }
    ).navigator;
    if (typeof browserNavigator?.vibrate !== "function") return undefined;
    return (haptic: GuidanceHaptic) => {
      const pattern =
        haptic === "TURN_LEFT"
          ? [35, 45, 35]
          : haptic === "TURN_RIGHT"
            ? [70, 35, 25]
            : haptic === "ARRIVAL"
              ? [35, 35, 35, 35, 70]
              : haptic === "START"
                ? 25
                : haptic === "TURN"
                  ? 40
                  : haptic === "WARNING"
                    ? 55
                    : 35;
      browserNavigator.vibrate?.(pattern);
    };
  }
  return (haptic: GuidanceHaptic) => {
    const feedbackType =
      haptic === "WARNING" ||
      haptic === "TURN" ||
      haptic === "TURN_LEFT" ||
      haptic === "TURN_RIGHT"
        ? Haptics.NotificationFeedbackType.Warning
        : Haptics.NotificationFeedbackType.Success;
    void Haptics.notificationAsync(feedbackType).catch(() => undefined);
  };
}

function SgGoAssistApp() {
  const { fontScale, height, width } = useWindowDimensions();
  const preserveViewport = useCallback(
    (_getAnchor: () => View | null, update: () => void) => update(),
    [],
  );
  const isCompactWidth = width < 380;
  const [screen, setScreen] = useState<Screen>("JOURNEY_IDLE");
  const [profiles, setProfiles] = useState<PassengerProfile[]>(demoProfiles);
  const [activeProfile, setActiveProfile] = useState<PassengerProfile | null>(
    null,
  );
  const [isEditingProfileNeeds, setIsEditingProfileNeeds] = useState(false);
  const [profileDraftPreferences, setProfileDraftPreferences] =
    useState<AccessibilityPreferences | null>(null);
  const [profilePreferenceSection, setProfilePreferenceSection] =
    useState<AccessibilityPreferenceSection | null>(null);
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [verificationMethod, setVerificationMethod] =
    useState<VerificationMethod>("DEMO_CREDENTIAL");
  const [credentialLast4, setCredentialLast4] = useState("");
  const [appPreferences, setAppPreferences] = useState<AccessibilityPreferences>(() => ({
    ...defaultAppPreferences,
    assistantLocale: normalizeAssistantLocale(
      Intl.DateTimeFormat().resolvedOptions().locale,
    ),
  }));
  const assistantLocaleRef = useRef(
    normalizeAssistantLocale(appPreferences.assistantLocale),
  );
  assistantLocaleRef.current = normalizeAssistantLocale(
    appPreferences.assistantLocale,
  );
  const requirements = useMemo(
    () => accessibilityRequirementsFromPreferences(appPreferences),
    [appPreferences],
  );
  const setRequirements = useCallback(
    (update: React.SetStateAction<AccessibilityRequirements>) => {
      setAppPreferences((current) => {
        const currentRequirements =
          accessibilityRequirementsFromPreferences(current);
        const nextRequirements =
          typeof update === "function" ? update(currentRequirements) : update;
        return preferencesWithAssistanceRequirements(current, nextRequirements);
      });
    },
    [],
  );
  const [journeyRequirements, setJourneyRequirements] =
    useState(defaultRequirements);
  const guidanceServiceRef = useRef<GuidanceService | null>(null);
  if (!guidanceServiceRef.current) {
    guidanceServiceRef.current = new GuidanceService({
      speech: createSpeechAdapter(() => assistantLocaleRef.current),
      haptic: createPlatformHapticAdapter(),
    });
  }
  const assistantRuntimeRef = useRef<OnDeviceAssistantRuntime | null>(null);
  if (!assistantRuntimeRef.current) {
    assistantRuntimeRef.current = new OnDeviceAssistantRuntime();
  }
  const [assistantRuntimeStatus, setAssistantRuntimeStatus] =
    useState<AssistantRuntimeStatus>(() =>
      assistantRuntimeRef.current!.getStatus(),
    );
  const assistantAnonymousTokenRef = useRef(
    `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  );
  const [latestSpokenGuidance, setLatestSpokenGuidance] = useState<
    string | null
  >(null);
  const [guidanceSpeaking, setGuidanceSpeaking] = useState(false);
  const [spokenGuidanceSupported, setSpokenGuidanceSupported] = useState(false);
  const preferencesHydratedRef = useRef(false);
  const activeJourneyHydratedRef = useRef(false);
  const latestPreferencesRef = useRef(appPreferences);
  latestPreferencesRef.current = appPreferences;
  const editorPreferences = profileDraftPreferences ?? appPreferences;
  const setEditorPreferences = useCallback<
    React.Dispatch<React.SetStateAction<AccessibilityPreferences>>
  >((update) => {
    setProfileDraftPreferences((current) => {
      const base = current ?? latestPreferencesRef.current;
      return typeof update === "function" ? update(base) : update;
    });
  }, []);
  const largeText = isLargeText(appPreferences);
  const extraLargeText = appPreferences.textSize === "EXTRA_LARGE";
  const shouldStackJourneyIntro = shouldStackJourneyEntry({
    width,
    fontScale,
    largeText,
  });
  const [transportDiscovery, setTransportDiscovery] =
    useState<TransportDiscoveryState>({
      location: "unavailable",
      locationPermission: "unknown",
      locationRequested: false,
      nearbyStops: [],
      nearbyStopsStatus: "idle",
      connectivity: readConnectivityState(),
      lastSuccessfulLocation: null,
    });
  const [selectedStop, setSelectedStop] = useState<NearbyBusStop | null>(null);
  const [selectedLandmarkId, setSelectedLandmarkId] = useState<string | null>(
    null,
  );
  const [mapViewMode, setMapViewMode] = useState<"MAP" | "LIST">("MAP");
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [accessibleRoutesOnly, setAccessibleRoutesOnly] = useState(false);
  const [accessibleStopRoutes, setAccessibleStopRoutes] = useState<
    Record<string, AccessibleStopRouteStatus>
  >({});
  const [bottomSheetState, setBottomSheetState] =
    useState<BottomSheetState>("HIDDEN_PEEK");
  const [bottomSheetContent, setBottomSheetContent] =
    useState<MapBottomSheetContent>("PLANNER");
  const [lastExpandedSheetState, setLastExpandedSheetState] =
    useState<UsefulBottomSheetState>("COLLAPSED");
  const [lastNearbySheetState, setLastNearbySheetState] =
    useState<UsefulBottomSheetState>("MEDIUM");
  const [stopSearchQuery, setStopSearchQuery] = useState("");
  const [mapLayers, setMapLayers] = useState<MapLayers>(defaultMapLayers);
  const [mapManuallyMoved, setMapManuallyMoved] = useState(false);
  const [viewportSource, setViewportSource] =
    useState<ViewportSource>("USER_LOCATION");
  const [mapCameraMode, setMapCameraMode] = useState<CameraMode>("FOLLOW_USER");
  const [mapViewport, setMapViewport] = useState<MapViewport>({
    center: manualStopLookup,
    zoom: DEFAULT_ZOOM,
    bearing: 0,
    pitch: 0,
    mode: "USER_LOCATION",
  });
  const [regionalStops, setRegionalStops] = useState<NearbyBusStop[]>([]);
  const [regionalStopsStatus, setRegionalStopsStatus] =
    useState<RegionalStopsStatus>("IDLE");
  const [regionalStopsRetryKey, setRegionalStopsRetryKey] = useState(0);
  const [measuredMapLayout, setMeasuredMapLayout] = useState<MapLayoutSize>(
    () =>
      measuredMapLayoutSize({
        height: height - bottomNavigationHeight,
        width,
      }),
  );
  const [lastStopQueryOrigin, setLastStopQueryOrigin] =
    useState<NearbySearchOrigin | null>(null);
  const [destinationSearchQuery, setDestinationSearchQuery] = useState("");
  const [busStopSearch, setBusStopSearch] = useState<BusStopSearchState>({
    isOpen: false,
    query: "",
    status: "IDLE",
    results: emptySearchResults,
    requestId: 0,
  });
  const [transportSearchMode, setTransportSearchMode] =
    useState<TransportSearchMode>("DISCOVERY");
  const [mapPickMode, setMapPickMode] = useState<"DESTINATION" | null>(null);
  const [journeyPlanner, setJourneyPlanner] = useState<JourneyPlannerState>({
    origin: null,
    destination: null,
    alternatives: [],
    selectedAlternativeId: null,
    recentDestinations: [],
  });
  const [nearbySearchOrigin, setNearbySearchOrigin] =
    useState<NearbySearchOrigin>({
      center: manualStopLookup,
      label: "Nearby bus stops",
      source: "USER_LOCATION",
    });
  const [guidanceMode, setGuidanceMode] = useState<GuidanceMode>("INACTIVE");
  const directionsActive = guidanceMode !== "INACTIVE";
  const guidanceStatus: GuidanceStatus =
    guidanceMode === "ACTIVE"
      ? "ACTIVE"
      : guidanceMode === "ARRIVED"
        ? "ARRIVED"
        : "INACTIVE";
  const [followState, setFollowState] = useState<MapFollowState>("FREE");
  const [mapRotationEnabled, setMapRotationEnabled] = useState(false);
  const [mapHeadingDegrees, setMapHeadingDegrees] = useState(0);
  const [directionsStatus, setDirectionsStatus] =
    useState<DirectionsStatus>("IDLE");
  const [mobilityMode, setMobilityMode] = useState<MobilityMode>("WALKING");
  const [directionsError, setDirectionsError] = useState<string | null>(null);
  const [walkingRoute, setWalkingRoute] = useState<WalkingRoute | null>(null);
  const [cameraGuideVisible, setCameraGuideVisible] = useState(false);
  const [routeFitKey, setRouteFitKey] = useState(0);
  const walkingProgressRef = useRef<WalkingRouteProgress | null>(null);
  const walkingRouteMonitoringRef = useRef<RouteMonitoringState>(
    createRouteMonitoringState(),
  );
  const [walkingRouteMonitoring, setWalkingRouteMonitoring] =
    useState<RouteMonitoringState>(createRouteMonitoringState);
  const [walkingOffRouteDismissed, setWalkingOffRouteDismissed] =
    useState(false);
  const walkingGuidanceThresholdRef = useRef<string | null>(null);
  const [locationPulseKey, setLocationPulseKey] = useState(0);
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const [screenReaderDetected, setScreenReaderDetected] = useState(false);
  const [hapticsSupported, setHapticsSupported] = useState(false);
  const reducedMotion = systemReducedMotion || appPreferences.reducedMotion;
  const screenReaderMode =
    screenReaderDetected || appPreferences.screenReaderOptimised;
  const screenReaderModeRef = useRef(screenReaderMode);
  screenReaderModeRef.current = screenReaderMode;
  useEffect(() => {
    if (!directionsActive) {
      setMobilityMode(
        appPreferences.wheelchairRouting ? "WHEELCHAIR" : "WALKING",
      );
    }
  }, [appPreferences.wheelchairRouting, directionsActive]);
  const nearbyStops = transportDiscovery.nearbyStops;
  const currentLocation = transportDiscovery.lastSuccessfulLocation;
  const [journeySetupState, setJourneySetupState] =
    useState<JourneySetupState>("SELECTING_STOP");
  const [serviceOptions, setServiceOptions] = useState<BusServiceOption[]>([]);
  const [selectedServiceOption, setSelectedServiceOption] =
    useState<BusServiceOption | null>(null);
  const [arrivingBuses, setArrivingBuses] = useState<ArrivalBus[]>([]);
  const [arrivalsStatus, setArrivalsStatus] = useState<DataLoadStatus>("IDLE");
  const [routeDetailsStatus, setRouteDetailsStatus] =
    useState<DataLoadStatus>("IDLE");
  const [staticServicesStatus, setStaticServicesStatus] =
    useState<DataLoadStatus>("IDLE");
  const [selectedBus, setSelectedBus] = useState<Bus | null>(null);
  const [selectedArrival, setSelectedArrival] = useState<ArrivalBus | null>(
    null,
  );
  const [journeyPhase, setJourneyPhase] = useState<JourneyPhase>("DISCOVERY");
  const [lastCompletedJourney, setLastCompletedJourney] = useState<{
    destinationName: string;
    serviceNo: string;
  } | null>(null);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [selectedAlightingStop, setSelectedAlightingStop] =
    useState<RouteStop | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [assistanceCaseState, setAssistanceCaseState] =
    useState<AssistanceCaseState | null>(null);
  const [requestStatus, setRequestStatus] =
    useState<AssistanceRequestStatus | null>(null);
  const requestStatusRef = useRef<AssistanceRequestStatus | null>(null);
  const [requestPhase, setRequestPhase] = useState<AssistancePhase | null>(
    null,
  );
  const [focusedAssistLocating, setFocusedAssistLocating] = useState(false);
  const [focusedAssistContextError, setFocusedAssistContextError] = useState<
    string | null
  >(null);
  const [focusedAssistManualStop, setFocusedAssistManualStop] =
    useState<NearbyBusStop | null>(null);
  const [focusedAssistArrivals, setFocusedAssistArrivals] = useState<
    ArrivalBus[]
  >([]);
  const [focusedAssistSelectedBusId, setFocusedAssistSelectedBusId] = useState<
    string | null
  >(null);
  const [focusedAssistRequest, setFocusedAssistRequest] =
    useState<FocusedAssistRequestContext>({
      requestId: null,
      status: null,
      assistanceType: null,
      submitting: false,
      bus: null,
      stop: null,
      error: null,
    });
  const requestPhaseRef = useRef<AssistancePhase | null>(null);
  const [confirmingCancelRequest, setConfirmingCancelRequest] = useState(false);
  const [confirmingJourneyEnd, setConfirmingJourneyEnd] =
    useState<JourneyCompletionKind | null>(null);
  const [journeyEndInProgress, setJourneyEndInProgress] = useState(false);
  const [vehicleStatus, setVehicleStatus] = useState<VehicleStatus | null>(
    null,
  );
  const [autonomousDriveState, setAutonomousDriveState] =
    useState<AutonomousDriveState | null>(null);
  const vehicleStatusRef = useRef<VehicleStatus | null>(null);
  const [events, setEvents] = useState<StatusUpdateMessage[]>([]);
  const [visualAlert, setVisualAlert] = useState<string | null>(null);
  const [hasSpokenGuidanceInCurrentFlow, setHasSpokenGuidanceInCurrentFlow] =
    useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nearbyStopsCacheRef = useRef(
    new Map<string, { timestamp: number; result: NearbyBusStopsResponse }>(),
  );
  const arrivalsCacheRef = useRef(
    new Map<string, { timestamp: number; result: BusStopArrivalsResponse }>(),
  );
  const routeDetailsCacheRef = useRef(
    new Map<string, BusStopServiceRoutesResponse>(),
  );
  const stopDetailsCacheRef = useRef(new Map<string, BusStop>());
  const selectedServiceOptionRef = useRef<BusServiceOption | null>(null);
  const stopsRequestRef = useRef<{
    id: number;
    controller: AbortController | null;
  }>({
    id: 0,
    controller: null,
  });
  const regionalStopsRequestRef = useRef<{
    id: number;
    controller: AbortController | null;
  }>({ id: 0, controller: null });
  const locationLookupRequestRef = useRef(0);
  const arrivalsRequestRef = useRef<{
    id: number;
    controller: AbortController | null;
  }>({
    id: 0,
    controller: null,
  });
  const routeDetailsRequestRef = useRef<{
    id: number;
    controller: AbortController | null;
  }>({ id: 0, controller: null });
  const stopDetailsRequestRef = useRef<{
    id: number;
    controller: AbortController | null;
  }>({ id: 0, controller: null });
  const lastLocationResultRef = useRef<{
    timestamp: number;
    coords: {
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
      headingDegrees?: number;
    };
  } | null>(null);
  const routingProviderRef = useRef<RoutingProvider | null>(null);
  if (!routingProviderRef.current) {
    routingProviderRef.current = createRoutingProvider();
  }
  const directionsRequestRef = useRef<{
    id: number;
    controller: AbortController | null;
  }>({ id: 0, controller: null });
  const journeySessionIdRef = useRef(0);
  const focusedAssistRequestSessionRef = useRef(0);
  const focusedAssistSubmittingRef = useRef(false);
  const focusedAssistSelectingStopRef = useRef(false);
  const focusedAssistPreviousSelectedStopRef = useRef<NearbyBusStop | null>(
    null,
  );
  const focusedAssistLocationRequestRef = useRef(0);
  const focusedAssistAnnouncedBusRef = useRef<string | null>(null);
  const busPresenceProviderRef = useRef(
    createBusPresenceProvider({ demoMode: __DEV__ }),
  );
  const speechRecognitionProviderRef = useRef(
    createSpeechRecognitionProvider(),
  );
  const journeyEndInProgressRef = useRef(false);
  const activeJourneyPersistenceQueueRef = useRef<Promise<void>>(
    Promise.resolve(),
  );
  const guidanceSessionIdRef = useRef(0);
  const arrivalAnnouncementStopRef = useRef<string | null>(null);
  const initialCameraAppliedRef = useRef(false);
  const cameraIntentIdRef = useRef(0);
  const searchRequestIdRef = useRef(0);
  const previousUserLocationRef =
    useRef<typeof currentLocation>(currentLocation);
  const searchThisAreaVisible = useMemo(() => {
    if (
      mapCameraMode !== "MANUAL" ||
      viewportSource !== "USER_PAN" ||
      !lastStopQueryOrigin
    ) {
      return false;
    }
    return (
      distanceBetweenCoordinates(
        mapViewport.center,
        lastStopQueryOrigin.center,
      ) > searchAreaThresholdMeters
    );
  }, [lastStopQueryOrigin, mapCameraMode, mapViewport.center, viewportSource]);
  const mapCameraGeometry = useMemo(
    () =>
      createMapCameraGeometry({
        contextualActionVisible: searchThisAreaVisible,
        mapLayout: measuredMapLayout,
      }),
    [measuredMapLayout.height, measuredMapLayout.width, searchThisAreaVisible],
  );
  const mapCameraGeometryRef = useRef(mapCameraGeometry);
  const bottomSheetStateRef = useRef(bottomSheetState);
  const currentLocationRef = useRef(currentLocation);
  const selectedStopCameraIntentRef = useRef(0);

  function queueActiveJourneyPersistence(operation: () => Promise<void>) {
    activeJourneyPersistenceQueueRef.current =
      activeJourneyPersistenceQueueRef.current
        .catch(() => undefined)
        .then(operation);
    return activeJourneyPersistenceQueueRef.current;
  }

  useEffect(() => {
    selectedServiceOptionRef.current = selectedServiceOption;
  }, [selectedServiceOption]);

  useEffect(() => {
    if (!selectedStop) {
      setStaticServicesStatus("IDLE");
      return;
    }
    if (bottomSheetContent !== "STOP_DETAILS" && screen !== "BUS") {
      return;
    }
    if (selectedStop.services.length > 0) {
      stopDetailsCacheRef.current.set(selectedStop.busStopCode, selectedStop);
      setStaticServicesStatus("SUCCESS");
      return;
    }
    void loadStaticStopDetails(selectedStop);
    return () => {
      const currentRequest = stopDetailsRequestRef.current;
      currentRequest.controller?.abort();
      stopDetailsRequestRef.current = {
        id: currentRequest.id + 1,
        controller: null,
      };
    };
  }, [bottomSheetContent, screen, selectedStop?.busStopCode]);

  useEffect(() => {
    mapCameraGeometryRef.current = mapCameraGeometry;
  }, [mapCameraGeometry]);

  useEffect(() => {
    bottomSheetStateRef.current = bottomSheetState;
  }, [bottomSheetState]);

  useEffect(() => {
    if (
      bottomSheetContent === "NEARBY" &&
      (bottomSheetState === "MEDIUM" || bottomSheetState === "EXPANDED")
    ) {
      setLastNearbySheetState(bottomSheetState);
    }
  }, [bottomSheetContent, bottomSheetState]);

  useEffect(() => {
    currentLocationRef.current = currentLocation;
    if (currentLocation?.headingDegrees !== undefined) {
      setMapHeadingDegrees(currentLocation.headingDegrees);
    }
  }, [currentLocation]);

  useEffect(
    () =>
      subscribeToDevelopmentE2ELocation((update) => {
        const coords = {
          latitude: update.latitude,
          longitude: update.longitude,
          accuracyMeters: update.accuracy,
          headingDegrees: update.heading,
        };
        lastLocationResultRef.current = { timestamp: Date.now(), coords };
        setTransportDiscovery((current) => ({
          ...current,
          location: locationStateForCoords(coords),
          locationPermission: "granted",
          locationRequested: true,
          lastSuccessfulLocation: coords,
        }));
      }),
    [],
  );

  useEffect(() => {
    if (
      journeyPhase !== "WALKING_TO_STOP" ||
      !currentLocation ||
      !selectedStop ||
      distanceBetweenCoordinates(currentLocation, selectedStop) > 50
    ) {
      return;
    }
    setJourneySetupState("WAITING_FOR_BUS");
    setJourneyPhase("WAITING_FOR_BUS");
    setGuidanceMode("INACTIVE");
    notifyPassenger(
      `You have reached ${selectedStop.description}. Wait for Service ${selectedBus?.busService ?? "your bus"}.`,
      {
        haptic: "ARRIVAL",
        id: `boarding-stop-arrival-${selectedStop.busStopCode}`,
        priority: "BUS",
      },
    );
  }, [currentLocation, journeyPhase, selectedBus?.busService, selectedStop]);

  useEffect(() => {
    const guidanceService = guidanceServiceRef.current!;
    return guidanceService.subscribe((snapshot) => {
      setLatestSpokenGuidance(snapshot.latestSpokenText);
      setGuidanceSpeaking(snapshot.speaking);
      setSpokenGuidanceSupported(snapshot.speechSupported);
      setHapticsSupported(snapshot.hapticsSupported);
      if (snapshot.latestSpokenText) {
        setHasSpokenGuidanceInCurrentFlow(true);
      }
    });
  }, []);

  useEffect(() => {
    const runtime = assistantRuntimeRef.current!;
    const unsubscribe = runtime.subscribe(setAssistantRuntimeStatus);
    return unsubscribe;
  }, []);

  useEffect(() => {
    const runtime = assistantRuntimeRef.current!;
    let releaseTimer: ReturnType<typeof setTimeout> | null = null;
    const clearReleaseTimer = () => {
      if (releaseTimer) clearTimeout(releaseTimer);
      releaseTimer = null;
    };
    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        clearReleaseTimer();
        if (nextState !== "active") {
          releaseTimer = setTimeout(
            () => void runtime.release("RELEASED"),
            5 * 60_000,
          );
        }
      },
    );
    const memorySubscription = AppState.addEventListener(
      "memoryWarning",
      () => void runtime.release("RELEASED"),
    );
    return () => {
      clearReleaseTimer();
      appStateSubscription.remove();
      memorySubscription.remove();
    };
  }, []);

  useEffect(() => {
    guidanceServiceRef.current!.configure({
      spokenGuidanceEnabled: appPreferences.spokenGuidance,
      vibrationAlerts: appPreferences.vibrationAlerts,
    });
  }, [appPreferences.spokenGuidance, appPreferences.vibrationAlerts]);

  useEffect(() => {
    if (__DEV__ && process.env.NODE_ENV !== "test") {
      const provider = routingProviderRef.current!;
      console.info("[Routing] development provider", {
        id: provider.id,
        name: provider.name,
        routeCache: "short-lived memory cache",
      });
    }
  }, []);

  useEffect(() => {
    let active = true;
    const reducedMotionResult = AccessibilityInfo.isReduceMotionEnabled?.();
    if (reducedMotionResult) {
      void reducedMotionResult.then((enabled) => {
        if (active) {
          setSystemReducedMotion(enabled);
        }
      });
    }
    const subscription = AccessibilityInfo.addEventListener?.(
      "reduceMotionChanged",
      setSystemReducedMotion,
    );
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isScreenReaderEnabled?.().then((enabled) => {
      if (active && enabled) setScreenReaderDetected(true);
    });
    const subscription = AccessibilityInfo.addEventListener?.(
      "screenReaderChanged",
      setScreenReaderDetected,
    );
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    guidanceSessionIdRef.current += 1;
    directionsRequestRef.current.controller?.abort();
    directionsRequestRef.current = {
      id: directionsRequestRef.current.id + 1,
      controller: null,
    };
    setGuidanceMode("INACTIVE");
    setDirectionsStatus("IDLE");
    setDirectionsError(null);
    resetWalkingRouteMonitoring();
    setWalkingRoute(null);
    arrivalAnnouncementStopRef.current = null;
  }, [selectedStop?.busStopCode]);

  useEffect(() => {
    setMeasuredMapLayout((current) => {
      if (current.width > 0 && current.height > 0) {
        return current;
      }
      return measuredMapLayoutSize({
        height: height - bottomNavigationHeight,
        width,
      });
    });
  }, [height, width]);

  const handleMapLayoutChange = useCallback((layout: MapLayoutSize) => {
    const next = measuredMapLayoutSize(layout);
    setMeasuredMapLayout((current) =>
      Math.abs(current.width - next.width) < 1 &&
      Math.abs(current.height - next.height) < 1
        ? current
        : next,
    );
  }, []);

  useEffect(() => {
    let active = true;
    const hydrationSessionId = journeySessionIdRef.current;
    void readSavedActiveJourney().then((savedJourney) => {
      if (!active) {
        return;
      }
      activeJourneyHydratedRef.current = true;
      if (hydrationSessionId !== journeySessionIdRef.current) {
        return;
      }
      if (savedJourney) {
        const restoredSessionId = hydrationSessionId + 1;
        journeySessionIdRef.current = restoredSessionId;
        setSelectedStop(savedJourney.selectedStop);
        setSelectedServiceOption(savedJourney.selectedServiceOption);
        setServiceOptions([savedJourney.selectedServiceOption]);
        setSelectedBus(savedJourney.selectedBus);
        setSelectedArrival(savedJourney.selectedArrival);
        setArrivingBuses(savedJourney.selectedServiceOption.buses);
        setSelectedAlightingStop(savedJourney.selectedAlightingStop);
        setRouteStops(savedJourney.routeStops);
        setCurrentStopIndex(savedJourney.currentStopIndex);
        setJourneyPhase(savedJourney.journeyPhase);
        setJourneySetupState(savedJourney.journeySetupState);
        setJourneyRequirements(savedJourney.journeyRequirements);
        setRequestId(savedJourney.requestId);
        setCaseId(savedJourney.caseId ?? null);
        setAssistanceCaseState(savedJourney.assistanceCaseState ?? null);
        setRequestStatus(savedJourney.requestStatus);
        setRequestPhase(
          savedJourney.requestPhase ??
            (savedJourney.journeyPhase === "DISEMBARKING" ||
            savedJourney.journeyPhase === "ALIGHTING"
              ? "ALIGHTING"
              : savedJourney.requestId
                ? "BOARDING"
                : null),
        );
        setVehicleStatus(savedJourney.vehicleStatus);
        if (
          savedJourney.journeyPhase === "WALKING_TO_STOP" &&
          savedJourney.walkingRoute
        ) {
          setWalkingRoute(savedJourney.walkingRoute);
          setDirectionsStatus("READY");
          setGuidanceMode(
            savedJourney.guidanceMode === "ARRIVED" ? "ARRIVED" : "PREVIEW",
          );
        }
        setScreen(screenForPersistedJourney(savedJourney));

        void fetchBusStopArrivals(savedJourney.selectedStop.busStopCode)
          .then((arrivals) => {
            if (!active || restoredSessionId !== journeySessionIdRef.current) {
              return;
            }
            const refreshedService = arrivals.services.find(
              (service) =>
                service.serviceNo === savedJourney.selectedBus.busService,
            );
            const refreshedArrival = refreshedService?.buses[0] ?? null;
            if (refreshedService) {
              const refreshedOption = serviceOptionsFromArrivals(
                savedJourney.selectedStop,
                [refreshedService],
              )[0];
              if (refreshedOption) {
                setSelectedServiceOption(refreshedOption);
                setServiceOptions([refreshedOption]);
                setArrivingBuses(refreshedService.buses);
              }
            }
            if (refreshedArrival) {
              setSelectedArrival(refreshedArrival);
              setSelectedBus((current) =>
                current
                  ? {
                      ...current,
                      busId: refreshedArrival.busId,
                      estimatedArrivalSeconds: refreshedArrival.etaSeconds,
                      isAccessible: refreshedArrival.wheelchairAccessible,
                      nextStop: refreshedArrival.destination,
                    }
                  : current,
              );
            }
          })
          .catch(() => {
            // The restored journey remains usable with its last known data.
          });
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const previousLocation = previousUserLocationRef.current;
    const changed =
      previousLocation?.latitude !== currentLocation?.latitude ||
      previousLocation?.longitude !== currentLocation?.longitude ||
      previousLocation?.accuracyMeters !== currentLocation?.accuracyMeters;
    if (changed && __DEV__ && enableLocationDebugLogs) {
      console.debug(
        "USER LOCATION CHANGED",
        previousLocation,
        currentLocation,
        previousLocation ? "GPS_UPDATE" : "LAST_KNOWN_LOCATION",
      );
    }
    previousUserLocationRef.current = currentLocation;
  }, [
    currentLocation?.accuracyMeters,
    currentLocation?.latitude,
    currentLocation?.longitude,
  ]);

  const assistanceTypes = useMemo(
    () => assistanceTypesForPhase(journeyRequirements, "BOARDING"),
    [journeyRequirements],
  );
  const alightingAssistanceTypes = useMemo(
    () =>
      appPreferences.alightingAssistance
        ? assistanceTypesForPhase(journeyRequirements, "ALIGHTING")
        : [],
    [appPreferences.alightingAssistance, journeyRequirements],
  );
  const selectedNeeds = useMemo(
    () => assistanceTypes.map(readableAssistanceType).join(", "),
    [assistanceTypes],
  );
  const hasUnsavedProfileNeeds = useMemo(
    () =>
      activeProfile
        ? profilePreferencesChanged(activeProfile, editorPreferences)
        : false,
    [activeProfile, editorPreferences],
  );
  const currentRouteStop = routeStops[currentStopIndex] ?? null;
  const nextRouteStop = routeStops[currentStopIndex + 1] ?? null;
  const plannedRouteStops = useMemo(
    () =>
      routeStops.length > 0
        ? routeStops
        : routeStopsForBus(selectedBus, selectedStop, selectedArrival),
    [routeStops, selectedArrival, selectedBus, selectedStop],
  );
  const selectedAlightingStopIndex = routeStopIndex(
    routeStops,
    selectedAlightingStop,
  );
  const stopsRemaining = stopsRemainingToDestination(
    routeStops,
    currentStopIndex,
    selectedAlightingStop,
  );
  const selectedStopIsNext =
    Boolean(selectedAlightingStop && nextRouteStop) &&
    selectedAlightingStop?.busStopCode === nextRouteStop?.busStopCode;
  const selectedStopReached =
    Boolean(selectedAlightingStop && currentRouteStop) &&
    selectedAlightingStop?.busStopCode === currentRouteStop?.busStopCode;
  const focusedAssistOnboard =
    Boolean(selectedBus) &&
    (journeyPhase === "ONBOARD" ||
      journeyPhase === "DESTINATION_APPROACHING" ||
      journeyPhase === "DESTINATION_NEXT" ||
      journeyPhase === "DISEMBARKING" ||
      journeyPhase === "ALIGHTING");
  const focusedAssistHasActiveJourney =
    Boolean(selectedBus && selectedStop) &&
    (journeyPhase === "WAITING_FOR_BUS" ||
      journeyPhase === "BUS_ARRIVING" ||
      journeyPhase === "BOARDING" ||
      focusedAssistOnboard);
  const focusedAssistNearbyStops = useMemo(() => {
    const candidates = [...nearbyStops];
    if (
      selectedStop &&
      !candidates.some(
        (candidate) => candidate.busStopCode === selectedStop.busStopCode,
      )
    ) {
      candidates.push(selectedStop);
    }
    return candidates;
  }, [nearbyStops, selectedStop]);
  const focusedAssistArrivalCandidates = useMemo(() => {
    const candidates = [...focusedAssistArrivals];
    if (
      selectedArrival &&
      !candidates.some((candidate) => candidate.busId === selectedArrival.busId)
    ) {
      candidates.push(selectedArrival);
    }
    return candidates;
  }, [focusedAssistArrivals, selectedArrival]);
  const focusedAssistActiveJourney =
    focusedAssistHasActiveJourney && selectedBus
      ? {
          bus: selectedBus,
          boardingStopCode: selectedStop?.busStopCode ?? null,
          arrival: selectedArrival,
          phase: journeyPhase,
          vehicleStatus,
        }
      : null;
  const focusedAssistActiveBus: BusAtStop | null = selectedBus
    ? {
        id: selectedBus.busId,
        serviceNo: selectedBus.busService,
        vehicleId: selectedBus.busId,
        destination: selectedArrival?.destination ?? selectedBus.nextStop,
        wheelchairAccessible: selectedBus.isAccessible,
        etaSeconds: selectedArrival?.etaSeconds,
        confidence: vehicleStatus === "ARRIVED" ? "HIGH" : "MEDIUM",
        source:
          vehicleStatus === "ARRIVED" ? "VEHICLE_TELEMETRY" : "ACTIVE_JOURNEY",
        activeJourneyMatch: focusedAssistHasActiveJourney,
      }
    : null;
  const activeJourneyRequestEvent = events.find(
    (event) => event.type === "REQUEST_STATUS" && event.requestId === requestId,
  );
  const activeJourneyFocusedRequest: FocusedAssistRequestContext = {
    requestId,
    status: requestStatus,
    assistanceType:
      activeJourneyRequestEvent?.type === "REQUEST_STATUS"
        ? (activeJourneyRequestEvent.assistanceTypes[0] ?? null)
        : null,
    submitting: isLoading && Boolean(selectedBus),
    bus: focusedAssistActiveBus,
    stop: selectedStop,
    error: null,
  };
  const effectiveFocusedAssistRequest = focusedAssistOnboard
    ? requestId && requestPhase === "ALIGHTING"
      ? activeJourneyFocusedRequest
      : {
          requestId: null,
          status: null,
          assistanceType: null,
          submitting: false,
          bus: focusedAssistActiveBus,
          stop: selectedStop,
          error: null,
        }
    : focusedAssistRequest.requestId ||
        focusedAssistRequest.submitting ||
        focusedAssistRequest.error
      ? focusedAssistRequest
      : requestId && requestPhase === "BOARDING"
        ? activeJourneyFocusedRequest
        : focusedAssistRequest;
  const focusedAssistContext = useMemo(
    () =>
      deriveFocusedAssistContext(
        {
          locating: focusedAssistLocating,
          location: currentLocation,
          nearbyStops: focusedAssistNearbyStops,
          manuallySelectedStop: focusedAssistManualStop,
          arrivals: focusedAssistArrivalCandidates,
          activeJourney: focusedAssistActiveJourney,
          onboard: focusedAssistOnboard,
          destinationName: selectedAlightingStop?.description ?? null,
          destinationIsNext:
            selectedStopIsNext || journeyPhase === "DESTINATION_NEXT",
          selectedBusId: focusedAssistSelectedBusId,
          request: effectiveFocusedAssistRequest,
        },
        busPresenceProviderRef.current,
      ),
    [
      currentLocation,
      effectiveFocusedAssistRequest,
      focusedAssistActiveJourney,
      focusedAssistArrivalCandidates,
      focusedAssistLocating,
      focusedAssistManualStop,
      focusedAssistNearbyStops,
      focusedAssistOnboard,
      focusedAssistSelectedBusId,
      journeyPhase,
      selectedAlightingStop?.description,
      selectedStopIsNext,
    ],
  );
  const focusedAssistController = useMemo<FocusedAssistController>(
    () =>
      createFocusedAssistController({
        getContext: () => focusedAssistContext,
        selectBus: (busId) => {
          setFocusedAssistSelectedBusId(busId);
          setFocusedAssistRequest((current) => ({
            ...current,
            error: null,
          }));
        },
        requestRamp: requestFocusedAssistRamp,
        requestExtraTime: requestFocusedAssistExtraTime,
        requestAlightingAssistance: requestFocusedAlightingAssistance,
        refreshContext: refreshFocusedAssistContext,
        reportError: (message) =>
          setFocusedAssistRequest((current) => ({
            ...current,
            submitting: false,
            error: message,
          })),
      }),
    [focusedAssistContext],
  );
  const assistantCurrentStop = focusedAssistOnboard
    ? currentRouteStop
    : (focusedAssistContext.stop ?? selectedStop);
  const assistantRampStatus =
    effectiveFocusedAssistRequest.assistanceType === "EXTENDED_DWELL_TIME" &&
    (focusedAssistContext.state === "REQUESTING" ||
      focusedAssistContext.state === "REQUESTED" ||
      focusedAssistContext.state === "ACKNOWLEDGED")
      ? focusedAssistContext.selectedBus?.confidence === "HIGH"
        ? "ONE_BUS_PRESENT"
        : "BUS_CONFIRMATION_REQUIRED"
      : focusedAssistContext.state;
  const assistantContextRevisionRef = useRef({
    fingerprint: "",
    revision: 0,
  });
  const assistantSafetyFingerprint = JSON.stringify({
    journeyPhase,
    onboard: focusedAssistOnboard,
    stopCode: assistantCurrentStop?.busStopCode ?? null,
    serviceNo:
      selectedBus?.busService ??
      focusedAssistContext.selectedBus?.serviceNo ??
      null,
    busId:
      focusedAssistContext.selectedBus?.id ?? selectedBus?.busId ?? null,
    destination: selectedAlightingStop?.description ?? null,
    caseId,
    requestId,
    requestPhase,
    requestStatus,
    assistanceCaseState,
    rampStatus: assistantRampStatus,
    walkingGuidanceActive: directionsActive,
    buses: focusedAssistContext.buses.map((bus) => ({
      id: bus.id,
      serviceNo: bus.serviceNo,
      confidence: bus.confidence,
    })),
  });
  if (
    assistantContextRevisionRef.current.fingerprint !==
    assistantSafetyFingerprint
  ) {
    assistantContextRevisionRef.current = {
      fingerprint: assistantSafetyFingerprint,
      revision: assistantContextRevisionRef.current.revision + 1,
    };
  }
  const assistantContext = useMemo<AssistantContext>(
    () => ({
      locale: normalizeAssistantLocale(appPreferences.assistantLocale),
      journeyId:
        requestId ??
        caseId ??
        focusedAssistContext.selectedBus?.id ??
        selectedBus?.busId ??
        null,
      revision: assistantContextRevisionRef.current.revision,
      activeCaseId: caseId,
      journeyStage: journeyPhase,
      hasActiveJourney: focusedAssistHasActiveJourney,
      onboard: focusedAssistOnboard,
      currentStop: assistantCurrentStop
        ? {
            busStopCode: assistantCurrentStop.busStopCode,
            description: assistantCurrentStop.description,
          }
        : null,
      selectedService:
        selectedBus?.busService ??
        focusedAssistContext.selectedBus?.serviceNo ??
        null,
      destination: selectedAlightingStop?.description ?? null,
      nextStop: nextRouteStop?.description ?? null,
      stopsRemaining,
      busesAtStop: focusedAssistContext.buses.map((bus) => ({
        id: bus.id,
        serviceNo: bus.serviceNo,
        destination: bus.destination,
        wheelchairAccessible: bus.wheelchairAccessible,
        confidence: bus.confidence,
      })),
      selectedBusAtStop: focusedAssistContext.selectedBus
        ? {
            id: focusedAssistContext.selectedBus.id,
            serviceNo: focusedAssistContext.selectedBus.serviceNo,
            destination: focusedAssistContext.selectedBus.destination,
            wheelchairAccessible:
              focusedAssistContext.selectedBus.wheelchairAccessible,
            confidence: focusedAssistContext.selectedBus.confidence,
          }
        : null,
      busArrivalSeconds:
        selectedArrival?.etaSeconds ??
        focusedAssistContext.selectedBus?.etaSeconds ??
        null,
      rampStatus: assistantRampStatus,
      alightingAssistanceStatus:
        requestPhase === "ALIGHTING" ? requestStatus : null,
      walkingGuidanceActive: directionsActive,
      walkingRouteAvailable: Boolean(walkingRoute),
      routeOptions:
        journeyPlanner.alternatives.length > 0
          ? journeyPlanner.alternatives.map((alternative) => ({
              id: alternative.id,
              title: alternative.title,
              serviceNo: alternative.serviceNo,
              walkingMinutes: alternative.walkingMinutes,
              shelterCoverage: "UNVERIFIED" as const,
            }))
          : selectedBus
            ? [
                {
                  id: `active-${selectedBus.busId}`,
                  title: `Service ${selectedBus.busService}`,
                  serviceNo: selectedBus.busService,
                  walkingMinutes: Math.max(
                    1,
                    Math.ceil((selectedStop?.distanceMeters ?? 0) / 75),
                  ),
                  shelterCoverage: "UNVERIFIED" as const,
                },
              ]
            : [],
      preferences: {
        wheelchairAssistance: appPreferences.wheelchairAssistance,
        spokenGuidance: appPreferences.spokenGuidance,
        simplifiedJourney: appPreferences.simplifiedJourney,
        vibrationAlerts: appPreferences.vibrationAlerts !== "OFF",
      },
    }),
    [
      appPreferences.assistantLocale,
      appPreferences.simplifiedJourney,
      appPreferences.spokenGuidance,
      appPreferences.vibrationAlerts,
      appPreferences.wheelchairAssistance,
      caseId,
      assistantCurrentStop,
      assistantRampStatus,
      directionsActive,
      focusedAssistContext.buses,
      focusedAssistContext.selectedBus,
      focusedAssistHasActiveJourney,
      focusedAssistOnboard,
      journeyPhase,
      journeyPlanner.alternatives,
      nextRouteStop?.description,
      requestPhase,
      requestId,
      requestStatus,
      selectedAlightingStop?.description,
      selectedArrival?.etaSeconds,
      selectedBus?.busId,
      selectedBus?.busService,
      selectedStop?.distanceMeters,
      stopsRemaining,
      walkingRoute,
    ],
  );
  const assistantContextRef = useRef(assistantContext);
  assistantContextRef.current = assistantContext;
  const focusedAssistControllerRef = useRef(focusedAssistController);
  focusedAssistControllerRef.current = focusedAssistController;
  const voiceAssistantActionHandlersRef = useRef<Omit<
    VoiceAssistantActions,
    "getContext"
  > | null>(null);
  voiceAssistantActionHandlersRef.current = {
    refreshLocationContext: async () => {
      await focusedAssistControllerRef.current.refreshContext();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      return assistantContextRef.current.currentStop
        ? { ok: true }
        : {
            ok: false,
            reason:
              "I couldn’t identify your nearest bus stop. Use my location or choose a bus stop manually.",
          };
    },
    requestRamp: async (busId) => {
      const sent =
        await focusedAssistControllerRef.current.requestRampForBus(busId);
      return sent
        ? { ok: true }
        : {
            ok: false,
            reason:
              focusedAssistControllerRef.current.getContext().request.error ??
              "A ramp request is already active or the bus can no longer be confirmed.",
          };
    },
    requestExtraBoardingTime: async (busId) => {
      const sent =
        await focusedAssistControllerRef.current.requestExtraTimeForBus(busId);
      return sent
        ? { ok: true }
        : {
            ok: false,
            reason:
              focusedAssistControllerRef.current.getContext().request.error ??
              "An assistance request is already active or the bus can no longer be confirmed.",
          };
    },
    requestAlightingAssistance: async () => ({
      ok: await focusedAssistControllerRef.current.requestAlightingAssistance(),
      reason: "I couldn’t send your alighting assistance request.",
    }),
    requestOperatorHelp: async (reason) => {
      const context = assistantContextRef.current;
      if (!context.currentStop) {
        return {
          ok: false,
          reason: "Choose or confirm your current bus stop first.",
        };
      }
      try {
        const idempotencyKey = [
          "assistant-help",
          context.journeyId ?? context.currentStop.busStopCode,
          context.revision ?? 0,
        ].join("-");
        const response = await requestPassengerOperatorHelp({
          stopCode: context.currentStop.busStopCode,
          busId: context.selectedBusAtStop?.id,
          busService: context.selectedService ?? undefined,
          phase: context.onboard ? "ALIGHTING" : "BOARDING",
          anonymousToken: assistantAnonymousTokenRef.current,
          idempotencyKey,
          reason,
        });
        setCaseId(response.case.caseId);
        setAssistanceCaseState(response.case.state);
        return { ok: true };
      } catch {
        return {
          ok: false,
          reason: "I couldn’t alert an operator. Please try again.",
        };
      }
    },
    startDirectionsToSelectedStop: startVoiceWalkingGuidance,
    stopGuidance: () => {
      if (!directionsActive) {
        return { ok: false, reason: "Walking guidance isn’t active." };
      }
      exitGuidance();
      return { ok: true };
    },
    repeatGuidance: () => {
      const latest = guidanceServiceRef.current!.snapshot().latestSpokenText;
      if (!latest) {
        return {
          ok: false,
          reason: "There isn’t a guidance message to repeat yet.",
        };
      }
      if (
        shouldSuppressAssistantTts({
          platform: Platform.OS,
          screenReaderDetected,
        })
      ) {
        AccessibilityInfo.announceForAccessibility(latest);
        return { ok: true, text: latest };
      }
      return guidanceServiceRef.current!.repeatLatest({ force: true })
        ? { ok: true, text: latest }
        : { ok: false, reason: "Speech is unavailable in this browser." };
    },
    endJourney: async () => ({
      ok: await endJourney("ENDED_EARLY"),
      reason: "I couldn’t end your journey.",
    }),
    speakResponse: (text) => {
      if (
        shouldSuppressAssistantTts({
          platform: Platform.OS,
          screenReaderDetected,
        })
      ) {
        AccessibilityInfo.announceForAccessibility(text);
        return false;
      }
      return guidanceServiceRef.current!.speakAssistantResponse(text);
    },
  };
  const voiceAssistantControllerRef = useRef<VoiceAssistantController | null>(
    null,
  );
  if (!voiceAssistantControllerRef.current) {
    voiceAssistantControllerRef.current = new VoiceAssistantController(
      {
        getContext: () => assistantContextRef.current,
        refreshLocationContext: () =>
          voiceAssistantActionHandlersRef.current!.refreshLocationContext(),
        requestRamp: (busId) =>
          voiceAssistantActionHandlersRef.current!.requestRamp(busId),
        requestExtraBoardingTime: (busId) =>
          voiceAssistantActionHandlersRef.current!.requestExtraBoardingTime(
            busId,
          ),
        requestAlightingAssistance: () =>
          voiceAssistantActionHandlersRef.current!.requestAlightingAssistance(),
        requestOperatorHelp: (reason) =>
          voiceAssistantActionHandlersRef.current!.requestOperatorHelp(reason),
        startDirectionsToSelectedStop: () =>
          voiceAssistantActionHandlersRef.current!.startDirectionsToSelectedStop(),
        stopGuidance: () =>
          voiceAssistantActionHandlersRef.current!.stopGuidance(),
        repeatGuidance: () =>
          voiceAssistantActionHandlersRef.current!.repeatGuidance(),
        endJourney: () => voiceAssistantActionHandlersRef.current!.endJourney(),
        speakResponse: (text) =>
          voiceAssistantActionHandlersRef.current!.speakResponse(text),
      },
      {
        developmentLogging: __DEV__ && process.env.NODE_ENV !== "test",
        turnProvider: new HybridAssistantTurnProvider(
          undefined,
          developmentE2EAssistantGenerator() ?? assistantRuntimeRef.current,
        ),
      },
    );
  }
  const lastAssistantRuntimeFailureRef = useRef<string | null>(null);
  useEffect(() => {
    if (assistantRuntimeStatus.mode !== "RULES_ONLY") return;
    if (
      ![
        "INITIALIZATION_FAILED",
        "MODEL_INTEGRITY_FAILED",
        "INFERENCE_FAILED",
        "INFERENCE_TIMEOUT",
        "CIRCUIT_OPEN",
      ].includes(assistantRuntimeStatus.reasonCode)
    ) {
      return;
    }
    const signature = `${assistantRuntimeStatus.reasonCode}:${assistantRuntimeStatus.consecutiveFailures}`;
    if (lastAssistantRuntimeFailureRef.current === signature) return;
    lastAssistantRuntimeFailureRef.current = signature;
    voiceAssistantControllerRef.current!.recordModelFailure(
      assistantRuntimeStatus.reasonCode,
    );
  }, [assistantRuntimeStatus]);

  const shareAssistantDiagnostic = useCallback(
    (turn: AssistantTurnResult) => {
      const preview = createAssistantDiagnosticPreview(turn, assistantContext);
      Alert.alert(
        "Review redacted exchange",
        `You: ${preview.redactedTranscript}\n\nGoAssist: ${preview.redactedResponse}\n\nNo audio or normal conversation history will be shared.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Share",
            onPress: () => {
              void submitAssistantDiagnostic({
                turn,
                context: assistantContext,
                locale: normalizeAssistantLocale(
                  appPreferences.assistantLocale,
                ),
                runtimeStatus: assistantRuntimeStatus,
              })
                .then(() =>
                  Alert.alert(
                    "Exchange shared",
                    "The redacted diagnostic will be deleted after 30 days. You can withdraw it by turning diagnostics off.",
                  ),
                )
                .catch((error: unknown) =>
                  Alert.alert(
                    "Couldn’t share exchange",
                    error instanceof Error
                      ? error.message
                      : "Try again when a connection is available.",
                  ),
                );
            },
          },
        ],
      );
    }, [
      appPreferences.assistantLocale,
      assistantContext,
      assistantRuntimeStatus,
    ],
  );
  useEffect(() => {
    voiceAssistantControllerRef.current?.clearPendingAction();
    voiceAssistantControllerRef.current?.clearConversation();
    assistantAnonymousTokenRef.current =
      `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }, [activeProfile?.profileId]);

  useEffect(() => {
    if (journeyPhase === "COMPLETED") {
      voiceAssistantControllerRef.current?.clearPendingAction();
      voiceAssistantControllerRef.current?.clearConversation();
    }
  }, [journeyPhase]);
  useEffect(() => {
    if (
      !selectedBus ||
      !selectedArrival ||
      (journeyPhase !== "WAITING_FOR_BUS" &&
        journeySetupState !== "WAITING_FOR_BUS")
    ) {
      return;
    }
    const minutes = Math.max(1, Math.ceil(selectedArrival.etaSeconds / 60));
    const approaching = selectedArrival.etaSeconds <= 90;
    if (approaching && !appPreferences.warnBusApproaching) {
      return;
    }
    const band = approaching
      ? "approaching"
      : selectedArrival.etaSeconds <= 360
        ? "five-minutes"
        : "later";
    announceSemanticGuidance({
      haptic: approaching ? "WARNING" : undefined,
      id: `bus-${selectedArrival.busId}-eta-${band}`,
      priority: "BUS",
      text: approaching
        ? `Service ${selectedBus.busService} is approaching.`
        : `Service ${selectedBus.busService} is approximately ${minutes} minutes away.`,
    });
  }, [
    appPreferences.warnBusApproaching,
    journeyPhase,
    journeySetupState,
    selectedArrival,
    selectedBus,
  ]);
  const filteredNearbyStops = useMemo(() => {
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
          [landmark.name, landmark.category]
            .join(" ")
            .toLowerCase()
            .includes(query),
      );
      return (
        stopText.includes(query) || serviceText.includes(query) || landmarkMatch
      );
    });
  }, [nearbyStops, stopSearchQuery]);
  useEffect(() => {
    if (
      !appPreferences.preferAccessibleStops ||
      !nearbyOpen ||
      !currentLocation ||
      filteredNearbyStops.length === 0
    ) {
      return undefined;
    }
    const controller = new AbortController();
    const shortlist = [...filteredNearbyStops]
      .sort((first, second) => first.distanceMeters - second.distanceMeters)
      .slice(0, 3);
    setAccessibleStopRoutes((current) => ({
      ...current,
      ...Object.fromEntries(
        shortlist.map((stop) => [stop.busStopCode, "CHECKING" as const]),
      ),
    }));
    void (async () => {
      for (const stop of shortlist) {
        try {
          const route = await routingProviderRef.current!.getRoute({
            origin: currentLocation,
            destination: stop,
            destinationLabel: stop.description,
            mobilityMode: "WHEELCHAIR",
            accessibilityPreferences: {
              avoidSteps: true,
              avoidSteepSlopes: appPreferences.avoidSteepSlopes,
              preferSmoothSurfaces: appPreferences.preferSmoothSurfaces,
            },
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          setAccessibleStopRoutes((current) => ({
            ...current,
            [stop.busStopCode]:
              route.accessibility.confidence === "LIMITED_DATA"
                ? "LIMITED_DATA"
                : "AVAILABLE",
          }));
        } catch (routeError) {
          if (controller.signal.aborted) return;
          setAccessibleStopRoutes((current) => ({
            ...current,
            [stop.busStopCode]:
              routeError instanceof RoutingProviderError &&
              (routeError.code === "NO_ROUTE" ||
                routeError.code === "KNOWN_BARRIER")
                ? "UNAVAILABLE"
                : "LIMITED_DATA",
          }));
        }
      }
    })();
    return () => controller.abort();
  }, [
    appPreferences.avoidSteepSlopes,
    appPreferences.preferSmoothSurfaces,
    appPreferences.preferAccessibleStops,
    currentLocation?.latitude,
    currentLocation?.longitude,
    filteredNearbyStops,
    nearbyOpen,
  ]);
  const visibleNearbyStops = useMemo(() => {
    if (!appPreferences.preferAccessibleStops) {
      return filteredNearbyStops;
    }
    return rankStopsForWheelchair(
      filteredNearbyStops,
      accessibleStopRoutes,
      accessibleRoutesOnly,
    );
  }, [
    accessibleRoutesOnly,
    accessibleStopRoutes,
    appPreferences.preferAccessibleStops,
    filteredNearbyStops,
  ]);
  const recommendedAccessibleStopCode = appPreferences.preferAccessibleStops
    ? (visibleNearbyStops.find(
        (stop) => accessibleStopRoutes[stop.busStopCode] === "AVAILABLE",
      )?.busStopCode ?? visibleNearbyStops[0]?.busStopCode)
    : undefined;
  const visibleMapStops = useMemo(() => {
    const byCode = new Map<string, NearbyBusStop>();
    for (const stop of regionalStops) byCode.set(stop.busStopCode, stop);
    for (const stop of nearbyStops) byCode.set(stop.busStopCode, stop);
    if (selectedStop) byCode.set(selectedStop.busStopCode, selectedStop);
    return [...byCode.values()];
  }, [nearbyStops, regionalStops, selectedStop]);
  const availableDestinationStops = useMemo(() => {
    const query = destinationSearchQuery.trim().toLowerCase();
    const upcoming = plannedRouteStops.slice(1);
    if (!query) {
      return upcoming;
    }
    return upcoming.filter((stop) =>
      [stop.description, stop.roadName, stop.busStopCode]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [destinationSearchQuery, plannedRouteStops]);
  const effectiveJourneyOrigin = useMemo(
    () => journeyPlanner.origin ?? currentLocationJourneyPoint(currentLocation),
    [currentLocation, journeyPlanner.origin],
  );
  const selectedJourneyAlternative = useMemo(
    () =>
      journeyPlanner.alternatives.find(
        (alternative) =>
          alternative.id === journeyPlanner.selectedAlternativeId,
      ) ??
      journeyPlanner.alternatives[0] ??
      null,
    [journeyPlanner.alternatives, journeyPlanner.selectedAlternativeId],
  );
  const mapPickCandidate = useMemo(
    () => mapCandidateJourneyPoint(mapViewport.center),
    [mapViewport.center.latitude, mapViewport.center.longitude],
  );
  const canRepeatJourneyGuidance =
    appPreferences.repeatAudio &&
    hasSpokenGuidanceInCurrentFlow &&
    Boolean(selectedBus || selectedStop);
  const isJourneyLocationLoading =
    screen === "JOURNEY_IDLE" &&
    isLoading &&
    loadingMessage === "Finding nearby bus stops...";
  const isJourneyManualStopsLoading =
    screen === "JOURNEY_IDLE" &&
    isLoading &&
    loadingMessage === "Loading nearby bus stops...";
  const isJourneyEntryLoading =
    isJourneyLocationLoading || isJourneyManualStopsLoading;
  const journeyEntryLoadingPresentationRef = useRef<{
    kind: "LOCATING" | "MAP_LOADING";
    message: string;
  }>({
    kind: "LOCATING",
    message: "Finding nearby bus stops...",
  });
  if (isJourneyLocationLoading) {
    journeyEntryLoadingPresentationRef.current = {
      kind: "LOCATING",
      message: "Finding nearby bus stops...",
    };
  } else if (isJourneyManualStopsLoading) {
    journeyEntryLoadingPresentationRef.current = {
      kind: "MAP_LOADING",
      message: "Loading bus stop choices...",
    };
  }
  const journeyEntryLoadingVisible = useDelayedLoadingVisibility(
    isJourneyEntryLoading,
  );
  const findBusPanelState = resolveFindBusPanelState({
    discovery: transportDiscovery,
    loadingKind: journeyEntryLoadingPresentationRef.current.kind,
    loadingMessage: journeyEntryLoadingPresentationRef.current.message,
    loadingVisible: journeyEntryLoadingVisible,
  });
  const retryJourneyDiscovery =
    transportDiscovery.lastSuccessfulLocation &&
    (transportDiscovery.nearbyStopsStatus === "network_error" ||
      transportDiscovery.nearbyStopsStatus === "service_error" ||
      transportDiscovery.nearbyStopsStatus === "empty")
      ? showNearbyStopsInArea
      : findMyBusStop;
  useEffect(() => {
    if (screen !== "STOP") {
      return;
    }

    regionalStopsRequestRef.current.controller?.abort();
    const controller = new AbortController();
    const requestId = regionalStopsRequestRef.current.id + 1;
    regionalStopsRequestRef.current = { id: requestId, controller };
    setRegionalStopsStatus("LOADING");

    const timeout = setTimeout(() => {
      const query = {
        latitude: mapViewport.center.latitude,
        longitude: mapViewport.center.longitude,
        radiusMeters: regionalStopRadiusForZoom(mapViewport.zoom),
        limit: 500,
      };
      void fetchRegionalBusStops(query, controller.signal)
        .then((result) => {
          if (regionalStopsRequestRef.current.id !== requestId) return;
          setRegionalStops(result.stops);
          setRegionalStopsStatus("SUCCESS");
          if (__DEV__ && process.env.NODE_ENV !== "test") {
            console.debug(
              `[BusStops] Loaded ${result.stops.length} stops for viewport`,
              {
                center: {
                  latitude: query.latitude,
                  longitude: query.longitude,
                },
                radiusMeters: query.radiusMeters,
              },
            );
          }
        })
        .catch((apiError: unknown) => {
          if (
            apiError instanceof DOMException &&
            apiError.name === "AbortError"
          )
            return;
          if (regionalStopsRequestRef.current.id !== requestId) return;
          if (__DEV__ && process.env.NODE_ENV !== "test") {
            console.error("[BusStops] Failed to load visible stops", {
              endpoint:
                apiError instanceof BusStopRequestError
                  ? apiError.endpoint
                  : "/api/bus-stops/nearby",
              status:
                apiError instanceof BusStopRequestError
                  ? apiError.status
                  : null,
              center: {
                latitude: query.latitude,
                longitude: query.longitude,
              },
              radiusMeters: query.radiusMeters,
              error:
                apiError instanceof Error
                  ? apiError.message
                  : "Unknown bus-stop request error",
            });
          }
          setRegionalStopsStatus("ERROR");
        });
    }, 225);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [
    mapViewport.center.latitude,
    mapViewport.center.longitude,
    mapViewport.zoom,
    regionalStopsRetryKey,
    screen,
  ]);
  useEffect(() => {
    if (!busStopSearch.isOpen) {
      return;
    }

    const query = busStopSearch.query.trim();
    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;

    if (!query) {
      setBusStopSearch((current) => ({
        ...current,
        status: "IDLE",
        results: emptySearchResults,
        requestId,
      }));
      return;
    }

    setBusStopSearch((current) => ({
      ...current,
      status: "SEARCHING",
      requestId,
      caseId,
      assistanceCaseState,
    }));

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      const fallbackStops =
        process.env.NODE_ENV === "test"
          ? localSearchStops
          : [...regionalStops, ...nearbyStops];
      const localResults = searchTransport(query, fallbackStops);
      void searchBusStops(query, controller.signal)
        .then((response) => {
          if (searchRequestIdRef.current !== requestId) return;
          const resultStops =
            process.env.NODE_ENV === "test"
              ? Array.from(
                  new Map(
                    [...response.stops, ...localResults.stops].map((stop) => [
                      stop.busStopCode,
                      stop,
                    ]),
                  ).values(),
                )
              : response.stops;
          const services = Array.from(
            new Set(
              resultStops
                .flatMap((stop) => stop.services)
                .filter((service) =>
                  normalizeSearchText(service).includes(
                    normalizeSearchText(query),
                  ),
                ),
            ),
          )
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .slice(0, 5);
          const results: BusStopSearchResults = {
            stops: resultStops,
            places: localResults.places,
            services,
          };
          const hasResults =
            results.stops.length > 0 ||
            results.places.length > 0 ||
            results.services.length > 0;
          setBusStopSearch((current) => ({
            ...current,
            status: hasResults ? "SUCCESS" : "EMPTY",
            results,
            requestId,
          }));
        })
        .catch((apiError: unknown) => {
          if (
            apiError instanceof DOMException &&
            apiError.name === "AbortError"
          )
            return;
          if (searchRequestIdRef.current !== requestId) return;
          const hasFallbackResults =
            localResults.stops.length > 0 ||
            localResults.places.length > 0 ||
            localResults.services.length > 0;
          setBusStopSearch((current) => ({
            ...current,
            status: hasFallbackResults ? "SUCCESS" : "ERROR",
            results: localResults,
            requestId,
          }));
        });
    }, 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [busStopSearch.isOpen, busStopSearch.query, nearbyStops, regionalStops]);
  const updateBottomSheetState = useCallback((state: BottomSheetState) => {
    setBottomSheetState(state);
    if (state === "HIDDEN_PEEK") {
      setNearbyOpen(false);
    }
    if (state !== "HIDDEN_PEEK") {
      setLastExpandedSheetState(state);
    }
  }, []);
  const runCameraCommand = useCallback(
    (
      command: CameraCommand,
      mode: ViewportSource,
      update: (current: MapViewport) => MapViewport,
      cameraMode: CameraMode = cameraModeForViewportSource(mode),
    ) => {
      cameraIntentIdRef.current += 1;
      if (command !== "selectStopReveal") {
        selectedStopCameraIntentRef.current += 1;
      }
      if (__DEV__ && enableCameraDebugLogs) {
        console.info("CAMERA", {
          action: command,
          cameraMode,
          viewportSource: mode,
        });
      }
      setMapViewport((current) => {
        const next = update(current);
        debugMapCameraSnapshot({
          bottomSheetState: bottomSheetStateRef.current,
          cameraCenter: current.center,
          cameraMode,
          geometry: mapCameraGeometryRef.current,
          phase: "before",
          userLocation: currentLocationRef.current,
          zoom: current.zoom,
        });
        debugMapCameraSnapshot({
          bottomSheetState: bottomSheetStateRef.current,
          cameraCenter: next.center,
          cameraMode,
          geometry: mapCameraGeometryRef.current,
          phase: "after",
          userLocation: currentLocationRef.current,
          zoom: next.zoom,
        });
        return {
          ...next,
          zoom: clampMapZoom(next.zoom, mode),
          mode,
        };
      });
      setViewportSource(mode);
      setMapCameraMode(cameraMode);
      setMapManuallyMoved(cameraMode === "MANUAL");
    },
    [],
  );
  const visibleLandmarks = useMemo(() => {
    const stopCodes = new Set(visibleMapStops.map((stop) => stop.busStopCode));
    const query = stopSearchQuery.trim().toLowerCase();
    return orientationLandmarks.filter((landmark) => {
      const relatedToVisibleStop = landmark.relatedStopCodes.some((code) =>
        stopCodes.has(code),
      );
      const queryMatch = [landmark.name, landmark.category]
        .join(" ")
        .toLowerCase()
        .includes(query);
      return (
        landmark.tier <= 2 &&
        (relatedToVisibleStop || Boolean(query && queryMatch))
      );
    });
  }, [stopSearchQuery, visibleMapStops]);
  const selectedLandmark = useMemo(
    () =>
      selectedLandmarkId
        ? (orientationLandmarks.find(
            (landmark) => landmark.id === selectedLandmarkId,
          ) ?? null)
        : selectedStop
          ? (orientationLandmarks.find((landmark) =>
              landmark.relatedStopCodes.includes(selectedStop.busStopCode),
            ) ?? null)
          : null,
    [selectedLandmarkId, selectedStop],
  );
  useEffect(() => {
    if (!currentLocation || followState === "FREE") {
      return;
    }

    const geometry = mapCameraGeometryRef.current;
    const projectedUserLocation = createMapProjection(
      mapViewport.center,
      mapViewport.zoom,
    ).projectRaw(currentLocation);
    if (
      projectedPointInRect(
        projectedUserLocation,
        geometry.centerSafeZone,
        geometry,
      )
    ) {
      return;
    }

    const nextCenter = cameraCenterForUserLocation(
      currentLocation,
      mapViewport.zoom,
      geometry,
    );
    if (
      distanceBetweenCoordinates(mapViewport.center, nextCenter) <
      followUserMovementThresholdMeters
    ) {
      return;
    }

    runCameraCommand(
      "followUser",
      "USER_LOCATION",
      (current) => ({
        ...current,
        center: nextCenter,
        zoom:
          current.zoom < mapZoomLimits.journeyMin
            ? DEFAULT_ZOOM
            : clampMapZoom(current.zoom, "USER_LOCATION"),
      }),
      "FOLLOW_USER",
    );
  }, [
    currentLocation,
    followState,
    mapCameraGeometry,
    mapViewport.center,
    mapViewport.zoom,
    runCameraCommand,
  ]);
  const selectStopForBoarding = useCallback(
    (stop: NearbyBusStop) => {
      const selectionIntentId = selectedStopCameraIntentRef.current + 1;
      selectedStopCameraIntentRef.current = selectionIntentId;
      setSelectedStop(stop);
      setSelectedLandmarkId(null);
      setBottomSheetContent("STOP_DETAILS");
      setNearbyOpen(false);
      updateBottomSheetState("MEDIUM");
      setGuidanceMode("INACTIVE");
      setFollowState("FREE");
      handleStopSelectionCamera({
        currentLocation,
        currentGeometry: mapCameraGeometryRef.current,
        geometry: createMapCameraGeometry({
          mapLayout: measuredMapLayout,
        }),
        intentId: selectionIntentId,
        intentRef: selectedStopCameraIntentRef,
        runCameraCommand,
        stop,
        viewport: mapViewport,
      });
      announceGuidance(`Selected bus stop, ${stop.description}.`);
    },
    [
      currentLocation,
      mapViewport,
      measuredMapLayout,
      runCameraCommand,
      updateBottomSheetState,
    ],
  );
  const markMapMoved = useCallback(() => {
    selectedStopCameraIntentRef.current += 1;
    setViewportSource("USER_PAN");
    setMapCameraMode("MANUAL");
    setMapManuallyMoved(true);
    setFollowState("FREE");
  }, []);
  const handleProviderViewportChange = useCallback(
    ({ center, zoom, bearing, pitch }: ProviderViewportChange) => {
      selectedStopCameraIntentRef.current += 1;
      runCameraCommand(
        "manualPan",
        "USER_PAN",
        (current) => ({
          ...current,
          center,
          zoom,
          bearing,
          pitch,
        }),
        "MANUAL",
      );
      setFollowState("FREE");
    },
    [runCameraCommand],
  );
  const focusStopCluster = useCallback(
    (center: MapCoordinate) => {
      runCameraCommand(
        "expandCluster",
        "CLUSTER_EXPAND",
        (current) => ({
          ...current,
          center,
          zoom: clampMapZoom(
            Math.min(18, Math.max(current.zoom + 2, 16)),
            "CLUSTER_EXPAND",
          ),
          bearing: current.bearing,
          pitch: current.pitch,
        }),
        "CLUSTER_FOCUS",
      );
      setFollowState("FREE");
      AccessibilityInfo.announceForAccessibility(
        "Zooming into clustered nearby bus stops.",
      );
    },
    [runCameraCommand],
  );
  const recenterStopMap = useCallback(() => {
    const focusZoom = DEFAULT_ZOOM;
    runCameraCommand(
      "locateUser",
      "USER_LOCATION",
      (current) => ({
        ...current,
        center: currentLocation
          ? cameraCenterForUserLocation(
              currentLocation,
              focusZoom,
              mapCameraGeometryRef.current,
            )
          : manualStopLookup,
        zoom: focusZoom,
        bearing: 0,
        pitch: 0,
      }),
      "FOLLOW_USER",
    );
    setFollowState("FOLLOW_USER");
  }, [currentLocation, runCameraCommand]);
  const confirmSelectedStop = useCallback(() => {
    if (selectedStop) {
      if (focusedAssistSelectingStopRef.current) {
        const focusedStop = selectedStop;
        focusedAssistSelectingStopRef.current = false;
        setFocusedAssistManualStop(focusedStop);
        setFocusedAssistSelectedBusId(null);
        setFocusedAssistArrivals([]);
        setSelectedStop(focusedAssistPreviousSelectedStopRef.current);
        focusedAssistPreviousSelectedStopRef.current = null;
        setScreen("ACCESSIBILITY");
        focusedAssistLocationRequestRef.current += 1;
        void loadFocusedAssistArrivals(focusedStop);
        return;
      }
      confirmBusStop(selectedStop);
    }
  }, [selectedStop]);
  const selectServiceFromSelectedStop = useCallback(
    (serviceNo: string) => {
      if (selectedStop) {
        confirmBusStop(selectedStop, serviceNo);
      }
    },
    [selectedStop],
  );
  const hearSelectedStop = useCallback(() => {
    if (selectedStop) {
      announceGuidance(stopAnnouncement(selectedStop));
    }
  }, [selectedStop]);
  const requestWalkingDirections = useCallback(
    async (
      reason: "INITIAL" | "RECALCULATE" = "INITIAL",
      requestedMobilityMode: MobilityMode = mobilityMode,
    ) => {
      if (!selectedStop) {
        return null;
      }
      setGuidanceMode("PREVIEW");
      setDirectionsError(null);
      setBottomSheetContent("WALKING_TO_STOP");
      updateBottomSheetState("MEDIUM");
      if (!currentLocation) {
        resetWalkingRouteMonitoring();
        setWalkingRoute(null);
        setDirectionsStatus("NEEDS_LOCATION");
        AccessibilityInfo.announceForAccessibility(
          "Your location is needed for walking directions.",
        );
        return null;
      }

      directionsRequestRef.current.controller?.abort();
      const controller = new AbortController();
      const requestId = directionsRequestRef.current.id + 1;
      const requestedStopCode = selectedStop.busStopCode;
      directionsRequestRef.current = { id: requestId, controller };
      setDirectionsStatus("LOADING");
      resetWalkingRouteMonitoring();
      setWalkingRoute(null);
      setFollowState("FREE");

      try {
        const route = await routingProviderRef.current!.getRoute({
          origin: currentLocation,
          destination: selectedStop,
          destinationLabel: selectedStop.description,
          mobilityMode: requestedMobilityMode,
          accessibilityPreferences: {
            avoidSteps: true,
            avoidSteepSlopes: appPreferences.avoidSteepSlopes,
            preferSmoothSurfaces: appPreferences.preferSmoothSurfaces,
          },
          signal: controller.signal,
        });
        if (
          requestId !== directionsRequestRef.current.id ||
          requestedStopCode !== selectedStop.busStopCode
        ) {
          return null;
        }
        setWalkingRoute(route);
        setDirectionsStatus("READY");
        setDirectionsError(null);
        setMapLayers((current) => ({ ...current, walkingRoute: true }));
        setViewportSource("ROUTE");
        setMapCameraMode("ROUTE_FOCUS");
        setMapManuallyMoved(false);
        setRouteFitKey((current) => current + 1);
        if (reason === "RECALCULATE") {
          announceSemanticGuidance({
            haptic: "START",
            id: `${requestedMobilityMode.toLowerCase()}-route-${requestId}-recalculated`,
            priority: "WALKING",
            text: `${requestedMobilityMode === "WHEELCHAIR" ? "Wheelchair" : "Walking"} route recalculated. ${friendlyDistance(route.distanceMeters)} remaining.`,
          });
        }
        if (requestedMobilityMode === "WHEELCHAIR") {
          announceSemanticGuidance({
            haptic: "START",
            id: `wheelchair-route-${requestId}-selected`,
            kind: "ACCESSIBLE_ROUTE_SELECTED",
            priority: "WALKING",
            text: "Wheelchair-friendly route selected. Based on available accessibility data.",
          });
          const accessibilityWarning = route.accessibility.warnings.find(
            (warning) => warning.code === "INCOMPLETE_ACCESSIBILITY_DATA",
          );
          if (accessibilityWarning) {
            announceSemanticGuidance({
              id: `wheelchair-route-${requestId}-accessibility-warning`,
              kind: "ACCESSIBILITY_WARNING",
              priority: "WALKING",
              text: accessibilityWarning.message,
            });
          }
        }
        if (requestedMobilityMode === "WALKING") {
          AccessibilityInfo.announceForAccessibility(
            `Walking directions, approximately ${friendlyWalkingMinutes(route.durationSeconds)} minutes, ${friendlyDistance(route.distanceMeters)}.`,
          );
        }
        return route;
      } catch (routeError) {
        if (
          routeError instanceof DOMException &&
          routeError.name === "AbortError"
        ) {
          return null;
        }
        if (requestId !== directionsRequestRef.current.id) {
          return null;
        }
        const rateLimited =
          routeError instanceof RoutingProviderError &&
          routeError.code === "RATE_LIMITED";
        const wheelchairUnavailable =
          routeError instanceof RoutingProviderError &&
          routeError.code === "WHEELCHAIR_ROUTING_UNAVAILABLE";
        const knownBarrier =
          routeError instanceof RoutingProviderError &&
          routeError.code === "KNOWN_BARRIER";
        setDirectionsStatus(
          rateLimited
            ? "RATE_LIMITED"
            : knownBarrier
              ? "KNOWN_BARRIER"
              : requestedMobilityMode === "WHEELCHAIR" || wheelchairUnavailable
                ? "WHEELCHAIR_UNAVAILABLE"
                : "ERROR",
        );
        const unavailableMessage = knownBarrier
          ? "This route contains a known wheelchair barrier."
          : requestedMobilityMode === "WHEELCHAIR" || wheelchairUnavailable
            ? "No wheelchair-accessible route found."
            : "Walking route unavailable.";
        setDirectionsError(
          rateLimited
            ? "The routing service is busy. Try again shortly."
            : unavailableMessage,
        );
        resetWalkingRouteMonitoring();
        setWalkingRoute(null);
        const spokenError = rateLimited
          ? "The routing service is busy. Try again shortly."
          : unavailableMessage;
        if (requestedMobilityMode === "WHEELCHAIR") {
          announceSemanticGuidance({
            haptic: "WARNING",
            id: `wheelchair-route-${requestId}-unavailable`,
            kind: "NO_ACCESSIBLE_ROUTE",
            priority: "WALKING",
            text: spokenError,
          });
        } else {
          AccessibilityInfo.announceForAccessibility(spokenError);
        }
        return null;
      }
    },
    [
      appPreferences.avoidSteepSlopes,
      appPreferences.preferSmoothSurfaces,
      currentLocation,
      mobilityMode,
      selectedStop,
      updateBottomSheetState,
    ],
  );
  const startDirections = useCallback(() => {
    void requestWalkingDirections();
  }, [requestWalkingDirections]);
  const changeDirectionsMobilityMode = useCallback(
    (nextMode: MobilityMode) => {
      if (nextMode === mobilityMode) return;
      setMobilityMode(nextMode);
      announceSemanticGuidance({
        id: `mobility-mode-${nextMode.toLowerCase()}-${Date.now()}`,
        kind: "MOBILITY_MODE_CHANGED",
        priority: "WALKING",
        text:
          nextMode === "WHEELCHAIR"
            ? "Wheelchair routing selected."
            : "Standard walking directions selected. This route is not checked for wheelchair access.",
      });
      if (directionsActive) {
        void requestWalkingDirections("INITIAL", nextMode);
      }
    },
    [directionsActive, mobilityMode, requestWalkingDirections],
  );
  const recalculateWalkingDirections = useCallback(() => {
    setWalkingOffRouteDismissed(false);
    void requestWalkingDirections("RECALCULATE");
  }, [requestWalkingDirections]);
  useEffect(() => {
    if (
      directionsActive &&
      directionsStatus === "NEEDS_LOCATION" &&
      currentLocation
    ) {
      void requestWalkingDirections();
    }
  }, [
    currentLocation,
    directionsActive,
    directionsStatus,
    requestWalkingDirections,
  ]);
  const exitGuidance = useCallback(() => {
    guidanceSessionIdRef.current += 1;
    directionsRequestRef.current.controller?.abort();
    directionsRequestRef.current = {
      id: directionsRequestRef.current.id + 1,
      controller: null,
    };
    setGuidanceMode("INACTIVE");
    setDirectionsStatus("IDLE");
    setDirectionsError(null);
    resetWalkingRouteMonitoring();
    setWalkingRoute(null);
    setFollowState("FREE");
    setMapCameraMode("MANUAL");
    setLocationPulseKey(0);
    setNearbyOpen(false);
    setBottomSheetContent("STOP_DETAILS");
    updateBottomSheetState("MEDIUM");
    arrivalAnnouncementStopRef.current = null;
    const guidanceService = guidanceServiceRef.current!;
    guidanceService.stopActiveSpeech();
    guidanceService.clearEvents("walking-");
  }, [updateBottomSheetState]);
  const beginWalkingGuidance = useCallback(
    (route: WalkingRoute) => {
      if (!currentLocation) {
        return false;
      }
      guidanceSessionIdRef.current += 1;
      setGuidanceMode("ACTIVE");
      setFollowState("FOLLOW_USER");
      setViewportSource("USER_LOCATION");
      setMapCameraMode("FOLLOW_USER");
      updateBottomSheetState("COLLAPSED");
      setLocationPulseKey((current) => current + 1);
      const firstStep = route.steps[0];
      const firstDistance = firstStep?.distanceMeters ?? route.distanceMeters;
      walkingGuidanceThresholdRef.current = `0:${walkingGuidanceDistanceBand(firstDistance)}`;
      announceSemanticGuidance({
        haptic: "START",
        id: `walking-${directionsRequestRef.current.id}-started`,
        priority: "WALKING",
        text: walkingStepAnnouncement(
          firstStep?.instruction ?? "Walking guidance started",
          firstDistance,
        ),
      });
      return true;
    },
    [currentLocation, updateBottomSheetState],
  );
  const startWalkingGuidance = useCallback(() => {
    if (walkingRoute) {
      beginWalkingGuidance(walkingRoute);
    }
  }, [beginWalkingGuidance, walkingRoute]);
  const walkingRouteProgress = useMemo<WalkingRouteProgress | null>(
    () =>
      walkingRoute && currentLocation
        ? calculateWalkingRouteProgress(walkingRoute, currentLocation, {
            accuracyMeters: currentLocation.accuracyMeters,
            headingDegrees: currentLocation.headingDegrees,
            previousProgress: walkingProgressRef.current,
          })
        : null,
    [currentLocation, walkingRoute],
  );
  useEffect(() => {
    walkingProgressRef.current = walkingRouteProgress;
  }, [walkingRouteProgress]);
  const walkingLocationAccuracyLimited = isWalkingLocationAccuracyLimited(
    currentLocation?.accuracyMeters,
  );
  const walkingRouteOffRoute =
    guidanceStatus === "ACTIVE" &&
    walkingRouteMonitoring.offRoute &&
    !walkingOffRouteDismissed;

  useEffect(() => {
    if (
      guidanceStatus !== "ACTIVE" ||
      !walkingRouteProgress ||
      !currentLocation ||
      !selectedStop
    ) {
      return;
    }
    const previous = walkingRouteMonitoringRef.current;
    const next = updateRouteMonitoring(previous, {
      accuracyMeters: currentLocation.accuracyMeters,
      distanceToDestinationMeters: distanceBetweenRoutingCoordinates(
        currentLocation,
        selectedStop,
      ),
      distanceToRouteMeters: walkingRouteProgress.distanceToRouteMeters,
    });
    walkingRouteMonitoringRef.current = next;
    setWalkingRouteMonitoring(next);
    if (!previous.offRoute && next.offRoute) {
      announceSemanticGuidance({
        haptic: "WARNING",
        id: `walking-off-route-${directionsRequestRef.current.id}-${next.offRouteEpisode}`,
        priority: "WALKING",
        text: "You're off the suggested walking route.",
      });
    }
  }, [currentLocation, guidanceStatus, selectedStop, walkingRouteProgress]);

  useEffect(() => {
    if (!walkingRouteMonitoring.offRoute) {
      setWalkingOffRouteDismissed(false);
    }
  }, [walkingRouteMonitoring.offRoute]);

  useEffect(() => {
    if (guidanceStatus !== "ACTIVE" || !walkingLocationAccuracyLimited) return;
    announceSemanticGuidance({
      id: `walking-poor-accuracy-${directionsRequestRef.current.id}`,
      priority: "WALKING",
      text: "Location accuracy is limited. Follow the map and signs around you.",
    });
  }, [guidanceStatus, walkingLocationAccuracyLimited]);

  useEffect(() => {
    if (
      guidanceStatus !== "ACTIVE" ||
      !walkingRoute ||
      !walkingRouteProgress ||
      walkingLocationAccuracyLimited
    ) {
      return;
    }
    const stepIndex = walkingRouteProgress.activeStepIndex;
    const band = walkingGuidanceDistanceBand(
      walkingRouteProgress.distanceToNextManeuverMeters,
    );
    const eventKey = `${stepIndex}:${band}`;
    const previousEventKey = walkingGuidanceThresholdRef.current;
    if (previousEventKey === eventKey) return;
    const stepChanged = !previousEventKey?.startsWith(`${stepIndex}:`);
    walkingGuidanceThresholdRef.current = eventKey;
    if (!stepChanged && band !== "NEAR" && band !== "NOW") return;
    const activeStep = walkingRoute.steps[stepIndex];
    const nextStep = walkingRoute.steps[stepIndex + 1];
    const instruction = stepChanged
      ? walkingStepAnnouncement(
          activeStep?.instruction ?? "Continue toward the bus stop",
          walkingRouteProgress.distanceToNextManeuverMeters,
        )
      : walkingManeuverAnnouncement(
          nextStep?.instruction ?? "Your bus stop is ahead",
          walkingRouteProgress.distanceToNextManeuverMeters,
          band === "NOW",
        );
    announceSemanticGuidance({
      haptic:
        band === "NOW" &&
        ["LEFT", "SLIGHT_LEFT", "SHARP_LEFT"].includes(
          nextStep?.maneuverDirection ?? "",
        )
          ? "TURN_LEFT"
          : band === "NOW" &&
              ["RIGHT", "SLIGHT_RIGHT", "SHARP_RIGHT"].includes(
                nextStep?.maneuverDirection ?? "",
              )
            ? "TURN_RIGHT"
            : band === "NOW" && nextStep?.maneuver?.includes("turn")
              ? "TURN"
              : undefined,
      id: `walking-${directionsRequestRef.current.id}-step-${stepIndex}-${band}`,
      priority: "WALKING",
      text: instruction,
    });
  }, [
    guidanceStatus,
    walkingLocationAccuracyLimited,
    walkingRoute,
    walkingRouteProgress,
  ]);

  useEffect(() => {
    if (
      guidanceStatus !== "ACTIVE" ||
      !currentLocation ||
      !selectedStop ||
      !walkingRoute
    ) {
      return;
    }
    if (!walkingRouteMonitoring.arrived) {
      return;
    }
    setGuidanceMode("ARRIVED");
    setFollowState("FOLLOW_USER");
    updateBottomSheetState("MEDIUM");
    if (arrivalAnnouncementStopRef.current === selectedStop.busStopCode) {
      return;
    }
    arrivalAnnouncementStopRef.current = selectedStop.busStopCode;
    announceSemanticGuidance({
      haptic: "ARRIVAL",
      id: `walking-arrived-${directionsRequestRef.current.id}-${selectedStop.busStopCode}`,
      priority: "DESTINATION",
      text: `You've reached the bus stop. ${selectedStop.description}, Bus Stop ${selectedStop.busStopCode}.`,
    });
  }, [
    currentLocation,
    guidanceStatus,
    selectedStop,
    updateBottomSheetState,
    walkingRoute,
    walkingRouteMonitoring.arrived,
  ]);

  useEffect(() => {
    if (
      guidanceStatus !== "ACTIVE" ||
      typeof Location.watchPositionAsync !== "function"
    ) {
      return undefined;
    }
    const guidanceSessionId = guidanceSessionIdRef.current;
    let disposed = false;
    let subscription: Location.LocationSubscription | null = null;
    void Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 8,
        timeInterval: 5_000,
      },
      (position) => {
        if (disposed || guidanceSessionId !== guidanceSessionIdRef.current) {
          return;
        }
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy ?? undefined,
          headingDegrees:
            position.coords.heading !== null && position.coords.heading >= 0
              ? position.coords.heading
              : undefined,
        };
        lastLocationResultRef.current = { timestamp: Date.now(), coords };
        setTransportDiscovery((current) => ({
          ...current,
          location: locationStateForCoords(coords),
          locationPermission: "granted",
          locationRequested: true,
          lastSuccessfulLocation: coords,
        }));
      },
    )
      .then((nextSubscription) => {
        if (disposed || guidanceSessionId !== guidanceSessionIdRef.current) {
          nextSubscription.remove();
          return;
        }
        subscription = nextSubscription;
      })
      .catch(() => {
        // The routed path remains usable when live location updates fail.
      });
    return () => {
      disposed = true;
      subscription?.remove();
    };
  }, [guidanceStatus]);
  const toggleFollowMode = useCallback(() => {
    setFollowState((current) => {
      if (current === "FREE") {
        return "FOLLOW_USER";
      }
      if (
        current === "FOLLOW_USER" &&
        currentLocation?.headingDegrees !== undefined
      ) {
        return "FOLLOW_USER_HEADING";
      }
      return currentLocation?.headingDegrees === undefined
        ? "FOLLOW_USER"
        : "FREE";
    });
    runCameraCommand(
      "locateUser",
      "USER_LOCATION",
      (current) => ({
        ...current,
        center: currentLocation
          ? cameraCenterForUserLocation(
              currentLocation,
              current.zoom,
              mapCameraGeometryRef.current,
            )
          : current.center,
      }),
      "FOLLOW_USER",
    );
  }, [currentLocation, runCameraCommand]);
  const showWholeRoute = useCallback(() => {
    setGuidanceMode("PREVIEW");
    setMapManuallyMoved(false);
    if (walkingRoute) {
      setRouteFitKey((current) => current + 1);
      return;
    }
    runCameraCommand("fitWalkingRoute", "ROUTE", (current) => ({
      ...current,
      center: selectedStop ?? current.center,
      zoom: clampMapZoom(15, "ROUTE"),
    }));
  }, [runCameraCommand, selectedStop, walkingRoute]);
  const rotateMap = useCallback(() => {
    setMapRotationEnabled(false);
    AccessibilityInfo.announceForAccessibility(
      "This map stays north up. Device heading is shown on your location marker when available.",
    );
  }, []);
  const resetMapNorth = useCallback(() => {
    setMapRotationEnabled(false);
    setMapHeadingDegrees(0);
    runCameraCommand(
      "northUp",
      viewportSource,
      (current) => ({
        ...current,
        bearing: 0,
        pitch: 0,
      }),
      mapCameraMode,
    );
  }, [mapCameraMode, runCameraCommand, viewportSource]);
  const resetMapView = useCallback(() => {
    setMapRotationEnabled(false);
    setMapLayers(defaultMapLayers);
    setFollowState("FREE");
    const mode = selectedStop ? "SELECTED_STOP" : "USER_LOCATION";
    const zoom = selectedStop ? 17 : DEFAULT_ZOOM;
    runCameraCommand(
      "resetMap",
      mode,
      (current) => ({
        ...current,
        center: selectedStop
          ? selectedStop
          : currentLocation
            ? cameraCenterForUserLocation(
                currentLocation,
                zoom,
                mapCameraGeometryRef.current,
              )
            : manualStopLookup,
        zoom,
        bearing: 0,
        pitch: 0,
      }),
      selectedStop ? "STOP_FOCUS" : "FOLLOW_USER",
    );
  }, [currentLocation, runCameraCommand, selectedStop]);
  const viewFullRoute = useCallback(() => {
    setFollowState("FREE");
    runCameraCommand("fitFullRoute", "FULL_ROUTE", (current) => ({
      ...current,
      center: selectedStop ?? selectedLandmark ?? current.center,
      zoom: mapZoomLimits.fullRouteMin,
    }));
  }, [runCameraCommand, selectedLandmark, selectedStop]);
  const hearDirections = useCallback(() => {
    if (selectedStop && walkingRoute) {
      const activeStep =
        walkingRoute.steps[walkingRouteProgress?.activeStepIndex ?? 0];
      announceGuidance(
        [
          `Walking to ${selectedStop.description}.`,
          `${friendlyWalkingMinutes(
            walkingRouteProgress?.remainingDurationSeconds ??
              walkingRoute.durationSeconds,
          )} minutes, ${friendlyDistance(
            walkingRouteProgress?.remainingDistanceMeters ??
              walkingRoute.distanceMeters,
          )} remaining.`,
          activeStep?.instruction,
        ]
          .filter(Boolean)
          .join(" "),
      );
    } else if (selectedStop) {
      announceGuidance(routeAnnouncement(selectedStop, selectedLandmark));
    }
  }, [selectedLandmark, selectedStop, walkingRoute, walkingRouteProgress]);
  const selectLandmark = useCallback(
    (landmark: MapLandmark) => {
      setSelectedLandmarkId(landmark.id);
      setSelectedStop(null);
      setNearbyOpen(false);
      setGuidanceMode("INACTIVE");
      setFollowState("FREE");
      runCameraCommand("searchResult", "SEARCH_RESULT", (current) => ({
        ...current,
        center: landmark,
        zoom: 16,
      }));
      announceGuidance(`${landmark.name}. Nearby bus stops are shown.`);
    },
    [runCameraCommand],
  );
  const openStopSearch = useCallback(
    (query = "", mode: TransportSearchMode = "DISCOVERY") => {
      setTransportSearchMode(mode);
      setBusStopSearch((current) => ({
        ...current,
        isOpen: true,
        query,
        status: query.trim() ? "SEARCHING" : "IDLE",
        results: query.trim() ? current.results : emptySearchResults,
      }));
    },
    [],
  );
  const clearStopSearch = useCallback(() => {
    setBusStopSearch((current) => ({
      ...current,
      query: "",
      status: "IDLE",
      results: emptySearchResults,
    }));
  }, []);
  const closeStopSearch = useCallback(() => {
    Keyboard.dismiss();
    setTransportSearchMode("DISCOVERY");
    setBusStopSearch((current) => ({
      ...current,
      isOpen: false,
      query: "",
      status: "IDLE",
      results: emptySearchResults,
    }));
  }, []);
  const focusSearchStop = useCallback(
    (stop: NearbyBusStop) => {
      const selectionIntentId = selectedStopCameraIntentRef.current + 1;
      selectedStopCameraIntentRef.current = selectionIntentId;
      setSelectedStop(stop);
      setSelectedLandmarkId(null);
      setBottomSheetContent("STOP_DETAILS");
      setNearbyOpen(false);
      setGuidanceMode("INACTIVE");
      setFollowState("FREE");
      setStopSearchQuery("");
      setScreen("STOP");
      updateBottomSheetState("MEDIUM");
      setNearbySearchOrigin({
        center: stop,
        label: `Bus stops near ${stop.description}`,
        source: "SEARCH_RESULT",
      });
      setLastStopQueryOrigin({
        center: stop,
        label: `Bus stops near ${stop.description}`,
        source: "SEARCH_RESULT",
      });
      handleStopSelectionCamera({
        currentLocation,
        currentGeometry: mapCameraGeometryRef.current,
        geometry: createMapCameraGeometry({
          mapLayout: measuredMapLayout,
        }),
        intentId: selectionIntentId,
        intentRef: selectedStopCameraIntentRef,
        runCameraCommand,
        stop,
        viewport: mapViewport,
      });
      announceGuidance(
        `${stop.description}, Bus Stop ${stop.busStopCode}. Stop details shown.`,
      );
    },
    [
      currentLocation,
      mapViewport,
      measuredMapLayout,
      runCameraCommand,
      updateBottomSheetState,
    ],
  );
  const applyJourneyPlanDestination = useCallback(
    (destinationPoint: JourneyPoint, originPoint = effectiveJourneyOrigin) => {
      const plan = journeyPlannerService.planJourney(
        originPoint,
        destinationPoint,
        requirements,
      );
      setJourneyPlanner((current) => ({
        ...current,
        origin: originPoint,
        destination: destinationPoint,
        alternatives: plan.alternatives,
        selectedAlternativeId: plan.alternatives[0]?.id ?? null,
        recentDestinations: [
          destinationPoint,
          ...current.recentDestinations.filter(
            (point) => point.id !== destinationPoint.id,
          ),
        ].slice(0, 3),
      }));
      setMapPickMode(null);
      setBottomSheetContent("ROUTE_OPTIONS");
      setNearbyOpen(false);
      updateBottomSheetState(
        plan.alternatives.length > 0 ? "MEDIUM" : "COLLAPSED",
      );
      announceGuidance(
        plan.alternatives.length > 0
          ? `Journey options ready for ${destinationPoint.label}.`
          : `No journey options found for ${destinationPoint.label}.`,
      );
    },
    [effectiveJourneyOrigin, requirements, updateBottomSheetState],
  );
  const applyJourneyPlanOrigin = useCallback(
    (originPoint: JourneyPoint) => {
      const hasDestination = Boolean(journeyPlanner.destination);
      setJourneyPlanner((current) => {
        const plan = current.destination
          ? journeyPlannerService.planJourney(
              originPoint,
              current.destination,
              requirements,
            )
          : { alternatives: [] };
        return {
          ...current,
          origin: originPoint,
          alternatives: plan.alternatives,
          selectedAlternativeId: plan.alternatives[0]?.id ?? null,
        };
      });
      setBottomSheetContent(hasDestination ? "ROUTE_OPTIONS" : "PLANNER");
      setNearbyOpen(false);
      announceGuidance(`Starting point set to ${originPoint.label}.`);
    },
    [journeyPlanner.destination, requirements],
  );
  const selectSearchStop = useCallback(
    (stop: StaticSearchStop) => {
      Keyboard.dismiss();
      closeStopSearch();
      if (transportSearchMode === "DESTINATION") {
        applyJourneyPlanDestination(
          journeyPointFromStop(stop, currentLocation),
        );
        return;
      }
      if (transportSearchMode === "ORIGIN") {
        applyJourneyPlanOrigin(journeyPointFromStop(stop, currentLocation));
        return;
      }
      focusSearchStop(toNearbySearchStop(stop, currentLocation));
    },
    [
      applyJourneyPlanDestination,
      applyJourneyPlanOrigin,
      closeStopSearch,
      currentLocation,
      focusSearchStop,
      transportSearchMode,
    ],
  );
  const selectSearchPlace = useCallback(
    (landmark: MapLandmark) => {
      Keyboard.dismiss();
      closeStopSearch();
      if (transportSearchMode === "DESTINATION") {
        applyJourneyPlanDestination(journeyPointFromLandmark(landmark));
        return;
      }
      if (transportSearchMode === "ORIGIN") {
        applyJourneyPlanOrigin(journeyPointFromLandmark(landmark));
        return;
      }
      selectLandmark(landmark);
      setScreen("STOP");
      updateBottomSheetState("MEDIUM");
      setNearbySearchOrigin({
        center: landmark,
        label: `Bus stops near ${landmark.name}`,
        source: "SEARCH_RESULT",
      });
      void loadNearbyStopsFor(landmark, {
        useCache: true,
        announce: true,
        preserveSelection: false,
        keepViewport: true,
        originLabel: `Bus stops near ${landmark.name}`,
        viewportSource: "SEARCH_RESULT",
      }).catch((apiError) => {
        if (
          apiError instanceof DOMException &&
          apiError.name === "AbortError"
        ) {
          return;
        }
        const failureStatus = nearbyStopsFailureStatus(apiError);
        setTransportDiscovery((current) => ({
          ...current,
          nearbyStopsStatus: failureStatus,
        }));
      });
    },
    [
      applyJourneyPlanDestination,
      applyJourneyPlanOrigin,
      closeStopSearch,
      selectLandmark,
      transportSearchMode,
      updateBottomSheetState,
    ],
  );
  const selectSearchService = useCallback((serviceNo: string) => {
    setBusStopSearch((current) => ({
      ...current,
      isOpen: true,
      query: serviceNo,
      status: current.results.stops.some((stop) =>
        stop.services.includes(serviceNo),
      )
        ? "SUCCESS"
        : "SEARCHING",
      results: {
        stops: current.results.stops.filter((stop) =>
          stop.services.includes(serviceNo),
        ),
        places: [],
        services: [],
      },
    }));
  }, []);
  const swapJourneyPoints = useCallback(() => {
    const currentOrigin = effectiveJourneyOrigin;
    setJourneyPlanner((current) => {
      if (!current.destination) {
        return current;
      }
      const nextOrigin = current.destination;
      const nextDestination = current.origin ?? currentOrigin;
      const plan = journeyPlannerService.planJourney(
        nextOrigin,
        nextDestination,
        requirements,
      );
      return {
        ...current,
        origin: nextOrigin,
        destination: nextDestination,
        alternatives: plan.alternatives,
        selectedAlternativeId: plan.alternatives[0]?.id ?? null,
      };
    });
  }, [effectiveJourneyOrigin, requirements]);
  const chooseDestinationOnMap = useCallback(() => {
    setMapPickMode("DESTINATION");
    setNearbyOpen(false);
    closeStopSearch();
    updateBottomSheetState("HIDDEN_PEEK");
    announceGuidance(
      "Move the map and set the destination shown at the centre pin.",
    );
  }, [closeStopSearch, updateBottomSheetState]);
  const confirmMapDestination = useCallback(() => {
    applyJourneyPlanDestination(mapPickCandidate);
  }, [applyJourneyPlanDestination, mapPickCandidate]);
  const selectJourneyAlternative = useCallback(
    (alternativeId: string) => {
      setJourneyPlanner((current) => ({
        ...current,
        selectedAlternativeId: alternativeId,
      }));
      setBottomSheetContent("ROUTE_OPTIONS");
      setNearbyOpen(false);
      updateBottomSheetState("EXPANDED");
    },
    [updateBottomSheetState],
  );
  const startSelectedJourneyPlan = useCallback(() => {
    if (!selectedJourneyAlternative) {
      return;
    }

    journeySessionIdRef.current += 1;

    const option: BusServiceOption = {
      serviceNo: selectedJourneyAlternative.serviceNo,
      destination: selectedJourneyAlternative.alightingStop.description,
      buses: [],
      arrivalUnavailable: selectedJourneyAlternative.nextBusEtaSeconds === null,
    };
    const plannedArrival: ArrivalBus | null =
      selectedJourneyAlternative.nextBusEtaSeconds === null
        ? null
        : {
            busId: `SERVICE-${selectedJourneyAlternative.serviceNo}-PLANNED`,
            serviceNo: selectedJourneyAlternative.serviceNo,
            arrivalSlot: "NEXT_BUS",
            etaSeconds: selectedJourneyAlternative.nextBusEtaSeconds,
            wheelchairAccessible: false,
            vehicleType: "SD",
            destination: selectedJourneyAlternative.alightingStop.description,
          };
    const selectedRoute = selectedJourneyAlternative.routeStops;

    setSelectedStop(selectedJourneyAlternative.boardingStop);
    setSelectedServiceOption(option);
    setSelectedArrival(plannedArrival);
    setSelectedBus({
      busId:
        plannedArrival?.busId ??
        `SERVICE-${selectedJourneyAlternative.serviceNo}-PLANNED`,
      busService: selectedJourneyAlternative.serviceNo,
      routeNumber: selectedJourneyAlternative.serviceNo,
      currentStop: selectedJourneyAlternative.boardingStop.description,
      nextStop: selectedJourneyAlternative.alightingStop.description,
      isAccessible: false,
      wheelchairSpaces: 0,
      latitude: selectedJourneyAlternative.boardingStop.latitude,
      longitude: selectedJourneyAlternative.boardingStop.longitude,
      estimatedArrivalSeconds:
        selectedJourneyAlternative.nextBusEtaSeconds ?? 0,
    });
    setRouteStops(selectedRoute);
    setCurrentStopIndex(0);
    setSelectedAlightingStop(selectedJourneyAlternative.alightingStop);
    setJourneyRequirements(requirements);
    setRequestId(null);
    setCaseId(null);
    setAssistanceCaseState(null);
    setRequestStatus(null);
    setRequestPhase(null);
    setEvents([]);
    setVehicleStatus(null);
    setAutonomousDriveState(null);
    setJourneySetupState("WALKING_TO_STOP");
    setJourneyPhase("WALKING_TO_STOP");
    setScreen("STATUS");
    announceGuidance(
      `Journey started. Walk to ${selectedJourneyAlternative.boardingStop.description}. Take Service ${selectedJourneyAlternative.serviceNo} to ${selectedJourneyAlternative.alightingStop.description}.`,
    );
  }, [requirements, selectedJourneyAlternative]);
  const sessionId = activeProfile?.profileId ?? "demo-passenger-session";
  const activeTab = getActiveTab(screen);
  const currentWalkingInstruction = walkingRoute
    ? walkingRoute.steps[walkingRouteProgress?.activeStepIndex ?? 0]
        ?.instruction
    : undefined;
  const currentWalkingStepIndex = walkingRouteProgress?.activeStepIndex ?? 0;
  const currentWalkingStep =
    walkingRoute?.steps[currentWalkingStepIndex] ?? null;
  const nextWalkingStep =
    walkingRoute?.steps[currentWalkingStepIndex + 1] ?? null;
  const journeyVisualInstruction = useMemo(
    () =>
      deriveJourneyVisualInstruction({
        journeyPhase,
        selectedStopName: selectedStop?.description,
        stopCode: selectedStop?.busStopCode,
        serviceNo: selectedBus?.busService,
        destinationName: selectedAlightingStop?.description,
        currentStopName: currentRouteStop?.description,
        nextStopName: nextRouteStop?.description,
        stopsRemaining: stopsRemaining ?? undefined,
        etaSeconds: selectedArrival?.etaSeconds,
        vehicleStatus,
        assistanceCaseState,
        wheelchairAssistance: journeyRequirements.wheelchairRamp,
        walkingStep: currentWalkingStep,
        nextWalkingStep,
        walkingProgress: walkingRouteProgress,
        walkingOffRoute: walkingRouteOffRoute,
        locationAccuracyLimited: walkingLocationAccuracyLimited,
        cameraGuideAvailable:
          Platform.OS === "android" && Boolean(walkingRoute && currentLocation),
        destinationReached: selectedStopReached,
        autonomousVehicle: Boolean(
          selectedBus?.busId.startsWith("AV-") ||
          selectedBus?.busId.startsWith("SERVICE-"),
        ),
        autonomousDriveState,
      }),
    [
      assistanceCaseState,
      autonomousDriveState,
      currentLocation,
      currentRouteStop?.description,
      currentWalkingStep,
      journeyPhase,
      journeyRequirements.wheelchairRamp,
      nextRouteStop?.description,
      nextWalkingStep,
      selectedAlightingStop?.description,
      selectedArrival?.etaSeconds,
      selectedBus?.busService,
      selectedStop?.busStopCode,
      selectedStop?.description,
      selectedStopReached,
      stopsRemaining,
      vehicleStatus,
      walkingLocationAccuracyLimited,
      walkingRoute,
      walkingRouteOffRoute,
      walkingRouteProgress,
    ],
  );
  const completedJourneyInstruction = useMemo<JourneyVisualInstruction | null>(
    () =>
      lastCompletedJourney
        ? deriveJourneyVisualInstruction({
            journeyPhase: "COMPLETED",
            destinationName: lastCompletedJourney.destinationName,
            serviceNo: lastCompletedJourney.serviceNo,
          })
        : null,
    [lastCompletedJourney],
  );
  const journeyNextAction = deriveJourneyNextAction({
    journeyPhase,
    selectedStopName: selectedStop?.description,
    serviceNo: selectedBus?.busService,
    destinationName: selectedAlightingStop?.description,
    nextStopName: nextRouteStop?.description,
    walkingInstruction: currentWalkingInstruction,
    wheelchairAssistance: journeyRequirements.wheelchairRamp,
  });
  const resolvedThemeMode = appPreferences.themeMode;
  const lightMode = resolvedThemeMode === "light";
  const highContrastDark = appPreferences.highContrast && !lightMode;
  const highContrastLight = appPreferences.highContrast && lightMode;

  useEffect(() => {
    let active = true;
    void readSavedPreferences().then((saved) => {
      if (!active) {
        return;
      }
      if (saved) {
        setJourneyRequirements(accessibilityRequirementsFromPreferences(saved));
        setAppPreferences(saved);
      }
      preferencesHydratedRef.current = true;
      if (!saved) {
        void savePreferencesLocally(latestPreferencesRef.current);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!preferencesHydratedRef.current) {
      return;
    }
    void savePreferencesLocally(appPreferences);
  }, [appPreferences]);

  useEffect(() => {
    if (!activeJourneyHydratedRef.current) {
      return;
    }
    if (!selectedStop || !selectedServiceOption || !selectedBus) {
      void queueActiveJourneyPersistence(clearSavedActiveJourney);
      return;
    }
    const journeySessionId = journeySessionIdRef.current;
    const persistedJourney: PersistedActiveJourney = {
      version: 2,
      savedAt: new Date().toISOString(),
      selectedStop,
      selectedServiceOption,
      selectedBus,
      selectedArrival,
      selectedAlightingStop,
      routeStops,
      currentStopIndex,
      journeyPhase,
      journeySetupState,
      journeyRequirements,
      requestId,
      caseId,
      assistanceCaseState,
      requestStatus,
      requestPhase,
      vehicleStatus,
      visualGuidePhase: journeyPhase,
      walkingRoute: journeyPhase === "WALKING_TO_STOP" ? walkingRoute : null,
      guidanceMode: guidanceMode === "ACTIVE" ? "PREVIEW" : guidanceMode,
    };
    void queueActiveJourneyPersistence(() =>
      journeySessionId === journeySessionIdRef.current
        ? saveActiveJourneyLocally(persistedJourney)
        : Promise.resolve(),
    );
  }, [
    currentStopIndex,
    journeyPhase,
    journeyRequirements,
    journeySetupState,
    requestId,
    caseId,
    assistanceCaseState,
    requestPhase,
    requestStatus,
    routeStops,
    selectedAlightingStop,
    selectedArrival,
    selectedBus,
    selectedServiceOption,
    selectedStop,
    vehicleStatus,
    walkingRoute,
    guidanceMode,
  ]);

  useEffect(() => {
    requestStatusRef.current = requestStatus;
  }, [requestStatus]);

  useEffect(() => {
    requestPhaseRef.current = requestPhase;
  }, [requestPhase]);

  useEffect(() => {
    if (
      !requestId ||
      requestPhase !== "ALIGHTING" ||
      requestStatus !== AssistanceRequestStatus.ACKNOWLEDGED
    ) {
      return;
    }
    notifyPassenger(
      assistanceConfirmationAnnouncement(alightingAssistanceTypes, "ALIGHTING"),
      {
        haptic: "SUCCESS",
        id: `assistance-${requestId}-received`,
        priority: "BUS",
      },
    );
  }, [alightingAssistanceTypes, requestId, requestPhase, requestStatus]);

  useEffect(() => {
    vehicleStatusRef.current = vehicleStatus;
  }, [vehicleStatus]);

  useEffect(() => {
    if (!visualAlert) {
      return undefined;
    }

    const timeout = setTimeout(
      () => setVisualAlert(null),
      appPreferences.longerMessageDuration
        ? 8000
        : requirements.extendedDwellTime
          ? 6000
          : 3200,
    );
    return () => clearTimeout(timeout);
  }, [
    appPreferences.longerMessageDuration,
    requirements.extendedDwellTime,
    visualAlert,
  ]);

  useEffect(() => {
    if (!requestId) {
      return;
    }
    const journeySessionId = journeySessionIdRef.current;

    return subscribeToRequestStatus(
      requestId,
      (message) => {
        if (journeySessionId !== journeySessionIdRef.current) {
          return;
        }
        if (message.type === "REQUEST_STATUS") {
          const currentStatus = requestStatusRef.current;
          if (!canApplyRequestStatus(currentStatus, message.status)) {
            return;
          }

          if (currentStatus === message.status) {
            return;
          }

          requestStatusRef.current = message.status;
          setRequestStatus(message.status);
          setEvents((current) => [message, ...current]);
          if (message.status === "ACKNOWLEDGED") {
            notifyPassenger(
              assistanceConfirmationAnnouncement(
                message.assistanceTypes,
                requestPhaseRef.current ?? "BOARDING",
              ),
              {
                haptic: "SUCCESS",
                id: `assistance-${message.requestId}-received`,
                priority: "BUS",
              },
            );
          }
          return;
        }

        if (message.type === "CASE_STATUS") {
          setAssistanceCaseState(message.state);
          setEvents((current) =>
            current.some(
              (event) =>
                event.type === "CASE_STATUS" &&
                event.caseId === message.caseId &&
                event.state === message.state,
            )
              ? current
              : [message, ...current],
          );
          if (
            ["READY", "BLOCKED", "ESCALATED", "FAILED"].includes(message.state)
          ) {
            notifyPassenger(caseStatePassengerMessage(message.state), {
              haptic: message.state === "READY" ? "SUCCESS" : "WARNING",
              id: `case-${message.caseId}-${message.state}`,
              priority: "BUS",
            });
          }
          return;
        }

        if (message.type === "AUTONOMY_STATUS") {
          setAutonomousDriveState(message.autonomy.state);
          setEvents((current) =>
            current.some(
              (event) =>
                event.type === "AUTONOMY_STATUS" &&
                event.timestamp === message.timestamp,
            )
              ? current
              : [message, ...current],
          );
          if (["EMERGENCY_STOP", "BLOCKED", "MANUAL_OVERRIDE"].includes(message.autonomy.state)) {
            notifyPassenger(eventLabel(message), {
              haptic: "WARNING",
              id: `autonomy-${message.busId}-${message.autonomy.state}-${message.timestamp}`,
              priority: "BUS",
            });
          }
          return;
        }

        if (message.type === "VEHICLE_STATUS") {
          const currentStatus = vehicleStatusRef.current;
          if (
            !canTransitionVehicleStatus(currentStatus, message.status) ||
            currentStatus === message.status
          ) {
            return;
          }
          vehicleStatusRef.current = message.status;
          setVehicleStatus(message.status);
          if (message.status === "APPROACHING") {
            setJourneySetupState((current) =>
              current === "WAITING_FOR_BUS" ? "BUS_ARRIVING" : current,
            );
            setJourneyPhase((current) =>
              current === "WAITING_FOR_BUS" ? "BUS_ARRIVING" : current,
            );
          }
          if (message.status === "ARRIVED") {
            setJourneySetupState((current) =>
              current === "WAITING_FOR_BUS" || current === "BUS_ARRIVING"
                ? "BOARDING"
                : current,
            );
            setJourneyPhase((current) =>
              current === "WAITING_FOR_BUS" || current === "BUS_ARRIVING"
                ? "BOARDING"
                : current,
            );
          }
        }

        setEvents((current) =>
          current.some(
            (event) =>
              event.type === message.type &&
              event.timestamp === message.timestamp,
          )
            ? current
            : [message, ...current],
        );

        if (message.type === "VEHICLE_STATUS") {
          if (
            message.status === "APPROACHING" &&
            latestPreferencesRef.current.warnBusApproaching
          ) {
            notifyPassenger(
              `Your bus is approaching. Service ${message.busService} will arrive soon.`,
              {
                haptic: "WARNING",
                id: `bus-${message.busId}-approaching`,
                priority: "BUS",
              },
            );
          }
          if (
            message.status === "ARRIVED" &&
            latestPreferencesRef.current.warnBusArrives
          ) {
            notifyPassenger(
              `Your bus is here. Service ${message.busService} is at the stop.`,
              {
                haptic: "SUCCESS",
                id: `bus-${message.busId}-arrived`,
                priority: "BUS",
              },
            );
          }
        }
      },
      () => {
        if (journeySessionId === journeySessionIdRef.current) {
          setError(liveStatusErrorMessage);
        }
      },
      {
        caseId: caseId ?? undefined,
        onConnected: () => {
          if (journeySessionId === journeySessionIdRef.current) {
            setError((current) =>
              current === liveStatusErrorMessage ? null : current,
            );
          }
        },
      },
    );
  }, [caseId, requestId]);

  useEffect(() => {
    const focusedRequestId = focusedAssistRequest.requestId;
    if (!focusedRequestId) {
      return;
    }
    const focusedSessionId = focusedAssistRequestSessionRef.current;
    return subscribeToRequestStatus(
      focusedRequestId,
      (message) => {
        if (
          focusedSessionId !== focusedAssistRequestSessionRef.current ||
          message.type !== "REQUEST_STATUS" ||
          message.requestId !== focusedRequestId
        ) {
          return;
        }
        let becameAcknowledged = false;
        setFocusedAssistRequest((current) => {
          if (
            !canApplyRequestStatus(current.status, message.status) ||
            current.status === message.status
          ) {
            return current;
          }
          becameAcknowledged =
            message.status === AssistanceRequestStatus.ACKNOWLEDGED;
          return {
            ...current,
            status: message.status,
            submitting: false,
            error:
              message.status === AssistanceRequestStatus.FAILED
                ? current.assistanceType === "EXTENDED_DWELL_TIME"
                  ? "We couldn't request more boarding time."
                  : "We couldn't complete the ramp request."
                : null,
          };
        });
        if (becameAcknowledged) {
          notifyPassenger(
            focusedAssistRequest.assistanceType === "EXTENDED_DWELL_TIME"
              ? "The bus has received your request for more boarding time."
              : "The bus has received your ramp request.",
            {
              haptic: "SUCCESS",
              id: `focused-assist-${focusedRequestId}-received`,
              priority: "BUS",
            },
          );
        }
      },
      () => {
        if (focusedSessionId === focusedAssistRequestSessionRef.current) {
          setFocusedAssistRequest((current) => ({
            ...current,
            error:
              "Live request updates are unavailable. Your request may still be active.",
          }));
        }
      },
      {
        onConnected: () => {
          if (focusedSessionId === focusedAssistRequestSessionRef.current) {
            setFocusedAssistRequest((current) => ({
              ...current,
              error:
                current.error ===
                "Live request updates are unavailable. Your request may still be active."
                  ? null
                  : current.error,
            }));
          }
        },
      },
    );
  }, [focusedAssistRequest.assistanceType, focusedAssistRequest.requestId]);

  useEffect(() => {
    const bus = focusedAssistContext.selectedBus;
    if (
      focusedAssistContext.state !== "ONE_BUS_PRESENT" ||
      !bus ||
      focusedAssistAnnouncedBusRef.current === bus.id
    ) {
      return;
    }
    focusedAssistAnnouncedBusRef.current = bus.id;
    notifyPassenger(`Service ${bus.serviceNo} is at your stop.`, {
      haptic: "SUCCESS",
      id: `focused-assist-${bus.id}-present`,
      priority: "BUS",
    });
  }, [focusedAssistContext.selectedBus, focusedAssistContext.state]);

  function notifyPassenger(
    message: string,
    event: {
      id: string;
      priority: GuidancePriority;
      haptic?: GuidanceHaptic;
    },
  ) {
    const preferences = latestPreferencesRef.current;
    if (
      preferences.visualJourneyAlerts ||
      (preferences.textAnnouncementEquivalent && preferences.spokenGuidance)
    ) {
      setVisualAlert(message);
    }
    announceSemanticGuidance(
      { ...event, text: message },
      { visualEquivalent: false },
    );
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
      const announcement =
        selectedStopReached && selectedAlightingStop
          ? `This is your stop, ${selectedAlightingStop.description}. Remain onboard until the bus has stopped and it is safe to exit.`
          : (selectedStopIsNext || journeyPhase === "DESTINATION_NEXT") &&
              selectedAlightingStop
            ? `Your destination, ${selectedAlightingStop.description}, is the next stop. Prepare to alight.`
            : [
                `On Service ${selectedBus.busService}.`,
                nextRouteStop
                  ? `Next stop: ${nextRouteStop.description}.`
                  : "Final stop.",
                selectedAlightingStop && stopsRemaining !== null
                  ? `${stopsRemaining} ${stopsRemaining === 1 ? "stop" : "stops"} to ${selectedAlightingStop.description}.`
                  : "Destination not selected.",
              ]
                .filter(Boolean)
                .join(" ");
      setVisualAlert(announcement);
      announceGuidance(announcement);
      return;
    }

    const announcement = [
      selectedBus ? `Bus ${selectedBus.busService} selected.` : undefined,
      selectedArrival
        ? `Arriving in approximately ${Math.ceil(selectedArrival.etaSeconds / 60)} minutes.`
        : undefined,
      selectedArrival?.destination
        ? `Towards ${selectedArrival.destination}.`
        : undefined,
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
      announceGuidance(announcement);
    }
  }

  function createProfile() {
    const displayName = authName.trim() || "Passenger";
    const email =
      authEmail.trim().toLowerCase() || `${Date.now()}@sg-goassist.local`;
    const now = new Date().toISOString();
    const profile: PassengerProfile = {
      profileId: `profile-${Date.now()}`,
      displayName,
      email,
      verificationStatus: "UNVERIFIED",
      accessibilityPreferences: appPreferences,
      createdAt: now,
      updatedAt: now,
    };

    setProfiles((current) => [profile, ...current]);
    applyProfile(profile, "PROFILE");
  }

  function applyProfile(
    profile: PassengerProfile,
    nextScreen: Screen = "PROFILE",
  ) {
    const profilePreferences = accessibilityPreferencesForProfile(profile);
    const profileRequirements =
      accessibilityRequirementsFromPreferences(profilePreferences);
    setActiveProfile(profile);
    setIsEditingProfileNeeds(false);
    setProfileDraftPreferences(null);
    setProfilePreferenceSection(null);
    if (!selectedBus || requestStatus) {
      setJourneyRequirements(profileRequirements);
    }
    setAppPreferences(profilePreferences);
    setScreen(nextScreen);
    AccessibilityInfo.announceForAccessibility(
      `Signed in as ${profile.displayName}.`,
    );
  }

  function saveActiveProfile() {
    if (!activeProfile || !hasUnsavedProfileNeeds) {
      return;
    }
    const preferencesToSave = profileDraftPreferences ?? appPreferences;

    const updatedProfile: PassengerProfile = {
      ...activeProfile,
      accessibilityPreferences: preferencesToSave,
      assistanceDefaults: undefined,
      appPreferences: undefined,
      updatedAt: new Date().toISOString(),
    };

    setActiveProfile(updatedProfile);
    setProfiles((current) =>
      current.map((profile) =>
        profile.profileId === updatedProfile.profileId
          ? updatedProfile
          : profile,
      ),
    );
    setAppPreferences(preferencesToSave);
    setProfileDraftPreferences(null);
    setVisualAlert("Preferences saved");
    if (preferencesToSave.vibrationAlerts !== "OFF") {
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
    }
    AccessibilityInfo.announceForAccessibility("Preferences saved.");
    setIsEditingProfileNeeds(false);
  }

  function resetProfileNeedsEditing() {
    if (!activeProfile) {
      return;
    }

    setAppPreferences(accessibilityPreferencesForProfile(activeProfile));
    setProfileDraftPreferences(null);
    setIsEditingProfileNeeds(false);
  }

  function cancelProfileNeedsEditing() {
    if (!hasUnsavedProfileNeeds) {
      resetProfileNeedsEditing();
      return;
    }

    Alert.alert(
      "Discard changes?",
      "Your saved accessibility needs will stay as they were.",
      [
        { text: "Keep editing", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: resetProfileNeedsEditing,
        },
      ],
    );
  }

  function previewAccessibilitySetup(
    preferences: AccessibilityPreferences,
  ): AccessibilityPreviewResult {
    const message = "Sample journey alert. Bus 95 arriving in 3 minutes.";
    AccessibilityInfo.announceForAccessibility(message);

    let spoken = false;
    if (preferences.spokenGuidance) {
      spoken = screenReaderDetected;
      if (!screenReaderDetected) {
        spoken = guidanceServiceRef.current!.speakAssistantResponse(message);
      }
    }

    let haptic = false;
    if (preferences.vibrationAlerts !== "OFF" && hapticsSupported) {
      const hapticAdapter = createPlatformHapticAdapter();
      if (hapticAdapter) {
        hapticAdapter("WARNING");
        haptic = true;
      }
    }

    return { haptic, spoken };
  }

  function signOut() {
    setActiveProfile(null);
    setIsEditingProfileNeeds(false);
    setProfileDraftPreferences(null);
    setProfilePreferenceSection(null);
    setJourneyRequirements(defaultRequirements);
    setAppPreferences(defaultAppPreferences);
    setVerificationMethod("DEMO_CREDENTIAL");
    setCredentialLast4("");
    setVisualAlert(null);
    setScreen("PROFILE");
    AccessibilityInfo.announceForAccessibility(
      "Signed out. Profile settings cleared.",
    );
  }

  function verifyActiveProfile() {
    if (!activeProfile) {
      return;
    }

    const trimmedCredential = credentialLast4.trim();
    const now = new Date().toISOString();
    const verified =
      verificationMethod === "DEMO_CREDENTIAL" || trimmedCredential === "4821";
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
        profile.profileId === updatedProfile.profileId
          ? updatedProfile
          : profile,
      ),
    );
    setVisualAlert(
      verified
        ? "Accessibility profile verified."
        : "Verification pending. You can still use journey accessibility features.",
    );
    AccessibilityInfo.announceForAccessibility(
      verified
        ? "Accessibility profile verified."
        : "Verification pending. You can still use journey accessibility features.",
    );
  }

  function openTab(tab: AppTab) {
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
      if (requestId) {
        setScreen("STATUS");
        return;
      }
      if (selectedBus) {
        setScreen(
          journeySetupState === "REVIEWING_JOURNEY" ? "CONFIRM" : "BUS",
        );
        return;
      }
      if (selectedStop) {
        setScreen("BUS");
        return;
      }
      setScreen("JOURNEY_IDLE");
      return;
    }
    if (tab === "ASSISTANCE") {
      setScreen("ACCESSIBILITY");
      void prepareFocusedAssistContext();
      return;
    }
    setScreen("PROFILE");
    setIsEditingProfileNeeds(false);
    setProfilePreferenceSection(null);
  }

  function announceGuidance(message: string) {
    setHasSpokenGuidanceInCurrentFlow(true);
    AccessibilityInfo.announceForAccessibility(message);
  }

  function announceSemanticGuidance(
    event: GuidanceEvent,
    {
      screenReader = true,
      visualEquivalent = true,
    }: { screenReader?: boolean; visualEquivalent?: boolean } = {},
  ) {
    const result = guidanceServiceRef.current!.announce(event);
    if (result.duplicate) return result;
    const preferences = latestPreferencesRef.current;
    if (
      visualEquivalent &&
      preferences.spokenGuidance &&
      preferences.textAnnouncementEquivalent
    ) {
      setVisualAlert(event.text);
    }
    if (screenReader && screenReaderModeRef.current) {
      AccessibilityInfo.announceForAccessibility(event.text);
    }
    return result;
  }

  function repeatLatestGuidance() {
    guidanceServiceRef.current!.repeatLatest();
  }

  async function startVoiceWalkingGuidance(): Promise<AssistantActionResult> {
    if (!selectedStop) {
      return { ok: false, reason: "Choose a bus stop first." };
    }
    if (guidanceMode === "ACTIVE") {
      return { ok: true };
    }
    const route = walkingRoute ?? (await requestWalkingDirections());
    if (!route) {
      return {
        ok: false,
        reason: currentLocation
          ? "I couldn’t calculate directions to the selected bus stop."
          : "Your location is needed before guidance can start.",
      };
    }
    return beginWalkingGuidance(route)
      ? { ok: true }
      : {
          ok: false,
          reason: "Your location is needed before guidance can start.",
        };
  }

  function resetWalkingRouteMonitoring() {
    const reset = createRouteMonitoringState();
    walkingProgressRef.current = null;
    walkingRouteMonitoringRef.current = reset;
    walkingGuidanceThresholdRef.current = null;
    setWalkingRouteMonitoring(reset);
    setWalkingOffRouteDismissed(false);
  }

  function useUsualAssistanceForJourney() {
    setJourneyRequirements(requirements);
    setVisualAlert("Using your saved assistance for this journey.");
    AccessibilityInfo.announceForAccessibility(
      "Using your saved assistance for this journey.",
    );
  }

  function saveJourneyAssistanceAsDefault() {
    const updatedPreferences = preferencesWithAssistanceRequirements(
      appPreferences,
      journeyRequirements,
    );
    setAppPreferences(updatedPreferences);
    if (activeProfile) {
      const updatedProfile: PassengerProfile = {
        ...activeProfile,
        accessibilityPreferences: updatedPreferences,
        assistanceDefaults: undefined,
        appPreferences: undefined,
        updatedAt: new Date().toISOString(),
      };
      setActiveProfile(updatedProfile);
      setProfiles((current) =>
        current.map((profile) =>
          profile.profileId === updatedProfile.profileId
            ? updatedProfile
            : profile,
        ),
      );
    }
    setVisualAlert("Saved these assistance choices for future journeys.");
    AccessibilityInfo.announceForAccessibility(
      "Saved these assistance choices for future journeys.",
    );
  }

  function nearbyStopsCacheKey(payload: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
  }) {
    return `${payload.latitude.toFixed(4)}:${payload.longitude.toFixed(4)}:${Math.round(
      payload.accuracyMeters ?? 0,
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
      requestOrigin?: MapCoordinate & { accuracyMeters?: number };
    } = {},
  ) {
    if (!options.preserveSelection) {
      setSelectedStop(null);
      setSelectedLandmarkId(null);
      setGuidanceMode("INACTIVE");
      setFollowState("FREE");
    }
    const queryCenter = options.requestOrigin ?? {
      latitude: result.debug.latitude,
      longitude: result.debug.longitude,
      accuracyMeters: result.debug.accuracyMeters,
    };
    const source = options.viewportSource ?? "USER_LOCATION";
    setTransportDiscovery((current) => ({
      ...current,
      nearbyStops: result.stops,
      nearbyStopsStatus: result.stops.length > 0 ? "success" : "empty",
      connectivity: "online",
      ...(source === "USER_LOCATION"
        ? {
            location: current.lastSuccessfulLocation
              ? locationStateForCoords(current.lastSuccessfulLocation)
              : current.location,
            locationPermission: "granted" as const,
            locationRequested: true,
          }
        : {}),
    }));
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
          center:
            source === "USER_LOCATION"
              ? cameraCenterForUserLocation(
                  queryCenter,
                  DEFAULT_ZOOM,
                  mapCameraGeometryRef.current,
                )
              : queryCenter,
          zoom:
            source === "USER_LOCATION"
              ? DEFAULT_ZOOM
              : clampMapZoom(current.zoom, source),
        }),
        source === "USER_LOCATION" ? "FOLLOW_USER" : undefined,
      );
      if (source === "USER_LOCATION") {
        initialCameraAppliedRef.current = true;
      }
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
    },
  ) {
    const cacheKey = nearbyStopsCacheKey(payload);
    const cached = nearbyStopsCacheRef.current.get(cacheKey);
    const now = Date.now();

    if (
      options.useCache &&
      cached &&
      now - cached.timestamp < nearbyStopsCacheMs
    ) {
      applyNearbyStopsResult(cached.result, {
        ...options,
        requestOrigin: payload,
      });
      if (options.announce) {
        announceGuidance(
          `${cached.result.stops.length} nearby bus stops found. Please confirm your bus stop.`,
        );
      }
      return cached.result;
    }

    setTransportDiscovery((current) => ({
      ...current,
      nearbyStopsStatus: "loading",
      connectivity:
        current.connectivity === "offline"
          ? "reconnecting"
          : current.connectivity,
    }));
    stopsRequestRef.current.controller?.abort();
    const controller = new AbortController();
    const requestId = stopsRequestRef.current.id + 1;
    stopsRequestRef.current = { id: requestId, controller };

    const result = await findNearbyBusStops(payload, controller.signal);
    if (requestId !== stopsRequestRef.current.id) {
      return null;
    }

    nearbyStopsCacheRef.current.set(cacheKey, {
      timestamp: Date.now(),
      result,
    });
    applyNearbyStopsResult(result, {
      ...options,
      requestOrigin: payload,
    });
    if (options.announce) {
      announceGuidance(
        `${result.stops.length} nearby bus stops found. Please confirm your bus stop.`,
      );
    }
    return result;
  }

  async function findMyBusStop() {
    const locationLookupRequestId = locationLookupRequestRef.current + 1;
    locationLookupRequestRef.current = locationLookupRequestId;
    setBottomSheetContent("NEARBY");
    setNearbyOpen(false);
    setIsLoading(true);
    setLoadingMessage("Finding nearby bus stops...");
    setError(null);
    try {
      setTransportDiscovery((current) => ({
        ...current,
        location: "loading",
        locationRequested: true,
        nearbyStopsStatus:
          current.nearbyStopsStatus === "idle"
            ? "idle"
            : current.nearbyStopsStatus,
      }));
      const permission = await settleWithin(
        Location.requestForegroundPermissionsAsync(),
        deviceLocationTimeoutMs,
      );
      if (locationLookupRequestId !== locationLookupRequestRef.current) {
        return;
      }
      if (permission.status !== "granted") {
        setTransportDiscovery((current) => ({
          ...current,
          location: "permission_denied",
          locationPermission: "denied",
          locationRequested: true,
        }));
        return;
      }

      const position = await getReliableDeviceLocation(
        lastLocationResultRef.current,
      );
      if (locationLookupRequestId !== locationLookupRequestRef.current) {
        return;
      }
      lastLocationResultRef.current = position;
      setTransportDiscovery((current) => ({
        ...current,
        location: locationStateForCoords(position.coords),
        locationPermission: "granted",
        locationRequested: true,
        lastSuccessfulLocation: position.coords,
      }));
      const focusZoom = DEFAULT_ZOOM;
      runCameraCommand(
        "initialLocation",
        "USER_LOCATION",
        (current) => ({
          ...current,
          center: cameraCenterForUserLocation(
            position.coords,
            focusZoom,
            mapCameraGeometryRef.current,
          ),
          zoom: focusZoom,
          bearing: 0,
          pitch: 0,
        }),
        "FOLLOW_USER",
      );
      initialCameraAppliedRef.current = true;
      setFollowState("FOLLOW_USER");
      setLocationPulseKey((current) => current + 1);
      setMapViewMode("MAP");
      setScreen("STOP");
      let result: NearbyBusStopsResponse | null = null;
      try {
        result = await loadNearbyStopsFor(position.coords, {
          useCache: true,
          announce: true,
          originLabel: "Nearby bus stops",
          viewportSource: "USER_LOCATION",
          updateCamera: false,
        });
      } catch (apiError) {
        if (
          apiError instanceof DOMException &&
          apiError.name === "AbortError"
        ) {
          return;
        }
        if (locationLookupRequestId !== locationLookupRequestRef.current) {
          return;
        }
        const failureStatus = nearbyStopsFailureStatus(apiError);
        const connectivity = readConnectivityState();
        setTransportDiscovery((current) => ({
          ...current,
          nearbyStopsStatus: failureStatus,
          connectivity:
            failureStatus === "network_error"
              ? connectivity === "offline"
                ? "offline"
                : "reconnecting"
              : current.connectivity,
        }));
        setScreen("STOP");
        updateBottomSheetState("HIDDEN_PEEK");
        return;
      }
      if (!result) {
        return;
      }
      setFollowState("FOLLOW_USER");
    } catch (apiError) {
      if (apiError instanceof DOMException && apiError.name === "AbortError") {
        return;
      }
      if (locationLookupRequestId !== locationLookupRequestRef.current) {
        return;
      }
      setTransportDiscovery((current) => ({
        ...current,
        location: current.lastSuccessfulLocation
          ? "approximate"
          : "unavailable",
        locationPermission:
          current.locationPermission === "granted"
            ? "granted"
            : current.locationPermission,
        locationRequested: true,
      }));
    } finally {
      if (locationLookupRequestId === locationLookupRequestRef.current) {
        setIsLoading(false);
        setLoadingMessage(null);
      }
    }
  }

  async function loadFocusedAssistArrivals(stop: NearbyBusStop) {
    const requestId = focusedAssistLocationRequestRef.current;
    try {
      const arrivals = await fetchBusStopArrivals(stop.busStopCode);
      if (requestId !== focusedAssistLocationRequestRef.current) {
        return;
      }
      setFocusedAssistArrivals(
        arrivals.services.flatMap((service) => service.buses),
      );
      setFocusedAssistContextError(null);
    } catch {
      if (requestId === focusedAssistLocationRequestRef.current) {
        setFocusedAssistArrivals([]);
        setFocusedAssistContextError(
          "We found your stop, but live bus detection is unavailable.",
        );
      }
    }
  }

  async function prepareFocusedAssistContext() {
    if (focusedAssistOnboard) {
      return;
    }
    const resolution = resolveCurrentStop({
      location: currentLocationRef.current,
      nearbyStops: focusedAssistNearbyStops,
      manuallySelectedStop: focusedAssistManualStop,
    });
    if (!resolution.stop) {
      return;
    }
    focusedAssistLocationRequestRef.current += 1;
    setFocusedAssistLocating(true);
    setFocusedAssistContextError(null);
    try {
      await loadFocusedAssistArrivals(resolution.stop);
    } finally {
      setFocusedAssistLocating(false);
    }
  }

  async function refreshFocusedAssistContext() {
    const requestId = focusedAssistLocationRequestRef.current + 1;
    focusedAssistLocationRequestRef.current = requestId;
    setFocusedAssistLocating(true);
    setFocusedAssistContextError(null);
    setFocusedAssistManualStop(null);
    setFocusedAssistSelectedBusId(null);
    try {
      const permission = await settleWithin(
        Location.requestForegroundPermissionsAsync(),
        focusedAssistLocationTimeoutMs,
      );
      if (requestId !== focusedAssistLocationRequestRef.current) {
        return;
      }
      if (permission.status !== "granted") {
        setTransportDiscovery((current) => ({
          ...current,
          location: "permission_denied",
          locationPermission: "denied",
          locationRequested: true,
        }));
        setFocusedAssistContextError(
          "Location permission is needed to identify your bus stop.",
        );
        return;
      }
      const position = await settleWithin(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        focusedAssistLocationTimeoutMs,
      );
      if (requestId !== focusedAssistLocationRequestRef.current) {
        return;
      }
      const location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy ?? undefined,
        headingDegrees:
          position.coords.heading !== null && position.coords.heading >= 0
            ? position.coords.heading
            : undefined,
      };
      lastLocationResultRef.current = {
        timestamp: Date.now(),
        coords: location,
      };
      const nearby = await findNearbyBusStops(location);
      if (requestId !== focusedAssistLocationRequestRef.current) {
        return;
      }
      setTransportDiscovery((current) => ({
        ...current,
        location: locationStateForCoords(location),
        locationPermission: "granted",
        locationRequested: true,
        lastSuccessfulLocation: location,
        nearbyStops: nearby.stops,
        nearbyStopsStatus: nearby.stops.length > 0 ? "success" : "empty",
        connectivity: "online",
      }));
      const resolution = resolveCurrentStop({
        location,
        nearbyStops: nearby.stops,
        manuallySelectedStop: null,
      });
      if (!resolution.stop) {
        setFocusedAssistArrivals([]);
        setFocusedAssistContextError(
          resolution.reason === "POOR_ACCURACY"
            ? "We're not sure which bus stop you're at."
            : "We can't identify a bus stop close enough to your location.",
        );
        return;
      }
      await loadFocusedAssistArrivals(resolution.stop);
    } catch {
      if (requestId === focusedAssistLocationRequestRef.current) {
        setFocusedAssistArrivals([]);
        setFocusedAssistContextError(
          "We couldn't update your location. Try again or choose a bus stop.",
        );
      }
    } finally {
      if (requestId === focusedAssistLocationRequestRef.current) {
        setFocusedAssistLocating(false);
      }
    }
  }

  function chooseFocusedAssistBusStop() {
    focusedAssistPreviousSelectedStopRef.current = selectedStop;
    focusedAssistSelectingStopRef.current = true;
    void loadManualStops();
  }

  async function loadManualStops({
    sheetContent = "NEARBY",
  }: { sheetContent?: MapBottomSheetContent } = {}) {
    locationLookupRequestRef.current += 1;
    setBottomSheetContent(sheetContent);
    setNearbyOpen(sheetContent === "NEARBY");
    setIsLoading(true);
    setLoadingMessage("Loading nearby bus stops...");
    setError(null);
    setTransportDiscovery((current) => ({
      ...current,
      location:
        current.location === "loading"
          ? current.lastSuccessfulLocation
            ? locationStateForCoords(current.lastSuccessfulLocation)
            : "unavailable"
          : current.location,
      locationRequested:
        current.location === "loading" ? false : current.locationRequested,
      nearbyStopsStatus: "loading",
    }));
    try {
      await loadNearbyStopsFor(manualStopLookup, {
        useCache: true,
        announce: false,
        originLabel: "Nearby bus stops",
        viewportSource: "SEARCH_RESULT",
        updateCamera: !initialCameraAppliedRef.current,
      });
      if (sheetContent === "NEARBY") {
        updateBottomSheetState(lastNearbySheetState);
      }
    } catch (apiError) {
      if (apiError instanceof DOMException && apiError.name === "AbortError") {
        return;
      }
      const failureStatus = nearbyStopsFailureStatus(apiError);
      setBottomSheetContent("NEARBY");
      const connectivity = readConnectivityState();
      setTransportDiscovery((current) => ({
        ...current,
        nearbyStopsStatus: failureStatus,
        connectivity:
          failureStatus === "network_error"
            ? connectivity === "offline"
              ? "offline"
              : "reconnecting"
            : current.connectivity,
      }));
      setScreen("STOP");
      if (sheetContent === "NEARBY") {
        setNearbyOpen(true);
      }
      updateBottomSheetState("MEDIUM");
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  }

  async function loadStaticStopDetails(stop: NearbyBusStop, force = false) {
    const cached = force
      ? undefined
      : stopDetailsCacheRef.current.get(stop.busStopCode);
    if (cached) {
      setSelectedStop({ ...cached, distanceMeters: stop.distanceMeters });
      setStaticServicesStatus("SUCCESS");
      return;
    }

    stopDetailsRequestRef.current.controller?.abort();
    const requestId = stopDetailsRequestRef.current.id + 1;
    const controller = new AbortController();
    stopDetailsRequestRef.current = { id: requestId, controller };
    setStaticServicesStatus("LOADING");
    try {
      const result = await fetchBusStop(stop.busStopCode, controller.signal);
      if (requestId !== stopDetailsRequestRef.current.id) return;
      const enrichedStop: NearbyBusStop = {
        ...result.stop,
        distanceMeters: stop.distanceMeters,
      };
      stopDetailsCacheRef.current.set(stop.busStopCode, result.stop);
      setSelectedStop(enrichedStop);
      setRegionalStops((current) =>
        current.map((candidate) =>
          candidate.busStopCode === enrichedStop.busStopCode
            ? { ...enrichedStop, distanceMeters: candidate.distanceMeters }
            : candidate,
        ),
      );
      setTransportDiscovery((current) => ({
        ...current,
        nearbyStops: current.nearbyStops.map((candidate) =>
          candidate.busStopCode === enrichedStop.busStopCode
            ? { ...enrichedStop, distanceMeters: candidate.distanceMeters }
            : candidate,
        ),
      }));
      setStaticServicesStatus("SUCCESS");
    } catch (apiError) {
      if (apiError instanceof DOMException && apiError.name === "AbortError") {
        return;
      }
      if (requestId === stopDetailsRequestRef.current.id) {
        setStaticServicesStatus("ERROR");
      }
    }
  }

  function confirmBusStop(stop = selectedStop, preferredServiceNo?: string) {
    if (!stop) {
      return;
    }

    journeySessionIdRef.current += 1;
    const staticOptions = serviceOptionsFromStopFallback(stop);
    setSelectedStop(stop);
    setJourneySetupState("SELECTING_SERVICE");
    setServiceOptions(staticOptions);
    setSelectedServiceOption(null);
    selectedServiceOptionRef.current = null;
    setSelectedArrival(null);
    setSelectedAlightingStop(null);
    setSelectedBus(null);
    setArrivingBuses([]);
    setArrivalsStatus("LOADING");
    setRouteDetailsStatus("IDLE");
    setScreen("BUS");
    setError(null);

    const preferredOption = preferredServiceNo
      ? staticOptions.find((option) => option.serviceNo === preferredServiceNo)
      : undefined;
    if (preferredOption) {
      selectService(preferredOption, stop);
    }
    void loadArrivalsForStop(stop);
  }

  async function loadArrivalsForStop(stop: NearbyBusStop) {
    const journeySessionId = journeySessionIdRef.current;
    setArrivalsStatus("LOADING");
    try {
      arrivalsRequestRef.current.controller?.abort();
      const cached = arrivalsCacheRef.current.get(stop.busStopCode);
      const cachedIsFresh =
        cached && Date.now() - cached.timestamp < arrivalsCacheMs;
      const requestId = arrivalsRequestRef.current.id + 1;

      if (cachedIsFresh) {
        applyArrivalResult(stop, cached.result);
        return;
      }

      const controller = new AbortController();
      arrivalsRequestRef.current = { id: requestId, controller };
      const arrivals = await fetchBusStopArrivals(
        stop.busStopCode,
        controller.signal,
      );
      if (
        requestId !== arrivalsRequestRef.current.id ||
        journeySessionId !== journeySessionIdRef.current
      ) {
        return;
      }
      arrivalsCacheRef.current.set(stop.busStopCode, {
        timestamp: Date.now(),
        result: arrivals,
      });
      applyArrivalResult(stop, arrivals);
    } catch (apiError) {
      if (apiError instanceof DOMException && apiError.name === "AbortError") {
        return;
      }
      if (journeySessionId === journeySessionIdRef.current) {
        setArrivalsStatus("ERROR");
      }
    }
  }

  function applyArrivalResult(
    stop: NearbyBusStop,
    arrivals: BusStopArrivalsResponse,
  ) {
    const options = serviceOptionsFromArrivals(stop, arrivals.services);
    const flattened = options.flatMap((service) => service.buses);
    setServiceOptions(options);
    setArrivingBuses(flattened);
    setArrivalsStatus(flattened.length > 0 ? "SUCCESS" : "ERROR");

    const currentSelection = selectedServiceOptionRef.current;
    if (!currentSelection) return;
    const refreshedSelection = options.find(
      (option) => option.serviceNo === currentSelection.serviceNo,
    );
    if (!refreshedSelection) return;

    const arrival = refreshedSelection.buses[0] ?? null;
    selectedServiceOptionRef.current = refreshedSelection;
    setSelectedServiceOption(refreshedSelection);
    setSelectedArrival(arrival);
    setSelectedBus((current) =>
      current && current.busService === refreshedSelection.serviceNo
        ? {
            ...current,
            busId:
              arrival?.busId ??
              `SERVICE-${refreshedSelection.serviceNo}-UNASSIGNED`,
            isAccessible: arrival?.wheelchairAccessible ?? false,
            wheelchairSpaces: arrival?.wheelchairAccessible ? 1 : 0,
            estimatedArrivalSeconds: arrival?.etaSeconds ?? 0,
          }
        : current,
    );
  }

  function selectService(option: BusServiceOption, stop = selectedStop) {
    if (!stop) {
      return;
    }

    const arrival = option.buses[0] ?? null;
    const etaSeconds = arrival?.etaSeconds ?? 0;
    const arrivalDestination = arrival?.destination ?? option.destination;
    const busId = arrival?.busId ?? `SERVICE-${option.serviceNo}-UNASSIGNED`;
    setSelectedArrival(arrival);
    setSelectedServiceOption(option);
    selectedServiceOptionRef.current = option;
    setDestinationSearchQuery("");
    setJourneyRequirements(requirements);
    setRequestId(null);
    setCaseId(null);
    setAssistanceCaseState(null);
    setRequestStatus(null);
    setRequestPhase(null);
    setEvents([]);
    setVehicleStatus(null);
    setAutonomousDriveState(null);
    setSelectedBus({
      busId,
      busService: option.serviceNo,
      routeNumber: option.serviceNo,
      currentStop: stop.description,
      nextStop: arrivalDestination,
      isAccessible: arrival?.wheelchairAccessible ?? false,
      wheelchairSpaces: arrival?.wheelchairAccessible ? 1 : 0,
      latitude: stop.latitude,
      longitude: stop.longitude,
      estimatedArrivalSeconds: etaSeconds,
    });
    const selectedRoute = routeStopsForBus(
      {
        busId,
        busService: option.serviceNo,
        routeNumber: option.serviceNo,
        currentStop: stop.description,
        nextStop: arrivalDestination,
        isAccessible: arrival?.wheelchairAccessible ?? false,
        wheelchairSpaces: arrival?.wheelchairAccessible ? 1 : 0,
        latitude: stop.latitude,
        longitude: stop.longitude,
        estimatedArrivalSeconds: etaSeconds,
      },
      stop,
      arrival,
    );
    setRouteStops(selectedRoute);
    setCurrentStopIndex(0);
    setSelectedAlightingStop(defaultAlightingStopForRoute(selectedRoute));
    setJourneyPhase("PLANNING");
    setJourneySetupState("SELECTING_DESTINATION");
    setRouteDetailsStatus("LOADING");
    void loadRouteDetails(stop, option, arrival);
    announceGuidance(
      arrival
        ? `Service ${option.serviceNo} selected. Towards ${arrivalDestination}. Arriving in approximately ${Math.ceil(
            arrival.etaSeconds / 60,
          )} minutes. Choose destination.`
        : `Service ${option.serviceNo} selected. Live arrival unavailable. Route details are loading.`,
    );
  }

  async function loadRouteDetails(
    stop: NearbyBusStop,
    option: BusServiceOption,
    arrival: ArrivalBus | null,
  ) {
    const journeySessionId = journeySessionIdRef.current;
    setRouteDetailsStatus("LOADING");
    const cacheKey = `${stop.busStopCode}\u0000${option.serviceNo}`;
    const cached = routeDetailsCacheRef.current.get(cacheKey);
    if (cached) {
      applyRouteDetails(stop, option, arrival, cached.routes);
      return;
    }

    routeDetailsRequestRef.current.controller?.abort();
    const requestId = routeDetailsRequestRef.current.id + 1;
    const controller = new AbortController();
    routeDetailsRequestRef.current = { id: requestId, controller };
    try {
      const result = await fetchBusStopServiceRoutes(
        stop.busStopCode,
        option.serviceNo,
        controller.signal,
      );
      if (
        requestId !== routeDetailsRequestRef.current.id ||
        journeySessionId !== journeySessionIdRef.current
      )
        return;
      routeDetailsCacheRef.current.set(cacheKey, result);
      applyRouteDetails(stop, option, arrival, result.routes);
    } catch (apiError) {
      if (apiError instanceof DOMException && apiError.name === "AbortError") {
        return;
      }
      if (
        requestId === routeDetailsRequestRef.current.id &&
        journeySessionId === journeySessionIdRef.current
      ) {
        setRouteDetailsStatus("ERROR");
      }
    }
  }

  function applyRouteDetails(
    stop: NearbyBusStop,
    option: BusServiceOption,
    arrival: ArrivalBus | null,
    routes: BusServiceRouteOption[],
  ) {
    const route = preferredServiceRoute(routes, arrival?.destination);
    if (!route) {
      setRouteDetailsStatus("ERROR");
      return;
    }

    const destinationName = route.destination.description;
    const currentSelection = selectedServiceOptionRef.current;
    if (
      currentSelection?.serviceNo !== option.serviceNo ||
      selectedStop?.busStopCode !== stop.busStopCode
    ) {
      return;
    }
    const updatedOption = { ...currentSelection, destination: destinationName };
    selectedServiceOptionRef.current = updatedOption;
    setSelectedServiceOption(updatedOption);
    setServiceOptions((current) =>
      current.map((candidate) =>
        candidate.serviceNo === option.serviceNo
          ? { ...candidate, destination: destinationName }
          : candidate,
      ),
    );
    setSelectedBus((current) =>
      current?.busService === option.serviceNo
        ? { ...current, nextStop: destinationName }
        : current,
    );
    setRouteStops(route.stops);
    setCurrentStopIndex(0);
    setSelectedAlightingStop(defaultAlightingStopForRoute(route.stops));
    setRouteDetailsStatus("SUCCESS");
    announceGuidance(
      `Service ${option.serviceNo}, towards ${destinationName}. Choose your destination.`,
    );
  }

  async function submitRequest(
    requestedAssistanceTypes: AssistanceType[] = assistanceTypes,
    options: { stayOnAssist?: boolean } = {},
  ) {
    if (
      !selectedBus ||
      !selectedStop ||
      requestedAssistanceTypes.length === 0 ||
      isLoading
    ) {
      return false;
    }

    const journeySessionId = journeySessionIdRef.current;
    setIsLoading(true);
    setLoadingMessage(loadingMessageForAssistance(requestedAssistanceTypes));
    setError(null);
    try {
      const response = await createAssistanceRequest({
        sessionId,
        busService: selectedBus.busService,
        busId: selectedBus.busId,
        boardingStop: selectedStop.busStopCode,
        destination:
          selectedAlightingStop?.description ??
          selectedArrival?.destination ??
          selectedBus.nextStop,
        stopCode: selectedStop.busStopCode,
        assistanceTypes: requestedAssistanceTypes,
        source: "MOBILE_APP",
        boardingOrAlighting: "BOARDING",
        accessibilityVerificationStatus: activeProfile?.verificationStatus,
        verificationMethod: activeProfile?.verificationMethod,
      });

      if (journeySessionId !== journeySessionIdRef.current) {
        void cancelAssistanceRequest(response.requestId).catch(() => undefined);
        return false;
      }

      setRequestId(response.requestId);
      setCaseId(response.caseId ?? null);
      setAssistanceCaseState(response.assistanceCaseState ?? null);
      setRequestStatus(response.status);
      requestPhaseRef.current = "BOARDING";
      setRequestPhase("BOARDING");
      setEvents([
        {
          type: "REQUEST_STATUS",
          requestId: response.requestId,
          status: response.status,
          timestamp: response.createdAt,
          assistanceTypes: requestedAssistanceTypes,
          source: "MOBILE_APP",
          busId: selectedBus.busId,
          busService: selectedBus.busService,
          message: response.duplicateOfRequestId
            ? "Ramp assistance is already requested for this bus."
            : `The bus has received your request for ${requestedAssistanceTypes
                .map(readableAssistanceType)
                .join(", ")}. You do not need to request again.`,
        },
      ]);
      setJourneySetupState("WAITING_FOR_BUS");
      setJourneyPhase("WAITING_FOR_BUS");
      setScreen(options.stayOnAssist ? "ACCESSIBILITY" : "STATUS");
      return true;
    } catch (apiError) {
      if (journeySessionId === journeySessionIdRef.current) {
        setError(
          `We could not confirm your assistance request for Service ${selectedBus.busService}. Please try again.`,
        );
      }
      return false;
    } finally {
      if (journeySessionId === journeySessionIdRef.current) {
        setIsLoading(false);
        setLoadingMessage(null);
      }
    }
  }

  async function requestRampWhileWaiting() {
    const updatedRequirements = {
      ...journeyRequirements,
      wheelchairRamp: true,
    };
    const rampRequestSent = await submitRequest(
      assistanceTypesForPhase(updatedRequirements, "BOARDING"),
    );
    if (rampRequestSent) {
      setJourneyRequirements(updatedRequirements);
    }
  }

  async function requestFocusedAssistRamp(
    bus: BusAtStop,
    context: FocusedAssistContext,
  ) {
    return requestFocusedBoardingAssistance(bus, context, "WHEELCHAIR_RAMP");
  }

  async function requestFocusedAssistExtraTime(
    bus: BusAtStop,
    context: FocusedAssistContext,
  ) {
    return requestFocusedBoardingAssistance(
      bus,
      context,
      "EXTENDED_DWELL_TIME",
    );
  }

  async function requestFocusedBoardingAssistance(
    bus: BusAtStop,
    context: FocusedAssistContext,
    assistanceType: "WHEELCHAIR_RAMP" | "EXTENDED_DWELL_TIME",
  ) {
    if (focusedAssistSubmittingRef.current || !context.stop) {
      return false;
    }
    const isRamp = assistanceType === "WHEELCHAIR_RAMP";
    const requestName = isRamp ? "Ramp assistance" : "More boarding time";
    if (
      bus.activeJourneyMatch &&
      selectedBus?.busId === bus.vehicleId &&
      selectedStop?.busStopCode === context.stop.busStopCode
    ) {
      focusedAssistSubmittingRef.current = true;
      try {
        const sent = await submitRequest([assistanceType], {
          stayOnAssist: true,
        });
        if (sent) {
          notifyPassenger(
            `${requestName} requested for Service ${bus.serviceNo}.`,
            {
              haptic: "SUCCESS",
              id: `focused-assist-${bus.id}-${assistanceType.toLowerCase()}-requested`,
              priority: "BUS",
            },
          );
        }
        return sent;
      } finally {
        focusedAssistSubmittingRef.current = false;
      }
    }

    focusedAssistSubmittingRef.current = true;
    const focusedSessionId = focusedAssistRequestSessionRef.current + 1;
    focusedAssistRequestSessionRef.current = focusedSessionId;
    setFocusedAssistRequest({
      requestId: null,
      status: null,
      assistanceType,
      submitting: true,
      bus,
      stop: context.stop,
      error: null,
    });
    try {
      const response = await createAssistanceRequest({
        sessionId,
        busService: bus.serviceNo,
        busId: bus.vehicleId ?? bus.id,
        boardingStop: context.stop.busStopCode,
        destination: bus.destination ?? "Destination not selected",
        stopCode: context.stop.busStopCode,
        assistanceTypes: [assistanceType],
        source: "MOBILE_APP",
        boardingOrAlighting: "BOARDING",
        accessibilityVerificationStatus: activeProfile?.verificationStatus,
        verificationMethod: activeProfile?.verificationMethod,
      });
      if (focusedSessionId !== focusedAssistRequestSessionRef.current) {
        void cancelAssistanceRequest(response.requestId).catch(() => undefined);
        return false;
      }
      setFocusedAssistRequest({
        requestId: response.requestId,
        status: response.status,
        assistanceType,
        submitting: false,
        bus,
        stop: context.stop,
        error: null,
      });
      notifyPassenger(
        response.duplicateOfRequestId
          ? `${requestName} is already requested for Service ${bus.serviceNo}.`
          : `${requestName} requested for Service ${bus.serviceNo}.`,
        {
          haptic: "SUCCESS",
          id: `focused-assist-${bus.id}-${assistanceType.toLowerCase()}-requested`,
          priority: "BUS",
        },
      );
      return true;
    } catch {
      if (focusedSessionId === focusedAssistRequestSessionRef.current) {
        setFocusedAssistRequest((current) => ({
          ...current,
          status: AssistanceRequestStatus.FAILED,
          submitting: false,
          error: isRamp
            ? "We couldn't complete the ramp request."
            : "We couldn't request more boarding time.",
        }));
      }
      return false;
    } finally {
      if (focusedSessionId === focusedAssistRequestSessionRef.current) {
        focusedAssistSubmittingRef.current = false;
      }
    }
  }

  async function requestFocusedAlightingAssistance() {
    if (!focusedAssistOnboard) {
      setFocusedAssistRequest((current) => ({
        ...current,
        error: "Alighting assistance is available once you are onboard.",
      }));
      return false;
    }
    return requestDisembarkation();
  }

  function continueToJourneyReview() {
    if (!selectedBus || !selectedAlightingStop) {
      return;
    }
    setJourneySetupState("REVIEWING_JOURNEY");
    setScreen("CONFIRM");
    announceGuidance(
      `Journey preview. Service ${selectedBus.busService}. Get off at ${selectedAlightingStop.description}.`,
    );
  }

  function startJourneyWithoutAssistance() {
    if (!selectedBus || !selectedStop || !selectedAlightingStop) {
      return;
    }
    setRequestId(null);
    setCaseId(null);
    setAssistanceCaseState(null);
    setRequestStatus(null);
    setRequestPhase(null);
    setEvents([]);
    const distanceToBoardingStop = currentLocation
      ? distanceBetweenCoordinates(currentLocation, selectedStop)
      : selectedStop.distanceMeters;
    const nextPhase =
      distanceToBoardingStop > 50 ? "WALKING_TO_STOP" : "WAITING_FOR_BUS";
    setJourneySetupState(nextPhase);
    setJourneyPhase(nextPhase);
    setScreen("STATUS");
    announceGuidance(
      nextPhase === "WALKING_TO_STOP"
        ? `Journey started. Walk to ${selectedStop.description}. Take Service ${selectedBus.busService} to ${selectedAlightingStop.description}.`
        : `Journey started. Wait for Service ${selectedBus.busService} at ${selectedStop.description}. Destination ${selectedAlightingStop.description}.`,
    );
    if (nextPhase === "WALKING_TO_STOP") {
      void requestWalkingDirections().then((route) => {
        if (route) beginWalkingGuidance(route);
      });
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
      setAssistanceCaseState("CANCELLED");
      requestStatusRef.current = AssistanceRequestStatus.CANCELLED;
      setRequestStatus(AssistanceRequestStatus.CANCELLED);
      if (selectedBus) {
        const cancelledEvent: StatusUpdateMessage = {
          type: "REQUEST_STATUS",
          requestId,
          status: AssistanceRequestStatus.CANCELLED,
          timestamp: new Date().toISOString(),
          assistanceTypes,
          source: "MOBILE_APP",
          busId: selectedBus.busId,
          busService: selectedBus.busService,
          message: "Assistance request cancelled.",
        };
        setEvents((current) => [cancelledEvent, ...current]);
      }
      announceGuidance("Your assistance request has been cancelled.");
    } catch {
      setError(
        "We could not cancel the request. Your original assistance request may still be active.",
      );
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
    setTransportDiscovery((current) => ({
      ...current,
      location: "loading",
      locationRequested: true,
    }));
    try {
      const permission = await settleWithin(
        Location.requestForegroundPermissionsAsync(),
        deviceLocationTimeoutMs,
      );
      if (permission.status !== "granted") {
        setTransportDiscovery((current) => ({
          ...current,
          location: "permission_denied",
          locationPermission: "denied",
          locationRequested: true,
        }));
        setScreen("STOP");
        return;
      }

      const position = await getReliableDeviceLocation(
        lastLocationResultRef.current,
      );
      lastLocationResultRef.current = position;

      if (cameraIntentId !== cameraIntentIdRef.current) {
        setTransportDiscovery((current) => ({
          ...current,
          location: locationStateForCoords(position.coords),
          locationPermission: "granted",
          locationRequested: true,
          lastSuccessfulLocation: position.coords,
        }));
        return;
      }
      setTransportDiscovery((current) => ({
        ...current,
        location: locationStateForCoords(position.coords),
        locationPermission: "granted",
        locationRequested: true,
        lastSuccessfulLocation: position.coords,
      }));
      const focusZoom = DEFAULT_ZOOM;
      runCameraCommand(
        "locateUser",
        "USER_LOCATION",
        (current) => ({
          ...current,
          center: cameraCenterForUserLocation(
            position.coords,
            focusZoom,
            mapCameraGeometryRef.current,
          ),
          zoom: focusZoom,
          bearing: 0,
          pitch: 0,
        }),
        "FOLLOW_USER",
      );
      setFollowState("FOLLOW_USER");
      setLocationPulseKey((current) => current + 1);
      AccessibilityInfo.announceForAccessibility(
        "Map centred on your current location.",
      );
    } catch (apiError) {
      setTransportDiscovery((current) => ({
        ...current,
        location: current.lastSuccessfulLocation
          ? "approximate"
          : "unavailable",
        locationRequested: true,
      }));
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  }

  function resolveNearbyStopsOrigin() {
    const source: ViewportSource = selectedLandmark
      ? "SEARCH_RESULT"
      : selectedStop
        ? "SELECTED_STOP"
        : mapCameraMode === "MANUAL"
          ? "USER_PAN"
          : currentLocation
            ? "USER_LOCATION"
            : "SEARCH_RESULT";
    const origin =
      selectedLandmark ??
      selectedStop ??
      (source === "USER_PAN" ? mapViewport.center : currentLocation) ??
      mapViewport.center ??
      manualStopLookup;
    const originLabel =
      source === "USER_LOCATION"
        ? "Nearby bus stops"
        : selectedLandmark
          ? `Bus stops near ${selectedLandmark.name}`
          : selectedStop
            ? `Bus stops near ${selectedStop.description}`
            : "Bus stops in this area";
    return { origin, originLabel, source };
  }

  async function showNearbyStopsInArea() {
    const { origin, originLabel, source } = resolveNearbyStopsOrigin();
    setScreen("STOP");
    setBottomSheetContent("NEARBY");
    setIsLoading(true);
    setLoadingMessage("Finding bus stops nearby...");
    setError(null);
    setTransportDiscovery((current) => ({
      ...current,
      nearbyStopsStatus: "loading",
    }));
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
      if (nearbyOpen) {
        updateBottomSheetState("MEDIUM");
      }
      if (source === "USER_PAN" || !currentLocation) {
        AccessibilityInfo.announceForAccessibility(
          "Bus stops in this area are shown.",
        );
      }
    } catch (apiError) {
      if (apiError instanceof DOMException && apiError.name === "AbortError") {
        return;
      }
      const failureStatus = nearbyStopsFailureStatus(apiError);
      const connectivity = readConnectivityState();
      setTransportDiscovery((current) => ({
        ...current,
        nearbyStopsStatus: failureStatus,
        connectivity:
          failureStatus === "network_error"
            ? connectivity === "offline"
              ? "offline"
              : "reconnecting"
            : current.connectivity,
      }));
      setScreen("STOP");
      if (nearbyOpen) {
        updateBottomSheetState("MEDIUM");
      }
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  }

  function openNearbyStops() {
    setScreen("STOP");
    setSelectedStop(null);
    setSelectedLandmarkId(null);
    setGuidanceMode("INACTIVE");
    setBottomSheetContent("NEARBY");
    setNearbyOpen(true);
    updateBottomSheetState(lastNearbySheetState);

    if (
      transportDiscovery.nearbyStopsStatus === "idle" ||
      searchThisAreaVisible
    ) {
      void showNearbyStopsInArea();
    }
  }

  function toggleNearbyStopsSheet() {
    if (nearbyOpen) {
      setNearbyOpen(false);
      updateBottomSheetState("HIDDEN_PEEK");
      return;
    }

    openNearbyStops();
  }

  function askToCancelRequest() {
    if (!appPreferences.confirmImportantActions) {
      void cancelRequest();
      return;
    }
    setConfirmingCancelRequest(true);
    AccessibilityInfo.announceForAccessibility(
      "Cancel assistance request? Your bus may no longer receive your accessibility request.",
    );
  }

  function enterOnboardMode() {
    if (!selectedBus) {
      return;
    }

    const route =
      routeStops.length > 0
        ? routeStops
        : routeStopsForBus(selectedBus, selectedStop, selectedArrival);
    setRouteStops(route);
    setCurrentStopIndex(0);
    setSelectedAlightingStop(
      (current) => current ?? defaultAlightingStopForRoute(route),
    );
    setJourneySetupState("ONBOARD");
    setJourneyPhase("ONBOARD");
    setScreen("ONBOARD");
    notifyPassenger(
      `You are onboard Bus ${selectedBus.busService} towards ${selectedArrival?.destination ?? selectedBus.nextStop}.`,
      {
        haptic: "START",
        id: `onboard-${selectedBus.busId}-started`,
        priority: "BUS",
      },
    );
  }

  function chooseAlightingStop(stop: RouteStop) {
    setSelectedAlightingStop(stop);
    if (journeySetupState === "SELECTING_DESTINATION") {
      setJourneySetupState("REVIEWING_JOURNEY");
    }
    if (
      journeyPhase === "ONBOARD" ||
      journeyPhase === "DESTINATION_APPROACHING" ||
      journeyPhase === "DESTINATION_NEXT" ||
      journeyPhase === "DISEMBARKING" ||
      journeyPhase === "ALIGHTING"
    ) {
      setScreen("ONBOARD");
    }
    announceGuidance(`${stop.description} selected as your alighting stop.`);
  }

  function simulateNextStop() {
    if (currentStopIndex >= routeStops.length - 1) {
      return;
    }

    const nextIndex = currentStopIndex + 1;
    const nextStop = routeStops[nextIndex];
    setCurrentStopIndex(nextIndex);

    if (selectedAlightingStop?.busStopCode === nextStop.busStopCode) {
      setJourneySetupState("DISEMBARKING");
      setJourneyPhase("DISEMBARKING");
      notifyPassenger(`This is your stop. ${nextStop.description}.`, {
        haptic: "SUCCESS",
        id: `onboard-${selectedBus?.busId ?? "bus"}-destination-reached-${nextIndex}`,
        priority: "DESTINATION",
      });
      return;
    }

    const followingStop = routeStops[nextIndex + 1];
    if (
      selectedAlightingStop &&
      followingStop?.busStopCode === selectedAlightingStop.busStopCode
    ) {
      setJourneySetupState("DESTINATION_NEXT");
      setJourneyPhase("DESTINATION_NEXT");
      if (appPreferences.warnDestinationNext) {
        notifyPassenger(
          `Your destination, ${selectedAlightingStop.description}, is the next stop. Prepare to alight.`,
          {
            haptic: "WARNING",
            id: `onboard-${selectedBus?.busId ?? "bus"}-destination-next-${nextIndex}`,
            priority: "DESTINATION",
          },
        );
      }
      return;
    }

    const remainingAfterMove = stopsRemainingToDestination(
      routeStops,
      nextIndex,
      selectedAlightingStop,
    );
    if (remainingAfterMove !== null && remainingAfterMove <= 2) {
      setJourneySetupState("DESTINATION_APPROACHING");
      setJourneyPhase("DESTINATION_APPROACHING");
      if (appPreferences.warnTwoStopsBeforeDestination) {
        notifyPassenger(
          `${remainingAfterMove} stops remaining before ${selectedAlightingStop?.description}.`,
          {
            haptic: "WARNING",
            id: `onboard-${selectedBus?.busId ?? "bus"}-${remainingAfterMove}-stops-remaining`,
            priority: "DESTINATION",
          },
        );
      }
      return;
    }

    setJourneySetupState("ONBOARD");
    setJourneyPhase("ONBOARD");
    if (followingStop) {
      announceSemanticGuidance({
        id: `onboard-${selectedBus?.busId ?? "bus"}-next-stop-${nextIndex}`,
        priority: "GENERAL",
        text: `Next stop: ${followingStop.description}.`,
      });
    }
  }

  function themedHeadingStyle() {
    return [
      styles.heading,
      largeText && styles.largeHeading,
      extraLargeText && styles.extraLargeHeading,
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
      largeText && styles.largeBody,
      extraLargeText && styles.extraLargeBody,
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
      largeText && styles.largeBody,
      extraLargeText && styles.extraLargeBody,
      lightMode && lightStyles.text,
      highContrastDark && styles.highContrastText,
      highContrastLight && lightStyles.highContrastText,
    ];
  }

  async function requestDisembarkation() {
    if (!selectedBus || !selectedAlightingStop || isLoading) {
      setError("Choose where to get off before requesting disembarkation.");
      setScreen("ALIGHTING_STOP");
      return false;
    }

    const journeySessionId = journeySessionIdRef.current;
    if (
      requestPhase === "ALIGHTING" &&
      (requestStatus === AssistanceRequestStatus.SENDING ||
        requestStatus === AssistanceRequestStatus.ACKNOWLEDGED)
    ) {
      return false;
    }

    if (alightingAssistanceTypes.length === 0) {
      setJourneyPhase("DISEMBARKING");
      setVisualAlert(
        `Your request to alight at ${selectedAlightingStop.description} is ready.`,
      );
      announceGuidance(
        `Request to alight at ${selectedAlightingStop.description} prepared.`,
      );
      return true;
    }

    setIsLoading(true);
    setLoadingMessage("Updating your journey...");
    setError(null);
    try {
      const response = await createAssistanceRequest({
        sessionId,
        busService: selectedBus.busService,
        busId: selectedBus.busId,
        boardingStop:
          selectedStop?.busStopCode ??
          currentRouteStop?.busStopCode ??
          "ONBOARD",
        destination: selectedAlightingStop.description,
        stopCode: selectedAlightingStop.busStopCode,
        assistanceTypes: alightingAssistanceTypes,
        source: "MOBILE_APP",
        boardingOrAlighting: "ALIGHTING",
        accessibilityVerificationStatus: activeProfile?.verificationStatus,
        verificationMethod: activeProfile?.verificationMethod,
      });

      if (journeySessionId !== journeySessionIdRef.current) {
        void cancelAssistanceRequest(response.requestId).catch(() => undefined);
        return false;
      }

      setRequestId(response.requestId);
      setCaseId(response.caseId ?? null);
      setAssistanceCaseState(response.assistanceCaseState ?? null);
      setRequestStatus(response.status);
      requestPhaseRef.current = "ALIGHTING";
      setRequestPhase("ALIGHTING");
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
          .map(readableAlightingAssistanceType)
          .join(", ")}.`,
      );
      return true;
    } catch {
      if (journeySessionId === journeySessionIdRef.current) {
        setError("We couldn't send your alighting assistance request.");
      }
      return false;
    } finally {
      if (journeySessionId === journeySessionIdRef.current) {
        setIsLoading(false);
        setLoadingMessage(null);
      }
    }
  }

  function invalidateJourneyAsyncWork() {
    journeySessionIdRef.current += 1;
    guidanceSessionIdRef.current += 1;
    locationLookupRequestRef.current += 1;
    searchRequestIdRef.current += 1;
    cameraIntentIdRef.current += 1;
    selectedStopCameraIntentRef.current += 1;

    stopsRequestRef.current.controller?.abort();
    stopsRequestRef.current = {
      id: stopsRequestRef.current.id + 1,
      controller: null,
    };
    regionalStopsRequestRef.current.controller?.abort();
    regionalStopsRequestRef.current = {
      id: regionalStopsRequestRef.current.id + 1,
      controller: null,
    };
    arrivalsRequestRef.current.controller?.abort();
    arrivalsRequestRef.current = {
      id: arrivalsRequestRef.current.id + 1,
      controller: null,
    };
    routeDetailsRequestRef.current.controller?.abort();
    routeDetailsRequestRef.current = {
      id: routeDetailsRequestRef.current.id + 1,
      controller: null,
    };
    stopDetailsRequestRef.current.controller?.abort();
    stopDetailsRequestRef.current = {
      id: stopDetailsRequestRef.current.id + 1,
      controller: null,
    };
    directionsRequestRef.current.controller?.abort();
    directionsRequestRef.current = {
      id: directionsRequestRef.current.id + 1,
      controller: null,
    };
  }

  async function endJourney(completionKind: JourneyCompletionKind) {
    if (
      journeyEndInProgressRef.current ||
      (!selectedStop && !selectedServiceOption && !selectedBus)
    ) {
      return false;
    }

    journeyEndInProgressRef.current = true;
    setJourneyEndInProgress(true);
    setConfirmingJourneyEnd(null);
    setIsLoading(true);
    setLoadingMessage(
      completionKind === "FINISHED"
        ? "Finishing your journey..."
        : "Ending your journey...",
    );
    setError(null);

    const journeyRequestId = requestId;
    const journeyRequestStatus = requestStatusRef.current;
    const completedDestinationName =
      selectedAlightingStop?.description ??
      selectedBus?.nextStop ??
      "your destination";
    const completedServiceNo = selectedBus?.busService ?? "your service";
    const activeAssistanceRequest =
      Boolean(journeyRequestId) &&
      assistanceCaseState !== "COMPLETED" &&
      assistanceCaseState !== "CANCELLED" &&
      assistanceCaseState !== "FAILED" &&
      (journeyRequestStatus === AssistanceRequestStatus.SENDING ||
        journeyRequestStatus === AssistanceRequestStatus.ACKNOWLEDGED);
    invalidateJourneyAsyncWork();

    let assistanceCancellationFailed = false;
    if (activeAssistanceRequest && journeyRequestId) {
      const cancellationController = new AbortController();
      const cancellationTimeout = setTimeout(
        () => cancellationController.abort(),
        3_000,
      );
      try {
        await cancelAssistanceRequest(
          journeyRequestId,
          cancellationController.signal,
        );
      } catch {
        assistanceCancellationFailed = true;
      } finally {
        clearTimeout(cancellationTimeout);
      }
    }

    await queueActiveJourneyPersistence(clearSavedActiveJourney);

    guidanceServiceRef.current!.stopActiveSpeech();
    guidanceServiceRef.current!.clearEvents();
    resetWalkingRouteMonitoring();
    selectedServiceOptionRef.current = null;
    requestStatusRef.current = null;
    requestPhaseRef.current = null;
    vehicleStatusRef.current = null;
    arrivalAnnouncementStopRef.current = null;

    setGuidanceMode("INACTIVE");
    setCameraGuideVisible(false);
    setDirectionsStatus("IDLE");
    setDirectionsError(null);
    setWalkingRoute(null);
    setLocationPulseKey(0);
    setFollowState("FREE");
    setMapRotationEnabled(false);
    setMapHeadingDegrees(0);
    setMapLayers(defaultMapLayers);
    setMapManuallyMoved(false);
    setViewportSource("USER_LOCATION");
    setMapCameraMode("FOLLOW_USER");
    setMapViewport({
      center: currentLocationRef.current ?? manualStopLookup,
      zoom: DEFAULT_ZOOM,
      bearing: 0,
      pitch: 0,
      mode: "USER_LOCATION",
    });
    setMapPickMode(null);
    setNearbyOpen(false);
    setBottomSheetState("HIDDEN_PEEK");
    setBottomSheetContent("PLANNER");
    setBusStopSearch((current) => ({
      ...current,
      isOpen: false,
      query: "",
      status: "IDLE",
      results: emptySearchResults,
      requestId: current.requestId + 1,
    }));
    setStopSearchQuery("");
    setDestinationSearchQuery("");
    setSelectedLandmarkId(null);
    setSelectedStop(null);
    setServiceOptions([]);
    setSelectedServiceOption(null);
    setArrivingBuses([]);
    setSelectedArrival(null);
    setSelectedBus(null);
    setRouteStops([]);
    setCurrentStopIndex(0);
    setSelectedAlightingStop(null);
    setJourneyPlanner((current) => ({
      origin: null,
      destination: null,
      alternatives: [],
      selectedAlternativeId: null,
      recentDestinations: current.recentDestinations,
    }));
    setJourneyRequirements(
      accessibilityRequirementsFromPreferences(latestPreferencesRef.current),
    );
    setJourneySetupState("SELECTING_STOP");
    setJourneyPhase("DISCOVERY");
    setLastCompletedJourney(
      completionKind === "FINISHED"
        ? {
            destinationName: completedDestinationName,
            serviceNo: completedServiceNo,
          }
        : null,
    );
    setRequestId(null);
    setCaseId(null);
    setAssistanceCaseState(null);
    setRequestStatus(null);
    setRequestPhase(null);
    setConfirmingCancelRequest(false);
    setVehicleStatus(null);
    setAutonomousDriveState(null);
    setEvents([]);
    setHasSpokenGuidanceInCurrentFlow(false);
    setLatestSpokenGuidance(null);
    setArrivalsStatus("IDLE");
    setRouteDetailsStatus("IDLE");
    setStaticServicesStatus("IDLE");
    setScreen("JOURNEY_IDLE");
    setVisualAlert(
      completionKind === "FINISHED" ? "Journey finished." : "Journey ended.",
    );
    setError(
      assistanceCancellationFailed
        ? "Your journey ended, but we could not confirm cancellation of the active assistance request. Please contact the operator if help is no longer needed."
        : null,
    );
    setIsLoading(false);
    setLoadingMessage(null);
    setJourneyEndInProgress(false);
    journeyEndInProgressRef.current = false;
    AccessibilityInfo.announceForAccessibility(
      completionKind === "FINISHED"
        ? "Journey finished. Find your bus is ready."
        : "Journey ended. Find your bus is ready.",
    );
    return true;
  }

  function requestEndJourney() {
    if (!selectedBus || journeyEndInProgressRef.current) {
      return;
    }
    setConfirmingJourneyEnd("ENDED_EARLY");
    AccessibilityInfo.announceForAccessibility(
      `End this journey? Service ${selectedBus.busService}. Destination ${selectedAlightingStop?.description ?? "not selected"}.`,
    );
  }

  function finishJourney() {
    void endJourney("FINISHED");
  }

  function requestDestinationChange() {
    if (!appPreferences.confirmImportantActions) {
      setScreen("ALIGHTING_STOP");
      return;
    }
    Alert.alert(
      "Change destination?",
      "Your stop countdown and alighting guidance will update.",
      [
        { text: "Keep destination", style: "cancel" },
        {
          text: "Change destination",
          onPress: () => setScreen("ALIGHTING_STOP"),
        },
      ],
    );
  }

  return (
    <AccessibilityRuntimeContext.Provider
      value={{
        largerControls: appPreferences.largerControls,
        reducedMotion,
        textSize: appPreferences.textSize,
        preserveViewport,
      }}
    >
      <SafeAreaView
        style={[
          styles.safeArea,
          lightMode && lightStyles.safeArea,
          highContrastDark && styles.highContrastSafeArea,
          highContrastLight && lightStyles.highContrastSafeArea,
        ]}
      >
        <ScrollView
          style={[
            styles.appScroll,
            screen === "STOP" && styles.mapWorkspaceScroll,
          ]}
          scrollEnabled={screen !== "STOP"}
          showsVerticalScrollIndicator={screen !== "STOP"}
          contentContainerStyle={[
            styles.container,
            isCompactWidth && styles.compactContainer,
            screen === "JOURNEY_IDLE" && styles.journeyEntryContainer,
            screen === "STOP" && styles.mapWorkspaceContainer,
          ]}
        >
          {screen !== "STOP" ? (
            <BrandHeader
              highContrast={appPreferences.highContrast}
              lightMode={lightMode}
              compact={
                screen !== "JOURNEY_IDLE" || appPreferences.simplifiedJourney
              }
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
          {activeTab === "JOURNEY" &&
          screen !== "STOP" &&
          screen !== "ONBOARD" &&
          (appPreferences.alwaysShowNextAction ||
            appPreferences.simplifiedJourney ||
            appPreferences.reduceMapDependence) ? (
            <JourneyNextActionCard
              action={journeyNextAction}
              simplified={appPreferences.simplifiedJourney}
              plainLanguage={appPreferences.plainLanguage}
              reduceMapDependence={appPreferences.reduceMapDependence}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
          ) : null}
          {screen === "JOURNEY_IDLE" ? (
            <AccessibilityPreferenceSummary
              preferences={appPreferences}
              onEdit={() => {
                setScreen("PROFILE");
                setProfileDraftPreferences(
                  activeProfile ? { ...appPreferences } : null,
                );
                setIsEditingProfileNeeds(Boolean(activeProfile));
              }}
            />
          ) : null}

          {(screen === "AUTH" || (screen === "PROFILE" && !activeProfile)) && (
            <View style={styles.section}>
              <ProfileHeaderWithAppearance
                eyebrow="Profile"
                title="Your SG GoAssist profile"
                themeMode={appPreferences.themeMode}
                highContrast={appPreferences.highContrast}
                lightMode={lightMode}
                largeText={largeText}
                compactLayout={isCompactWidth}
                onSelectMode={(themeMode) => {
                  setAppPreferences((current) => ({
                    ...current,
                    themeMode,
                  }));
                  setProfileDraftPreferences((current) =>
                    current ? { ...current, themeMode } : current,
                  );
                }}
              />
              <GeneratedFeatureArtwork
                source={illustrations.accessibilityProfile}
                testID="profile-accessibility-artwork"
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
                compact
              />
              <Text style={themedBodyStyle()}>
                Save your assistance needs for easier, safer and more
                independent bus journeys.
              </Text>
              <View style={themedPanelStyle()}>
                <Text style={themedLabelStyle()}>
                  Designed for accessible journeys
                </Text>
                <Text style={themedValueStyle()}>Guided with care</Text>
                <Text style={themedBodyStyle()}>
                  SG GoAssist helps less-abled passengers travel with confidence
                  by making bus journeys easier, safer and more independent.
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
                <Text style={themedHeadingStyle()}>Create Profile</Text>
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
              <Text style={themedHeadingStyle()}>Saved Profiles</Text>
              {profiles.map((profile) => (
                <Pressable
                  key={profile.profileId}
                  accessibilityRole="button"
                  accessibilityLabel={`Sign in as ${profile.displayName}. Journey assistance: ${requirementsLabel(
                    accessibilityRequirementsFromPreferences(
                      accessibilityPreferencesForProfile(profile),
                    ),
                  )}.`}
                  onPress={() => applyProfile(profile, "PROFILE")}
                  style={[styles.busCard, lightMode && lightStyles.surface]}
                >
                  <Text
                    style={[styles.busTitle, lightMode && lightStyles.text]}
                  >
                    {profile.displayName}
                  </Text>
                  <Text style={themedBodyStyle()}>{profile.email}</Text>
                  <Text style={themedBodyStyle()}>
                    Verification: {verificationStatusLabel(profile)}
                  </Text>
                  <PassengerDefaultsIcons
                    requirements={accessibilityRequirementsFromPreferences(
                      accessibilityPreferencesForProfile(profile),
                    )}
                    lightMode={lightMode}
                    highContrast={appPreferences.highContrast}
                  />
                </Pressable>
              ))}
            </View>
          )}

          {screen === "PROFILE" && activeProfile && (
            <View style={styles.section}>
              <ProfileHeaderWithAppearance
                eyebrow="Profile"
                title="My profile"
                themeMode={appPreferences.themeMode}
                highContrast={appPreferences.highContrast}
                lightMode={lightMode}
                largeText={largeText}
                compactLayout={isCompactWidth}
                onSelectMode={(themeMode) => {
                  setAppPreferences((current) => ({
                    ...current,
                    themeMode,
                  }));
                  setProfileDraftPreferences((current) =>
                    current ? { ...current, themeMode } : current,
                  );
                }}
              />
              <GeneratedFeatureArtwork
                source={illustrations.accessibilityProfile}
                testID="profile-support-artwork"
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
                compact
              />
              {!isEditingProfileNeeds &&
                activeProfile.verificationStatus !== "VERIFIED" && (
                  <View
                    style={[
                      styles.summaryRow,
                      lightMode && lightStyles.surface,
                    ]}
                  >
                    <Text
                      style={[
                        styles.summaryLabel,
                        lightMode && lightStyles.mutedText,
                      ]}
                    >
                      Accessibility Verification
                    </Text>
                    <Text
                      style={[
                        styles.summaryValue,
                        lightMode && lightStyles.text,
                      ]}
                    >
                      Verify eligibility separately from your needs
                    </Text>
                    <Text style={themedBodyStyle()}>
                      Demo verification accepts the built-in credential. Card
                      numbers are mocked for the prototype.
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
              <View style={themedPanelStyle()}>
                <Text style={themedLabelStyle()}>Account</Text>
                <Text style={themedValueStyle()}>
                  {activeProfile.displayName}
                </Text>
                <Text style={themedBodyStyle()}>{activeProfile.email}</Text>
                <Text style={themedBodyStyle()}>
                  Verification: {verificationStatusLabel(activeProfile)}
                </Text>
                <PassengerDefaultsIcons
                  requirements={accessibilityRequirementsFromPreferences(
                    accessibilityPreferencesForProfile(activeProfile),
                  )}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
                <Text style={themedBodyStyle()}>
                  App support:{" "}
                  {appPreferencesLabel(
                    accessibilityPreferencesForProfile(activeProfile),
                  )}
                </Text>
              </View>
              {!isEditingProfileNeeds && (
                <View
                  style={[styles.summaryRow, lightMode && lightStyles.surface]}
                >
                  <PhysicalAssistanceButtonVisual
                    lightMode={lightMode}
                    highContrast={appPreferences.highContrast}
                  />
                  <Text
                    style={[
                      styles.summaryLabel,
                      lightMode && lightStyles.mutedText,
                    ]}
                  >
                    Boarding without the app
                  </Text>
                  <Text
                    style={[styles.summaryValue, lightMode && lightStyles.text]}
                  >
                    No phone? You can still request help.
                  </Text>
                  <Text style={themedBodyStyle()}>
                    Press the assistance button at the bus stop to request
                    boarding help. On board, use the matching control when you
                    need assistance to alight.
                  </Text>
                </View>
              )}
              {!isEditingProfileNeeds && (
                <>
                  <PrimaryButton
                    label="Edit accessibility preferences"
                    icon={Settings}
                    onPress={() => {
                      setProfileDraftPreferences({ ...appPreferences });
                      setIsEditingProfileNeeds(true);
                    }}
                    lightMode={lightMode}
                    highContrast={appPreferences.highContrast}
                  />
                </>
              )}
              {isEditingProfileNeeds && (
                <>
                  <Text style={themedHeadingStyle()}>Accessibility</Text>
                  <Text style={themedBodyStyle()}>
                    Choose what helps you travel. Nothing is requested until you
                    start a journey.
                  </Text>
                  <AccessibilityPreferencesOverview
                    preferences={editorPreferences}
                    layoutPreferences={appPreferences}
                    hapticsSupported={hapticsSupported}
                    spokenGuidanceSupported={spokenGuidanceSupported}
                    expandedSection={profilePreferenceSection}
                    setPreferences={setEditorPreferences}
                    onTogglePreset={(preset) =>
                      setEditorPreferences((current) =>
                        toggleAccessibilityPreset(current, preset),
                      )
                    }
                    onPreview={previewAccessibilitySetup}
                    onSelectSection={setProfilePreferenceSection}
                  />
                  <Text style={themedHeadingStyle()}>Preferences</Text>
                  <Text style={themedBodyStyle()}>
                    Save these accessibility, display and guidance choices to
                    this profile.
                  </Text>
                  <PrimaryButton
                    label={hasUnsavedProfileNeeds ? "Save needs" : "Saved"}
                    icon={CircleCheck}
                    onPress={saveActiveProfile}
                    disabled={!hasUnsavedProfileNeeds}
                    lightMode={lightMode}
                    highContrast={editorPreferences.highContrast}
                    largerControls={editorPreferences.largerControls}
                  />
                  <SecondaryButton
                    label="Cancel editing"
                    lightMode={lightMode}
                    highContrast={editorPreferences.highContrast}
                    largerControls={editorPreferences.largerControls}
                    onPress={cancelProfileNeedsEditing}
                  />
                </>
              )}
              <SecondaryButton
                label="Sign out"
                onPress={signOut}
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
              />
              <View style={styles.profileBottomSpacer} />
            </View>
          )}

          {screen === "JOURNEY_IDLE" && (
            <View style={styles.section}>
              <SectionHeader
                eyebrow="Journey"
                title="Find your bus"
                highContrast={appPreferences.highContrast}
                lightMode={lightMode}
              />
              {completedJourneyInstruction ? (
                <JourneyVisualGuide
                  instruction={completedJourneyInstruction}
                  illustration={
                    illustrations.journeyGuide[
                      completedJourneyInstruction.scene
                    ]
                  }
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                  largeText={largeText}
                  simplified={appPreferences.simplifiedJourney}
                  reducedMotion={reducedMotion}
                  onRepeat={() =>
                    announceGuidance(
                      `${completedJourneyInstruction.title}. ${completedJourneyInstruction.summary}`,
                    )
                  }
                />
              ) : null}
              <FindBusPanel
                state={findBusPanelState}
                interactionBusy={isJourneyEntryLoading}
                stacked={shouldStackJourneyIntro}
                largeText={largeText}
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
                canRepeatGuidance={canRepeatJourneyGuidance}
                onUseLocation={() => {
                  void findMyBusStop();
                }}
                onSelectManually={() => {
                  void loadManualStops();
                }}
                onRetry={() => {
                  void retryJourneyDiscovery();
                }}
                onRepeatGuidance={announceCurrentJourney}
              />
            </View>
          )}

          {screen === "STOP" && (
            <MapFirstStopScreen
              stops={visibleMapStops}
              nearbyStops={visibleNearbyStops}
              accessibleStopRoutes={accessibleStopRoutes}
              accessibleRoutesOnly={accessibleRoutesOnly}
              recommendedStopCode={recommendedAccessibleStopCode}
              selectedStop={selectedStop}
              selectedLandmark={selectedLandmark}
              landmarks={visibleLandmarks}
              currentLocation={currentLocation}
              mapViewport={mapViewport}
              mapCameraGeometry={mapCameraGeometry}
              layers={mapLayers}
              mapManuallyMoved={mapManuallyMoved}
              searchThisAreaVisible={searchThisAreaVisible}
              nearbyHeading={nearbySearchOrigin.label}
              directionsActive={directionsActive}
              followState={followState}
              directionsStatus={directionsStatus}
              directionsError={directionsError}
              mobilityMode={mobilityMode}
              wheelchairRoutingPreferred={appPreferences.wheelchairRouting}
              wheelchairRoutingAvailable={
                routingProviderRef.current.capabilities.wheelchair
              }
              walkingRoute={walkingRoute}
              walkingRouteProgress={walkingRouteProgress}
              walkingRouteOffRoute={walkingRouteOffRoute}
              walkingLocationAccuracyLimited={walkingLocationAccuracyLimited}
              canRepeatWalkingGuidance={Boolean(
                latestSpokenGuidance &&
                spokenGuidanceSupported &&
                appPreferences.spokenGuidance,
              )}
              guidanceStatus={guidanceStatus}
              routeFitKey={routeFitKey}
              locationPulseKey={locationPulseKey}
              reducedMotion={reducedMotion}
              rotationEnabled={mapRotationEnabled}
              hasSelectedService={Boolean(selectedBus)}
              hasSelectedDestination={Boolean(selectedAlightingStop)}
              journeyOrigin={effectiveJourneyOrigin}
              journeyDestination={journeyPlanner.destination}
              journeyAlternatives={journeyPlanner.alternatives}
              selectedJourneyAlternative={selectedJourneyAlternative}
              recentDestinations={journeyPlanner.recentDestinations}
              mapPickMode={mapPickMode}
              mapPickCandidate={mapPickCandidate}
              headingDegrees={mapHeadingDegrees}
              query={stopSearchQuery}
              searchState={busStopSearch}
              searchMode={transportSearchMode}
              bottomSheetState={bottomSheetState}
              bottomSheetContent={bottomSheetContent}
              nearbyOpen={nearbyOpen}
              lastExpandedSheetState={lastExpandedSheetState}
              nearbyStatus={transportDiscovery.nearbyStopsStatus}
              locationStatus={transportDiscovery.location}
              locationRequested={transportDiscovery.locationRequested}
              connectivityStatus={transportDiscovery.connectivity}
              regionalStopsStatus={regionalStopsStatus}
              staticServicesStatus={staticServicesStatus}
              onRetryRegionalStops={() =>
                setRegionalStopsRetryKey((current) => current + 1)
              }
              onRetryStopServices={() => {
                if (selectedStop) {
                  void loadStaticStopDetails(selectedStop, true);
                }
              }}
              largeText={largeText}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
              onChangeSearchQuery={(query) => {
                openStopSearch(
                  query,
                  busStopSearch.isOpen ? transportSearchMode : "DISCOVERY",
                );
              }}
              onOpenSearch={() =>
                openStopSearch(
                  "",
                  !selectedBus && !selectedStop && !directionsActive
                    ? "DESTINATION"
                    : "DISCOVERY",
                )
              }
              onOpenDestinationSearch={() => openStopSearch("", "DESTINATION")}
              onOpenOriginSearch={() => openStopSearch("", "ORIGIN")}
              onSelectJourneyDestination={applyJourneyPlanDestination}
              onSwapJourneyPoints={swapJourneyPoints}
              onChooseDestinationOnMap={chooseDestinationOnMap}
              onConfirmMapDestination={confirmMapDestination}
              onSelectJourneyAlternative={selectJourneyAlternative}
              onStartJourneyPlan={startSelectedJourneyPlan}
              onCloseSearch={closeStopSearch}
              onClearSearch={clearStopSearch}
              onSelectSearchStop={selectSearchStop}
              onSelectSearchPlace={selectSearchPlace}
              onSelectSearchService={selectSearchService}
              onSelectStop={selectStopForBoarding}
              onSelectLandmark={selectLandmark}
              onMapLayoutChange={handleMapLayoutChange}
              onMoveMap={markMapMoved}
              onProviderViewportChange={handleProviderViewportChange}
              onFocusCluster={focusStopCluster}
              onRecenter={recenterStopMap}
              onLocateMap={locateCurrentPosition}
              onOpenNearby={toggleNearbyStopsSheet}
              onToggleAccessibleRoutesOnly={() =>
                setAccessibleRoutesOnly((current) => !current)
              }
              onRefreshLocation={showNearbyStopsInArea}
              onSearchForStop={() => openStopSearch()}
              onShowRoute={showWholeRoute}
              onRotateMap={rotateMap}
              onResetMap={resetMapView}
              onViewFullRoute={viewFullRoute}
              onToggleFollow={toggleFollowMode}
              onToggleLayer={(layer) =>
                setMapLayers((current) => ({
                  ...current,
                  [layer]: !current[layer],
                }))
              }
              onResetHeading={resetMapNorth}
              onDirections={startDirections}
              onRetryDirections={startDirections}
              onChangeMobilityMode={changeDirectionsMobilityMode}
              onStartGuidance={startWalkingGuidance}
              onRecalculateDirections={recalculateWalkingDirections}
              onContinueWithoutRerouting={() =>
                setWalkingOffRouteDismissed(true)
              }
              onRepeatWalkingGuidance={repeatLatestGuidance}
              onUseLocationForDirections={() => {
                void locateCurrentPosition();
              }}
              onStopDirections={exitGuidance}
              onClearSelectedStop={() => {
                selectedStopCameraIntentRef.current += 1;
                setSelectedStop(null);
                setGuidanceMode("INACTIVE");
                setBottomSheetContent("NEARBY");
                setNearbyOpen(true);
                updateBottomSheetState(lastNearbySheetState);
              }}
              onExitMap={() => {
                if (focusedAssistSelectingStopRef.current) {
                  focusedAssistSelectingStopRef.current = false;
                  setSelectedStop(focusedAssistPreviousSelectedStopRef.current);
                  focusedAssistPreviousSelectedStopRef.current = null;
                  setScreen("ACCESSIBILITY");
                  return;
                }
                setScreen("JOURNEY_IDLE");
              }}
              onConfirm={confirmSelectedStop}
              onSelectService={selectServiceFromSelectedStop}
              onHear={hearSelectedStop}
              onHearDirections={hearDirections}
              onSetBottomSheetState={updateBottomSheetState}
            />
          )}

          {screen === "ACCESSIBILITY" && (
            <View style={styles.section}>
              {focusedAssistContext.state !== "LOCATING" ? (
                <GeneratedFeatureArtwork
                  source={illustrations.assistCommunication}
                  testID="assist-communication-artwork"
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                  compact
                />
              ) : null}
              <FocusedAssistScreen
                context={focusedAssistContext}
                controller={focusedAssistController}
                contextError={focusedAssistContextError}
                selectedServiceNo={selectedBus?.busService ?? null}
                requestPhase={requestPhase}
                appPreferences={appPreferences}
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
                onChooseStop={chooseFocusedAssistBusStop}
                onOpenJourney={() => openTab("JOURNEY")}
              />
              <VoiceAssistantPanel
                controller={voiceAssistantControllerRef.current!}
                recognitionProvider={speechRecognitionProviderRef.current}
                guidanceSpeaking={guidanceSpeaking}
                locale={normalizeAssistantLocale(
                  appPreferences.assistantLocale,
                )}
                runtimeStatus={assistantRuntimeStatus}
                prepareAssistant={() =>
                  assistantRuntimeRef.current!.initialize()
                }
                retryAssistant={() =>
                  assistantRuntimeRef.current!.retry()
                }
                diagnosticsConsent={Boolean(
                  appPreferences.assistantDiagnosticsConsent,
                )}
                onLocaleChange={(locale) => {
                  voiceAssistantControllerRef.current!.clearPendingAction();
                  voiceAssistantControllerRef.current!.clearConversation();
                  guidanceServiceRef.current!.stopActiveSpeech();
                  setAppPreferences((current) => ({
                    ...current,
                    assistantLocale: locale,
                  }));
                }}
                onDiagnosticsConsentChange={(enabled) => {
                  setAppPreferences((current) => ({
                    ...current,
                    assistantDiagnosticsConsent: enabled,
                  }));
                  if (!enabled) {
                    void withdrawAssistantDiagnostics().then(() =>
                      Alert.alert(
                        "Diagnostics withdrawn",
                        "Previously shared diagnostic exchanges from this device were deleted where still retained.",
                      ),
                    );
                  }
                }}
                onShareDiagnostic={shareAssistantDiagnostic}
                prominent={
                  appPreferences.spokenGuidance ||
                  appPreferences.screenReaderOptimised
                }
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
              />
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
              <GeneratedFeatureArtwork
                source={illustrations.chooseBus}
                testID="choose-bus-artwork"
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
                compact
              />
              {selectedStop && (
                <View
                  style={[
                    styles.compactBoardingCard,
                    lightMode && lightStyles.surface,
                  ]}
                >
                  <Text
                    style={[
                      styles.summaryLabel,
                      lightMode && lightStyles.mutedText,
                    ]}
                  >
                    BOARDING AT
                  </Text>
                  <Text
                    style={[styles.summaryValue, lightMode && lightStyles.text]}
                  >
                    {selectedStop.description}
                  </Text>
                  <Text style={themedBodyStyle()}>
                    Bus Stop {selectedStop.busStopCode}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Change boarding stop"
                    onPress={() => {
                      setJourneySetupState("SELECTING_STOP");
                      setSelectedArrival(null);
                      setSelectedServiceOption(null);
                      setSelectedBus(null);
                      setScreen("STOP");
                      updateBottomSheetState("MEDIUM");
                    }}
                    style={styles.inlineSecondaryAction}
                  >
                    <Text
                      style={[
                        styles.inlineSecondaryActionText,
                        lightMode && lightStyles.secondaryButtonText,
                      ]}
                    >
                      Change stop -&gt;
                    </Text>
                  </Pressable>
                </View>
              )}
              {canRepeatJourneyGuidance ? (
                <TertiaryButton
                  label="Repeat guidance"
                  icon={Volume2}
                  onPress={announceCurrentJourney}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
              ) : null}
              <Text style={themedBodyStyle()}>Which bus are you taking?</Text>
              {isLoading && serviceOptions.length === 0 ? (
                <View
                  style={[
                    styles.feedbackPanel,
                    lightMode && lightStyles.surface,
                  ]}
                >
                  <ActivityIndicator
                    color={controlIconColor({
                      active: true,
                      lightMode,
                      highContrast: appPreferences.highContrast,
                    })}
                  />
                  <Text style={themedBodyStyle()}>
                    Finding buses serving this stop...
                  </Text>
                </View>
              ) : null}
              {serviceOptions.map((service) => (
                <BusArrivalCard
                  key={service.serviceNo}
                  service={service}
                  selected={
                    selectedServiceOption?.serviceNo === service.serviceNo
                  }
                  onPress={() => selectService(service)}
                  arrivalsLoading={arrivalsStatus === "LOADING"}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
              ))}
              {!selectedServiceOption && arrivalsStatus === "ERROR" ? (
                <View
                  style={[
                    styles.feedbackPanel,
                    lightMode && lightStyles.surface,
                  ]}
                >
                  <Text style={themedLabelStyle()}>
                    Arrival info unavailable
                  </Text>
                  <Text style={themedBodyStyle()}>
                    Static services remain available. Select a service to choose
                    your destination and view its route.
                  </Text>
                  {selectedStop ? (
                    <SecondaryButton
                      label="Retry live arrivals"
                      icon={RefreshCw}
                      onPress={() => void loadArrivalsForStop(selectedStop)}
                      lightMode={lightMode}
                      highContrast={appPreferences.highContrast}
                    />
                  ) : null}
                </View>
              ) : null}
              {selectedServiceOption && arrivalsStatus === "ERROR" ? (
                <View
                  style={[
                    styles.feedbackPanel,
                    lightMode && lightStyles.surface,
                  ]}
                  accessible
                  accessibilityLabel={`Service ${selectedServiceOption.serviceNo}. Live arrival temporarily unavailable. You can still choose your destination and view the route.`}
                >
                  <Text style={themedLabelStyle()}>
                    Service {selectedServiceOption.serviceNo}
                  </Text>
                  <Text style={themedBodyStyle()}>
                    Live arrival temporarily unavailable.
                  </Text>
                  <Text style={themedBodyStyle()}>
                    You can still choose your destination and view the route.
                  </Text>
                  {selectedStop ? (
                    <SecondaryButton
                      label="Retry live arrivals"
                      icon={RefreshCw}
                      onPress={() => void loadArrivalsForStop(selectedStop)}
                      lightMode={lightMode}
                      highContrast={appPreferences.highContrast}
                    />
                  ) : null}
                </View>
              ) : null}
              {!isLoading && serviceOptions.length === 0 ? (
                <View
                  style={[
                    styles.feedbackPanel,
                    lightMode && lightStyles.surface,
                  ]}
                >
                  <Text style={themedBodyStyle()}>
                    No bus services were found for this stop.
                  </Text>
                  {selectedStop ? (
                    <SecondaryButton
                      label="Refresh buses"
                      icon={RefreshCw}
                      onPress={() => confirmBusStop(selectedStop)}
                      lightMode={lightMode}
                      highContrast={appPreferences.highContrast}
                    />
                  ) : null}
                </View>
              ) : null}
              {selectedServiceOption && selectedBus ? (
                <>
                  {routeDetailsStatus === "LOADING" ? (
                    <View
                      style={[
                        styles.feedbackPanel,
                        lightMode && lightStyles.surface,
                      ]}
                    >
                      <ActivityIndicator
                        color={controlIconColor({
                          active: true,
                          lightMode,
                          highContrast: appPreferences.highContrast,
                        })}
                      />
                      <Text style={themedBodyStyle()}>
                        Loading route and destination details...
                      </Text>
                    </View>
                  ) : null}
                  {routeDetailsStatus === "ERROR" && selectedStop ? (
                    <View
                      style={[
                        styles.feedbackPanel,
                        lightMode && lightStyles.surface,
                      ]}
                    >
                      <Text style={themedBodyStyle()}>
                        Route details are temporarily unavailable. Live arrival
                        status does not affect this service.
                      </Text>
                      <SecondaryButton
                        label="Retry route details"
                        icon={RefreshCw}
                        onPress={() =>
                          void loadRouteDetails(
                            selectedStop,
                            selectedServiceOption,
                            selectedArrival,
                          )
                        }
                        lightMode={lightMode}
                        highContrast={appPreferences.highContrast}
                      />
                    </View>
                  ) : null}
                  <SecondaryButton
                    label="Repeat bus information"
                    icon={Volume2}
                    onPress={announceCurrentJourney}
                    disabled={!appPreferences.repeatAudio}
                    lightMode={lightMode}
                    highContrast={appPreferences.highContrast}
                  />
                  <View
                    style={[
                      styles.summaryRow,
                      lightMode && lightStyles.surface,
                    ]}
                  >
                    <View style={styles.iconTitleRow}>
                      <MapPinned
                        size={22}
                        color={controlIconColor({
                          active: true,
                          lightMode,
                          highContrast: appPreferences.highContrast,
                        })}
                        strokeWidth={2.75}
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                      />
                      <Text style={themedLabelStyle()}>
                        Where are you getting off?
                      </Text>
                    </View>
                    <View style={styles.stopSearchInputFrame}>
                      <Search
                        size={20}
                        color={controlIconColor({
                          lightMode,
                          highContrast: appPreferences.highContrast,
                        })}
                        strokeWidth={2.5}
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                      />
                      <TextInput
                        accessibilityLabel="Search destination on selected service"
                        placeholder="Search destination"
                        placeholderTextColor={
                          lightMode ? lightTheme.textSecondary : colors.metadata
                        }
                        value={destinationSearchQuery}
                        onChangeText={setDestinationSearchQuery}
                        style={[
                          styles.stopSearchInput,
                          lightMode && lightStyles.textInputField,
                          largeText && styles.largeStopSearchInput,
                          extraLargeText && styles.extraLargeStopSearchInput,
                        ]}
                      />
                    </View>
                    <Text
                      style={[
                        styles.summaryLabel,
                        lightMode && lightStyles.mutedText,
                      ]}
                    >
                      Upcoming stops
                    </Text>
                    {availableDestinationStops.map((stop) => (
                      <AlightingStopRow
                        key={`bus-destination-${stop.sequence}-${stop.busStopCode}`}
                        stop={stop}
                        selected={
                          selectedAlightingStop?.sequence === stop.sequence
                        }
                        onPress={() => chooseAlightingStop(stop)}
                        lightMode={lightMode}
                        highContrast={appPreferences.highContrast}
                      />
                    ))}
                    {availableDestinationStops.length === 0 ? (
                      <Text style={themedBodyStyle()}>
                        No upcoming stops match this search.
                      </Text>
                    ) : null}
                    <SecondaryButton
                      label="View route on map"
                      icon={MapIcon}
                      onPress={() => updateBottomSheetState("EXPANDED")}
                      lightMode={lightMode}
                      highContrast={appPreferences.highContrast}
                    />
                  </View>
                  <PrimaryButton
                    label="Review journey"
                    icon={ArrowRight}
                    onPress={continueToJourneyReview}
                    disabled={!selectedAlightingStop}
                    lightMode={lightMode}
                    highContrast={appPreferences.highContrast}
                  />
                </>
              ) : null}
            </View>
          )}

          {screen === "CONFIRM" && selectedBus && (
            <View style={styles.section}>
              <SectionHeader
                eyebrow="Journey preview"
                title="Your journey"
                highContrast={appPreferences.highContrast}
                lightMode={lightMode}
              />
              <GeneratedFeatureArtwork
                source={illustrations.journeyReview}
                testID="journey-review-artwork"
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
                compact
              />
              <SummaryRow
                label="Service"
                value={selectedBus.busService}
                valueAccessory={
                  selectedBus.isAccessible ? (
                    <WheelchairAccessibleSymbol
                      lightMode={lightMode}
                      highContrast={appPreferences.highContrast}
                    />
                  ) : null
                }
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
                label="Get off"
                value={
                  selectedAlightingStop
                    ? `${selectedAlightingStop.description}, Bus Stop ${selectedAlightingStop.busStopCode}`
                    : "Choose destination"
                }
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
              />
              <SummaryRow
                label="Stops"
                value={
                  selectedAlightingStopIndex > 0
                    ? `${selectedAlightingStopIndex} stops after boarding`
                    : "Destination not selected"
                }
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
              />
              <View
                style={[styles.summaryRow, lightMode && lightStyles.surface]}
              >
                <View style={styles.iconTitleRow}>
                  <MapIcon
                    size={22}
                    color={controlIconColor({
                      active: true,
                      lightMode,
                      highContrast: appPreferences.highContrast,
                    })}
                    strokeWidth={2.75}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  />
                  <Text style={themedLabelStyle()}>Route preview</Text>
                </View>
                <Text style={themedBodyStyle()}>
                  Board at{" "}
                  {selectedStop?.description ?? selectedBus.currentStop}, follow
                  Service {selectedBus.busService}, then get off at{" "}
                  {selectedAlightingStop?.description ??
                    "your selected destination"}
                  .
                </Text>
                <RouteProgressList
                  routeStops={plannedRouteStops}
                  currentStopIndex={0}
                  destinationStopIndex={selectedAlightingStopIndex}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
              </View>
              {activeProfile ? (
                <View
                  style={[styles.summaryRow, lightMode && lightStyles.surface]}
                >
                  <View style={styles.serviceAccessibilityRow}>
                    <Text
                      style={[
                        styles.summaryLabel,
                        lightMode && lightStyles.mutedText,
                      ]}
                    >
                      Need assistance for Service {selectedBus.busService}?
                    </Text>
                    {selectedBus.isAccessible ? (
                      <WheelchairAccessibleSymbol
                        lightMode={lightMode}
                        highContrast={appPreferences.highContrast}
                        size="small"
                      />
                    ) : null}
                  </View>
                  <Text style={themedBodyStyle()}>
                    Your usual assistance is loaded for this journey only.
                    Change it in Assist if needed.
                  </Text>
                  <AssistanceSummaryList
                    requirements={journeyRequirements}
                    status={requestStatus}
                    lightMode={lightMode}
                    highContrast={appPreferences.highContrast}
                  />
                </View>
              ) : null}
              <SecondaryButton
                label="Back to destination"
                icon={ArrowLeft}
                onPress={() => {
                  setJourneySetupState("SELECTING_DESTINATION");
                  setScreen("BUS");
                }}
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
              />
              <SecondaryButton
                label="Repeat journey summary"
                icon={Volume2}
                onPress={announceCurrentJourney}
                disabled={!appPreferences.repeatAudio}
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
              />
              {activeProfile && assistanceTypes.length > 0 ? (
                <PrimaryButton
                  label="Request assistance"
                  icon={CircleCheck}
                  onPress={() => void submitRequest()}
                  disabled={isLoading || !selectedAlightingStop}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
              ) : null}
              <PrimaryButton
                label={
                  activeProfile && assistanceTypes.length > 0
                    ? "Skip assistance and start"
                    : "Start this journey"
                }
                icon={ArrowRight}
                onPress={startJourneyWithoutAssistance}
                disabled={isLoading || !selectedAlightingStop}
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
              />
            </View>
          )}

          {screen === "STATUS" && selectedBus && (
            <View style={styles.section}>
              <SectionHeader
                eyebrow="Status"
                title={
                  journeyPhase === "WALKING_TO_STOP"
                    ? "Walking to your stop"
                    : vehicleStatus === "ARRIVED"
                      ? "Your bus is here"
                      : "Waiting for bus"
                }
                highContrast={appPreferences.highContrast}
                lightMode={lightMode}
              />
              <JourneyVisualGuide
                instruction={journeyVisualInstruction}
                illustration={
                  illustrations.journeyGuide[journeyVisualInstruction.scene]
                }
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
                largeText={largeText}
                simplified={appPreferences.simplifiedJourney}
                reducedMotion={reducedMotion}
                onRepeat={announceCurrentJourney}
                onUseCamera={() => setCameraGuideVisible(true)}
                onRecalculate={recalculateWalkingDirections}
                onContinueWithoutRerouting={() =>
                  setWalkingOffRouteDismissed(true)
                }
              />
              {journeyPhase === "WALKING_TO_STOP" ? (
                <>
                  <View
                    style={[
                      styles.statusPanel,
                      lightMode && lightStyles.surface,
                      highContrastDark && styles.highContrastControl,
                      highContrastLight && lightStyles.highContrastControl,
                      (vehicleStatus === "APPROACHING" ||
                        vehicleStatus === "ARRIVED") &&
                        styles.journeyAlertPanel,
                    ]}
                    accessible
                    accessibilityLabel={`Assistance status ${requestStatusLabel(
                      requestStatus,
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
                      <Text style={themedLabelStyle()}>
                        {requestId ? "Assistance" : "Journey"}
                      </Text>
                    </View>
                    <AssistanceStatusVisual
                      assistanceTypes={assistanceTypes}
                      journeyPhase={journeyPhase}
                      lightMode={lightMode}
                      highContrast={appPreferences.highContrast}
                    />
                    <Text style={themedValueStyle()}>
                      {requestStatusLabel(requestStatus)}
                    </Text>
                    <View style={styles.serviceAccessibilityRow}>
                      <ServiceNumberWithAccessibility
                        serviceNo={selectedBus.busService}
                        accessible={selectedBus.isAccessible}
                        textStyle={themedBodyStyle()}
                        lightMode={lightMode}
                        highContrast={appPreferences.highContrast}
                        symbolSize="small"
                      />
                      <Text style={themedBodyStyle()}>
                        {selectedArrival
                          ? formatEta(selectedArrival.etaSeconds).toLowerCase()
                          : "live arrival unavailable"}
                        .
                      </Text>
                    </View>
                    {selectedStop ? (
                      <Text style={themedBodyStyle()}>
                        {journeyPhase === "WALKING_TO_STOP"
                          ? `Walk to ${selectedStop.description}, Stop ${selectedStop.busStopCode}.`
                          : `Board at ${selectedStop.description}, Stop ${selectedStop.busStopCode}.`}
                      </Text>
                    ) : null}
                    {selectedAlightingStop ? (
                      <Text style={themedBodyStyle()}>
                        Destination: {selectedAlightingStop.description}.{" "}
                        {selectedAlightingStopIndex > 0
                          ? `${selectedAlightingStopIndex} ${selectedAlightingStopIndex === 1 ? "stop" : "stops"} after boarding.`
                          : ""}
                      </Text>
                    ) : null}
                    {requestId ? (
                      <Text style={themedBodyStyle()}>
                        {selectedNeeds} requested for this journey.
                      </Text>
                    ) : null}
                    {assistanceCaseState ? (
                      <Text style={themedBodyStyle()}>
                        Equipment status:{" "}
                        {assistanceCaseStateLabel(assistanceCaseState)}.
                      </Text>
                    ) : null}
                    {requestStatus === "ACKNOWLEDGED" && (
                      <Text
                        style={[
                          styles.confirmationText,
                          lightMode && lightStyles.text,
                        ]}
                      >
                        The bus has received your request. This confirms the
                        request, not that boarding equipment is ready.
                      </Text>
                    )}
                    {vehicleStatus === "ARRIVED" &&
                    assistanceTypes.includes("WHEELCHAIR_RAMP") ? (
                      <Text
                        style={[
                          styles.confirmationText,
                          lightMode && lightStyles.text,
                        ]}
                      >
                        Your bus has arrived. Please wait until the ramp is
                        fully deployed before boarding.
                      </Text>
                    ) : null}
                    <View style={styles.iconTitleRow}>
                      <BusFront
                        size={24}
                        color={controlIconColor({
                          active:
                            vehicleStatus === "APPROACHING" ||
                            vehicleStatus === "ARRIVED",
                          lightMode,
                          highContrast: appPreferences.highContrast,
                        })}
                        strokeWidth={2.75}
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                      />
                      <Text style={themedLabelStyle()}>Bus</Text>
                    </View>
                    <Text style={themedValueStyle()}>
                      {vehicleStatusLabel(vehicleStatus)}
                    </Text>
                  </View>

                  {requestStatus === "ACKNOWLEDGED" &&
                    (confirmingCancelRequest ? (
                      <View
                        style={[
                          styles.summaryRow,
                          lightMode && lightStyles.surface,
                        ]}
                      >
                        <Text
                          style={[
                            styles.summaryValue,
                            lightMode && lightStyles.text,
                          ]}
                        >
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
                      <SecondaryButton
                        label="Cancel request"
                        icon={CircleX}
                        onPress={askToCancelRequest}
                        disabled={isLoading}
                        lightMode={lightMode}
                        highContrast={appPreferences.highContrast}
                      />
                    ))}

                  {(vehicleStatus === "ARRIVED" ||
                    requestStatus === "ACKNOWLEDGED" ||
                    journeySetupState === "WAITING_FOR_BUS") && (
                    <View style={styles.boardingConfirmationGroup}>
                      <Text style={themedBodyStyle()}>
                        Choose this only after you have safely boarded the bus.
                      </Text>
                      <PrimaryButton
                        label="I'm onboard"
                        icon={BusFront}
                        accessibilityHint="Enter onboard journey mode after you have safely boarded."
                        onPress={enterOnboardMode}
                        disabled={isLoading}
                        lightMode={lightMode}
                        highContrast={appPreferences.highContrast}
                      />
                    </View>
                  )}

                  {appPreferences.repeatAudio &&
                  hasSpokenGuidanceInCurrentFlow ? (
                    <SecondaryButton
                      label="Repeat journey status"
                      icon={Volume2}
                      onPress={announceCurrentJourney}
                      lightMode={lightMode}
                      highContrast={appPreferences.highContrast}
                    />
                  ) : null}

                  {requestStatus === "FAILED" && (
                    <PrimaryButton
                      label="Retry"
                      icon={RefreshCw}
                      onPress={() => void submitRequest()}
                      disabled={isLoading}
                      lightMode={lightMode}
                      highContrast={appPreferences.highContrast}
                    />
                  )}

                  {events.map((event) => (
                    <View
                      key={`${event.type}-${event.timestamp}`}
                      style={[
                        styles.eventRow,
                        lightMode && lightStyles.surface,
                      ]}
                    >
                      <Text
                        style={[
                          styles.eventStatus,
                          lightMode && lightStyles.text,
                        ]}
                      >
                        {eventLabel(event)}
                      </Text>
                      <Text style={themedBodyStyle()}>
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </Text>
                    </View>
                  ))}
                </>
              ) : (
                <WaitingForBusStatus
                  serviceNo={selectedBus.busService}
                  accessibleBus={selectedBus.isAccessible}
                  etaSeconds={selectedArrival?.etaSeconds ?? null}
                  boardingStop={selectedStop}
                  destinationStop={selectedAlightingStop}
                  stopsAfterBoarding={selectedAlightingStopIndex}
                  assistanceTypes={assistanceTypes}
                  requestStatus={requestStatus}
                  isLoading={isLoading}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                  onRequestRamp={() => void requestRampWhileWaiting()}
                  onBoard={enterOnboardMode}
                />
              )}
            </View>
          )}

          {screen === "ONBOARD" && selectedBus && (
            <>
              <View style={styles.section}>
                <JourneyVisualGuide
                  instruction={journeyVisualInstruction}
                  illustration={
                    illustrations.journeyGuide[journeyVisualInstruction.scene]
                  }
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                  largeText={largeText}
                  simplified={appPreferences.simplifiedJourney}
                  reducedMotion={reducedMotion}
                  onRepeat={announceCurrentJourney}
                />
              </View>
              <OnboardJourneyScreen
                appPreferences={appPreferences}
                selectedBus={selectedBus}
                currentStop={currentRouteStop}
                nextStop={nextRouteStop}
                routeStops={routeStops}
                currentStopIndex={currentStopIndex}
                selectedAlightingStop={selectedAlightingStop}
                selectedAlightingStopIndex={selectedAlightingStopIndex}
                stopsRemaining={stopsRemaining}
                alightingAssistanceTypes={alightingAssistanceTypes}
                alightingRequestStatus={
                  requestPhase === "ALIGHTING" ? requestStatus : null
                }
                selectedStopIsNext={selectedStopIsNext}
                selectedStopReached={selectedStopReached}
                journeyPhase={journeyPhase}
                hasMeaningfulAnnouncement={
                  appPreferences.repeatAudio && hasSpokenGuidanceInCurrentFlow
                }
                isRequestLoading={isLoading}
                onChangeStop={requestDestinationChange}
                onSetDestination={chooseAlightingStop}
                onRequestDisembarkation={requestDisembarkation}
                onRepeat={announceCurrentJourney}
                onSimulateNextStop={simulateNextStop}
                onOpenAccessibility={() => openTab("ASSISTANCE")}
                onRequestEndJourney={requestEndJourney}
                onFinishJourney={finishJourney}
                journeyEndInProgress={journeyEndInProgress}
              />
            </>
          )}

          {screen === "ALIGHTING_STOP" && (
            <View style={styles.section}>
              <SectionHeader
                eyebrow="On board"
                title="Choose where to get off"
                highContrast={appPreferences.highContrast}
                lightMode={lightMode}
              />
              <GeneratedFeatureArtwork
                source={illustrations.onboardGuidance}
                testID="alighting-stop-artwork"
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
                compact
              />
              {routeStops.slice(currentStopIndex + 1).map((stop) => (
                <AlightingStopRow
                  key={stop.busStopCode}
                  stop={stop}
                  selected={
                    selectedAlightingStop?.busStopCode === stop.busStopCode
                  }
                  onPress={() => chooseAlightingStop(stop)}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
              ))}
              <SecondaryButton
                label="Back to onboard journey"
                onPress={() => setScreen("ONBOARD")}
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
              />
            </View>
          )}

          <JourneyEndConfirmationDialog
            visible={confirmingJourneyEnd === "ENDED_EARLY"}
            serviceNo={selectedBus?.busService ?? null}
            destinationName={selectedAlightingStop?.description ?? null}
            busy={journeyEndInProgress}
            lightMode={lightMode}
            highContrast={appPreferences.highContrast}
            onKeep={() => setConfirmingJourneyEnd(null)}
            onConfirm={() => void endJourney("ENDED_EARLY")}
          />

          {cameraGuideVisible &&
          journeyPhase === "WALKING_TO_STOP" &&
          journeyVisualInstruction.maneuver ? (
            <CameraDirectionGuide
              visible
              currentLocation={currentLocation}
              locationAccuracyMeters={currentLocation?.accuracyMeters}
              initialHeadingDegrees={currentLocation?.headingDegrees}
              target={journeyVisualInstruction.maneuver.target}
              distanceMeters={journeyVisualInstruction.maneuver.distanceMeters}
              instruction={journeyVisualInstruction.title}
              nextInstruction={
                journeyVisualInstruction.maneuver.nextInstruction
              }
              onClose={() => setCameraGuideVisible(false)}
              onRepeat={announceCurrentJourney}
            />
          ) : null}

          {isLoading && screen !== "STOP" && !isJourneyEntryLoading && (
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
                screen === "JOURNEY_IDLE" || screen === "BUS"
                  ? "Try again"
                  : undefined
              }
              onPrimaryAction={
                screen === "JOURNEY_IDLE"
                  ? () => {
                      void findMyBusStop();
                    }
                  : screen === "BUS" && selectedStop
                    ? () => confirmBusStop(selectedStop)
                    : undefined
              }
              secondaryActionLabel={
                screen === "JOURNEY_IDLE" ? "Select stop manually" : undefined
              }
              onSecondaryAction={
                screen === "JOURNEY_IDLE"
                  ? () => {
                      void loadManualStops();
                    }
                  : undefined
              }
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
            largeText={largeText}
            onDismiss={() => setVisualAlert(null)}
          />
        ) : null}
        <TabBar
          activeTab={activeTab}
          journeyStateDescription={
            selectedBus
              ? "active journey"
              : screen === "STOP"
                ? "map ready"
                : selectedStop
                  ? "stop selected"
                  : "find bus ready"
          }
          hasRequest={Boolean(requestId || focusedAssistRequest.requestId)}
          lightMode={lightMode}
          highContrast={appPreferences.highContrast}
          compact={isCompactWidth}
          onSelect={openTab}
        />
      </SafeAreaView>
    </AccessibilityRuntimeContext.Provider>
  );
}

const ToggleRow = memo(function ToggleRow({
  label,
  description,
  enabled,
  disabled = false,
  highContrast = false,
  largeText = false,
  lightMode = false,
  variant = "default",
  Icon,
  iconSize,
  illustrationSource,
  illustrationSize,
  illustration,
  onPress,
}: {
  label: string;
  description: string;
  enabled: boolean;
  disabled?: boolean;
  highContrast?: boolean;
  largeText?: boolean;
  lightMode?: boolean;
  variant?: "default" | "assistance" | "phone";
  Icon?: LucideIcon;
  iconSize?: number;
  illustrationSource?: ImageSourcePropType;
  illustrationSize?: "small" | "medium" | "large";
  illustration?: React.ReactNode;
  onPress: () => void;
}) {
  const runtimeAccessibility = useContext(AccessibilityRuntimeContext);
  const { fontScale, width } = useWindowDimensions();
  const isAssistance = variant === "assistance";
  const isPhone = variant === "phone";
  const shouldStackIllustration =
    Boolean(illustration || illustrationSource) &&
    shouldStackFeatureIllustration({ width, fontScale, largeText });
  const theme = resolveVisualTheme(lightMode, highContrast);
  const selectedForeground = theme.colors.iconSelected;
  const rowForeground = enabled ? selectedForeground : theme.colors.textPrimary;
  const rowDescriptionColor = enabled
    ? selectedForeground
    : theme.colors.textSecondary;
  const iconForeground = enabled
    ? selectedForeground
    : theme.colors.iconPrimary;
  const rowSurface = enabled
    ? theme.colors.selectedSurface
    : lightMode
      ? theme.colors.surfacePrimary
      : theme.colors.surfaceRaised;
  const iconSurface = enabled ? "transparent" : theme.colors.actionSecondary;
  const rowBorderColor = enabled
    ? highContrast
      ? theme.colors.borderStrong
      : theme.colors.selectedSurface
    : theme.colors.borderDefault;
  const rowBorderWidth = highContrast
    ? enabled
      ? 3
      : 2
    : enabled
      ? borders.selected
      : borders.default;
  const accessibilityLabel = isAssistance
    ? `${label}, ${enabled ? "selected" : "not selected"}`
    : label;
  const accessibilityState = isAssistance
    ? { checked: enabled, disabled, selected: enabled }
    : { checked: enabled, disabled };

  function handlePress() {
    if (disabled) return;
    onPress();
    AccessibilityInfo.announceForAccessibility(
      `${label} turned ${enabled ? "off" : "on"}.`,
    );
  }

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={description}
      disabled={disabled}
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
        highContrast &&
          !lightMode &&
          enabled &&
          styles.highContrastSelectedControl,
        highContrast && lightMode && lightStyles.highContrastControl,
        highContrast &&
          lightMode &&
          enabled &&
          lightStyles.highContrastSelectedControl,
        disabled && styles.disabledButton,
        runtimeAccessibility.largerControls && styles.largerControl,
        {
          backgroundColor: rowSurface,
          borderColor: rowBorderColor,
          borderWidth: rowBorderWidth,
        },
      ]}
    >
      <View
        style={[
          styles.toggleHeaderRow,
          shouldStackIllustration && styles.stackedToggleHeaderRow,
        ]}
      >
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
              {
                backgroundColor: iconSurface,
                borderColor: enabled
                  ? selectedForeground
                  : theme.colors.borderDefault,
                borderWidth: enabled ? 2 : borders.default,
              },
            ]}
          >
            {Icon ? (
              <Icon
                size={iconSize ?? 28}
                color={iconForeground}
                strokeWidth={highContrast ? 3.2 : 2.8}
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
                  { color: iconForeground },
                ]}
              >
                Aa
              </Text>
            )}
          </View>
        </View>
        <View style={styles.toggleTextGroup}>
          <View style={styles.toggleTitleRow}>
            <Text
              style={[
                styles.toggleText,
                largeText && styles.largeBody,
                runtimeAccessibility.textSize === "EXTRA_LARGE" &&
                  styles.extraLargeBody,
                lightMode && lightStyles.text,
                highContrast && !lightMode && styles.highContrastText,
                highContrast && lightMode && lightStyles.highContrastText,
                { color: rowForeground },
              ]}
            >
              {label}
            </Text>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={styles.compactSelectionIndicator}
            >
              {enabled ? (
                <CheckCircle2
                  size={32}
                  color={selectedForeground}
                  strokeWidth={highContrast ? 3 : 2.8}
                  accessible={false}
                />
              ) : (
                <Circle
                  size={30}
                  color={theme.colors.iconSecondary}
                  strokeWidth={highContrast ? 3 : 2.4}
                  accessible={false}
                />
              )}
            </View>
          </View>
          <Text
            style={[
              styles.bodyText,
              largeText && styles.largeBody,
              runtimeAccessibility.textSize === "EXTRA_LARGE" &&
                styles.extraLargeBody,
              lightMode && lightStyles.bodyText,
              highContrast && !lightMode && styles.highContrastMutedText,
              highContrast && lightMode && lightStyles.highContrastMutedText,
              { color: rowDescriptionColor },
            ]}
          >
            {description}
          </Text>
        </View>
        {illustration ? (
          <View
            style={[
              styles.toggleIllustrationSlot,
              shouldStackIllustration && styles.stackedToggleIllustrationSlot,
            ]}
          >
            {illustration}
          </View>
        ) : illustrationSource ? (
          <View
            style={[
              styles.toggleIllustrationSlot,
              shouldStackIllustration && styles.stackedToggleIllustrationSlot,
            ]}
          >
            <FeatureIllustration
              source={illustrationSource}
              size={illustrationSize ?? "medium"}
              decorative
              lightMode={lightMode}
              highContrast={highContrast}
            />
          </View>
        ) : null}
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
  const metadata: Record<AssistanceType, { label: string; icon: LucideIcon }> =
    {
      WHEELCHAIR_RAMP: {
        label: "Ramp assistance",
        icon: Accessibility,
      },
      BUS_AUDIO_IDENTIFICATION: {
        label: "Bus identification",
        icon: BusFront,
      },
      EXTENDED_DWELL_TIME: {
        label: "Extra boarding time",
        icon: Timer,
      },
    };
  const defaults = requirementsToAssistanceTypes(requirements).map(
    (type) => metadata[type],
  );
  const label = requirementsLabel(requirements);
  const theme = resolveVisualTheme(lightMode, highContrast);

  return (
    <View
      style={[
        styles.defaultsIconGroup,
        compact && styles.compactDefaultsIconGroup,
      ]}
      accessible
      accessibilityLabel={`Journey assistance: ${label}.`}
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
          Journey assistance
        </Text>
      )}
      {defaults.length > 0 ? (
        <View
          style={[
            styles.defaultsIconRow,
            compact && styles.compactDefaultsIconRow,
          ]}
        >
          {defaults.map((item) => {
            const ItemIcon = item.icon;
            return (
              <View
                key={item.label}
                style={[
                  styles.defaultsIconChip,
                  compact && styles.compactDefaultsIconBadge,
                  {
                    backgroundColor: theme.colors.profileBadgeSurface,
                    borderColor: theme.colors.profileBadgeBorder,
                  },
                ]}
              >
                <ItemIcon
                  size={compact ? 30 : 28}
                  color={theme.colors.profileBadgeIcon}
                  strokeWidth={highContrast ? 3.2 : 2.8}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                {!compact && (
                  <Text
                    style={[
                      styles.defaultsIconText,
                      lightMode && lightStyles.text,
                      highContrast && !lightMode && styles.highContrastText,
                      highContrast && lightMode && lightStyles.highContrastText,
                      { color: theme.colors.profileBadgeText },
                    ]}
                  >
                    {item.label}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      ) : compact ? null : (
        <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
          No journey assistance selected
        </Text>
      )}
    </View>
  );
});

function AssistanceSummaryList({
  requirements,
  status,
  phase = "BOARDING",
  lightMode,
  highContrast,
}: {
  requirements: AccessibilityRequirements;
  status: AssistanceRequestStatus | null;
  phase?: AssistancePhase;
  lightMode: boolean;
  highContrast: boolean;
}) {
  const metadata: Record<AssistanceType, { label: string; icon: LucideIcon }> =
    {
      WHEELCHAIR_RAMP: {
        label: "Ramp assistance",
        icon: Accessibility,
      },
      BUS_AUDIO_IDENTIFICATION: {
        label: "Bus identification",
        icon: BusFront,
      },
      EXTENDED_DWELL_TIME: {
        label:
          phase === "ALIGHTING" ? "Extra alighting time" : "More boarding time",
        icon: Timer,
      },
    };
  const items = requirementsToAssistanceTypes(requirements).map(
    (type) => metadata[type],
  );
  const statusText =
    status === "ACKNOWLEDGED" ? "Confirmed" : requestStatusLabel(status);

  if (items.length === 0) {
    return (
      <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
        No assistance selected for this journey.
      </Text>
    );
  }

  return (
    <View style={styles.assistanceSummaryList}>
      {items.map((item) => {
        const ItemIcon = item.icon;
        return (
          <View
            key={item.label}
            style={[
              styles.assistanceSummaryRow,
              lightMode && lightStyles.landmarkSearchResult,
              highContrast && !lightMode && styles.highContrastControl,
              highContrast && lightMode && lightStyles.highContrastControl,
            ]}
          >
            <FeatureGlyph
              icon={ItemIcon}
              lightMode={lightMode}
              highContrast={highContrast}
              selected={status === "ACKNOWLEDGED"}
              size="small"
            />
            <View style={styles.landmarkSearchTextGroup}>
              <Text
                style={[styles.summaryValue, lightMode && lightStyles.text]}
              >
                {item.label}
              </Text>
              <Text
                style={[
                  styles.summaryLabel,
                  lightMode && lightStyles.mutedText,
                ]}
              >
                {statusText}
              </Text>
            </View>
            <CircleCheck
              size={iconSizes.standard}
              color={controlIconColor({
                active: status === "ACKNOWLEDGED",
                lightMode,
                highContrast,
              })}
              strokeWidth={2.75}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </View>
        );
      })}
    </View>
  );
}

function loadingMessageForAssistance(types: AssistanceType[]) {
  if (types.includes("WHEELCHAIR_RAMP")) {
    return "Sending your ramp request...";
  }
  if (types.includes("EXTENDED_DWELL_TIME")) {
    return "Asking the bus for extra boarding time...";
  }
  if (types.includes("BUS_AUDIO_IDENTIFICATION")) {
    return "Preparing audio identification...";
  }
  return "Sending assistance request...";
}

type LoadingVisualKind =
  "location" | "request" | "audio" | "journey" | "generic";

function loadingVisualKindForMessage(message: string): LoadingVisualKind {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("location") ||
    normalized.includes("nearby") ||
    normalized.includes("stops")
  ) {
    return "location";
  }
  if (
    normalized.includes("audio") ||
    normalized.includes("identification") ||
    normalized.includes("announcement")
  ) {
    return "audio";
  }
  if (
    normalized.includes("journey") ||
    normalized.includes("alight") ||
    normalized.includes("disembark")
  ) {
    return "journey";
  }
  if (
    normalized.includes("ramp") ||
    normalized.includes("extra") ||
    normalized.includes("boarding time") ||
    normalized.includes("sending") ||
    normalized.includes("request") ||
    normalized.includes("cancelling")
  ) {
    return "request";
  }

  return "generic";
}

function loadingDescriptionForKind(kind: LoadingVisualKind) {
  switch (kind) {
    case "location":
      return "This should only take a moment.";
    case "request":
      return "Sending a simple signal to the bus.";
    case "audio":
      return "Preparing the announcement signal.";
    case "journey":
      return "Updating your journey status.";
    default:
      return "Still working if this takes a moment.";
  }
}

function useDelayedLoadingVisibility(
  active: boolean,
  showDelayMs = 180,
  minimumVisibleMs = 320,
) {
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      if (visible) {
        return undefined;
      }
      const showTimer = setTimeout(() => {
        shownAtRef.current = Date.now();
        setVisible(true);
      }, showDelayMs);
      return () => clearTimeout(showTimer);
    }

    if (!visible) {
      shownAtRef.current = null;
      return undefined;
    }

    const elapsed = Date.now() - (shownAtRef.current ?? Date.now());
    const hideTimer = setTimeout(
      () => {
        shownAtRef.current = null;
        setVisible(false);
      },
      Math.max(0, minimumVisibleMs - elapsed),
    );
    return () => clearTimeout(hideTimer);
  }, [active, minimumVisibleMs, showDelayMs, visible]);

  return visible;
}

function useDelayedFlag(active: boolean, delayMs: number) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return undefined;
    }
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return visible;
}

function usePulseAnimation() {
  const runtimeAccessibility = useContext(AccessibilityRuntimeContext);
  const pulse = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const animationsDisabled =
    reduceMotion ||
    runtimeAccessibility.reducedMotion ||
    Boolean(process.env.JEST_WORKER_ID);

  useEffect(() => {
    let mounted = true;
    const readReduceMotion = AccessibilityInfo.isReduceMotionEnabled;
    if (typeof readReduceMotion === "function") {
      const result = readReduceMotion();
      if (result && typeof result.then === "function") {
        result
          .then((enabled) => {
            if (mounted) {
              setReduceMotion(enabled);
            }
          })
          .catch(() => undefined);
      }
    }

    const subscription = AccessibilityInfo.addEventListener?.(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (animationsDisabled) {
      pulse.setValue(0);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          duration: 900,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          duration: 900,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [animationsDisabled, pulse]);

  return {
    opacity: pulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.35, 0.85],
    }),
    transform: [
      {
        scale: pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [0.96, 1.08],
        }),
      },
    ],
  };
}

function FindBusPanel({
  state,
  interactionBusy,
  stacked,
  largeText,
  lightMode,
  highContrast,
  canRepeatGuidance,
  onUseLocation,
  onSelectManually,
  onRetry,
  onRepeatGuidance,
}: {
  state: FindBusPanelState;
  interactionBusy: boolean;
  stacked: boolean;
  largeText: boolean;
  lightMode: boolean;
  highContrast: boolean;
  canRepeatGuidance: boolean;
  onUseLocation: () => void;
  onSelectManually: () => void;
  onRetry: () => void;
  onRepeatGuidance: () => void;
}) {
  const showManualEscape = useDelayedFlag(state.kind === "LOCATING", 4000);

  if (state.kind === "LOCATING" || state.kind === "MAP_LOADING") {
    return (
      <LocationLoadingPanel
        message={state.message}
        showManualEscape={state.kind === "LOCATING" ? showManualEscape : false}
        lightMode={lightMode}
        highContrast={highContrast}
        onSelectManually={onSelectManually}
      />
    );
  }

  if (state.kind === "LOCATION_ERROR" || state.kind === "DISCOVERY_ERROR") {
    return (
      <JourneyDiscoveryInlineStatus
        status={state.status}
        interactionBusy={interactionBusy}
        onPrimaryAction={onRetry}
        onSecondaryAction={onSelectManually}
        lightMode={lightMode}
        highContrast={highContrast}
      />
    );
  }

  return (
    <>
      <FeatureHero
        title="Choose a nearby stop and the bus you want to board."
        illustration={
          <JourneyFindBusIllustration
            lightMode={lightMode}
            highContrast={highContrast}
          />
        }
        stacked={stacked}
        largeText={largeText}
        lightMode={lightMode}
        highContrast={highContrast}
      />
      <View style={styles.journeyFindBusActions}>
        <PrimaryButton
          label="Use my location"
          icon={LocateFixed}
          accessibilityHint="Find nearby bus stops using your current location."
          onPress={onUseLocation}
          disabled={interactionBusy}
          lightMode={lightMode}
          highContrast={highContrast}
        />
        <SecondaryButton
          label="Select bus stop manually"
          icon={List}
          accessibilityHint="Opens a list of nearby bus stops."
          onPress={onSelectManually}
          disabled={interactionBusy}
          lightMode={lightMode}
          highContrast={highContrast}
        />
      </View>
      {state.kind === "NOTICE" ? (
        <JourneyDiscoveryInlineStatus
          status={state.status}
          interactionBusy={interactionBusy}
          onPrimaryAction={onRetry}
          onSecondaryAction={onSelectManually}
          lightMode={lightMode}
          highContrast={highContrast}
        />
      ) : null}
      {canRepeatGuidance ? (
        <TertiaryButton
          label="Repeat guidance"
          icon={Volume2}
          accessibilityHint="Repeats the latest spoken journey information."
          onPress={onRepeatGuidance}
          lightMode={lightMode}
          highContrast={highContrast}
        />
      ) : null}
    </>
  );
}

function LocationLoadingPanel({
  message,
  showManualEscape,
  lightMode,
  highContrast,
  onSelectManually,
}: {
  message: string;
  showManualEscape: boolean;
  lightMode: boolean;
  highContrast: boolean;
  onSelectManually: () => void;
}) {
  const theme = resolveVisualTheme(lightMode, highContrast);
  const panelSurface =
    lightMode && !highContrast
      ? theme.colors.surfaceRaised
      : theme.colors.backgroundSecondary;

  return (
    <View
      testID="journey-location-loading-panel"
      style={[
        styles.journeyLocationLoadingPanel,
        {
          backgroundColor: panelSurface,
          borderColor: highContrast
            ? theme.colors.borderStrong
            : theme.colors.borderDefault,
          borderWidth: highContrast ? 2 : 1,
        },
      ]}
    >
      <View
        style={styles.journeyLocationLoadingStatus}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`${message} This should only take a moment.`}
        accessibilityState={{ busy: true }}
        accessibilityLiveRegion="polite"
      >
        <GeneratedFeatureArtwork
          source={illustrations.nearestStopLoading}
          testID="location-loading-artwork"
          lightMode={lightMode}
          highContrast={highContrast}
        />
        <Text
          style={[
            styles.journeyLocationLoadingTitle,
            { color: theme.colors.textPrimary },
          ]}
        >
          {message}
        </Text>
        <Text
          style={[
            styles.journeyLocationLoadingSupport,
            { color: theme.colors.textSecondary },
          ]}
        >
          This should only take a moment.
        </Text>
        <View
          style={styles.locationLoadingProgress}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {[0, 1, 2].map((dot) => (
            <React.Fragment key={dot}>
              {dot > 0 ? (
                <View
                  style={[
                    styles.locationLoadingProgressLine,
                    { backgroundColor: theme.colors.borderDefault },
                  ]}
                />
              ) : null}
              <View
                style={[
                  styles.locationLoadingProgressDot,
                  {
                    backgroundColor: theme.colors.statusInformation,
                    opacity: 1 - dot * 0.22,
                  },
                ]}
              />
            </React.Fragment>
          ))}
        </View>
      </View>
      {showManualEscape ? (
        <View style={styles.journeyLocationLongWaitActions}>
          <Text
            style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}
          >
            Taking longer than expected?
          </Text>
          <SecondaryButton
            label="Select bus stop manually"
            icon={List}
            accessibilityHint="Stops waiting for location and opens manual bus stop selection."
            onPress={onSelectManually}
            lightMode={lightMode}
            highContrast={highContrast}
          />
        </View>
      ) : null}
    </View>
  );
}

function GeneratedFeatureArtwork({
  source,
  testID,
  lightMode,
  highContrast,
  compact = false,
}: {
  source: ImageSourcePropType;
  testID: string;
  lightMode: boolean;
  highContrast: boolean;
  compact?: boolean;
}) {
  return (
    <ThemedSceneArtwork
      source={source}
      testID={testID}
      decorative
      lightMode={lightMode}
      highContrast={highContrast}
      style={[
        styles.generatedFeatureArtwork,
        compact && styles.generatedFeatureArtworkCompact,
      ]}
    />
  );
}

function FeatureHero({
  title,
  illustration,
  stacked,
  largeText,
  lightMode,
  highContrast,
}: {
  title: string;
  illustration: React.ReactNode;
  stacked: boolean;
  largeText: boolean;
  lightMode: boolean;
  highContrast: boolean;
}) {
  const highContrastDark = highContrast && !lightMode;
  const highContrastLight = highContrast && lightMode;
  const artwork = (
    <View
      style={[
        styles.journeyIntroArtwork,
        stacked && styles.stackedJourneyIntroArtwork,
      ]}
    >
      {illustration}
    </View>
  );
  const copy = (
    <View
      style={[
        styles.journeyIntroTextGroup,
        stacked && styles.stackedJourneyIntroTextGroup,
      ]}
    >
      <Text
        accessibilityRole="header"
        style={[
          styles.journeyIntroCopy,
          largeText && styles.largeJourneyIntroCopy,
          lightMode && lightStyles.bodyText,
          highContrastDark && styles.highContrastMutedText,
          highContrastLight && lightStyles.highContrastMutedText,
        ]}
      >
        {title}
      </Text>
    </View>
  );

  return (
    <View
      testID="journey-feature-hero"
      style={[
        styles.journeyIntroPanel,
        stacked && styles.stackedJourneyIntroPanel,
        lightMode && lightStyles.journeyIntroPanel,
        highContrastDark && styles.highContrastControl,
        highContrastLight && lightStyles.highContrastControl,
      ]}
    >
      {stacked ? (
        <>
          {artwork}
          {copy}
        </>
      ) : (
        <>
          {copy}
          {artwork}
        </>
      )}
    </View>
  );
}

function JourneyFindBusIllustration({
  lightMode,
  highContrast,
}: {
  lightMode: boolean;
  highContrast: boolean;
}) {
  return (
    <GeneratedFeatureArtwork
      source={illustrations.journeyFindBus}
      testID="journey-hero-artwork"
      lightMode={lightMode}
      highContrast={highContrast}
      compact
    />
  );
}

function StatusConceptVisual({
  kind,
  lightMode,
  highContrast,
  compact = false,
}: {
  kind: LoadingVisualKind;
  lightMode: boolean;
  highContrast: boolean;
  compact?: boolean;
}) {
  const theme = resolveVisualTheme(lightMode, highContrast);
  const pulseStyle = usePulseAnimation();
  const iconColor = theme.colors.iconPrimary;
  const accentColor = theme.colors.statusInformation;
  const surfaceColor = lightMode
    ? lightTheme.surfaceSecondary
    : colors.surfaceSecondary;

  if (kind === "location") {
    return (
      <View
        style={[
          styles.statusConceptVisual,
          compact && styles.compactStatusConceptVisual,
        ]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        <Animated.View
          style={[
            styles.locationPulseRing,
            { borderColor: accentColor },
            pulseStyle,
          ]}
        />
        <MapPin
          size={compact ? 38 : 46}
          color={iconColor}
          strokeWidth={3}
          accessible={false}
        />
        <View style={styles.statusGroundRow}>
          <View
            style={[
              styles.statusBusStopSign,
              {
                backgroundColor: accentColor,
                borderColor: theme.colors.borderStrong,
              },
            ]}
          />
          <BusFront
            size={compact ? 28 : 34}
            color={iconColor}
            strokeWidth={2.75}
            accessible={false}
          />
        </View>
      </View>
    );
  }

  if (kind === "audio") {
    return (
      <View
        style={[
          styles.statusConceptVisual,
          compact && styles.compactStatusConceptVisual,
        ]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        <BusFront
          size={compact ? 38 : 48}
          color={iconColor}
          strokeWidth={2.75}
          accessible={false}
        />
        <Animated.View style={[styles.audioWaveGroup, pulseStyle]}>
          <View style={[styles.audioWave, { borderColor: accentColor }]} />
          <View style={[styles.audioWaveWide, { borderColor: accentColor }]} />
        </Animated.View>
        <Volume2
          size={compact ? 24 : 30}
          color={accentColor}
          strokeWidth={3}
          accessible={false}
        />
      </View>
    );
  }

  if (kind === "journey") {
    return (
      <View
        style={[
          styles.statusConceptVisual,
          compact && styles.compactStatusConceptVisual,
        ]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        <View style={styles.journeyProgressVisual}>
          <View
            style={[
              styles.journeyProgressDot,
              { backgroundColor: accentColor },
            ]}
          />
          <View
            style={[styles.journeyProgressLine, { backgroundColor: iconColor }]}
          />
          <Animated.View style={pulseStyle}>
            <BusFront
              size={compact ? 30 : 36}
              color={iconColor}
              strokeWidth={2.75}
              accessible={false}
            />
          </Animated.View>
          <View
            style={[styles.journeyProgressLine, { backgroundColor: iconColor }]}
          />
          <View
            style={[
              styles.journeyProgressDotOpen,
              { borderColor: accentColor },
            ]}
          />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.statusConceptVisual,
        compact && styles.compactStatusConceptVisual,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <View
        style={[
          styles.requestSignalDisc,
          {
            backgroundColor: surfaceColor,
            borderColor: theme.colors.borderDefault,
          },
        ]}
      >
        {kind === "request" ? (
          <Animated.View style={pulseStyle}>
            <Accessibility
              size={compact ? 28 : 34}
              color={accentColor}
              strokeWidth={3}
              accessible={false}
            />
          </Animated.View>
        ) : (
          <Clock
            size={compact ? 28 : 34}
            color={accentColor}
            strokeWidth={3}
            accessible={false}
          />
        )}
      </View>
      <View style={styles.statusSignalMarks}>
        <View
          style={[styles.statusSignalMark, { backgroundColor: accentColor }]}
        />
        <View
          style={[
            styles.statusSignalMark,
            styles.statusSignalMarkWide,
            { backgroundColor: accentColor },
          ]}
        />
      </View>
      <BusFront
        size={compact ? 32 : 40}
        color={iconColor}
        strokeWidth={2.75}
        accessible={false}
      />
    </View>
  );
}

function LargeTextConceptVisual({
  lightMode,
  highContrast,
}: {
  lightMode: boolean;
  highContrast: boolean;
}) {
  const theme = resolveVisualTheme(lightMode, highContrast);
  return (
    <View
      style={styles.featureConceptVisual}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Text style={[styles.smallAaText, { color: theme.colors.textSecondary }]}>
        Aa
      </Text>
      <ArrowRight
        size={18}
        color={theme.colors.iconSecondary}
        strokeWidth={3}
        accessible={false}
      />
      <Text style={[styles.largeAaText, { color: theme.colors.iconPrimary }]}>
        Aa
      </Text>
    </View>
  );
}

function HighContrastConceptVisual({
  lightMode,
  highContrast,
}: {
  lightMode: boolean;
  highContrast: boolean;
}) {
  const theme = resolveVisualTheme(lightMode, highContrast);
  return (
    <View
      style={[
        styles.featureConceptVisual,
        styles.contrastConceptVisual,
        { borderColor: theme.colors.borderStrong },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <View style={[styles.contrastHalf, { backgroundColor: "#FFFFFF" }]}>
        <BusFront
          size={26}
          color="#111111"
          strokeWidth={3}
          accessible={false}
        />
      </View>
      <View style={[styles.contrastHalf, { backgroundColor: "#111111" }]}>
        <BusFront
          size={26}
          color="#FFFFFF"
          strokeWidth={3}
          accessible={false}
        />
      </View>
    </View>
  );
}

function PhysicalAssistanceButtonVisual({
  lightMode,
  highContrast,
}: {
  lightMode: boolean;
  highContrast: boolean;
}) {
  return (
    <ThemedSceneArtwork
      source={illustrations.physicalHelpButton}
      testID="physical-assistance-button-visual"
      accessibilityLabel="A passenger presses the assistance button at a bus stop, sending a help request to the approaching accessible bus."
      lightMode={lightMode}
      highContrast={highContrast}
      style={styles.generatedPhysicalHelpVisual}
    />
  );
}

function FocusedAssistScreen({
  context,
  controller,
  contextError,
  selectedServiceNo,
  requestPhase,
  appPreferences,
  lightMode,
  highContrast,
  onChooseStop,
  onOpenJourney,
}: {
  context: FocusedAssistContext;
  controller: FocusedAssistController;
  contextError: string | null;
  selectedServiceNo: string | null;
  requestPhase: AssistancePhase | null;
  appPreferences: AccessibilityPreferences;
  lightMode: boolean;
  highContrast: boolean;
  onChooseStop: () => void;
  onOpenJourney: () => void;
}) {
  const largeText = isLargeText(appPreferences);
  const extraLargeText = appPreferences.textSize === "EXTRA_LARGE";
  const theme = resolveVisualTheme(lightMode, highContrast);
  const bodyStyle = [
    styles.bodyText,
    largeText && styles.largeBody,
    extraLargeText && styles.extraLargeBody,
    lightMode && lightStyles.bodyText,
    highContrast && !lightMode && styles.highContrastMutedText,
    highContrast && lightMode && lightStyles.highContrastMutedText,
  ];
  const headingStyle = [
    styles.summaryValue,
    largeText && styles.largeHeading,
    extraLargeText && styles.extraLargeHeading,
    lightMode && lightStyles.text,
    highContrast && !lightMode && styles.highContrastText,
    highContrast && lightMode && lightStyles.highContrastText,
  ];
  const panelStyle = [
    styles.focusedAssistPanel,
    lightMode && lightStyles.surface,
    highContrast && !lightMode && styles.highContrastControl,
    highContrast && lightMode && lightStyles.highContrastControl,
  ];
  const eyebrowStyle = [
    styles.focusedAssistEyebrow,
    { color: theme.colors.statusInformation },
  ];
  const servicePrefixStyle = [
    styles.focusedAssistServicePrefix,
    { color: theme.colors.textSecondary },
  ];
  const requestActive =
    context.request.status === AssistanceRequestStatus.SENDING ||
    context.request.status === AssistanceRequestStatus.ACKNOWLEDGED;

  if (context.state === "LOCATING") {
    return (
      <View
        style={panelStyle}
        accessible
        accessibilityLabel="Finding your bus stop. Checking nearby stops and buses."
      >
        <GeneratedFeatureArtwork
          source={illustrations.nearestStopLoading}
          testID="assist-location-loading-artwork"
          lightMode={lightMode}
          highContrast={highContrast}
          compact
        />
        <ActivityIndicator
          size="large"
          color={theme.colors.statusInformation}
        />
        <Text style={headingStyle}>Finding your bus stop...</Text>
        <Text style={bodyStyle}>Checking nearby stops and buses.</Text>
      </View>
    );
  }

  if (context.state === "NO_STOP") {
    const uncertain = context.stopResolution.reason === "POOR_ACCURACY";
    return (
      <View style={panelStyle}>
        <Text style={eyebrowStyle}>IMMEDIATE ASSISTANCE</Text>
        <Text style={headingStyle} accessibilityRole="header">
          {uncertain
            ? "We're not sure which bus stop you're at."
            : "We can't identify your bus stop yet."}
        </Text>
        {contextError ? (
          <Text style={bodyStyle} accessibilityRole="alert">
            {contextError}
          </Text>
        ) : null}
        <PrimaryButton
          label="Use my location"
          icon={LocateFixed}
          onPress={() => void controller.refreshContext()}
          lightMode={lightMode}
          highContrast={highContrast}
        />
        <SecondaryButton
          label="Choose bus stop"
          icon={MapPin}
          onPress={onChooseStop}
          lightMode={lightMode}
          highContrast={highContrast}
        />
      </View>
    );
  }

  if (context.state === "ONBOARD") {
    const acknowledged =
      requestPhase === "ALIGHTING" &&
      context.request.status === AssistanceRequestStatus.ACKNOWLEDGED;
    const requested =
      requestPhase === "ALIGHTING" &&
      context.request.status === AssistanceRequestStatus.SENDING;
    return (
      <View style={panelStyle}>
        <Text style={eyebrowStyle}>
          {context.destinationIsNext ? "YOUR STOP IS NEXT" : "ONBOARD ASSIST"}
        </Text>
        <Text
          style={styles.focusedAssistOnboardService}
          accessibilityRole="header"
        >
          ON SERVICE {selectedServiceNo ?? ""}
        </Text>
        <Text style={headingStyle}>
          Destination: {context.destinationName ?? "Choose destination"}
        </Text>
        <View style={styles.focusedAssistHelpLabel} accessible>
          <Accessibility size={28} color="#0B6670" />
          <Text style={headingStyle}>Alighting assistance</Text>
        </View>
        {acknowledged || requested ? (
          <FocusedAssistStatus
            tone={acknowledged ? "success" : "pending"}
            title={
              acknowledged ? "REQUEST RECEIVED" : "ASSISTANCE REQUEST SENT"
            }
            message={
              acknowledged
                ? "The bus received your request. Please wait until the bus stops and assistance is ready."
                : "Waiting for the bus to confirm."
            }
            lightMode={lightMode}
            highContrast={highContrast}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Request help to disembark from Service ${selectedServiceNo ?? "selected bus"}`}
            accessibilityHint="Sends an alighting assistance request. It does not directly operate bus hardware."
            onPress={() => void controller.requestAlightingAssistance()}
            style={({ pressed }) => [
              styles.focusedAssistAlightingAction,
              pressed && styles.buttonPressed,
              highContrast && styles.focusedAssistHighContrastAction,
            ]}
          >
            <DoorOpen size={38} color="#FFFFFF" />
            <Text style={styles.focusedAssistActionLabel}>
              REQUEST HELP TO DISEMBARK
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  if (context.state === "AT_STOP_NO_BUS") {
    return (
      <View style={panelStyle}>
        <Text style={eyebrowStyle}>YOU'RE AT</Text>
        <Text style={headingStyle}>{context.stop?.description}</Text>
        <Text style={bodyStyle}>Stop {context.stop?.busStopCode}</Text>
        <Text style={bodyStyle}>
          {contextError ?? "No bus is currently detected at the stop."}
        </Text>
        <SecondaryButton
          label="Check again"
          icon={RefreshCw}
          onPress={() => void controller.refreshContext()}
          lightMode={lightMode}
          highContrast={highContrast}
        />
      </View>
    );
  }

  if (context.state === "MULTIPLE_BUSES_PRESENT") {
    return (
      <View style={panelStyle}>
        <Text style={eyebrowStyle}>ASSIST</Text>
        <Text style={headingStyle} accessibilityRole="header">
          Which bus do you need?
        </Text>
        <Text style={bodyStyle}>
          {context.stop?.description} · Stop {context.stop?.busStopCode}
        </Text>
        {context.buses.map((bus) => (
          <Pressable
            key={bus.id}
            accessibilityRole="button"
            accessibilityLabel={`Choose Service ${bus.serviceNo}${bus.destination ? ` towards ${bus.destination}` : ""}`}
            onPress={() => controller.selectBus(bus.id)}
            style={({ pressed }) => [
              styles.focusedAssistBusChoice,
              lightMode && lightStyles.surface,
              pressed && styles.buttonPressed,
              highContrast && styles.focusedAssistHighContrastChoice,
            ]}
          >
            <Text style={styles.focusedAssistBusChoiceService}>
              Service {bus.serviceNo}
            </Text>
            {bus.destination ? (
              <Text style={bodyStyle}>Towards {bus.destination}</Text>
            ) : null}
            <Text style={bodyStyle}>
              {bus.confidence === "HIGH"
                ? "Detected at this stop"
                : "Appears to be arriving"}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  }

  const bus = context.selectedBus;
  if (!bus) {
    return (
      <View style={panelStyle}>
        <Text style={headingStyle}>Immediate assistance</Text>
        <Text style={bodyStyle} accessibilityRole="alert">
          {context.request.error ??
            contextError ??
            "We cannot confirm which bus needs assistance yet."}
        </Text>
        <SecondaryButton
          label="Check again"
          icon={RefreshCw}
          onPress={() => void controller.refreshContext()}
          lightMode={lightMode}
          highContrast={highContrast}
        />
      </View>
    );
  }

  const simplified = appPreferences.simplifiedJourney;
  const oneTouch = context.state === "ONE_BUS_PRESENT";
  const statusContent = focusedAssistStatusContent(context, simplified);
  return (
    <View style={panelStyle}>
      <Text style={eyebrowStyle} accessibilityRole="header">
        {simplified
          ? oneTouch
            ? "BUS HERE"
            : "BUS COMING"
          : oneTouch
            ? "BUS AT YOUR STOP"
            : bus.activeJourneyMatch
              ? "YOUR BUS IS APPROACHING"
              : "BUS APPEARS TO BE ARRIVING"}
      </Text>
      <Text style={servicePrefixStyle}>SERVICE</Text>
      <Text
        style={[
          styles.focusedAssistServiceNumber,
          extraLargeText && styles.focusedAssistServiceNumberExtraLarge,
          { color: theme.colors.textPrimary },
        ]}
        accessibilityLabel={`Service ${bus.serviceNo}`}
      >
        {bus.serviceNo}
      </Text>
      {!oneTouch && bus.etaSeconds !== undefined ? (
        <Text style={headingStyle}>{formatEta(bus.etaSeconds)}</Text>
      ) : null}
      {bus.wheelchairAccessible ? (
        <View
          style={styles.focusedAssistAccessibleRow}
          accessible
          accessibilityLabel="Wheelchair-accessible vehicle."
        >
          <Accessibility size={30} color="#0B6670" />
          <Text style={headingStyle}>
            {simplified ? "Wheelchair accessible" : "Wheelchair-accessible bus"}
          </Text>
        </View>
      ) : null}

      {statusContent ? (
        <>
          <FocusedAssistStatus
            {...statusContent}
            lightMode={lightMode}
            highContrast={highContrast}
          />
          {context.state === "ERROR" ? (
            <PrimaryButton
              label="Try again"
              icon={RefreshCw}
              onPress={() => void controller.requestRamp()}
              lightMode={lightMode}
              highContrast={highContrast}
            />
          ) : null}
        </>
      ) : context.state === "RAMP_UNAVAILABLE" ? (
        <>
          <FocusedAssistStatus
            tone="error"
            title="RAMP UNAVAILABLE"
            message="Ramp assistance is unavailable on this bus."
            lightMode={lightMode}
            highContrast={highContrast}
          />
          <SecondaryButton
            label="Find another bus"
            icon={BusFront}
            onPress={onOpenJourney}
            lightMode={lightMode}
            highContrast={highContrast}
          />
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${oneTouch ? "Request ramp" : bus.activeJourneyMatch ? "Request ramp in advance" : "Confirm bus and request ramp"} for Service ${bus.serviceNo}`}
          accessibilityHint="Sends a boarding assistance request. Bus safety systems remain responsible for ramp operation."
          disabled={requestActive || context.request.submitting}
          onPress={() => void controller.requestRamp()}
          style={({ pressed }) => [
            styles.focusedAssistRampAction,
            (largeText || appPreferences.largerControls) &&
              styles.focusedAssistRampActionLarge,
            pressed && styles.buttonPressed,
            highContrast && styles.focusedAssistHighContrastAction,
          ]}
        >
          <Accessibility size={48} color="#FFFFFF" />
          <Text style={styles.focusedAssistActionLabel}>
            {simplified
              ? "RAMP"
              : oneTouch
                ? "REQUEST RAMP"
                : bus.activeJourneyMatch
                  ? "REQUEST IN ADVANCE"
                  : "CONFIRM AND REQUEST RAMP"}
          </Text>
          <Text style={styles.focusedAssistActionService}>
            SERVICE {bus.serviceNo}
          </Text>
        </Pressable>
      )}

      <View style={styles.focusedAssistStopSummary}>
        <Text style={headingStyle}>{context.stop?.description}</Text>
        <Text style={bodyStyle}>Stop {context.stop?.busStopCode}</Text>
      </View>
      {context.isDemoPresence ? (
        <Text
          testID="focused-assist-demo-diagnostic"
          style={styles.focusedAssistDiagnostic}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          Demo bus-presence provider
        </Text>
      ) : null}
    </View>
  );
}

function FocusedAssistStatus({
  tone,
  title,
  message,
  lightMode,
  highContrast,
}: {
  tone: "pending" | "success" | "error";
  title: string;
  message: string;
  lightMode: boolean;
  highContrast: boolean;
}) {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${message}`}
      style={[
        styles.focusedAssistStatus,
        tone === "pending" && styles.focusedAssistStatusPending,
        tone === "success" && styles.focusedAssistStatusSuccess,
        tone === "error" && styles.focusedAssistStatusError,
        lightMode && styles.focusedAssistStatusLight,
        highContrast && styles.focusedAssistStatusHighContrast,
      ]}
    >
      {tone === "pending" ? (
        <ActivityIndicator size="large" color="#7A4D00" />
      ) : tone === "error" ? (
        <CircleX size={38} color="#B42318" />
      ) : (
        <CheckCircle2 size={38} color="#08783F" />
      )}
      <Text style={styles.focusedAssistStatusTitle}>{title}</Text>
      <Text style={styles.focusedAssistStatusMessage}>{message}</Text>
    </View>
  );
}

function focusedAssistStatusContent(
  context: FocusedAssistContext,
  simplified: boolean,
): {
  tone: "pending" | "success" | "error";
  title: string;
  message: string;
} | null {
  const extraTime = context.request.assistanceType === "EXTENDED_DWELL_TIME";
  if (context.state === "REQUESTING") {
    return {
      tone: "pending",
      title: "SENDING YOUR REQUEST",
      message: extraTime
        ? "Requesting more boarding time. Please wait."
        : "Please wait. Do not press again.",
    };
  }
  if (context.state === "REQUESTED") {
    return {
      tone: "pending",
      title: extraTime
        ? "MORE TIME REQUEST SENT"
        : simplified
          ? "REQUEST SENT"
          : "RAMP REQUEST SENT",
      message: extraTime
        ? "Waiting for the bus to confirm."
        : simplified
          ? "Wait for the ramp."
          : "Waiting for the bus to confirm. Do not press again.",
    };
  }
  if (context.state === "ACKNOWLEDGED") {
    return {
      tone: "success",
      title: "REQUEST RECEIVED",
      message: extraTime
        ? "The bus has received your request for more boarding time."
        : simplified
          ? "The bus received your request. Wait for the ramp."
          : "The bus has received your ramp request. Please wait while boarding assistance is prepared.",
    };
  }
  if (context.state === "PREPARING_RAMP") {
    return {
      tone: "pending",
      title: "PREPARING THE RAMP",
      message: "Please wait.",
    };
  }
  if (context.state === "RAMP_READY") {
    return {
      tone: "success",
      title: "RAMP READY",
      message: "Please board when the path is clear.",
    };
  }
  if (context.state === "ERROR") {
    return {
      tone: "error",
      title: "REQUEST NOT COMPLETED",
      message:
        context.request.error ?? "We couldn't complete the ramp request.",
    };
  }
  return null;
}

function AssistanceStatusVisual({
  assistanceTypes,
  journeyPhase,
  lightMode,
  highContrast,
}: {
  assistanceTypes: AssistanceType[];
  journeyPhase: JourneyPhase;
  lightMode: boolean;
  highContrast: boolean;
}) {
  const kind =
    journeyPhase === "DISEMBARKING" || journeyPhase === "ALIGHTING"
      ? "journey"
      : assistanceTypes.includes("BUS_AUDIO_IDENTIFICATION")
        ? "audio"
        : "request";

  return (
    <StatusConceptVisual
      kind={kind}
      compact
      lightMode={lightMode}
      highContrast={highContrast}
    />
  );
}

type WaitingRampStatus = "Not requested" | "Requested" | "Acknowledged";

function waitingRampStatus(
  assistanceTypes: AssistanceType[],
  requestStatus: AssistanceRequestStatus | null,
): WaitingRampStatus {
  if (
    !assistanceTypes.includes("WHEELCHAIR_RAMP") ||
    requestStatus === null ||
    requestStatus === "CANCELLED" ||
    requestStatus === "FAILED"
  ) {
    return "Not requested";
  }
  return requestStatus === "ACKNOWLEDGED" ? "Acknowledged" : "Requested";
}

function isActiveAssistanceRequest(
  requestStatus: AssistanceRequestStatus | null,
) {
  return requestStatus === "SENDING" || requestStatus === "ACKNOWLEDGED";
}

function WaitingForBusStatus({
  serviceNo,
  accessibleBus,
  etaSeconds,
  boardingStop,
  destinationStop,
  stopsAfterBoarding,
  assistanceTypes,
  requestStatus,
  isLoading,
  lightMode,
  highContrast,
  onRequestRamp,
  onBoard,
}: {
  serviceNo: string;
  accessibleBus: boolean;
  etaSeconds: number | null;
  boardingStop: NearbyBusStop | null;
  destinationStop: RouteStop | null;
  stopsAfterBoarding: number;
  assistanceTypes: AssistanceType[];
  requestStatus: AssistanceRequestStatus | null;
  isLoading: boolean;
  lightMode: boolean;
  highContrast: boolean;
  onRequestRamp: () => void;
  onBoard: () => void;
}) {
  const runtimeAccessibility = useContext(AccessibilityRuntimeContext);
  const scaledTextStyle = [
    runtimeAccessibility.textSize !== "STANDARD" && styles.largeBody,
    runtimeAccessibility.textSize === "EXTRA_LARGE" && styles.extraLargeBody,
  ];
  const theme = resolveVisualTheme(lightMode, highContrast);
  const rampStatus = waitingRampStatus(assistanceTypes, requestStatus);
  const audioIdentificationOn =
    assistanceTypes.includes("BUS_AUDIO_IDENTIFICATION") &&
    isActiveAssistanceRequest(requestStatus);
  const rampStatusColor =
    rampStatus === "Acknowledged"
      ? theme.colors.statusSuccess
      : rampStatus === "Requested"
        ? theme.colors.statusInformation
        : theme.colors.textSecondary;
  const arrivalLabel =
    etaSeconds === null
      ? "Arriving information unavailable"
      : etaSeconds <= 45
        ? "Arriving now"
        : `Arriving in about ${Math.ceil(etaSeconds / 60)} min`;
  const stopCountLabel = `${stopsAfterBoarding} ${
    stopsAfterBoarding === 1 ? "stop" : "stops"
  } after boarding`;
  const rampRequestUnavailable = !accessibleBus;
  const rampRequestDisabled =
    isLoading || rampStatus !== "Not requested" || rampRequestUnavailable;

  return (
    <View style={styles.waitingScreen} testID="waiting-for-bus-status">
      <View
        style={[
          styles.waitingJourneyCard,
          { backgroundColor: theme.colors.surfacePrimary },
          { borderColor: theme.colors.borderStrong },
        ]}
      >
        <View
          accessible
          accessibilityRole="summary"
          accessibilityLabel={`Service ${serviceNo}. ${arrivalLabel}. ${
            accessibleBus ? "Wheelchair accessible bus." : ""
          }`}
        >
          <View style={styles.waitingServiceRow}>
            <Text
              style={[
                styles.waitingServiceNumber,
                ...scaledTextStyle,
                { color: theme.colors.textPrimary },
              ]}
              accessible={false}
            >
              Service {serviceNo}
            </Text>
            {accessibleBus ? (
              <Accessibility
                size={iconSizes.standard}
                color={theme.colors.statusSuccess}
                strokeWidth={2.75}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            ) : null}
          </View>
          <Text
            style={[
              styles.waitingArrivalText,
              ...scaledTextStyle,
              { color: theme.colors.textSecondary },
            ]}
            accessible={false}
          >
            {arrivalLabel}
          </Text>
        </View>

        {boardingStop ? (
          <View style={styles.waitingDetailGroup}>
            <Text
              style={[
                styles.waitingDetailLabel,
                { color: theme.colors.textMuted },
              ]}
            >
              Boarding at:
            </Text>
            <Text
              style={[
                styles.waitingDetailValue,
                ...scaledTextStyle,
                { color: theme.colors.textPrimary },
              ]}
            >
              {boardingStop.description}, Stop {boardingStop.busStopCode}
            </Text>
          </View>
        ) : null}

        {destinationStop ? (
          <View style={styles.waitingDetailGroup}>
            <Text
              style={[
                styles.waitingDetailLabel,
                { color: theme.colors.textMuted },
              ]}
            >
              Destination:
            </Text>
            <Text
              style={[
                styles.waitingDetailValue,
                ...scaledTextStyle,
                { color: theme.colors.textPrimary },
              ]}
            >
              {destinationStop.description}
            </Text>
            <Text
              style={[
                styles.waitingStopCount,
                { color: theme.colors.textSecondary },
              ]}
            >
              {stopCountLabel}
            </Text>
          </View>
        ) : null}
      </View>

      <View
        style={[
          styles.waitingDivider,
          { backgroundColor: theme.colors.borderDefault },
        ]}
      />

      <View style={styles.waitingSection}>
        <Text
          accessibilityRole="header"
          style={[
            styles.waitingSectionTitle,
            ...scaledTextStyle,
            { color: theme.colors.textPrimary },
          ]}
        >
          Boarding assistance
        </Text>
        <View
          style={[
            styles.waitingAssistancePanel,
            { backgroundColor: theme.colors.surfacePrimary },
            { borderColor: theme.colors.borderDefault },
          ]}
        >
          <View
            style={styles.waitingAssistanceRow}
            accessible
            accessibilityLabel={`Ramp request: ${rampStatus}`}
            accessibilityLiveRegion="polite"
          >
            <View style={styles.waitingAssistanceCopy}>
              <Text
                style={[
                  styles.waitingAssistanceLabel,
                  ...scaledTextStyle,
                  { color: theme.colors.textPrimary },
                ]}
                accessible={false}
              >
                Ramp request
              </Text>
            </View>
            <View
              style={[
                styles.waitingStatusBadge,
                { backgroundColor: theme.colors.surfaceRaised },
                { borderColor: rampStatusColor },
              ]}
            >
              <Text
                style={[styles.waitingStatusText, { color: rampStatusColor }]}
                accessible={false}
              >
                {rampStatus}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.waitingAssistanceRow,
              styles.waitingAssistanceRowBorder,
              { borderTopColor: theme.colors.borderDefault },
            ]}
            accessible
            accessibilityLabel={`Audio identification: ${
              audioIdentificationOn ? "On" : "Off"
            }`}
            accessibilityLiveRegion="polite"
          >
            <View style={styles.waitingAssistanceCopy}>
              <Text
                style={[
                  styles.waitingAssistanceLabel,
                  ...scaledTextStyle,
                  { color: theme.colors.textPrimary },
                ]}
                accessible={false}
              >
                Audio identification
              </Text>
            </View>
            <View
              style={[
                styles.waitingStatusBadge,
                { backgroundColor: theme.colors.surfaceRaised },
                {
                  borderColor: audioIdentificationOn
                    ? theme.colors.statusSuccess
                    : theme.colors.textSecondary,
                },
              ]}
            >
              <Text
                style={[
                  styles.waitingStatusText,
                  {
                    color: audioIdentificationOn
                      ? theme.colors.statusSuccess
                      : theme.colors.textSecondary,
                  },
                ]}
                accessible={false}
              >
                {audioIdentificationOn ? "On" : "Off"}
              </Text>
            </View>
          </View>
        </View>
        {rampRequestUnavailable ? (
          <Text
            style={[
              styles.waitingAssistanceNote,
              { color: theme.colors.textSecondary },
            ]}
          >
            Ramp requests are unavailable for this bus.
          </Text>
        ) : null}
      </View>

      <View
        style={[
          styles.waitingDivider,
          { backgroundColor: theme.colors.borderDefault },
        ]}
      />

      <View style={styles.waitingSection}>
        <Text
          accessibilityRole="header"
          style={[
            styles.waitingSectionTitle,
            ...scaledTextStyle,
            { color: theme.colors.textPrimary },
          ]}
        >
          What to do
        </Text>
        <View style={styles.waitingInstructionList}>
          {[
            "Wait near the boarding point",
            "Listen for bus identification",
            "Board when the bus arrives and assistance is ready",
          ].map((instruction, index) => (
            <View
              key={instruction}
              style={styles.waitingInstructionRow}
              accessible
              accessibilityLabel={`Step ${index + 1} of 3. ${instruction}`}
            >
              <View
                style={[
                  styles.waitingInstructionNumber,
                  { backgroundColor: theme.colors.surfaceRaised },
                  { borderColor: theme.colors.borderStrong },
                ]}
              >
                <Text
                  style={[
                    styles.waitingInstructionNumberText,
                    { color: theme.colors.textPrimary },
                  ]}
                  accessible={false}
                >
                  {index + 1}
                </Text>
              </View>
              <Text
                style={[
                  styles.waitingInstructionText,
                  ...scaledTextStyle,
                  { color: theme.colors.textPrimary },
                ]}
                accessible={false}
              >
                {instruction}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.waitingActions}>
        <SecondaryButton
          label="Request ramp"
          icon={Accessibility}
          accessibilityHint={
            rampRequestUnavailable
              ? "This bus is not marked as wheelchair accessible."
              : rampStatus === "Not requested"
                ? "Send a wheelchair ramp request to this bus."
                : `Ramp request is ${rampStatus.toLowerCase()}.`
          }
          onPress={onRequestRamp}
          disabled={rampRequestDisabled}
          lightMode={lightMode}
          highContrast={highContrast}
        />
        <PrimaryButton
          label="I'm onboard"
          icon={BusFront}
          accessibilityHint="Enter onboard journey mode after you have safely boarded."
          onPress={onBoard}
          disabled={isLoading}
          lightMode={lightMode}
          highContrast={highContrast}
        />
      </View>
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
        <View
          style={[styles.boardingTimeHourHand, { backgroundColor: iconColor }]}
        />
        <View
          style={[
            styles.boardingTimeMinuteHand,
            { backgroundColor: iconColor },
          ]}
        />
      </View>
      <View
        style={[
          styles.boardingTimePlusHorizontal,
          { backgroundColor: iconColor },
        ]}
      />
      <View
        style={[
          styles.boardingTimePlusVertical,
          { backgroundColor: iconColor },
        ]}
      />
    </View>
  );
}

function AppearanceSwitch({
  themeMode,
  highContrast,
  largeText,
  onSelectMode,
}: {
  themeMode: AccessibilityPreferences["themeMode"];
  highContrast: boolean;
  largeText: boolean;
  onSelectMode: (themeMode: AccessibilityPreferences["themeMode"]) => void;
}) {
  const lightMode = themeMode === "light";
  const selectMode = (nextMode: AccessibilityPreferences["themeMode"]) => {
    if (nextMode !== themeMode) {
      onSelectMode(nextMode);
      AccessibilityInfo.announceForAccessibility(`${nextMode} mode selected.`);
    }
  };

  return (
    <View style={styles.appearanceTogglePanel}>
      <Text
        style={[
          styles.appearanceCompactLabel,
          largeText && styles.largeBody,
          lightMode && lightStyles.mutedText,
          highContrast && !lightMode && styles.highContrastMutedText,
          highContrast && lightMode && lightStyles.highContrastMutedText,
        ]}
      >
        Appearance
      </Text>
      <View
        style={[
          styles.appearanceIconToggle,
          lightMode && lightStyles.appearanceIconToggle,
          highContrast && !lightMode && styles.highContrastControl,
          highContrast && lightMode && lightStyles.highContrastControl,
        ]}
        accessible={false}
      >
        <AppearanceToggleOption
          mode="light"
          selected={lightMode}
          highContrast={highContrast}
          lightMode={lightMode}
          Icon={SunGlyph}
          onPress={() => selectMode("light")}
        />
        <AppearanceToggleOption
          mode="dark"
          selected={!lightMode}
          highContrast={highContrast}
          lightMode={lightMode}
          Icon={MoonGlyph}
          onPress={() => selectMode("dark")}
        />
      </View>
    </View>
  );
}

const appearanceModeIconSize = 34;

function AppearanceToggleOption({
  mode,
  selected,
  highContrast,
  lightMode,
  Icon,
  onPress,
}: {
  mode: AccessibilityPreferences["themeMode"];
  selected: boolean;
  highContrast: boolean;
  lightMode: boolean;
  Icon: LucideIcon;
  onPress: () => void;
}) {
  const theme = resolveVisualTheme(lightMode, highContrast);
  const appearanceSelectedSurface = theme.colors.selectedSurface;
  const appearanceSelectedIcon = theme.colors.iconSelected;
  const appearanceInactiveSurface = lightMode
    ? theme.colors.surfacePrimary
    : theme.colors.surfaceInteractive;
  const appearanceInactiveIcon = theme.colors.iconSecondary;
  const appearanceSelectedBorder = highContrast
    ? theme.colors.borderStrong
    : theme.colors.borderSelected;
  const appearanceInactiveBorder = highContrast
    ? theme.colors.borderStrong
    : theme.colors.borderDefault;
  const sunIcon = mode === "light";
  const label = sunIcon ? "Light mode" : "Dark mode";
  const iconColor =
    sunIcon && !highContrast
      ? selected
        ? lightMode
          ? "#FFE08A"
          : colors.warning
        : lightMode
          ? lightTheme.warning
          : colors.warning
      : selected
        ? appearanceSelectedIcon
        : appearanceInactiveIcon;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      accessibilityHint={`Sets the app appearance to ${mode} mode.`}
      onPress={onPress}
      style={[
        styles.appearanceIconButton,
        selected && styles.selectedAppearanceIconButton,
        {
          backgroundColor: selected
            ? appearanceSelectedSurface
            : appearanceInactiveSurface,
          borderColor: selected
            ? appearanceSelectedBorder
            : appearanceInactiveBorder,
          borderWidth: highContrast ? 3 : selected ? 2 : 1,
        },
      ]}
    >
      <View style={styles.appearanceIconContainer} accessible={false}>
        <Icon
          size={appearanceModeIconSize}
          color={iconColor}
          strokeWidth={highContrast ? 3 : 2.6}
        />
      </View>
    </Pressable>
  );
}

function AssistancePreferenceToggles({
  requirements,
  appPreferences,
  resolvedThemeMode,
  setRequirements,
}: {
  requirements: AccessibilityRequirements;
  appPreferences: AccessibilityPreferences;
  resolvedThemeMode: "light" | "dark";
  setRequirements: React.Dispatch<
    React.SetStateAction<AccessibilityRequirements>
  >;
}) {
  return (
    <>
      <ToggleRow
        label="Wheelchair ramp"
        description="Request a ramp before boarding."
        enabled={requirements.wheelchairRamp}
        highContrast={appPreferences.highContrast}
        largeText={isLargeText(appPreferences)}
        lightMode={resolvedThemeMode === "light"}
        variant="assistance"
        Icon={Accessibility}
        iconSize={30}
        illustrationSource={illustrations.wheelchairRamp}
        onPress={() =>
          setRequirements((current) => ({
            ...current,
            wheelchairRamp: !current.wheelchairRamp,
          }))
        }
      />
      <ToggleRow
        label="Extra boarding time"
        description="Ask the bus to wait a little longer while you board."
        enabled={requirements.extendedDwellTime}
        highContrast={appPreferences.highContrast}
        largeText={isLargeText(appPreferences)}
        lightMode={resolvedThemeMode === "light"}
        variant="assistance"
        Icon={Timer}
        iconSize={30}
        illustrationSource={illustrations.extraBoardingTime}
        onPress={() =>
          setRequirements((current) => ({
            ...current,
            extendedDwellTime: !current.extendedDwellTime,
          }))
        }
      />
      <ToggleRow
        label="Hear your bus"
        description="Have the approaching bus announce its service number."
        enabled={requirements.busAudioIdentification}
        highContrast={appPreferences.highContrast}
        largeText={isLargeText(appPreferences)}
        lightMode={resolvedThemeMode === "light"}
        variant="assistance"
        Icon={AudioLines}
        iconSize={30}
        illustrationSource={illustrations.audioIdentification}
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

function JourneyNextActionCard({
  action,
  simplified,
  plainLanguage,
  reduceMapDependence,
  lightMode,
  highContrast,
}: {
  action: JourneyNextAction;
  simplified: boolean;
  plainLanguage: boolean;
  reduceMapDependence: boolean;
  lightMode: boolean;
  highContrast: boolean;
}) {
  const runtimeAccessibility = useContext(AccessibilityRuntimeContext);
  const theme = resolveVisualTheme(lightMode, highContrast);
  const displayedTitle = plainLanguage
    ? action.title
    : `Next action: ${action.title}`;
  const displayedDetail = plainLanguage
    ? action.detail
    : `Current journey guidance: ${action.detail}`;
  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`Step ${action.step}. ${displayedTitle}. ${displayedDetail}`}
      style={[
        styles.nextActionCard,
        simplified && styles.simplifiedNextActionCard,
        lightMode && lightStyles.surface,
        lightMode && lightStyles.nextActionCard,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
      ]}
    >
      <View style={styles.nextActionHeader}>
        <View
          style={[
            styles.nextActionStepBadge,
            {
              backgroundColor: theme.colors.actionPrimary,
              borderColor: theme.colors.borderStrong,
            },
          ]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          <Text
            style={[
              styles.nextActionStepBadgeText,
              { color: theme.colors.actionPrimaryText },
            ]}
          >
            {action.step}
          </Text>
        </View>
        <Text
          style={[styles.nextActionEyebrow, lightMode && lightStyles.mutedText]}
        >
          {simplified ? `STEP ${action.step}` : "NEXT"}
        </Text>
      </View>
      <Text
        style={[
          styles.nextActionTitle,
          simplified && styles.simplifiedNextActionTitle,
          runtimeAccessibility.textSize !== "STANDARD" && styles.largeHeading,
          runtimeAccessibility.textSize === "EXTRA_LARGE" &&
            styles.extraLargeHeading,
          lightMode && lightStyles.text,
        ]}
      >
        {displayedTitle}
      </Text>
      <Text
        style={[
          styles.nextActionDetail,
          runtimeAccessibility.textSize !== "STANDARD" && styles.largeBody,
          runtimeAccessibility.textSize === "EXTRA_LARGE" &&
            styles.extraLargeBody,
          lightMode && lightStyles.bodyText,
        ]}
      >
        {displayedDetail}
      </Text>
      {reduceMapDependence ? (
        <Text
          style={[styles.nextActionTextStatus, lightMode && lightStyles.text]}
        >
          Text journey status is on. You can follow this instruction without
          reading the map.
        </Text>
      ) : null}
    </View>
  );
}

function AccessibilityPreferenceSummary({
  preferences,
  onEdit,
}: {
  preferences: AccessibilityPreferences;
  onEdit: () => void;
}) {
  const { width } = useWindowDimensions();
  const lightMode = preferences.themeMode === "light";
  const theme = resolveVisualTheme(lightMode, preferences.highContrast);
  const stack = shouldStackPreferenceSummary({
    width,
    textSize: preferences.textSize,
  });
  const highlights = [
    preferences.wheelchairAssistance ? "Wheelchair assistance" : null,
    preferences.wheelchairRouting ? "Wheelchair routing" : null,
    preferences.textSize === "EXTRA_LARGE"
      ? "Extra large text"
      : preferences.textSize === "LARGE"
        ? "Large text"
        : null,
    preferences.spokenGuidance ? "Spoken guidance" : null,
    preferences.visualJourneyAlerts ? "Visual alerts" : null,
    preferences.simplifiedJourney ? "Simplified journey" : null,
  ].filter((value): value is string => Boolean(value));
  return (
    <View
      style={[
        styles.preferenceSummaryCard,
        stack && styles.stackedPreferenceSummaryCard,
        lightMode && lightStyles.surface,
        preferences.highContrast &&
          (lightMode
            ? lightStyles.highContrastControl
            : styles.highContrastControl),
      ]}
      accessibilityLabel={`Accessibility preferences. ${highlights.slice(0, 3).join(", ") || "Standard settings"}.`}
    >
      <View style={styles.preferenceSummaryLead}>
        <View
          style={[
            styles.preferenceSummaryIcon,
            {
              backgroundColor: theme.colors.backgroundSecondary,
              borderColor: theme.colors.borderInteractive,
            },
          ]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          <Accessibility
            size={25}
            color={theme.colors.iconPrimary}
            strokeWidth={2.6}
          />
        </View>
        <View style={styles.preferenceCategoryCopy}>
          <Text
            style={[
              styles.summaryLabel,
              styles.preferenceSummaryLabel,
              lightMode && lightStyles.mutedText,
            ]}
          >
            Accessibility preferences
          </Text>
          <Text
            style={[
              styles.summaryValue,
              styles.preferenceSummaryValue,
              lightMode && lightStyles.text,
            ]}
          >
            {highlights.slice(0, 3).join(" · ") || "Standard settings"}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Edit accessibility preferences"
        onPress={onEdit}
        style={[
          styles.preferenceSummaryEdit,
          preferences.largerControls && styles.largerTertiaryControl,
        ]}
      >
        <View accessibilityElementsHidden importantForAccessibility="no">
          <SlidersHorizontal
            size={18}
            color={theme.colors.iconPrimary}
            strokeWidth={2.6}
          />
        </View>
        <Text
          style={[
            styles.preferenceSummaryEditText,
            lightMode && lightStyles.text,
          ]}
        >
          Edit
        </Text>
      </Pressable>
    </View>
  );
}

type AccessibilityPreviewResult = {
  haptic: boolean;
  spoken: boolean;
};

function accessibilitySectionSelectionCount(
  preferences: AccessibilityPreferences,
  section: AccessibilityPreferenceSection,
): number {
  if (section === "MOBILITY") {
    return [
      preferences.wheelchairAssistance,
      preferences.wheelchairRouting,
      preferences.avoidSteepSlopes,
      preferences.preferSmoothSurfaces,
      preferences.extraBoardingTime,
      preferences.alightingAssistance,
      preferences.preferAccessibleStops,
    ].filter(Boolean).length;
  }
  if (section === "VISION") {
    return [
      preferences.textSize !== "STANDARD",
      preferences.highContrast,
      preferences.spokenGuidance,
      preferences.audioBusIdentification,
      preferences.reduceMapDependence,
      preferences.screenReaderOptimised,
      preferences.repeatAudio,
    ].filter(Boolean).length;
  }
  if (section === "HEARING") {
    return [
      preferences.visualJourneyAlerts,
      preferences.vibrationAlerts !== "OFF",
      preferences.textAnnouncementEquivalent,
    ].filter(Boolean).length;
  }
  if (section === "JOURNEY_SUPPORT") {
    return [
      preferences.simplifiedJourney,
      preferences.alwaysShowNextAction,
      preferences.plainLanguage,
      preferences.confirmImportantActions,
      preferences.warnBusApproaching,
      preferences.warnBusArrives,
      preferences.warnTwoStopsBeforeDestination,
      preferences.warnDestinationNext,
    ].filter(Boolean).length;
  }
  return [
    preferences.largerControls,
    preferences.longerMessageDuration,
    preferences.reducedMotion,
  ].filter(Boolean).length;
}

type AccessibilitySettingDiscoveryItem = {
  keywords: string;
  label: string;
  section: AccessibilityPreferenceSection;
};

const accessibilitySettingDiscoveryItems: AccessibilitySettingDiscoveryItem[] =
  [
    {
      label: "Wheelchair assistance",
      section: "MOBILITY",
      keywords: "ramp mobility boarding help",
    },
    {
      label: "Extra boarding time",
      section: "MOBILITY",
      keywords: "wait dwell slow boarding",
    },
    {
      label: "Alighting assistance",
      section: "MOBILITY",
      keywords: "leave bus exit help",
    },
    {
      label: "Wheelchair-friendly routing",
      section: "MOBILITY",
      keywords: "accessible route mobility step free",
    },
    {
      label: "Avoid steps",
      section: "MOBILITY",
      keywords: "stairs step free route",
    },
    {
      label: "Avoid steep slopes",
      section: "MOBILITY",
      keywords: "incline hill route",
    },
    {
      label: "Prefer smooth surfaces",
      section: "MOBILITY",
      keywords: "paved path route",
    },
    {
      label: "Prefer accessible stops",
      section: "MOBILITY",
      keywords: "wheelchair bus stop route",
    },
    {
      label: "Text size",
      section: "VISION",
      keywords: "large extra large read display",
    },
    {
      label: "High contrast",
      section: "VISION",
      keywords: "colour color display visible",
    },
    {
      label: "Spoken guidance",
      section: "VISION",
      keywords: "speech voice audio directions",
    },
    {
      label: "Audio bus identification",
      section: "VISION",
      keywords: "hear announce service bus",
    },
    {
      label: "Reduce map dependence",
      section: "VISION",
      keywords: "text directions navigation",
    },
    {
      label: "Screen-reader optimised",
      section: "VISION",
      keywords: "talkback voiceover labels speech",
    },
    {
      label: "Repeat audio",
      section: "VISION",
      keywords: "replay speech announcement",
    },
    {
      label: "Visual journey alerts",
      section: "HEARING",
      keywords: "visible notifications hearing",
    },
    {
      label: "Vibration alerts",
      section: "HEARING",
      keywords: "haptic notification hearing",
    },
    {
      label: "Text announcement equivalents",
      section: "HEARING",
      keywords: "captions written speech hearing",
    },
    {
      label: "Simplified journey",
      section: "JOURNEY_SUPPORT",
      keywords: "simple cognitive next action",
    },
    {
      label: "Always show next action",
      section: "JOURNEY_SUPPORT",
      keywords: "instruction navigation guidance",
    },
    {
      label: "Plain language",
      section: "JOURNEY_SUPPORT",
      keywords: "simple cognitive instructions",
    },
    {
      label: "Confirm important actions",
      section: "JOURNEY_SUPPORT",
      keywords: "confirmation warning safety",
    },
    {
      label: "Bus approaching",
      section: "JOURNEY_SUPPORT",
      keywords: "arrival warning alert",
    },
    {
      label: "Bus arrives",
      section: "JOURNEY_SUPPORT",
      keywords: "arrival warning alert stop",
    },
    {
      label: "Two stops before destination",
      section: "JOURNEY_SUPPORT",
      keywords: "alight warning alert",
    },
    {
      label: "Destination is next",
      section: "JOURNEY_SUPPORT",
      keywords: "alight warning alert",
    },
    {
      label: "Larger controls",
      section: "INTERACTION",
      keywords: "buttons touch target motor dexterity",
    },
    {
      label: "Longer message duration",
      section: "INTERACTION",
      keywords: "timing status read cognitive",
    },
    {
      label: "Reduced motion",
      section: "INTERACTION",
      keywords: "animation movement vestibular",
    },
  ];

function AccessibilitySetupPreview({
  preferences,
  layoutPreferences,
  hapticsSupported,
  spokenGuidanceSupported,
  onPreview,
}: {
  preferences: AccessibilityPreferences;
  layoutPreferences: AccessibilityPreferences;
  hapticsSupported: boolean;
  spokenGuidanceSupported: boolean;
  onPreview: (
    preferences: AccessibilityPreferences,
  ) => AccessibilityPreviewResult;
}) {
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  const lightMode = preferences.themeMode === "light";
  const theme = resolveVisualTheme(lightMode, preferences.highContrast);
  const channels: Array<{
    enabled: boolean;
    icon: LucideIcon;
    label: string;
  }> = [
    {
      enabled:
        preferences.visualJourneyAlerts ||
        preferences.textAnnouncementEquivalent,
      icon: Eye,
      label: "Visual",
    },
    {
      enabled: preferences.spokenGuidance,
      icon: AudioLines,
      label: "Speech",
    },
    {
      enabled: preferences.vibrationAlerts !== "OFF",
      icon: Vibrate,
      label: "Vibration",
    },
  ];

  useEffect(() => {
    setPreviewStatus(null);
  }, [preferences]);

  return (
    <View
      style={[
        styles.accessibilityPreviewCard,
        {
          backgroundColor: theme.colors.backgroundSecondary,
          borderColor: theme.colors.borderInteractive,
        },
      ]}
    >
      <View style={styles.accessibilityPreviewHeader}>
        <FeatureGlyph
          icon={BellRing}
          lightMode={lightMode}
          highContrast={preferences.highContrast}
        />
        <View style={styles.preferencePresetCopy}>
          <Text
            style={[styles.preferencePresetText, lightMode && lightStyles.text]}
          >
            Try your setup
          </Text>
          <Text
            style={[
              styles.preferencePresetDescription,
              lightMode && lightStyles.mutedText,
            ]}
          >
            Preview your selected alerts before saving.
          </Text>
        </View>
      </View>
      <View
        style={[
          styles.accessibilityPreviewAlert,
          { backgroundColor: theme.colors.surfacePrimary },
        ]}
        accessible
        accessibilityLabel="Sample journey alert. Bus 95 arriving in 3 minutes."
      >
        <BusFront
          size={26}
          color={theme.colors.iconPrimary}
          strokeWidth={2.8}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <View style={styles.preferencePresetCopy}>
          <Text
            style={[
              styles.accessibilityPreviewEyebrow,
              lightMode && lightStyles.mutedText,
            ]}
          >
            Sample journey alert
          </Text>
          <Text
            style={[
              styles.accessibilityPreviewMessage,
              isLargeText(preferences) && styles.largeBody,
              preferences.textSize === "EXTRA_LARGE" && styles.extraLargeBody,
              lightMode && lightStyles.text,
            ]}
          >
            Bus 95 arriving in 3 minutes
          </Text>
        </View>
      </View>
      <View style={styles.accessibilityPreviewChannels}>
        {channels.map((channel) => {
          const ChannelIcon = channel.icon;
          return (
            <View
              key={channel.label}
              style={[
                styles.accessibilityPreviewChannel,
                {
                  backgroundColor: channel.enabled
                    ? theme.colors.selectedSurface
                    : theme.colors.surfacePrimary,
                  borderColor: channel.enabled
                    ? theme.colors.borderSelected
                    : theme.colors.borderDefault,
                },
              ]}
              accessibilityLabel={`${channel.label} ${channel.enabled ? "on" : "off"}`}
            >
              <ChannelIcon
                size={22}
                color={
                  channel.enabled
                    ? theme.colors.iconSelected
                    : theme.colors.iconSecondary
                }
                strokeWidth={2.8}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              {channel.enabled ? (
                <CheckCircle2
                  size={18}
                  color={theme.colors.iconSelected}
                  strokeWidth={3}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              ) : (
                <Circle
                  size={18}
                  color={theme.colors.iconSecondary}
                  strokeWidth={2.4}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              )}
              <Text
                style={[
                  styles.accessibilityPreviewChannelText,
                  lightMode && lightStyles.text,
                  channel.enabled && { color: theme.colors.textOnSelected },
                ]}
              >
                {channel.label}
              </Text>
            </View>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Play sample journey alert"
        accessibilityHint="Uses the visual, speech and vibration options currently selected"
        onPress={() => {
          const result = onPreview(preferences);
          const delivered = [
            "shown on screen",
            result.spoken ? "spoken" : null,
            result.haptic ? "vibrated" : null,
          ].filter((value): value is string => Boolean(value));
          const unavailable = [
            preferences.spokenGuidance &&
            !spokenGuidanceSupported &&
            !result.spoken
              ? "speech unavailable"
              : null,
            preferences.vibrationAlerts !== "OFF" &&
            !hapticsSupported &&
            !result.haptic
              ? "vibration unavailable"
              : null,
          ].filter((value): value is string => Boolean(value));
          setPreviewStatus(
            `Sample ${delivered.join(" · ")}${unavailable.length ? ` · ${unavailable.join(" · ")}` : ""}`,
          );
        }}
        style={[
          styles.accessibilityPreviewButton,
          { backgroundColor: theme.colors.actionPrimary },
          layoutPreferences.largerControls && styles.largerControl,
        ]}
      >
        <Volume2
          size={21}
          color={theme.colors.actionPrimaryText}
          strokeWidth={2.8}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text
          style={[
            styles.accessibilityPreviewButtonText,
            { color: theme.colors.actionPrimaryText },
          ]}
        >
          Play sample
        </Text>
      </Pressable>
      {previewStatus ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.accessibilityPreviewStatus,
            lightMode && lightStyles.mutedText,
          ]}
        >
          {previewStatus}
        </Text>
      ) : null}
    </View>
  );
}

function AccessibilityPreferencesOverview({
  preferences,
  layoutPreferences,
  hapticsSupported,
  spokenGuidanceSupported,
  expandedSection,
  setPreferences,
  onTogglePreset,
  onPreview,
  onSelectSection,
}: {
  preferences: AccessibilityPreferences;
  layoutPreferences: AccessibilityPreferences;
  hapticsSupported: boolean;
  spokenGuidanceSupported: boolean;
  expandedSection: AccessibilityPreferenceSection | null;
  setPreferences: React.Dispatch<
    React.SetStateAction<AccessibilityPreferences>
  >;
  onTogglePreset: (preset: AccessibilityPreset) => void;
  onPreview: (
    preferences: AccessibilityPreferences,
  ) => AccessibilityPreviewResult;
  onSelectSection: (section: AccessibilityPreferenceSection) => void;
}) {
  const { width } = useWindowDimensions();
  const runtimeAccessibility = useContext(AccessibilityRuntimeContext);
  const presetAnchorRefs = useRef<
    Partial<Record<AccessibilityPreset, View | null>>
  >({});
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [settingSearchQuery, setSettingSearchQuery] = useState("");
  const lightMode = preferences.themeMode === "light";
  const theme = resolveVisualTheme(lightMode, preferences.highContrast);
  const stackChoices = shouldStackAccessibilityChoices({
    width,
    textSize: layoutPreferences.textSize,
  });
  const presets: Array<{
    label: string;
    description: string;
    settingCount: number;
    icon: LucideIcon;
    value: AccessibilityPreset;
  }> = [
    {
      label: "Mobility support",
      description: "Ramp help, extra time and accessible routes",
      settingCount: 7,
      icon: Accessibility,
      value: "WHEELCHAIR",
    },
    {
      label: "Low-vision support",
      description: "Larger text, contrast and spoken guidance",
      settingCount: 5,
      icon: Eye,
      value: "LOW_VISION",
    },
    {
      label: "Hearing support",
      description: "Visual, vibration and written updates",
      settingCount: 3,
      icon: Ear,
      value: "HEARING_ASSISTANCE",
    },
    {
      label: "Simpler journeys",
      description: "Clear next actions and confirmations",
      settingCount: 4,
      icon: Route,
      value: "SIMPLIFIED_JOURNEY",
    },
  ];
  const sections: Array<{
    title: string;
    settingCount: number;
    selectedCount: number;
    icon: LucideIcon;
    value: AccessibilityPreferenceSection;
  }> = [
    {
      title: "Mobility",
      settingCount: 7,
      selectedCount: accessibilitySectionSelectionCount(
        preferences,
        "MOBILITY",
      ),
      icon: Accessibility,
      value: "MOBILITY",
    },
    {
      title: "Vision",
      settingCount: 7,
      selectedCount: accessibilitySectionSelectionCount(preferences, "VISION"),
      icon: Contrast,
      value: "VISION",
    },
    {
      title: "Hearing",
      settingCount: 3,
      selectedCount: accessibilitySectionSelectionCount(preferences, "HEARING"),
      icon: Ear,
      value: "HEARING",
    },
    {
      title: "Journey support",
      settingCount: 8,
      selectedCount: accessibilitySectionSelectionCount(
        preferences,
        "JOURNEY_SUPPORT",
      ),
      icon: Route,
      value: "JOURNEY_SUPPORT",
    },
    {
      title: "Interaction",
      settingCount: 3,
      selectedCount: accessibilitySectionSelectionCount(
        preferences,
        "INTERACTION",
      ),
      icon: Touchpad,
      value: "INTERACTION",
    },
  ];
  const selectedSection = sections.find(
    (section) => section.value === expandedSection,
  );
  const SelectedSectionIcon = selectedSection?.icon ?? Touchpad;
  const normalizedSettingSearch = settingSearchQuery.trim().toLowerCase();
  const matchingSettings = normalizedSettingSearch
    ? accessibilitySettingDiscoveryItems.filter((item) =>
        `${item.label} ${item.keywords}`
          .toLowerCase()
          .includes(normalizedSettingSearch),
      )
    : [];
  const visibleMatchingSettings = matchingSettings.slice(0, 6);
  const activeSettingCount = sections.reduce(
    (total, section) => total + section.selectedCount,
    0,
  );

  useEffect(() => {
    if (
      Platform.OS !== "web" ||
      typeof document === "undefined" ||
      typeof document.getElementById !== "function" ||
      typeof document.createElement !== "function" ||
      !document.head
    ) {
      return undefined;
    }

    const styleId = "goassist-settings-search-selection";
    const existingStyle = document.getElementById(styleId);
    const styleElement = existingStyle ?? document.createElement("style");
    styleElement.id = styleId;
    styleElement.textContent = `
      #accessibility-settings-search::selection {
        background-color: ${
          lightMode ? "rgba(7, 75, 106, 0.18)" : "rgba(163, 231, 239, 0.24)"
        } !important;
        color: inherit !important;
      }
    `;
    if (!existingStyle) {
      document.head.appendChild(styleElement);
    }

    return () => {
      if (!existingStyle) {
        styleElement.remove();
      }
    };
  }, [lightMode]);

  return (
    <View style={styles.preferenceOverview}>
      <View
        style={[
          styles.preferenceBulkActions,
          {
            backgroundColor: theme.colors.surfaceRaised,
            borderColor: theme.colors.borderDefault,
          },
        ]}
      >
        <View style={styles.preferenceBulkActionsHeader}>
          <FeatureGlyph
            icon={Settings}
            lightMode={lightMode}
            highContrast={preferences.highContrast}
          />
          <View style={styles.preferencePresetCopy}>
            <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>
              Settings groups
            </Text>
            <Text
              style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}
            >
              Turn related settings on or off together. You can still adjust
              each setting below.
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.preferencePresetGrid,
            stackChoices && styles.stackedPreferenceChoiceRow,
          ]}
        >
          {presets.map((preset) => {
            const selected = accessibilityPresetMatches(
              preferences,
              preset.value,
            );
            const PresetIcon = preset.icon;
            return (
              <Pressable
                key={preset.value}
                ref={(node) => {
                  presetAnchorRefs.current[preset.value] = node;
                }}
                accessibilityRole="button"
                accessibilityLabel={`${selected ? "Turn off" : "Turn on"} ${preset.label} group`}
                accessibilityHint={`${selected ? "Turns off" : "Turns on"} ${preset.settingCount} related settings: ${preset.description}. Settings used by another active group stay on.`}
                accessibilityState={{ selected }}
                accessibilityValue={{
                  text: selected
                    ? "On. Press to turn off"
                    : `Off. Press to turn on ${preset.settingCount} settings`,
                }}
                onPress={() => {
                  runtimeAccessibility.preserveViewport(
                    () => presetAnchorRefs.current[preset.value] ?? null,
                    () => {
                      onTogglePreset(preset.value);
                    },
                  );
                }}
                style={[
                  styles.preferencePresetButton,
                  lightMode && lightStyles.secondaryButton,
                  preferences.highContrast &&
                    (lightMode
                      ? lightStyles.highContrastControl
                      : styles.highContrastControl),
                  selected && {
                    backgroundColor: theme.colors.surfacePrimary,
                    borderColor: theme.colors.borderSelected,
                  },
                  layoutPreferences.largerControls && styles.largerControl,
                  stackChoices && styles.stackedPreferencePresetButton,
                ]}
              >
                <View style={styles.preferencePresetMain}>
                  <FeatureGlyph
                    icon={PresetIcon}
                    lightMode={lightMode}
                    highContrast={preferences.highContrast}
                    selected={selected}
                    size="large"
                  />
                  <View style={styles.preferencePresetCopy}>
                    <Text
                      style={[
                        styles.preferencePresetText,
                        lightMode && lightStyles.text,
                      ]}
                    >
                      {preset.label}
                    </Text>
                    <Text
                      style={[
                        styles.preferencePresetDescription,
                        lightMode && lightStyles.mutedText,
                      ]}
                    >
                      {preset.description}
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.preferencePresetAction,
                    {
                      backgroundColor: selected
                        ? theme.colors.actionPrimary
                        : theme.colors.actionSecondary,
                    },
                  ]}
                >
                  {selected ? (
                    <BadgeCheck
                      size={16}
                      color={theme.colors.actionPrimaryText}
                      strokeWidth={2.8}
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.preferencePresetActionText,
                      {
                        color: selected
                          ? theme.colors.actionPrimaryText
                          : theme.colors.textPrimary,
                      },
                    ]}
                  >
                    {selected ? "Turn off" : `Turn on ${preset.settingCount}`}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.preferenceCustomizeHeader}>
        <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>
          Customize settings
        </Text>
        <Text style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}>
          {activeSettingCount} settings on · Search or browse by need.
        </Text>
      </View>
      <View
        testID="accessibility-settings-search-field"
        style={[
          styles.preferenceSearchField,
          isLargeText(layoutPreferences) && styles.largePreferenceSearchField,
          layoutPreferences.textSize === "EXTRA_LARGE" &&
            styles.extraLargePreferenceSearchField,
          {
            backgroundColor: theme.colors.surfacePrimary,
            borderColor: theme.colors.borderInteractive,
          },
          preferences.highContrast &&
            (lightMode
              ? lightStyles.highContrastControl
              : styles.highContrastControl),
        ]}
      >
        <Search
          size={22}
          color={theme.colors.iconPrimary}
          strokeWidth={2.6}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <TextInput
          accessibilityLabel="Find an accessibility setting"
          autoCapitalize="none"
          autoCorrect={false}
          nativeID="accessibility-settings-search"
          onChangeText={setSettingSearchQuery}
          placeholder="Find a setting"
          placeholderTextColor={theme.colors.textSecondary}
          returnKeyType="search"
          selectionColor={
            lightMode ? "rgba(7, 75, 106, 0.22)" : "rgba(163, 231, 239, 0.24)"
          }
          style={[
            styles.preferenceSearchInput,
            { color: theme.colors.textPrimary },
            isLargeText(layoutPreferences) && styles.largeBody,
            layoutPreferences.textSize === "EXTRA_LARGE" &&
              styles.extraLargeBody,
          ]}
          value={settingSearchQuery}
        />
        {settingSearchQuery ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear settings search"
            onPress={() => setSettingSearchQuery("")}
            style={styles.preferenceSearchClear}
          >
            <CircleX
              size={22}
              color={theme.colors.iconPrimary}
              strokeWidth={2.6}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </Pressable>
        ) : null}
      </View>
      {normalizedSettingSearch ? (
        <View
          style={[
            styles.preferenceSearchResults,
            {
              backgroundColor: theme.colors.surfacePrimary,
              borderColor: theme.colors.borderDefault,
            },
          ]}
        >
          <View
            style={[
              styles.preferenceSearchResultsHeader,
              { backgroundColor: theme.colors.backgroundSecondary },
            ]}
          >
            <Text
              accessibilityRole="header"
              style={[
                styles.preferenceSearchResultsTitle,
                lightMode && lightStyles.text,
              ]}
            >
              {matchingSettings.length
                ? `${matchingSettings.length} ${matchingSettings.length === 1 ? "match" : "matches"}`
                : "No matches"}
            </Text>
            {matchingSettings.length > visibleMatchingSettings.length ? (
              <Text
                style={[
                  styles.preferenceCategoryCount,
                  lightMode && lightStyles.mutedText,
                ]}
              >
                Refine your search
              </Text>
            ) : null}
          </View>
          {visibleMatchingSettings.map((item) => {
            const itemSection = sections.find(
              (section) => section.value === item.section,
            );
            const ItemIcon = itemSection?.icon ?? SlidersHorizontal;
            return (
              <Pressable
                key={`${item.section}-${item.label}`}
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.label} in ${itemSection?.title ?? "accessibility"} settings`}
                accessibilityHint="Opens the category containing this setting"
                onPress={() => {
                  onSelectSection(item.section);
                  setSettingSearchQuery("");
                  AccessibilityInfo.announceForAccessibility(
                    `${item.label}. ${itemSection?.title ?? "Accessibility"} settings opened.`,
                  );
                }}
                style={[
                  styles.preferenceSearchResult,
                  { borderBottomColor: theme.colors.borderDefault },
                  layoutPreferences.largerControls && styles.largerControl,
                ]}
              >
                <FeatureGlyph
                  icon={ItemIcon}
                  lightMode={lightMode}
                  highContrast={preferences.highContrast}
                  size="small"
                />
                <View style={styles.preferenceSearchResultCopy}>
                  <Text
                    style={[
                      styles.preferenceSearchResultLabel,
                      lightMode && lightStyles.text,
                    ]}
                  >
                    {item.label}
                  </Text>
                  <Text
                    style={[
                      styles.preferenceSearchResultCategory,
                      lightMode && lightStyles.mutedText,
                    ]}
                  >
                    {itemSection?.title}
                  </Text>
                </View>
                <ArrowRight
                  size={21}
                  color={theme.colors.iconPrimary}
                  strokeWidth={2.6}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              </Pressable>
            );
          })}
          {!matchingSettings.length ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[
                styles.preferenceSearchEmptyText,
                lightMode && lightStyles.mutedText,
              ]}
            >
              Try another word or browse the categories below.
            </Text>
          ) : null}
        </View>
      ) : null}
      <Text
        style={[
          styles.preferenceBrowseLabel,
          lightMode && lightStyles.mutedText,
        ]}
      >
        Browse by need
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Settings category. ${selectedSection?.title ?? "Choose a category"}`}
        accessibilityHint="Opens the settings category menu"
        accessibilityState={{ expanded: categoryMenuOpen }}
        onPress={() => setCategoryMenuOpen(true)}
        style={[
          styles.preferenceCategoryDropdown,
          {
            backgroundColor: theme.colors.surfacePrimary,
            borderColor: theme.colors.borderInteractive,
          },
          preferences.highContrast &&
            (lightMode
              ? lightStyles.highContrastControl
              : styles.highContrastControl),
          layoutPreferences.largerControls && styles.largerControl,
        ]}
      >
        <FeatureGlyph
          icon={SelectedSectionIcon}
          lightMode={lightMode}
          highContrast={preferences.highContrast}
        />
        <View style={styles.preferenceCategoryCopy}>
          <Text
            style={[
              styles.preferenceCategoryDropdownLabel,
              lightMode && lightStyles.mutedText,
            ]}
          >
            Settings category
          </Text>
          <Text
            style={[
              styles.preferenceCategoryTitle,
              isLargeText(layoutPreferences) && styles.largeBody,
              layoutPreferences.textSize === "EXTRA_LARGE" &&
                styles.extraLargeBody,
              lightMode && lightStyles.text,
            ]}
          >
            {selectedSection?.title ?? "Choose a category"}
          </Text>
        </View>
        {selectedSection ? (
          <Text
            style={[
              styles.preferenceCategoryCount,
              lightMode && lightStyles.mutedText,
            ]}
          >
            {selectedSection.selectedCount} of {selectedSection.settingCount} on
          </Text>
        ) : null}
        <ChevronDown
          accessibilityElementsHidden
          importantForAccessibility="no"
          color={theme.colors.iconPrimary}
          size={23}
          style={categoryMenuOpen && styles.expandedPreferenceCategoryChevron}
        />
      </Pressable>
      <Modal
        animationType={preferences.reducedMotion ? "none" : "fade"}
        onRequestClose={() => setCategoryMenuOpen(false)}
        transparent
        visible={categoryMenuOpen}
      >
        <View style={styles.preferenceCategoryMenuOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close settings category menu"
            onPress={() => setCategoryMenuOpen(false)}
            style={styles.preferenceCategoryMenuBackdrop}
          />
          <View
            accessibilityViewIsModal
            style={[
              styles.preferenceCategoryMenu,
              {
                backgroundColor: theme.colors.surfacePrimary,
                borderColor: theme.colors.borderStrong,
              },
              preferences.highContrast &&
                (lightMode
                  ? lightStyles.highContrastControl
                  : styles.highContrastControl),
            ]}
          >
            <View style={styles.preferenceCategoryMenuHeader}>
              <View style={styles.preferenceCategoryCopy}>
                <Text
                  accessibilityRole="header"
                  style={[
                    styles.preferenceCategoryMenuTitle,
                    lightMode && lightStyles.text,
                  ]}
                >
                  Choose settings category
                </Text>
                <Text
                  style={[
                    styles.preferencePresetDescription,
                    lightMode && lightStyles.mutedText,
                  ]}
                >
                  Your selections remain unchanged.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close settings category menu"
                onPress={() => setCategoryMenuOpen(false)}
                style={styles.preferenceCategoryMenuClose}
              >
                <CircleX
                  size={25}
                  color={theme.colors.iconPrimary}
                  strokeWidth={2.6}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              </Pressable>
            </View>
            <View style={styles.preferenceCategoryMenuList}>
              {sections.map((section) => {
                const selected = expandedSection === section.value;
                const CategoryIcon = section.icon;
                return (
                  <Pressable
                    key={section.value}
                    accessibilityRole="button"
                    accessibilityLabel={`${section.title} accessibility settings`}
                    accessibilityHint={`Shows ${section.settingCount} settings`}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      onSelectSection(section.value);
                      setCategoryMenuOpen(false);
                      AccessibilityInfo.announceForAccessibility(
                        `${section.title} settings opened.`,
                      );
                    }}
                    style={[
                      styles.preferenceCategoryMenuItem,
                      {
                        backgroundColor: selected
                          ? theme.colors.selectedSurface
                          : theme.colors.surfacePrimary,
                        borderColor: selected
                          ? theme.colors.borderSelected
                          : theme.colors.borderDefault,
                      },
                      layoutPreferences.largerControls && styles.largerControl,
                    ]}
                  >
                    <FeatureGlyph
                      icon={CategoryIcon}
                      lightMode={lightMode}
                      highContrast={preferences.highContrast}
                      selected={selected}
                    />
                    <Text
                      style={[
                        styles.preferenceCategoryTitle,
                        lightMode && lightStyles.text,
                        selected && { color: theme.colors.textOnSelected },
                      ]}
                    >
                      {section.title}
                    </Text>
                    <Text
                      style={[
                        styles.preferenceCategoryCount,
                        lightMode && lightStyles.mutedText,
                        selected && { color: theme.colors.textOnSelected },
                      ]}
                    >
                      {section.selectedCount} of {section.settingCount} on
                    </Text>
                    {selected ? (
                      <CheckCircle2
                        size={23}
                        color={theme.colors.iconSelected}
                        strokeWidth={3}
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
      {selectedSection ? (
        <View
          style={[
            styles.preferenceSelectedCategory,
            {
              backgroundColor: theme.colors.surfacePrimary,
              borderColor: theme.colors.borderDefault,
            },
            preferences.highContrast &&
              (lightMode
                ? lightStyles.highContrastControl
                : styles.highContrastControl),
          ]}
        >
          <View
            testID="accessibility-settings-category-header"
            style={[
              styles.preferenceSelectedCategoryHeader,
              {
                backgroundColor: theme.colors.backgroundSecondary,
                borderBottomColor: theme.colors.borderDefault,
              },
            ]}
          >
            <FeatureGlyph
              icon={SelectedSectionIcon}
              lightMode={lightMode}
              highContrast={preferences.highContrast}
              size="large"
            />
            <View style={styles.preferenceSelectedCategoryTitleBlock}>
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no"
                style={[
                  styles.preferenceSelectedCategoryEyebrow,
                  lightMode && lightStyles.mutedText,
                ]}
              >
                Customize category
              </Text>
              <Text
                accessibilityRole="header"
                style={[
                  styles.preferenceSelectedCategoryTitle,
                  lightMode && lightStyles.text,
                ]}
              >
                {selectedSection.title} settings
              </Text>
            </View>
          </View>
          <AccessibilityCategorySettings
            section={selectedSection.value}
            preferences={preferences}
            layoutPreferences={layoutPreferences}
            hapticsSupported={hapticsSupported}
            setPreferences={setPreferences}
          />
        </View>
      ) : (
        <Text
          style={[
            styles.preferenceCategoryEmptyText,
            lightMode && lightStyles.mutedText,
          ]}
        >
          Select a category to customize its settings.
        </Text>
      )}
      <AccessibilitySetupPreview
        preferences={preferences}
        layoutPreferences={layoutPreferences}
        hapticsSupported={hapticsSupported}
        spokenGuidanceSupported={spokenGuidanceSupported}
        onPreview={onPreview}
      />
    </View>
  );
}

type BooleanAccessibilityPreference = Exclude<
  keyof AccessibilityPreferences,
  | "assistantLocale"
  | "assistantDiagnosticsConsent"
  | "textSize"
  | "vibrationAlerts"
  | "themeMode"
>;

const accessibilityFeatureIcons: Record<
  BooleanAccessibilityPreference,
  LucideIcon
> = {
  wheelchairAssistance: Accessibility,
  wheelchairRouting: Route,
  avoidSteepSlopes: Mountain,
  preferSmoothSurfaces: Footprints,
  extraBoardingTime: Timer,
  alightingAssistance: DoorOpen,
  preferAccessibleStops: MapPinCheck,
  highContrast: Contrast,
  spokenGuidance: AudioLines,
  audioBusIdentification: BusFront,
  reduceMapDependence: MessageSquareText,
  screenReaderOptimised: ScanText,
  visualJourneyAlerts: BellRing,
  textAnnouncementEquivalent: Captions,
  simplifiedJourney: Route,
  alwaysShowNextAction: Navigation,
  plainLanguage: Languages,
  confirmImportantActions: ShieldCheck,
  largerControls: Touchpad,
  longerMessageDuration: Timer,
  reducedMotion: Gauge,
  warnBusApproaching: BusFront,
  warnBusArrives: MapPinCheck,
  warnTwoStopsBeforeDestination: BellRing,
  warnDestinationNext: MapPinCheck,
  repeatAudio: Volume2,
};

function CompactPreferenceRow({
  label,
  description,
  icon: FeatureIcon,
  enabled,
  disabled = false,
  nested = false,
  preferences,
  layoutPreferences,
  onPress,
}: {
  label: string;
  description: string;
  icon: LucideIcon;
  enabled: boolean;
  disabled?: boolean;
  nested?: boolean;
  preferences: AccessibilityPreferences;
  layoutPreferences: AccessibilityPreferences;
  onPress: () => void;
}) {
  const runtimeAccessibility = useContext(AccessibilityRuntimeContext);
  const rowAnchorRef = useRef<View | null>(null);
  const [detailsPinned, setDetailsPinned] = useState(false);
  const [detailsHovered, setDetailsHovered] = useState(false);
  const detailsVisible = detailsPinned || detailsHovered;
  const lightMode = preferences.themeMode === "light";
  const theme = resolveVisualTheme(lightMode, preferences.highContrast);

  function handleToggle() {
    if (disabled) return;
    runtimeAccessibility.preserveViewport(
      () => rowAnchorRef.current,
      () => {
        onPress();
        AccessibilityInfo.announceForAccessibility(
          `${label} turned ${enabled ? "off" : "on"}.`,
        );
      },
    );
  }

  return (
    <View
      ref={rowAnchorRef}
      style={[
        styles.preferenceChecklistItem,
        nested && styles.nestedPreferenceChecklistItem,
        {
          backgroundColor:
            enabled && !disabled
              ? theme.colors.selectedSurface
              : theme.colors.surfacePrimary,
          borderBottomColor: theme.colors.borderDefault,
        },
      ]}
    >
      <View style={styles.preferenceChecklistMain}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={label}
          accessibilityHint={description}
          accessibilityState={{ checked: enabled, disabled }}
          disabled={disabled}
          onPress={handleToggle}
          style={[
            styles.preferenceChecklistToggle,
            disabled && styles.disabledPreferenceControl,
            layoutPreferences.largerControls && styles.largerChecklistControl,
          ]}
        >
          <FeatureGlyph
            icon={FeatureIcon}
            lightMode={lightMode}
            highContrast={preferences.highContrast}
            selected={enabled && !disabled}
          />
          <Text
            style={[
              styles.preferenceChecklistLabel,
              isLargeText(layoutPreferences) && styles.largeBody,
              layoutPreferences.textSize === "EXTRA_LARGE" &&
                styles.extraLargeBody,
              lightMode && lightStyles.text,
              enabled && !disabled && { color: theme.colors.textOnSelected },
            ]}
          >
            {label}
          </Text>
          {enabled ? (
            <CheckCircle2
              size={30}
              color={
                disabled
                  ? theme.colors.iconSecondary
                  : theme.colors.iconSelected
              }
              strokeWidth={preferences.highContrast ? 3.2 : 2.8}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          ) : (
            <Circle
              size={29}
              color={theme.colors.iconSecondary}
              strokeWidth={preferences.highContrast ? 3 : 2.4}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`About ${label}`}
          accessibilityHint={`${detailsVisible ? "Hide" : "Show"} a short description`}
          accessibilityState={{ expanded: detailsVisible }}
          onPress={() => setDetailsPinned((current) => !current)}
          onHoverIn={() => setDetailsHovered(true)}
          onHoverOut={() => setDetailsHovered(false)}
          style={[
            styles.preferenceDetailsButton,
            detailsVisible && {
              backgroundColor: theme.colors.actionSecondary,
            },
          ]}
        >
          <CircleHelp
            size={24}
            color={
              detailsVisible
                ? theme.colors.iconPrimary
                : enabled && !disabled
                  ? theme.colors.iconSelected
                  : theme.colors.iconPrimary
            }
            strokeWidth={2.5}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </Pressable>
      </View>
      {detailsVisible ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.preferenceChecklistDescription,
            lightMode && lightStyles.mutedText,
          ]}
        >
          {description}
        </Text>
      ) : null}
    </View>
  );
}

function AccessibilityCategorySettings({
  section,
  preferences,
  layoutPreferences,
  hapticsSupported,
  setPreferences,
}: {
  section: AccessibilityPreferenceSection;
  preferences: AccessibilityPreferences;
  layoutPreferences: AccessibilityPreferences;
  hapticsSupported: boolean;
  setPreferences: React.Dispatch<
    React.SetStateAction<AccessibilityPreferences>
  >;
}) {
  const toggle = (key: BooleanAccessibilityPreference) =>
    setPreferences((current) => ({ ...current, [key]: !current[key] }));
  const row = (
    key: BooleanAccessibilityPreference,
    label: string,
    description: string,
    disabled = false,
    nested = false,
  ) => (
    <CompactPreferenceRow
      key={key}
      label={label}
      description={description}
      icon={accessibilityFeatureIcons[key]}
      enabled={preferences[key]}
      disabled={disabled}
      nested={nested}
      preferences={preferences}
      layoutPreferences={layoutPreferences}
      onPress={() => toggle(key)}
    />
  );

  return (
    <View style={styles.preferenceCategorySettings}>
      {section === "MOBILITY" && (
        <>
          <CompactPreferenceRow
            label="Wheelchair assistance"
            description="Request ramp support when boarding"
            icon={Accessibility}
            enabled={preferences.wheelchairAssistance}
            preferences={preferences}
            layoutPreferences={layoutPreferences}
            onPress={() => toggle("wheelchairAssistance")}
          />
          {row(
            "extraBoardingTime",
            "Extra boarding time",
            "Ask the bus to wait longer while you board",
          )}
          {row(
            "alightingAssistance",
            "Alighting assistance",
            "Show help and prompts before you leave the bus",
          )}
          <PreferenceSectionHeading
            label="Accessible routing"
            accessibilityLabel="Accessible routing options"
            settingCount={4}
            preferences={preferences}
          />
          <View>
            {row(
              "wheelchairRouting",
              "Wheelchair-friendly routing",
              "Use step-free walking routes. Avoiding steps is included",
            )}
            {row(
              "avoidSteepSlopes",
              "Avoid steep slopes",
              "Prefer routes without mapped inclines above six percent",
              false,
              true,
            )}
            {row(
              "preferSmoothSurfaces",
              "Prefer smooth surfaces",
              "Prefer mapped paved and smooth paths",
              false,
              true,
            )}
            {row(
              "preferAccessibleStops",
              "Prefer accessible stops",
              "Rank accessible nearby stops more highly",
              false,
              true,
            )}
          </View>
        </>
      )}
      {section === "VISION" && (
        <>
          <TextSizeSelector
            preferences={preferences}
            layoutPreferences={layoutPreferences}
            setPreferences={setPreferences}
          />
          {row(
            "highContrast",
            "High contrast",
            "Use stronger contrast for alerts and controls",
          )}
          {row(
            "spokenGuidance",
            "Spoken guidance",
            "Speak walking, bus and destination updates",
          )}
          {row(
            "audioBusIdentification",
            "Audio bus identification",
            "Announce the approaching bus service",
          )}
          {row(
            "reduceMapDependence",
            "Reduce map dependence",
            "Keep route status and next actions available as text",
          )}
          {row(
            "screenReaderOptimised",
            "Screen-reader optimised",
            "Use descriptive labels and announcements",
          )}
          {row(
            "repeatAudio",
            "Repeat audio",
            "Keep repeat controls ready for spoken guidance",
          )}
        </>
      )}
      {section === "HEARING" && (
        <>
          {row(
            "visualJourneyAlerts",
            "Visual journey alerts",
            "Show approaching bus and destination warnings on screen",
          )}
          <VibrationAlertSelector
            supported={hapticsSupported}
            preferences={preferences}
            layoutPreferences={layoutPreferences}
            setPreferences={setPreferences}
          />
          {row(
            "textAnnouncementEquivalent",
            "Text announcement equivalents",
            "Show written text for spoken guidance",
          )}
        </>
      )}
      {section === "JOURNEY_SUPPORT" && (
        <>
          {row(
            "simplifiedJourney",
            "Simplified journey",
            "Keep one prominent next action visible",
          )}
          {row(
            "alwaysShowNextAction",
            "Always show next action",
            "Keep the current journey instruction near the top",
          )}
          {row(
            "plainLanguage",
            "Plain language",
            "Use short direct journey instructions",
          )}
          {row(
            "confirmImportantActions",
            "Confirm important actions",
            "Confirm cancellation, destination changes and journey ending",
          )}
          <PreferenceSectionHeading
            label="Journey warnings"
            settingCount={4}
            preferences={preferences}
          />
          {row(
            "warnBusApproaching",
            "Bus approaching",
            "Warn when your selected bus is close",
          )}
          {row(
            "warnBusArrives",
            "Bus arrives",
            "Warn when your selected bus reaches the stop",
          )}
          {row(
            "warnTwoStopsBeforeDestination",
            "Two stops before destination",
            "Warn two stops before you need to alight",
          )}
          {row(
            "warnDestinationNext",
            "Destination is next",
            "Warn when the next stop is your destination",
          )}
        </>
      )}
      {section === "INTERACTION" && (
        <>
          {row(
            "largerControls",
            "Larger controls",
            "Increase shared button and preference touch targets",
          )}
          {row(
            "longerMessageDuration",
            "Longer message duration",
            "Keep temporary status messages visible longer",
          )}
          {row(
            "reducedMotion",
            "Reduced motion",
            "Reduce map and interface animation",
          )}
        </>
      )}
    </View>
  );
}

function PreferenceSectionHeading({
  label,
  accessibilityLabel,
  settingCount,
  preferences,
}: {
  label: string;
  accessibilityLabel?: string;
  settingCount: number;
  preferences: AccessibilityPreferences;
}) {
  const lightMode = preferences.themeMode === "light";
  const theme = resolveVisualTheme(lightMode, preferences.highContrast);

  return (
    <View
      testID={`preference-section-${label.toLowerCase().replace(/\s+/g, "-")}`}
      accessible
      accessibilityRole="header"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.preferenceSectionHeadingContainer,
        {
          backgroundColor: theme.colors.backgroundSecondary,
          borderColor: theme.colors.borderDefault,
        },
      ]}
    >
      <View style={styles.preferenceSectionHeadingCopy}>
        <Text
          style={[
            styles.preferenceSectionHeadingEyebrow,
            lightMode && lightStyles.mutedText,
          ]}
        >
          Setting group
        </Text>
        <Text
          style={[
            styles.preferenceSectionHeading,
            lightMode && lightStyles.text,
          ]}
        >
          {label}
        </Text>
      </View>
      <View
        style={[
          styles.preferenceGroupCountPill,
          { backgroundColor: theme.colors.actionSecondary },
        ]}
      >
        <Text
          style={[
            styles.preferenceGroupCount,
            lightMode && lightStyles.mutedText,
          ]}
        >
          {settingCount} settings
        </Text>
      </View>
    </View>
  );
}

function CompactPreferenceChoice({
  label,
  description,
  icon: ChoiceIcon,
  choices,
  value,
  accessibilitySuffix,
  disabled = false,
  preferences,
  layoutPreferences,
  onChange,
}: {
  label: string;
  description: string;
  icon: LucideIcon;
  choices: Array<{ label: string; value: string }>;
  value: string;
  accessibilitySuffix: string;
  disabled?: boolean;
  preferences: AccessibilityPreferences;
  layoutPreferences: AccessibilityPreferences;
  onChange: (value: string) => void;
}) {
  const { width } = useWindowDimensions();
  const runtimeAccessibility = useContext(AccessibilityRuntimeContext);
  const choiceAnchorRef = useRef<View | null>(null);
  const [detailsPinned, setDetailsPinned] = useState(false);
  const [detailsHovered, setDetailsHovered] = useState(false);
  const detailsVisible = detailsPinned || detailsHovered;
  const lightMode = preferences.themeMode === "light";
  const theme = resolveVisualTheme(lightMode, preferences.highContrast);

  return (
    <View
      ref={choiceAnchorRef}
      style={[
        styles.preferenceChoiceChecklistItem,
        {
          backgroundColor: theme.colors.surfacePrimary,
          borderBottomColor: theme.colors.borderDefault,
        },
      ]}
    >
      <View style={styles.preferenceChoiceChecklistHeader}>
        <FeatureGlyph
          icon={ChoiceIcon}
          lightMode={lightMode}
          highContrast={preferences.highContrast}
        />
        <View style={styles.preferenceChoiceLabelBlock}>
          <Text
            style={[
              styles.preferenceChecklistLabel,
              isLargeText(layoutPreferences) && styles.largeBody,
              layoutPreferences.textSize === "EXTRA_LARGE" &&
                styles.extraLargeBody,
              lightMode && lightStyles.text,
            ]}
          >
            {label}
          </Text>
          <Text
            style={[
              styles.preferenceChoiceType,
              lightMode && lightStyles.mutedText,
            ]}
          >
            Choose one
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`About ${label}`}
          accessibilityHint={`${detailsVisible ? "Hide" : "Show"} a short description`}
          accessibilityState={{ expanded: detailsVisible }}
          onPress={() => setDetailsPinned((current) => !current)}
          onHoverIn={() => setDetailsHovered(true)}
          onHoverOut={() => setDetailsHovered(false)}
          style={[
            styles.preferenceDetailsButton,
            detailsVisible && {
              backgroundColor: theme.colors.actionSecondary,
            },
          ]}
        >
          <CircleHelp
            size={24}
            color={theme.colors.iconPrimary}
            strokeWidth={2.5}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </Pressable>
      </View>
      {detailsVisible ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.preferenceChecklistDescription,
            lightMode && lightStyles.mutedText,
          ]}
        >
          {description}
        </Text>
      ) : null}
      <View
        style={[
          styles.preferenceChoiceRow,
          shouldStackAccessibilityChoices({
            width,
            textSize: layoutPreferences.textSize,
          }) && styles.stackedPreferenceChoiceRow,
        ]}
      >
        {choices.map((choice) => {
          const selected = value === choice.value;
          return (
            <Pressable
              key={choice.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              accessibilityLabel={`${choice.label} ${accessibilitySuffix}`}
              disabled={disabled}
              onPress={() =>
                runtimeAccessibility.preserveViewport(
                  () => choiceAnchorRef.current,
                  () => onChange(choice.value),
                )
              }
              style={[
                styles.preferenceChoiceButton,
                lightMode && lightStyles.secondaryButton,
                selected && styles.selectedPreferenceChoice,
                disabled && styles.disabledButton,
              ]}
            >
              <Text
                style={[
                  styles.preferenceChoiceText,
                  lightMode && lightStyles.text,
                  selected && styles.selectedPreferenceChoiceText,
                ]}
              >
                {choice.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TextSizeSelector({
  preferences,
  layoutPreferences,
  setPreferences,
}: {
  preferences: AccessibilityPreferences;
  layoutPreferences: AccessibilityPreferences;
  setPreferences: React.Dispatch<
    React.SetStateAction<AccessibilityPreferences>
  >;
}) {
  const sizes: Array<{ label: string; value: AccessibilityTextSize }> = [
    { label: "Standard", value: "STANDARD" },
    { label: "Large", value: "LARGE" },
    { label: "Extra large", value: "EXTRA_LARGE" },
  ];
  const lightMode = preferences.themeMode === "light";
  const theme = resolveVisualTheme(lightMode, preferences.highContrast);
  const previewScale = textSizeScale(preferences.textSize);
  const selectedSizeLabel =
    sizes.find((size) => size.value === preferences.textSize)?.label ??
    "Standard";

  return (
    <>
      <CompactPreferenceChoice
        label="Text size"
        description="Changes the text size throughout the app."
        icon={Type}
        choices={sizes}
        value={preferences.textSize}
        accessibilitySuffix="text"
        preferences={preferences}
        layoutPreferences={layoutPreferences}
        onChange={(value) =>
          setPreferences((current) => ({
            ...current,
            textSize: value as AccessibilityTextSize,
          }))
        }
      />
      <View
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Text size preview. ${selectedSizeLabel}. Next bus in 4 minutes. Applies after saving.`}
        style={[
          styles.textSizePreview,
          {
            backgroundColor: theme.colors.backgroundSecondary,
            borderBottomColor: theme.colors.borderDefault,
          },
        ]}
      >
        <Text
          style={[
            styles.textSizePreviewEyebrow,
            lightMode && lightStyles.mutedText,
          ]}
        >
          Live preview · {selectedSizeLabel}
        </Text>
        <Text
          testID="text-size-live-preview"
          style={[
            styles.textSizePreviewText,
            {
              color: theme.colors.textPrimary,
              fontSize: Math.round(18 * previewScale),
              lineHeight: Math.round(24 * previewScale),
            },
          ]}
        >
          Next bus in 4 minutes
        </Text>
        <Text
          style={[
            styles.textSizePreviewNote,
            lightMode && lightStyles.mutedText,
          ]}
        >
          Applies across the app after saving.
        </Text>
      </View>
    </>
  );
}

function VibrationAlertSelector({
  supported,
  preferences,
  layoutPreferences,
  setPreferences,
}: {
  supported: boolean;
  preferences: AccessibilityPreferences;
  layoutPreferences: AccessibilityPreferences;
  setPreferences: React.Dispatch<
    React.SetStateAction<AccessibilityPreferences>
  >;
}) {
  const modes: Array<{ label: string; value: VibrationAlertMode }> = [
    { label: "Off", value: "OFF" },
    { label: "Important", value: "IMPORTANT" },
    { label: "All guidance", value: "ALL" },
  ];
  return (
    <CompactPreferenceChoice
      label="Vibration alerts"
      description={
        supported
          ? "Choose which journey updates should vibrate."
          : "Vibration alerts are unavailable on this device."
      }
      icon={Vibrate}
      choices={modes}
      value={preferences.vibrationAlerts}
      accessibilitySuffix="vibration alerts"
      disabled={!supported}
      preferences={preferences}
      layoutPreferences={layoutPreferences}
      onChange={(value) =>
        setPreferences((current) => ({
          ...current,
          vibrationAlerts: value as VibrationAlertMode,
        }))
      }
    />
  );
}

function AppPreferenceToggles({
  appPreferences,
  resolvedThemeMode,
  setAppPreferences,
}: {
  appPreferences: AccessibilityPreferences;
  resolvedThemeMode: "light" | "dark";
  setAppPreferences: React.Dispatch<
    React.SetStateAction<AccessibilityPreferences>
  >;
}) {
  return (
    <>
      <Text
        style={[
          styles.summaryValue,
          resolvedThemeMode === "light" && lightStyles.text,
        ]}
      >
        Mobility
      </Text>
      <ToggleRow
        label="Wheelchair routing"
        description="Default Directions to a dedicated wheelchair-aware route"
        enabled={appPreferences.wheelchairRouting}
        highContrast={appPreferences.highContrast}
        largeText={isLargeText(appPreferences)}
        lightMode={resolvedThemeMode === "light"}
        variant="phone"
        Icon={Accessibility}
        onPress={() =>
          setAppPreferences((current) => ({
            ...current,
            wheelchairRouting: !current.wheelchairRouting,
          }))
        }
      />
      <View
        style={styles.textPreviewPanel}
        accessible
        accessibilityLabel="Avoid steps, always on"
      >
        <Text
          style={[
            styles.summaryValue,
            resolvedThemeMode === "light" && lightStyles.text,
          ]}
        >
          Avoid steps · Always on
        </Text>
      </View>
      <ToggleRow
        label="Avoid steep slopes"
        description="Ask the wheelchair router to avoid inclines above six percent"
        enabled={appPreferences.avoidSteepSlopes}
        highContrast={appPreferences.highContrast}
        largeText={isLargeText(appPreferences)}
        lightMode={resolvedThemeMode === "light"}
        variant="phone"
        Icon={Route}
        onPress={() =>
          setAppPreferences((current) => ({
            ...current,
            avoidSteepSlopes: !current.avoidSteepSlopes,
          }))
        }
      />
      <ToggleRow
        label="Prefer smooth surfaces"
        description="Prefer mapped paved and smooth paths when available"
        enabled={appPreferences.preferSmoothSurfaces}
        highContrast={appPreferences.highContrast}
        largeText={isLargeText(appPreferences)}
        lightMode={resolvedThemeMode === "light"}
        variant="phone"
        Icon={Navigation}
        onPress={() =>
          setAppPreferences((current) => ({
            ...current,
            preferSmoothSurfaces: !current.preferSmoothSurfaces,
          }))
        }
      />
      <Text
        style={[
          styles.summaryValue,
          resolvedThemeMode === "light" && lightStyles.text,
        ]}
      >
        Guidance
      </Text>
      <ToggleRow
        label="Screen-reader optimised"
        description="Use longer labels and spoken announcements"
        enabled={appPreferences.screenReaderOptimised}
        highContrast={appPreferences.highContrast}
        largeText={isLargeText(appPreferences)}
        lightMode={resolvedThemeMode === "light"}
        variant="phone"
        Icon={ScanText}
        iconSize={28}
        onPress={() =>
          setAppPreferences((current) => ({
            ...current,
            screenReaderOptimised: !current.screenReaderOptimised,
          }))
        }
      />
      <ToggleRow
        label="Spoken guidance"
        description="Speak important walking, bus, and destination updates"
        enabled={appPreferences.spokenGuidance}
        highContrast={appPreferences.highContrast}
        largeText={isLargeText(appPreferences)}
        lightMode={resolvedThemeMode === "light"}
        variant="phone"
        Icon={Volume2}
        iconSize={28}
        onPress={() =>
          setAppPreferences((current) => ({
            ...current,
            spokenGuidance: !current.spokenGuidance,
          }))
        }
      />
      <ToggleRow
        label="Repeat important announcements"
        description="Keep repeat buttons available for bus and journey guidance"
        enabled={appPreferences.repeatAudio}
        highContrast={appPreferences.highContrast}
        largeText={isLargeText(appPreferences)}
        lightMode={resolvedThemeMode === "light"}
        variant="phone"
        Icon={RefreshCw}
        iconSize={28}
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
        enabled={appPreferences.vibrationAlerts !== "OFF"}
        highContrast={appPreferences.highContrast}
        largeText={isLargeText(appPreferences)}
        lightMode={resolvedThemeMode === "light"}
        variant="phone"
        Icon={Vibrate}
        iconSize={28}
        onPress={() =>
          setAppPreferences((current) => ({
            ...current,
            vibrationAlerts:
              current.vibrationAlerts === "OFF" ? "IMPORTANT" : "OFF",
          }))
        }
      />
      <Text
        style={[
          styles.summaryValue,
          resolvedThemeMode === "light" && lightStyles.text,
        ]}
      >
        Display
      </Text>
      <ToggleRow
        label="Large text"
        description="Increase important text size on this phone"
        enabled={isLargeText(appPreferences)}
        highContrast={appPreferences.highContrast}
        largeText={isLargeText(appPreferences)}
        lightMode={resolvedThemeMode === "light"}
        variant="phone"
        Icon={Type}
        iconSize={29}
        illustration={
          <LargeTextConceptVisual
            lightMode={resolvedThemeMode === "light"}
            highContrast={appPreferences.highContrast}
          />
        }
        onPress={() =>
          setAppPreferences((current) => ({
            ...current,
            textSize: current.textSize === "STANDARD" ? "LARGE" : "STANDARD",
          }))
        }
      />
      <View
        style={[
          styles.textPreviewPanel,
          resolvedThemeMode === "light" && lightStyles.surface,
          appPreferences.highContrast &&
            resolvedThemeMode !== "light" &&
            styles.highContrastControl,
          appPreferences.highContrast &&
            resolvedThemeMode === "light" &&
            lightStyles.highContrastControl,
        ]}
        accessible
        accessibilityLabel="Large text preview. Bus 95 arriving in 3 minutes."
      >
        <Text
          style={[
            styles.summaryLabel,
            resolvedThemeMode === "light" && lightStyles.mutedText,
          ]}
        >
          Text preview
        </Text>
        <Text
          style={[
            styles.summaryValue,
            isLargeText(appPreferences) && styles.largeBody,
            appPreferences.textSize === "EXTRA_LARGE" && styles.extraLargeBody,
            resolvedThemeMode === "light" && lightStyles.text,
          ]}
        >
          Bus 95 arriving in 3 minutes
        </Text>
      </View>
      <ToggleRow
        label="High contrast"
        description="Use stronger contrast for visual alerts and controls"
        enabled={appPreferences.highContrast}
        highContrast={appPreferences.highContrast}
        largeText={isLargeText(appPreferences)}
        lightMode={resolvedThemeMode === "light"}
        variant="phone"
        Icon={Contrast}
        iconSize={28}
        illustration={
          <HighContrastConceptVisual
            lightMode={resolvedThemeMode === "light"}
            highContrast={appPreferences.highContrast}
          />
        }
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
  const runtimeAccessibility = useContext(AccessibilityRuntimeContext);
  const theme = resolveVisualTheme(lightMode, highContrast);
  return (
    <View
      style={[
        styles.sectionHeader,
        { borderLeftColor: theme.colors.actionPrimary },
      ]}
    >
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
        accessibilityRole="header"
        style={[
          styles.heading,
          runtimeAccessibility.textSize !== "STANDARD" && styles.largeHeading,
          runtimeAccessibility.textSize === "EXTRA_LARGE" &&
            styles.extraLargeHeading,
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

function ProfileHeaderWithAppearance({
  eyebrow,
  title,
  themeMode,
  highContrast,
  lightMode,
  largeText,
  compactLayout,
  onSelectMode,
}: {
  eyebrow: string;
  title: string;
  themeMode: AccessibilityPreferences["themeMode"];
  highContrast: boolean;
  lightMode: boolean;
  largeText: boolean;
  compactLayout: boolean;
  onSelectMode: (themeMode: AccessibilityPreferences["themeMode"]) => void;
}) {
  return (
    <View
      style={[
        styles.profileHeaderWithAppearance,
        (compactLayout || largeText) && styles.stackedProfileHeaderAppearance,
      ]}
    >
      <View style={styles.profileHeaderTitle}>
        <SectionHeader
          eyebrow={eyebrow}
          title={title}
          highContrast={highContrast}
          lightMode={lightMode}
        />
      </View>
      <AppearanceSwitch
        themeMode={themeMode}
        highContrast={highContrast}
        largeText={largeText}
        onSelectMode={onSelectMode}
      />
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
  journeyStateDescription,
  hasRequest,
  lightMode,
  highContrast,
  compact,
  onSelect,
}: {
  activeTab: AppTab;
  journeyStateDescription: string;
  hasRequest: boolean;
  lightMode: boolean;
  highContrast: boolean;
  compact: boolean;
  onSelect: (tab: AppTab) => void;
}) {
  const runtimeAccessibility = useContext(AccessibilityRuntimeContext);
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
        runtimeAccessibility.largerControls && styles.largerTabBar,
        lightMode && lightStyles.tabBar,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
        highContrast && styles.highContrastTabBar,
      ]}
    >
      <TabButton
        label="Journey"
        icon="journey"
        index={1}
        selected={activeTab === "JOURNEY"}
        stateDescription={journeyStateDescription}
        lightMode={lightMode}
        highContrast={highContrast}
        compact={compact}
        onPress={() => onSelect("JOURNEY")}
      />
      <TabButton
        label="Assist"
        icon="assist"
        index={2}
        selected={activeTab === "ASSISTANCE"}
        stateDescription={
          hasRequest ? "assistance request active" : "preferences available"
        }
        lightMode={lightMode}
        highContrast={highContrast}
        compact={compact}
        onPress={() => onSelect("ASSISTANCE")}
      />
      <TabButton
        label="Profile"
        icon="profile"
        index={3}
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
  recommended: recommendedOverride,
  accessibleRouteStatus,
  onPress,
  lightMode = false,
  highContrast = false,
}: {
  stop: NearbyBusStop;
  selected?: boolean;
  recommended?: boolean;
  accessibleRouteStatus?: AccessibleStopRouteStatus;
  onPress?: () => void;
  lightMode?: boolean;
  highContrast?: boolean;
}) {
  const walkingMinutes = Math.max(1, Math.round(stop.distanceMeters / 70));
  const services = busServicesForStop(stop);
  const recommended = recommendedOverride ?? stop.distanceMeters <= 80;
  const accessibleRouteLabel =
    accessibleRouteStatus === "AVAILABLE"
      ? "Wheelchair-friendly route available"
      : accessibleRouteStatus === "LIMITED_DATA"
        ? "Wheelchair route · Accessibility data incomplete"
        : accessibleRouteStatus === "UNAVAILABLE"
          ? "No wheelchair route found"
          : accessibleRouteStatus === "CHECKING"
            ? "Checking wheelchair route…"
            : null;
  const content = (
    <>
      <View style={styles.iconTitleRow}>
        <View
          style={[
            styles.componentIconBadge,
            lightMode && lightStyles.componentIconBadge,
          ]}
        >
          <MapPin
            size={19}
            color={lightMode ? lightTheme.primary : colors.primary}
            strokeWidth={2.75}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </View>
        <Text style={[styles.statusLabel, lightMode && lightStyles.mutedText]}>
          {selected
            ? "Your bus stop"
            : recommended
              ? "Recommended nearby stop"
              : "Nearby stop"}
        </Text>
      </View>
      <Text style={[styles.busTitle, lightMode && lightStyles.text]}>
        {stop.description}
      </Text>
      <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
        {stop.roadName}
      </Text>
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
      {accessibleRouteLabel ? (
        <Text
          style={[
            styles.infoPill,
            accessibleRouteStatus === "AVAILABLE" && styles.accessibleChip,
            lightMode && lightStyles.infoPill,
          ]}
        >
          {accessibleRouteLabel}
        </Text>
      ) : null}
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
          <Text
            style={[
              styles.chooseStopHint,
              lightMode && lightStyles.selectedMapListToggleText,
            ]}
          >
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
      accessibilityLabel={`${recommended ? "Recommended stop. " : ""}${stop.description}, ${stop.roadName}, bus stop ${stop.busStopCode}, about ${stop.distanceMeters} metres away, about ${walkingMinutes} minutes walk. ${accessibleRouteLabel ? `${accessibleRouteLabel}. ` : ""}Services ${services.join(", ")}. Choose this stop.`}
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
  service,
  selected,
  onPress,
  arrivalsLoading,
  lightMode = false,
  highContrast = false,
}: {
  service: BusServiceOption;
  selected: boolean;
  onPress: () => void;
  arrivalsLoading: boolean;
  lightMode?: boolean;
  highContrast?: boolean;
}) {
  const runtimeAccessibility = useContext(AccessibilityRuntimeContext);
  const nextBus = service.buses[0];
  const followingBus = service.buses[1];
  const nextEtaLabel = nextBus
    ? formatEta(nextBus.etaSeconds)
    : arrivalsLoading
      ? "Loading live arrival..."
      : "Live arrival unavailable";
  const followingEtaLabel = followingBus
    ? formatEta(followingBus.etaSeconds)
    : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Bus ${service.serviceNo} towards ${service.destination}. Service ${service.serviceNo}. ${nextBus ? `Next bus ${nextEtaLabel}.` : arrivalsLoading ? "Live arrival loading." : "Live arrival unavailable."} ${
        nextBus?.wheelchairAccessible ? "Wheelchair accessible." : ""
      } Double tap to select service.`}
      onPress={onPress}
      style={[
        styles.arrivalCard,
        lightMode && lightStyles.surface,
        selected && styles.selectedCard,
        lightMode && selected && lightStyles.selectedCard,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
        runtimeAccessibility.largerControls && styles.largerServiceCard,
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
          <ServiceNumberWithAccessibility
            serviceNo={service.serviceNo}
            accessible={Boolean(nextBus?.wheelchairAccessible)}
            prefix=""
            textStyle={styles.serviceNumber}
            lightMode={lightMode}
            highContrast={highContrast}
            symbolSize="large"
          />
        </View>
        {selected ? (
          <View style={styles.selectedServiceBadge}>
            <CircleCheck
              size={18}
              color={colors.textOnPrimary}
              strokeWidth={3}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={styles.selectedServiceBadgeText}>Selected</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.destinationText, lightMode && lightStyles.text]}>
        {service.destination}
      </Text>
      <View style={styles.arrivalMetadata}>
        <View style={styles.arrivalInfoRow}>
          <Text
            style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}
          >
            Next bus
          </Text>
          <Text
            style={[styles.arrivalInfoValue, lightMode && lightStyles.text]}
          >
            {nextEtaLabel}
          </Text>
        </View>
        {followingEtaLabel ? (
          <View style={styles.arrivalInfoRow}>
            <Text
              style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}
            >
              Following
            </Text>
            <Text
              style={[styles.arrivalInfoValue, lightMode && lightStyles.text]}
            >
              {followingEtaLabel}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.infoRow}>
        {nextBus ? (
          <Text
            style={[
              styles.infoPill,
              nextBus.wheelchairAccessible && styles.accessibleChip,
              lightMode && lightStyles.infoPill,
              nextBus.wheelchairAccessible &&
                lightMode &&
                lightStyles.accessibleChip,
            ]}
          >
            {nextBus.wheelchairAccessible
              ? "Wheelchair accessible"
              : "Accessibility not indicated"}
          </Text>
        ) : arrivalsLoading ? (
          <Text style={[styles.infoPill, lightMode && lightStyles.infoPill]}>
            Checking live arrivals
          </Text>
        ) : (
          <Text style={[styles.infoPill, lightMode && lightStyles.infoPill]}>
            Arrival unavailable
          </Text>
        )}
      </View>
      <Text style={styles.selectHint}>
        {selected
          ? `Service ${service.serviceNo} selected`
          : `Select Service ${service.serviceNo}`}
      </Text>
    </Pressable>
  );
}

function ServiceNumberWithAccessibility({
  serviceNo,
  accessible,
  prefix = "Service",
  textStyle,
  lightMode = false,
  highContrast = false,
  onDark = false,
  symbolSize = "regular",
  rowStyle,
}: {
  serviceNo: string;
  accessible: boolean;
  prefix?: string;
  textStyle: React.ComponentProps<typeof Text>["style"];
  lightMode?: boolean;
  highContrast?: boolean;
  onDark?: boolean;
  symbolSize?: "small" | "regular" | "large";
  rowStyle?: React.ComponentProps<typeof View>["style"];
}) {
  return (
    <View style={[styles.serviceAccessibilityRow, rowStyle]}>
      <Text style={textStyle}>
        {prefix ? `${prefix} ${serviceNo}` : serviceNo}
      </Text>
      {accessible ? (
        <WheelchairAccessibleSymbol
          size={symbolSize}
          lightMode={lightMode}
          highContrast={highContrast}
          onDark={onDark}
        />
      ) : null}
    </View>
  );
}

function WheelchairAccessibleSymbol({
  size = "regular",
  lightMode = false,
  highContrast = false,
  onDark = false,
}: {
  size?: "small" | "regular" | "large";
  lightMode?: boolean;
  highContrast?: boolean;
  onDark?: boolean;
}) {
  return (
    <Text
      accessibilityLabel="Wheelchair accessible bus"
      style={[
        styles.serviceAccessibilitySymbol,
        size === "small" && styles.smallServiceAccessibilitySymbol,
        size === "large" && styles.largeServiceAccessibilitySymbol,
        lightMode && lightStyles.serviceAccessibilitySymbol,
        onDark && styles.serviceAccessibilitySymbolOnDark,
        highContrast &&
          !lightMode &&
          styles.highContrastServiceAccessibilitySymbol,
        highContrast &&
          lightMode &&
          lightStyles.highContrastServiceAccessibilitySymbol,
      ]}
    >
      ♿
    </Text>
  );
}

function OnboardJourneyScreen({
  appPreferences,
  selectedBus,
  currentStop,
  nextStop,
  routeStops,
  currentStopIndex,
  selectedAlightingStop,
  selectedAlightingStopIndex,
  stopsRemaining,
  alightingAssistanceTypes,
  alightingRequestStatus,
  selectedStopIsNext,
  selectedStopReached,
  journeyPhase,
  hasMeaningfulAnnouncement,
  isRequestLoading,
  onChangeStop,
  onSetDestination,
  onRequestDisembarkation,
  onRepeat,
  onSimulateNextStop,
  onOpenAccessibility,
  onRequestEndJourney,
  onFinishJourney,
  journeyEndInProgress,
}: {
  appPreferences: AccessibilityPreferences;
  selectedBus: Bus;
  currentStop: RouteStop | null;
  nextStop: RouteStop | null;
  routeStops: RouteStop[];
  currentStopIndex: number;
  selectedAlightingStop: RouteStop | null;
  selectedAlightingStopIndex: number;
  stopsRemaining: number | null;
  alightingAssistanceTypes: AssistanceType[];
  alightingRequestStatus: AssistanceRequestStatus | null;
  selectedStopIsNext: boolean;
  selectedStopReached: boolean;
  journeyPhase: JourneyPhase;
  hasMeaningfulAnnouncement: boolean;
  isRequestLoading: boolean;
  onChangeStop: () => void;
  onSetDestination: (stop: RouteStop) => void;
  onRequestDisembarkation: () => void;
  onRepeat: () => void;
  onSimulateNextStop: () => void;
  onOpenAccessibility: () => void;
  onRequestEndJourney: () => void;
  onFinishJourney: () => void;
  journeyEndInProgress: boolean;
}) {
  const [followJourney, setFollowJourney] = useState(true);
  const [showRouteStops, setShowRouteStops] = useState(false);
  const [showOnboardMore, setShowOnboardMore] = useState(false);
  const [showSimplifiedMap, setShowSimplifiedMap] = useState(false);
  const [previewKind, setPreviewKind] = useState<"BUS" | "STOP" | null>(null);
  const [selectedPreviewStop, setSelectedPreviewStop] =
    useState<RouteStop | null>(null);
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
    isLargeText(appPreferences) && styles.largeBody,
    appPreferences.textSize === "EXTRA_LARGE" && styles.extraLargeBody,
    lightMode && lightStyles.text,
    highContrast && !lightMode && styles.highContrastText,
    highContrast && lightMode && lightStyles.highContrastText,
  ];
  const bodyStyle = [
    styles.bodyText,
    isLargeText(appPreferences) && styles.largeBody,
    appPreferences.textSize === "EXTRA_LARGE" && styles.extraLargeBody,
    lightMode && lightStyles.bodyText,
    highContrast && !lightMode && styles.highContrastMutedText,
    highContrast && lightMode && lightStyles.highContrastMutedText,
  ];
  const destinationName =
    selectedAlightingStop?.description ?? "Choose destination";
  const destinationIsNext =
    selectedStopIsNext || journeyPhase === "DESTINATION_NEXT";
  const assistanceRequestActive =
    alightingRequestStatus === AssistanceRequestStatus.SENDING ||
    alightingRequestStatus === AssistanceRequestStatus.ACKNOWLEDGED;
  const assistanceAcknowledged =
    alightingRequestStatus === AssistanceRequestStatus.ACKNOWLEDGED;
  const assistanceRequestFailed =
    alightingRequestStatus === AssistanceRequestStatus.FAILED;
  const assistanceRequestCancelled =
    alightingRequestStatus === AssistanceRequestStatus.CANCELLED;
  const showActiveAlightingCard =
    destinationIsNext ||
    selectedStopReached ||
    assistanceRequestActive ||
    assistanceRequestFailed;
  const rampAssistanceSelected =
    alightingAssistanceTypes.includes("WHEELCHAIR_RAMP");
  const extraAlightingTimeSelected = alightingAssistanceTypes.includes(
    "EXTENDED_DWELL_TIME",
  );
  const wheelchairCompletion =
    appPreferences.wheelchairAssistance || rampAssistanceSelected;
  const stopsToDestinationLabel =
    stopsRemaining === null
      ? "Choose a destination for stop countdown"
      : stopsRemaining === 0
        ? "You have arrived"
        : `${stopsRemaining} ${stopsRemaining === 1 ? "stop" : "stops"} to ${destinationName}`;
  const heroAccessibilityLabel = selectedStopReached
    ? appPreferences.simplifiedJourney
      ? `You've reached your stop. ${destinationName}. Leave the bus when it is safe.`
      : `You've reached your stop. ${destinationName}. Remain onboard until the bus has stopped and it is safe to exit.`
    : destinationIsNext
      ? `Your stop is next. ${destinationName}. Prepare to alight.`
      : `Onboard Journey. Service ${selectedBus.busService}. Next stop ${nextStop?.description ?? "final stop"}. ${stopsToDestinationLabel}.`;
  const rampStatusTitle = assistanceAcknowledged
    ? "Ramp request received"
    : assistanceRequestActive
      ? "Ramp request sent"
      : "Ramp assistance";
  const rampStatusDetail = assistanceRequestActive
    ? null
    : rampAssistanceSelected
      ? assistanceRequestCancelled
        ? "Request cancelled"
        : assistanceRequestFailed
          ? "Request not sent"
          : "Not requested"
      : "Not selected";
  const dwellStatusTitle = assistanceRequestActive
    ? "Extra alighting time requested"
    : "Extra alighting time";
  const dwellStatusDetail = assistanceRequestActive
    ? null
    : extraAlightingTimeSelected
      ? assistanceRequestCancelled
        ? "Request cancelled"
        : assistanceRequestFailed
          ? "Request not sent"
          : "Enabled"
      : "Not enabled";
  const previewStopIndex = selectedPreviewStop
    ? routeStopIndex(routeStops, selectedPreviewStop)
    : -1;
  const previewStopsAhead =
    previewStopIndex >= 0
      ? Math.max(0, previewStopIndex - currentStopIndex)
      : null;

  function previewRouteStop(stop: RouteStop) {
    setFollowJourney(false);
    setPreviewKind("STOP");
    setSelectedPreviewStop(stop);
    setOnboardViewport((current) => ({
      ...current,
      center: stop,
      zoom: clampMapZoom(Math.max(current.zoom, 15), "SELECTED_STOP"),
      mode: "SELECTED_STOP",
    }));
  }

  function setPreviewAsDestination() {
    if (!selectedPreviewStop) {
      return;
    }
    onSetDestination(selectedPreviewStop);
  }

  function updateOnboardProviderViewport(next: ProviderViewportChange) {
    setFollowJourney(false);
    setOnboardViewport({
      ...next,
      mode: "USER_PAN",
    });
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

  function viewOnboardFullRoute() {
    setShowRouteStops(false);
    setShowOnboardMore(false);
    setShowSimplifiedMap(true);
    setPreviewKind(null);
    setSelectedPreviewStop(null);
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
        style={[
          styles.onboardHero,
          destinationIsNext && styles.onboardDestinationNextHero,
          selectedStopReached && styles.onboardDestinationReachedHero,
          highContrast && styles.highContrastOnboardHero,
        ]}
        accessible
        accessibilityRole="header"
        accessibilityLabel={heroAccessibilityLabel}
      >
        {!appPreferences.simplifiedJourney ||
        (!destinationIsNext && !selectedStopReached) ? (
          <>
            <Text
              style={[
                styles.onboardEyebrow,
                isLargeText(appPreferences) && styles.largeBody,
                appPreferences.textSize === "EXTRA_LARGE" &&
                  styles.extraLargeBody,
              ]}
            >
              ONBOARD JOURNEY
            </Text>
            <ServiceNumberWithAccessibility
              serviceNo={selectedBus.busService}
              accessible={selectedBus.isAccessible}
              prefix="Service"
              textStyle={[
                styles.onboardService,
                isLargeText(appPreferences) && styles.largeBody,
                appPreferences.textSize === "EXTRA_LARGE" &&
                  styles.extraLargeBody,
              ]}
              onDark
              highContrast={highContrast}
              symbolSize="regular"
            />
          </>
        ) : null}

        {selectedStopReached ? (
          <>
            <Text
              style={[
                styles.onboardAlertLabel,
                isLargeText(appPreferences) && styles.largeHeading,
                appPreferences.textSize === "EXTRA_LARGE" &&
                  styles.extraLargeHeading,
              ]}
            >
              YOU'VE REACHED YOUR STOP
            </Text>
            <Text
              style={[
                styles.onboardDestination,
                isLargeText(appPreferences) && styles.largeHeading,
                appPreferences.textSize === "EXTRA_LARGE" &&
                  styles.extraLargeHeading,
              ]}
            >
              {destinationName}
            </Text>
            {!appPreferences.simplifiedJourney ? (
              <Text
                style={[
                  styles.onboardInstruction,
                  isLargeText(appPreferences) && styles.largeBody,
                  appPreferences.textSize === "EXTRA_LARGE" &&
                    styles.extraLargeBody,
                ]}
              >
                You have arrived.
              </Text>
            ) : null}
            {appPreferences.simplifiedJourney ? (
              <Text
                style={[
                  styles.onboardNextStopLabel,
                  isLargeText(appPreferences) && styles.largeBody,
                  appPreferences.textSize === "EXTRA_LARGE" &&
                    styles.extraLargeBody,
                ]}
              >
                NEXT
              </Text>
            ) : null}
            <Text
              style={[
                styles.onboardInstruction,
                isLargeText(appPreferences) && styles.largeBody,
                appPreferences.textSize === "EXTRA_LARGE" &&
                  styles.extraLargeBody,
              ]}
            >
              {appPreferences.simplifiedJourney
                ? "Leave the bus when it is safe."
                : "Remain onboard until the bus has stopped and it is safe to exit."}
            </Text>
          </>
        ) : destinationIsNext ? (
          <>
            <Text
              style={[
                styles.onboardAlertLabel,
                isLargeText(appPreferences) && styles.largeHeading,
                appPreferences.textSize === "EXTRA_LARGE" &&
                  styles.extraLargeHeading,
              ]}
            >
              YOUR STOP IS NEXT
            </Text>
            <Text
              style={[
                styles.onboardDestination,
                isLargeText(appPreferences) && styles.largeHeading,
                appPreferences.textSize === "EXTRA_LARGE" &&
                  styles.extraLargeHeading,
              ]}
            >
              {destinationName}
            </Text>
            <Text
              style={[
                styles.onboardInstruction,
                isLargeText(appPreferences) && styles.largeBody,
                appPreferences.textSize === "EXTRA_LARGE" &&
                  styles.extraLargeBody,
              ]}
            >
              Prepare to alight.
            </Text>
          </>
        ) : (
          <>
            <Text
              style={[
                styles.onboardNextStopLabel,
                isLargeText(appPreferences) && styles.largeBody,
                appPreferences.textSize === "EXTRA_LARGE" &&
                  styles.extraLargeBody,
              ]}
            >
              Next stop
            </Text>
            <Text
              style={[
                styles.onboardDestination,
                isLargeText(appPreferences) && styles.largeHeading,
                appPreferences.textSize === "EXTRA_LARGE" &&
                  styles.extraLargeHeading,
              ]}
            >
              {nextStop?.description ?? "Final stop"}
            </Text>
            <Text
              style={[
                styles.onboardInstruction,
                isLargeText(appPreferences) && styles.largeBody,
                appPreferences.textSize === "EXTRA_LARGE" &&
                  styles.extraLargeBody,
              ]}
            >
              {stopsToDestinationLabel}
            </Text>
          </>
        )}
      </View>

      {showActiveAlightingCard ? (
        <View
          style={[
            panelStyle,
            destinationIsNext && styles.alightingPriorityPanel,
          ]}
          accessible={false}
          testID="alighting-assistance-card"
        >
          {appPreferences.simplifiedJourney && destinationIsNext ? (
            <>
              <Text style={labelStyle}>NEXT</Text>
              <Text style={valueStyle}>
                {assistanceRequestActive
                  ? "Assistance requested."
                  : "Request help to get off the bus."}
              </Text>
            </>
          ) : (
            <Text
              style={[
                styles.alightingCardTitle,
                isLargeText(appPreferences) && styles.largeHeading,
                appPreferences.textSize === "EXTRA_LARGE" &&
                  styles.extraLargeHeading,
                lightMode && lightStyles.text,
                highContrast && !lightMode && styles.highContrastText,
                highContrast && lightMode && lightStyles.highContrastText,
              ]}
            >
              Alighting assistance
            </Text>
          )}

          {!appPreferences.simplifiedJourney ? (
            <>
              <AlightingStatusRow
                Icon={Accessibility}
                title={rampStatusTitle}
                detail={rampStatusDetail}
                complete={assistanceRequestActive && rampAssistanceSelected}
                lightMode={lightMode}
                highContrast={highContrast}
              />
              <AlightingStatusRow
                Icon={Clock}
                title={dwellStatusTitle}
                detail={dwellStatusDetail}
                complete={assistanceRequestActive && extraAlightingTimeSelected}
                lightMode={lightMode}
                highContrast={highContrast}
              />
            </>
          ) : null}

          {assistanceRequestActive ? (
            <View
              style={styles.assistanceRequestedStatus}
              accessible
              accessibilityRole="alert"
              accessibilityLabel={
                assistanceAcknowledged
                  ? "Assistance requested. The bus has received your request."
                  : "Assistance requested. Your request is being sent to the bus."
              }
            >
              <View style={styles.iconTitleRow}>
                <CheckCircle2
                  size={24}
                  color={controlIconColor({
                    active: true,
                    lightMode,
                    highContrast,
                  })}
                  strokeWidth={3}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                <Text style={valueStyle}>Assistance requested</Text>
              </View>
              <Text style={bodyStyle}>
                {assistanceAcknowledged
                  ? "The bus has received your request."
                  : "Your request is being sent to the bus."}
              </Text>
            </View>
          ) : null}

          {assistanceAcknowledged && destinationIsNext ? (
            <Text
              style={[
                styles.alightingSafetyInstruction,
                isLargeText(appPreferences) && styles.largeBody,
                appPreferences.textSize === "EXTRA_LARGE" &&
                  styles.extraLargeBody,
                lightMode && lightStyles.text,
                highContrast && !lightMode && styles.highContrastText,
                highContrast && lightMode && lightStyles.highContrastText,
              ]}
              accessibilityRole="alert"
            >
              {rampAssistanceSelected
                ? "Please remain onboard until the bus has stopped and the ramp is ready."
                : "Please remain onboard until the bus has stopped and assistance is ready."}
            </Text>
          ) : null}

          {!assistanceRequestActive &&
          (!selectedStopReached || alightingAssistanceTypes.length > 0) ? (
            <PrimaryButton
              label={
                appPreferences.simplifiedJourney
                  ? "Request help"
                  : assistanceRequestFailed
                    ? "Retry help request"
                    : "Request help to disembark"
              }
              icon={CircleCheck}
              accessibilityHint="Send a request for help getting off the bus. The bus remains responsible for safe operation."
              onPress={onRequestDisembarkation}
              disabled={isRequestLoading}
              variant="attention"
              lightMode={lightMode}
              highContrast={highContrast}
            />
          ) : null}

          {selectedStopReached ? (
            alightingAssistanceTypes.length > 0 && !assistanceRequestActive ? (
              <SecondaryButton
                label={
                  appPreferences.simplifiedJourney
                    ? "I've left the bus"
                    : "I've safely alighted"
                }
                icon={DoorOpen}
                accessibilityHint="Complete this journey only after you have safely left the bus."
                onPress={onFinishJourney}
                disabled={journeyEndInProgress}
                lightMode={lightMode}
                highContrast={highContrast}
              />
            ) : (
              <PrimaryButton
                label={
                  appPreferences.simplifiedJourney
                    ? "I've left the bus"
                    : wheelchairCompletion
                      ? "I've safely alighted"
                      : "Finish journey"
                }
                icon={DoorOpen}
                accessibilityHint="Complete this journey only after you have safely left the bus."
                onPress={onFinishJourney}
                disabled={journeyEndInProgress}
                lightMode={lightMode}
                highContrast={highContrast}
              />
            )
          ) : null}
        </View>
      ) : (
        <View style={panelStyle} testID="alighting-assistance-card">
          <Text
            style={[
              styles.alightingCardTitle,
              isLargeText(appPreferences) && styles.largeHeading,
              appPreferences.textSize === "EXTRA_LARGE" &&
                styles.extraLargeHeading,
              lightMode && lightStyles.text,
              highContrast && !lightMode && styles.highContrastText,
              highContrast && lightMode && lightStyles.highContrastText,
            ]}
          >
            Alighting assistance
          </Text>
          <Text style={bodyStyle}>Available near your destination</Text>
        </View>
      )}

      {hasMeaningfulAnnouncement ? (
        <TertiaryButton
          label="Repeat announcement"
          icon={Volume2}
          onPress={onRepeat}
          lightMode={lightMode}
          highContrast={highContrast}
        />
      ) : null}

      {appPreferences.simplifiedJourney && !showSimplifiedMap ? (
        <SecondaryButton
          label="More"
          icon={SlidersHorizontal}
          onPress={() => setShowOnboardMore((open) => !open)}
          lightMode={lightMode}
          highContrast={highContrast}
        />
      ) : null}

      {appPreferences.simplifiedJourney &&
      !showSimplifiedMap &&
      showOnboardMore ? (
        <ActiveJourneyOptions
          busy={journeyEndInProgress}
          lightMode={lightMode}
          highContrast={highContrast}
          onChangeDestination={onChangeStop}
          onOpenAccessibility={onOpenAccessibility}
          onEndJourney={onRequestEndJourney}
        />
      ) : null}

      {appPreferences.simplifiedJourney ? (
        <SecondaryButton
          label={showSimplifiedMap ? "Hide journey map" : "Show journey map"}
          icon={MapIcon}
          onPress={() => setShowSimplifiedMap((visible) => !visible)}
          lightMode={lightMode}
          highContrast={highContrast}
        />
      ) : null}

      {!appPreferences.simplifiedJourney || showSimplifiedMap ? (
        <>
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
            routeStopsExpanded={showRouteStops}
            stopsRemaining={stopsRemaining}
            largeText={isLargeText(appPreferences)}
            lightMode={lightMode}
            highContrast={highContrast}
            onPreviewStop={previewRouteStop}
            onProviderViewportChange={updateOnboardProviderViewport}
            onReturnToJourney={returnToJourney}
            onViewStops={() => setShowRouteStops((visible) => !visible)}
            onMore={() => setShowOnboardMore((open) => !open)}
            onRotateMap={rotateOnboardMap}
            onResetNorth={resetOnboardNorth}
            onViewFullRoute={viewOnboardFullRoute}
            onResetMap={resetOnboardMap}
            onChangeDestination={onChangeStop}
            onOpenAccessibility={onOpenAccessibility}
            onEndJourney={onRequestEndJourney}
            journeyEndInProgress={journeyEndInProgress}
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
        </>
      ) : null}

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

function ActiveJourneyOptions({
  busy,
  lightMode,
  highContrast,
  onChangeDestination,
  onOpenAccessibility,
  onEndJourney,
}: {
  busy: boolean;
  lightMode: boolean;
  highContrast: boolean;
  onChangeDestination: () => void;
  onOpenAccessibility: () => void;
  onEndJourney: () => void;
}) {
  return (
    <View
      testID="active-journey-options"
      style={[
        styles.activeJourneyOptions,
        lightMode && lightStyles.surface,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
      ]}
    >
      <Text
        style={[
          styles.activeJourneyOptionsTitle,
          lightMode && lightStyles.text,
          highContrast && !lightMode && styles.highContrastText,
          highContrast && lightMode && lightStyles.highContrastText,
        ]}
      >
        Journey options
      </Text>
      <SecondaryButton
        label="Change destination"
        icon={Undo2}
        onPress={onChangeDestination}
        disabled={busy}
        lightMode={lightMode}
        highContrast={highContrast}
      />
      <SecondaryButton
        label="Accessibility options"
        icon={Accessibility}
        onPress={onOpenAccessibility}
        disabled={busy}
        lightMode={lightMode}
        highContrast={highContrast}
      />
      <View style={styles.journeyEndDivider} />
      <SecondaryButton
        label="End journey"
        icon={CircleX}
        onPress={onEndJourney}
        disabled={busy}
        variant="destructive"
        lightMode={lightMode}
        highContrast={highContrast}
      />
    </View>
  );
}

function JourneyEndConfirmationDialog({
  visible,
  serviceNo,
  destinationName,
  busy,
  lightMode,
  highContrast,
  onKeep,
  onConfirm,
}: {
  visible: boolean;
  serviceNo: string | null;
  destinationName: string | null;
  busy: boolean;
  lightMode: boolean;
  highContrast: boolean;
  onKeep: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onKeep}
    >
      <View style={styles.journeyEndBackdrop}>
        <View
          testID="end-journey-confirmation"
          accessibilityViewIsModal
          accessibilityRole="alert"
          accessibilityLabel={`End this journey? Service ${serviceNo ?? "not selected"}. Destination ${destinationName ?? "not selected"}. Your route and live journey monitoring will stop.`}
          style={[
            styles.journeyEndDialog,
            lightMode && lightStyles.surface,
            highContrast && !lightMode && styles.highContrastControl,
            highContrast && lightMode && lightStyles.highContrastControl,
          ]}
        >
          <Text
            style={[
              styles.journeyEndTitle,
              lightMode && lightStyles.text,
              highContrast && !lightMode && styles.highContrastText,
              highContrast && lightMode && lightStyles.highContrastText,
            ]}
          >
            End this journey?
          </Text>
          <Text style={[styles.statusValue, lightMode && lightStyles.text]}>
            Service {serviceNo ?? "not selected"}
          </Text>
          <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
            Destination: {destinationName ?? "Not selected"}
          </Text>
          <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
            Your route and live journey monitoring will stop.
          </Text>
          <PrimaryButton
            label="Keep journey"
            icon={ArrowLeft}
            onPress={onKeep}
            disabled={busy}
            lightMode={lightMode}
            highContrast={highContrast}
          />
          <SecondaryButton
            label="End journey"
            icon={CircleX}
            onPress={onConfirm}
            disabled={busy}
            variant="destructive"
            lightMode={lightMode}
            highContrast={highContrast}
          />
        </View>
      </View>
    </Modal>
  );
}

function AlightingStatusRow({
  Icon,
  title,
  detail,
  complete,
  lightMode,
  highContrast,
}: {
  Icon: LucideIcon;
  title: string;
  detail: string | null;
  complete: boolean;
  lightMode: boolean;
  highContrast: boolean;
}) {
  const runtimeAccessibility = useContext(AccessibilityRuntimeContext);
  const iconColor = controlIconColor({
    active: complete,
    lightMode,
    highContrast,
  });

  return (
    <View
      style={styles.alightingStatusRow}
      accessible
      accessibilityLabel={[title, detail].filter(Boolean).join(". ")}
    >
      {complete ? (
        <CheckCircle2
          size={26}
          color={iconColor}
          strokeWidth={3}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : (
        <Icon
          size={26}
          color={iconColor}
          strokeWidth={2.75}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}
      <View style={styles.alightingStatusCopy}>
        <Text
          style={[
            styles.alightingStatusTitle,
            lightMode && lightStyles.text,
            highContrast && !lightMode && styles.highContrastText,
            highContrast && lightMode && lightStyles.highContrastText,
            runtimeAccessibility.textSize !== "STANDARD" && styles.largeBody,
            runtimeAccessibility.textSize === "EXTRA_LARGE" &&
              styles.extraLargeBody,
          ]}
        >
          {title}
        </Text>
        {detail ? (
          <Text
            style={[
              styles.alightingStatusDetail,
              lightMode && lightStyles.bodyText,
              highContrast && !lightMode && styles.highContrastMutedText,
              highContrast && lightMode && lightStyles.highContrastMutedText,
              runtimeAccessibility.textSize !== "STANDARD" && styles.largeBody,
              runtimeAccessibility.textSize === "EXTRA_LARGE" &&
                styles.extraLargeBody,
            ]}
          >
            {detail}
          </Text>
        ) : null}
      </View>
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
  routeStopsExpanded,
  stopsRemaining,
  largeText,
  lightMode,
  highContrast,
  onPreviewStop,
  onProviderViewportChange,
  onReturnToJourney,
  onViewStops,
  onMore,
  onRotateMap,
  onResetNorth,
  onViewFullRoute,
  onResetMap,
  onChangeDestination,
  onOpenAccessibility,
  onEndJourney,
  journeyEndInProgress,
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
  routeStopsExpanded: boolean;
  stopsRemaining: number | null;
  largeText: boolean;
  lightMode: boolean;
  highContrast: boolean;
  onPreviewStop: (stop: RouteStop) => void;
  onProviderViewportChange: (viewport: ProviderViewportChange) => void;
  onReturnToJourney: () => void;
  onViewStops: () => void;
  onMore: () => void;
  onRotateMap: () => void;
  onResetNorth: () => void;
  onViewFullRoute: () => void;
  onResetMap: () => void;
  onChangeDestination: () => void;
  onOpenAccessibility: () => void;
  onEndJourney: () => void;
  journeyEndInProgress: boolean;
}) {
  const [mapReady, setMapReady] = useState(false);
  const [providerRetryKey, setProviderRetryKey] = useState(0);
  const [mapLayout, setMapLayout] = useState<MapLayoutSize>({
    height: 320,
    width: defaultMapCanvasWidth,
  });
  const routeEndIndex =
    destinationStopIndex >= 0 ? destinationStopIndex : routeStops.length - 1;
  const hasRemainingStops = stopsRemaining !== null && stopsRemaining > 0;
  const progressLabel = hasRemainingStops
    ? `${stopsRemaining} ${stopsRemaining === 1 ? "stop" : "stops"} remaining`
    : null;
  const iconColor = controlIconColor({ lightMode, highContrast });
  const destinationName =
    destinationStop?.description ?? "destination not selected";
  const mapStops = useMemo<NearbyBusStop[]>(
    () =>
      routeStops.map((stop) => ({
        ...stop,
        services: stop.services ?? [],
        distanceMeters: 0,
      })),
    [routeStops],
  );
  const selectedMapStop = useMemo(
    () =>
      selectedPreviewStop
        ? (mapStops.find(
            (stop) => stop.busStopCode === selectedPreviewStop.busStopCode,
          ) ?? null)
        : null,
    [mapStops, selectedPreviewStop],
  );
  const mapCameraGeometry = useMemo(
    () => createMapCameraGeometry({ mapLayout }),
    [mapLayout],
  );
  const activeVehicleCoordinate = currentStop ?? {
    latitude: selectedBus.latitude,
    longitude: selectedBus.longitude,
  };
  const remainingRouteStops = routeStops.slice(
    Math.max(0, currentStopIndex + 1),
    Math.max(currentStopIndex + 1, routeEndIndex + 1),
  );
  const routeProgressVisible =
    hasRemainingStops &&
    remainingRouteStops.length > 0 &&
    (routeStopsExpanded || !mapReady);

  function retryMap() {
    setMapReady(false);
    setProviderRetryKey((current) => current + 1);
  }

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
          <Text
            style={[styles.statusLabel, lightMode && lightStyles.mutedText]}
          >
            Journey map
          </Text>
        </View>
        {progressLabel ? (
          <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
            {progressLabel}
          </Text>
        ) : null}
      </View>

      <View style={styles.onboardMapControls}>
        {mapReady && hasRemainingStops ? (
          <SecondaryButton
            label={
              routeStopsExpanded
                ? "Hide remaining stops"
                : "View remaining stops"
            }
            icon={List}
            onPress={onViewStops}
            lightMode={lightMode}
            highContrast={highContrast}
          />
        ) : null}
        <SecondaryButton
          label="More"
          icon={SlidersHorizontal}
          onPress={onMore}
          lightMode={lightMode}
          highContrast={highContrast}
        />
      </View>

      <View style={styles.onboardProviderMap}>
        <NearbyStopsMap
          stops={mapStops}
          selectedStop={selectedMapStop}
          selectedLandmark={null}
          landmarks={[]}
          currentLocation={null}
          mapViewport={viewport}
          mapCameraGeometry={mapCameraGeometry}
          layers={defaultMapLayers}
          mapManuallyMoved={!followJourney}
          mapInteractionMode={followJourney ? "FOLLOW_JOURNEY" : "BROWSE"}
          directionsActive
          followMode={followJourney}
          hasSelectedService
          providerRetryKey={providerRetryKey}
          journeyAlternative={null}
          routeStops={routeStops}
          destinationCoordinate={destinationStop}
          activeVehicle={{
            coordinate: activeVehicleCoordinate,
            serviceNo: selectedBus.busService,
          }}
          mapPickCandidate={null}
          headingDegrees={viewport.bearing}
          largeText={largeText}
          lightMode={lightMode}
          highContrast={highContrast}
          showInlineControls={false}
          onSelectStop={(stop) => {
            const routeStop = routeStops.find(
              (candidate) => candidate.busStopCode === stop.busStopCode,
            );
            if (routeStop) {
              onPreviewStop(routeStop);
            }
          }}
          onSelectLandmark={() => undefined}
          onMapLayoutChange={setMapLayout}
          onMoveMap={() => undefined}
          onProviderAvailabilityChange={setMapReady}
          onProviderViewportChange={onProviderViewportChange}
          onFocusCluster={(center) =>
            onProviderViewportChange({
              ...viewport,
              center,
              zoom: clampMapZoom(viewport.zoom + 1, "CLUSTER_EXPAND"),
            })
          }
          onRecenter={onReturnToJourney}
          onRetryMap={retryMap}
          onRefreshLocation={() => undefined}
          onShowRoute={onViewFullRoute}
          onToggleFollow={onReturnToJourney}
          onToggleLayer={() => undefined}
          onResetHeading={onResetNorth}
        />
      </View>

      {mapReady && viewport.bearing !== 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reset map to north"
          onPress={onResetNorth}
          style={[
            styles.onboardCompassControl,
            lightMode && lightStyles.mapSideControl,
          ]}
        >
          <Text style={[styles.mapCompassText, lightMode && lightStyles.text]}>
            N
          </Text>
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
        <View style={styles.onboardMorePanel}>
          <ActiveJourneyOptions
            busy={journeyEndInProgress}
            lightMode={lightMode}
            highContrast={highContrast}
            onChangeDestination={onChangeDestination}
            onOpenAccessibility={onOpenAccessibility}
            onEndJourney={onEndJourney}
          />
          <Text
            style={[
              styles.activeJourneyOptionsTitle,
              lightMode && lightStyles.text,
            ]}
          >
            Map options
          </Text>
          <SecondaryButton
            label="View full route"
            icon={MapIcon}
            onPress={onViewFullRoute}
            lightMode={lightMode}
            highContrast={highContrast}
          />
          <SecondaryButton
            label="Rotate map"
            icon={Compass}
            onPress={onRotateMap}
            lightMode={lightMode}
            highContrast={highContrast}
          />
          <SecondaryButton
            label="North up"
            icon={Compass}
            onPress={onResetNorth}
            lightMode={lightMode}
            highContrast={highContrast}
          />
          <SecondaryButton
            label="Reset map"
            icon={RefreshCw}
            onPress={onResetMap}
            lightMode={lightMode}
            highContrast={highContrast}
          />
        </View>
      ) : null}

      {mapReady && !followJourney && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Return to journey"
          onPress={onReturnToJourney}
          style={[
            styles.returnJourneyBanner,
            lightMode && lightStyles.selectedCard,
          ]}
        >
          <LocateFixed
            size={20}
            color={controlIconColor({ active: true, lightMode, highContrast })}
            strokeWidth={2.75}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={[styles.statusValue, lightMode && lightStyles.text]}>
            Return to journey
          </Text>
        </Pressable>
      )}

      <JourneyProgressIndicator
        routeStops={routeStops}
        currentStopIndex={currentStopIndex}
        destinationStopIndex={routeEndIndex}
        lightMode={lightMode}
      />

      {routeProgressVisible ? (
        <View
          testID="remaining-stops-list"
          style={styles.onboardMapCanvas}
          accessibilityLabel="Remaining stops"
        >
          <Text
            style={[styles.statusLabel, lightMode && lightStyles.mutedText]}
          >
            Remaining stops
          </Text>
          {remainingRouteStops.map((stop, remainingIndex) => {
            const index = currentStopIndex + remainingIndex + 1;
            const next = remainingIndex === 0;
            const destination = index === destinationStopIndex;
            const previewed =
              selectedPreviewStop?.busStopCode === stop.busStopCode;
            const status = destination
              ? next
                ? "next destination"
                : "destination"
              : next
                ? "next"
                : "upcoming";
            const MarkerIcon = destination ? MapPinned : MapPin;

            return (
              <Pressable
                key={`${stop.sequence}-${stop.busStopCode}-map`}
                testID={`remaining-stop-${stop.busStopCode}`}
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
                  <View style={[styles.journeyMapLine]} />
                  <View
                    style={[
                      styles.journeyMapStopMarker,
                      next && styles.journeyMapStopMarkerNext,
                      destination && styles.journeyMapStopMarkerDestination,
                    ]}
                  >
                    <MarkerIcon
                      size={18}
                      color={destination ? "#FFFFFF" : colors.text}
                      strokeWidth={2.75}
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                    />
                  </View>
                </View>
                <View style={styles.journeyMapStopText}>
                  <Text
                    style={[styles.statusValue, lightMode && lightStyles.text]}
                  >
                    {stop.description}
                  </Text>
                  <Text
                    style={[styles.bodyText, lightMode && lightStyles.bodyText]}
                  >
                    {next ? "NEXT" : `${remainingIndex + 1}.`}
                    {destination ? " · DESTINATION" : ""} · Stop{" "}
                    {stop.busStopCode}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
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
    <View
      style={styles.journeyProgressBar}
      accessible
      accessibilityLabel={`Journey progress ${currentStopIndex} of ${destinationStopIndex} route stops completed`}
    >
      {routeStops.map((stop, index) => (
        <View
          key={`${stop.busStopCode}-progress`}
          style={[
            styles.journeyProgressCell,
            lightMode && lightStyles.journeyProgressCell,
            index <= currentStopIndex && styles.journeyProgressCellDone,
            index === destinationStopIndex &&
              styles.journeyProgressCellDestination,
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
  const previewIsDestination =
    selectedPreviewStop?.busStopCode === destinationStop?.busStopCode;
  const previewIsBehind =
    previewStopIndex >= 0 && previewStopIndex <= currentStopIndex;

  if (previewKind === "BUS") {
    return (
      <View
        style={[styles.journeyMapPreviewCard, lightMode && lightStyles.surface]}
      >
        <Text style={[styles.statusLabel, lightMode && lightStyles.mutedText]}>
          Journey position
        </Text>
        <ServiceNumberWithAccessibility
          serviceNo={selectedBus.busService}
          accessible={selectedBus.isAccessible}
          textStyle={[styles.statusValue, lightMode && lightStyles.text]}
          lightMode={lightMode}
          highContrast={highContrast}
        />
        <Text style={bodyStyle}>
          Current: {currentStop?.description ?? "Journey starting"}
        </Text>
        <Text style={bodyStyle}>
          Next: {nextStop?.description ?? "Final stop"}
        </Text>
        <Text style={bodyStyle}>
          Destination: {destinationStop?.description ?? "Choose destination"}
        </Text>
        <Text style={bodyStyle}>
          {stopsRemaining === null
            ? "Choose a destination"
            : `${stopsRemaining} stops remaining`}
        </Text>
      </View>
    );
  }

  if (!selectedPreviewStop) {
    return null;
  }

  return (
    <View
      style={[styles.journeyMapPreviewCard, lightMode && lightStyles.surface]}
    >
      <Text style={[styles.statusLabel, lightMode && lightStyles.mutedText]}>
        {previewIsDestination ? "Your destination" : "Stop preview"}
      </Text>
      <Text style={[styles.statusValue, lightMode && lightStyles.text]}>
        {selectedPreviewStop.description}
      </Text>
      <Text style={bodyStyle}>
        {previewStopsAhead === null
          ? "Route position unavailable"
          : previewStopsAhead === 0
            ? "You are here"
            : `${previewStopsAhead} stops ahead`}
      </Text>
      {!previewIsDestination && !previewIsBehind ? (
        <PrimaryButton
          label="Set as destination"
          icon={MapPinned}
          onPress={onSetDestination}
          lightMode={lightMode}
          highContrast={highContrast}
        />
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
    <View
      accessible
      accessibilityLabel={routeProgressAnnouncement(
        routeStops,
        currentStopIndex,
        destinationStopIndex,
      )}
    >
      {routeStops.map((stop, index) => {
        const passed = index < currentStopIndex;
        const current = index === currentStopIndex;
        const next = index === currentStopIndex + 1;
        const destinationStop = index === destinationStopIndex;
        const marker = passed
          ? "✓"
          : current
            ? "●"
            : destinationStop
              ? "◎"
              : "○";
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
            <Text
              style={[
                styles.routeProgressMarker,
                lightMode && lightStyles.text,
              ]}
            >
              {marker}
            </Text>
            <View style={styles.routeProgressTextGroup}>
              <Text style={[styles.statusValue, lightMode && lightStyles.text]}>
                {stop.description}
              </Text>
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
  onFocus,
  autoFocus = false,
  largeText,
  lightMode,
  highContrast,
}: {
  query: string;
  onChangeQuery: (query: string) => void;
  onFocus?: () => void;
  autoFocus?: boolean;
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
        onFocus={onFocus}
        autoFocus={autoFocus}
        returnKeyType="search"
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

const BusStopSearchOverlay = memo(function BusStopSearchOverlay({
  searchState,
  searchMode,
  largeText,
  lightMode,
  highContrast,
  onChangeQuery,
  onClose,
  onClear,
  onSelectStop,
  onSelectPlace,
  onSelectService,
  onChooseOnMap,
}: {
  searchState: BusStopSearchState;
  searchMode: TransportSearchMode;
  largeText: boolean;
  lightMode: boolean;
  highContrast: boolean;
  onChangeQuery: (query: string) => void;
  onClose: () => void;
  onClear: () => void;
  onSelectStop: (stop: StaticSearchStop) => void;
  onSelectPlace: (landmark: MapLandmark) => void;
  onSelectService: (serviceNo: string) => void;
  onChooseOnMap: () => void;
}) {
  const theme = resolveVisualTheme(lightMode, highContrast);
  const hasQuery = searchState.query.trim().length > 0;
  const hasResults =
    searchState.results.stops.length > 0 ||
    searchState.results.places.length > 0 ||
    searchState.results.services.length > 0;

  return (
    <View
      style={[
        styles.busStopSearchOverlay,
        {
          backgroundColor: theme.colors.map.sheetSurface,
          borderColor: theme.colors.map.sheetBorder,
        },
        lightMode && lightStyles.mapBottomSheet,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
      ]}
      accessibilityViewIsModal
      accessible={false}
    >
      <View style={styles.busStopSearchHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close search"
          onPress={onClose}
          style={styles.busStopSearchIconButton}
        >
          <ArrowLeft
            size={24}
            color={theme.colors.map.controlIcon}
            strokeWidth={2.8}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </Pressable>
        <View style={styles.busStopSearchInputWrap}>
          <StopSearch
            query={searchState.query}
            onChangeQuery={onChangeQuery}
            autoFocus
            largeText={largeText}
            lightMode={lightMode}
            highContrast={highContrast}
          />
        </View>
        {hasQuery ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={onClear}
            style={styles.busStopSearchIconButton}
          >
            <CircleX
              size={24}
              color={theme.colors.map.controlIcon}
              strokeWidth={2.8}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </Pressable>
        ) : null}
      </View>

      {!hasQuery ? (
        <View style={styles.searchStateBlock}>
          <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>
            {searchMode === "DESTINATION"
              ? "Search for a destination"
              : searchMode === "ORIGIN"
                ? "Search for a starting point"
                : "Search for a bus stop or place"}
          </Text>
          <Text
            style={[
              styles.bodyText,
              largeText && styles.largeBody,
              lightMode && lightStyles.bodyText,
            ]}
          >
            {searchMode === "DISCOVERY"
              ? "Try a stop name, stop code, road, landmark or bus service."
              : "Try NUH, Kent Ridge MRT, Central Library, a stop name or a landmark."}
          </Text>
          {searchMode === "DESTINATION" ? (
            <SecondaryButton
              label="Choose destination on map"
              icon={MapPinned}
              onPress={onChooseOnMap}
              lightMode={lightMode}
              highContrast={highContrast}
            />
          ) : null}
        </View>
      ) : (
        <ScrollView
          testID="search-results-shell"
          keyboardShouldPersistTaps="handled"
          style={styles.busStopSearchResultsScroll}
          contentContainerStyle={styles.busStopSearchResultsContent}
        >
          {searchState.status === "SEARCHING" ? (
            <View style={styles.searchStateBlock}>
              <ActivityIndicator accessibilityLabel="Searching stops" />
              <Text
                style={[
                  styles.bodyText,
                  largeText && styles.largeBody,
                  lightMode && lightStyles.bodyText,
                ]}
              >
                Searching...
              </Text>
            </View>
          ) : searchState.status === "EMPTY" || !hasResults ? (
            <View style={styles.searchStateBlock}>
              <Text
                style={[styles.summaryValue, lightMode && lightStyles.text]}
              >
                No matches found
              </Text>
              <Text
                style={[
                  styles.bodyText,
                  largeText && styles.largeBody,
                  lightMode && lightStyles.bodyText,
                ]}
              >
                Try a bus stop name, stop code, road or landmark.
              </Text>
            </View>
          ) : (
            <>
              {searchState.results.stops.length > 0 ? (
                <View style={styles.searchSection}>
                  <Text
                    style={[
                      styles.searchGroupLabel,
                      lightMode && lightStyles.mutedText,
                    ]}
                  >
                    Bus Stops
                  </Text>
                  {searchState.results.stops.map((stop) => {
                    const services = stop.services;
                    return (
                      <Pressable
                        key={stop.busStopCode}
                        accessibilityRole="button"
                        accessibilityLabel={`${stop.description}, Bus Stop ${stop.busStopCode}, ${stop.roadName}${
                          services.length > 0
                            ? `, services ${formatServicesForSpeech(services)}`
                            : ""
                        }.`}
                        onPress={() => onSelectStop(stop)}
                        style={[
                          styles.transportSearchResult,
                          lightMode && lightStyles.landmarkSearchResult,
                          highContrast &&
                            !lightMode &&
                            styles.highContrastControl,
                          highContrast &&
                            lightMode &&
                            lightStyles.highContrastControl,
                        ]}
                      >
                        <Text
                          style={[
                            styles.transportSearchIcon,
                            { color: theme.colors.map.controlIcon },
                          ]}
                        >
                          BUS
                        </Text>
                        <View style={styles.landmarkSearchTextGroup}>
                          <Text
                            style={[
                              styles.summaryValue,
                              largeText && styles.largeBody,
                              lightMode && lightStyles.text,
                            ]}
                          >
                            {stop.description}
                          </Text>
                          <Text
                            style={[
                              styles.summaryLabel,
                              lightMode && lightStyles.mutedText,
                            ]}
                          >
                            Bus Stop {stop.busStopCode}
                          </Text>
                          <Text
                            style={[
                              styles.bodyText,
                              lightMode && lightStyles.bodyText,
                            ]}
                          >
                            {stop.roadName}
                          </Text>
                          {services.length > 0 ? (
                            <Text
                              style={[
                                styles.summaryLabel,
                                lightMode && lightStyles.mutedText,
                              ]}
                            >
                              Services {services.join(" · ")}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {searchState.results.places.length > 0 ? (
                <View style={styles.searchSection}>
                  <Text
                    style={[
                      styles.searchGroupLabel,
                      lightMode && lightStyles.mutedText,
                    ]}
                  >
                    Places
                  </Text>
                  {searchState.results.places.map((place) => (
                    <Pressable
                      key={place.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${place.name}, place. Select to view nearby bus stops.`}
                      onPress={() => onSelectPlace(place)}
                      style={[
                        styles.transportSearchResult,
                        lightMode && lightStyles.landmarkSearchResult,
                        highContrast &&
                          !lightMode &&
                          styles.highContrastControl,
                        highContrast &&
                          lightMode &&
                          lightStyles.highContrastControl,
                      ]}
                    >
                      <Text
                        style={[
                          styles.transportSearchIcon,
                          { color: theme.colors.map.controlIcon },
                        ]}
                      >
                        {landmarkIcon(place)}
                      </Text>
                      <View style={styles.landmarkSearchTextGroup}>
                        <Text
                          style={[
                            styles.summaryValue,
                            largeText && styles.largeBody,
                            lightMode && lightStyles.text,
                          ]}
                        >
                          {place.name}
                        </Text>
                        <Text
                          style={[
                            styles.summaryLabel,
                            lightMode && lightStyles.mutedText,
                          ]}
                        >
                          {place.category}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {searchState.results.services.length > 0 ? (
                <View style={styles.searchSection}>
                  <Text
                    style={[
                      styles.searchGroupLabel,
                      lightMode && lightStyles.mutedText,
                    ]}
                  >
                    Bus Services
                  </Text>
                  {searchState.results.services.map((serviceNo) => (
                    <Pressable
                      key={serviceNo}
                      accessibilityRole="button"
                      accessibilityLabel={`Service ${serviceNo}. Stops serving ${serviceNo}.`}
                      onPress={() => onSelectService(serviceNo)}
                      style={[
                        styles.transportSearchResult,
                        lightMode && lightStyles.landmarkSearchResult,
                        highContrast &&
                          !lightMode &&
                          styles.highContrastControl,
                        highContrast &&
                          lightMode &&
                          lightStyles.highContrastControl,
                      ]}
                    >
                      <BusFront
                        size={24}
                        color={theme.colors.map.controlIcon}
                        strokeWidth={2.8}
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                      />
                      <View style={styles.landmarkSearchTextGroup}>
                        <Text
                          style={[
                            styles.summaryValue,
                            largeText && styles.largeBody,
                            lightMode && lightStyles.text,
                          ]}
                        >
                          {serviceNo}
                        </Text>
                        <Text
                          style={[
                            styles.summaryLabel,
                            lightMode && lightStyles.mutedText,
                          ]}
                        >
                          Stops serving {serviceNo}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
});

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

export function MapStatusPill({
  message,
  isAlert = false,
  lightMode,
  highContrast,
  error = false,
  children,
}: {
  message?: string | null;
  isAlert?: boolean;
  lightMode: boolean;
  highContrast: boolean;
  error?: boolean;
  children?: React.ReactNode;
}) {
  const normalizedMessage = message?.trim();
  if (!normalizedMessage) {
    return null;
  }
  const theme = resolveVisualTheme(lightMode, highContrast);

  return (
    <View
      testID="map-status-pill"
      pointerEvents={children ? "auto" : "none"}
      accessible
      accessibilityRole={isAlert ? "alert" : undefined}
      accessibilityLiveRegion={isAlert ? "assertive" : "polite"}
      accessibilityLabel={normalizedMessage}
      style={[
        styles.regionalStopsStatus,
        {
          backgroundColor: theme.colors.map.overlaySurfaceElevated,
          borderColor: error
            ? theme.colors.statusError
            : theme.colors.map.overlayBorder,
        },
      ]}
    >
      <Text
        style={[
          styles.statusLabel,
          styles.regionalStopsStatusText,
          { color: theme.colors.textPrimary },
        ]}
      >
        {normalizedMessage}
      </Text>
      {children}
    </View>
  );
}

function MapFirstStopScreen({
  stops,
  nearbyStops,
  accessibleStopRoutes,
  accessibleRoutesOnly,
  recommendedStopCode,
  selectedStop,
  selectedLandmark,
  landmarks,
  currentLocation,
  mapViewport,
  mapCameraGeometry,
  layers,
  mapManuallyMoved,
  searchThisAreaVisible,
  nearbyHeading,
  directionsActive,
  followState,
  directionsStatus,
  directionsError,
  mobilityMode,
  wheelchairRoutingPreferred,
  wheelchairRoutingAvailable,
  walkingRoute,
  walkingRouteProgress,
  walkingRouteOffRoute,
  walkingLocationAccuracyLimited,
  canRepeatWalkingGuidance,
  guidanceStatus,
  routeFitKey,
  locationPulseKey,
  reducedMotion,
  rotationEnabled,
  hasSelectedService,
  hasSelectedDestination,
  journeyOrigin,
  journeyDestination,
  journeyAlternatives,
  selectedJourneyAlternative,
  recentDestinations,
  mapPickMode,
  mapPickCandidate,
  headingDegrees,
  query,
  searchState,
  searchMode,
  bottomSheetState,
  bottomSheetContent,
  nearbyOpen,
  lastExpandedSheetState,
  nearbyStatus,
  locationStatus,
  locationRequested,
  connectivityStatus,
  regionalStopsStatus,
  staticServicesStatus,
  largeText,
  lightMode,
  highContrast,
  onChangeSearchQuery,
  onOpenSearch,
  onOpenDestinationSearch,
  onOpenOriginSearch,
  onSelectJourneyDestination,
  onSwapJourneyPoints,
  onChooseDestinationOnMap,
  onConfirmMapDestination,
  onSelectJourneyAlternative,
  onStartJourneyPlan,
  onCloseSearch,
  onClearSearch,
  onSelectSearchStop,
  onSelectSearchPlace,
  onSelectSearchService,
  onSelectStop,
  onSelectLandmark,
  onMapLayoutChange,
  onMoveMap,
  onProviderViewportChange,
  onFocusCluster,
  onRecenter,
  onLocateMap,
  onOpenNearby,
  onToggleAccessibleRoutesOnly,
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
  onRetryDirections,
  onChangeMobilityMode,
  onStartGuidance,
  onRecalculateDirections,
  onContinueWithoutRerouting,
  onRepeatWalkingGuidance,
  onUseLocationForDirections,
  onStopDirections,
  onClearSelectedStop,
  onExitMap,
  onConfirm,
  onSelectService,
  onHear,
  onHearDirections,
  onRetryRegionalStops,
  onRetryStopServices,
  onSetBottomSheetState,
}: {
  stops: NearbyBusStop[];
  nearbyStops: NearbyBusStop[];
  accessibleStopRoutes: Record<string, AccessibleStopRouteStatus>;
  accessibleRoutesOnly: boolean;
  recommendedStopCode?: string;
  selectedStop: NearbyBusStop | null;
  selectedLandmark: MapLandmark | null;
  landmarks: MapLandmark[];
  currentLocation: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    headingDegrees?: number;
  } | null;
  mapViewport: MapViewport;
  mapCameraGeometry: MapCameraGeometry;
  layers: MapLayers;
  mapManuallyMoved: boolean;
  searchThisAreaVisible: boolean;
  nearbyHeading: string;
  directionsActive: boolean;
  followState: MapFollowState;
  directionsStatus: DirectionsStatus;
  directionsError: string | null;
  mobilityMode: MobilityMode;
  wheelchairRoutingPreferred: boolean;
  wheelchairRoutingAvailable: boolean;
  walkingRoute: WalkingRoute | null;
  walkingRouteProgress: WalkingRouteProgress | null;
  walkingRouteOffRoute: boolean;
  walkingLocationAccuracyLimited: boolean;
  canRepeatWalkingGuidance: boolean;
  guidanceStatus: GuidanceStatus;
  routeFitKey: number;
  locationPulseKey: number;
  reducedMotion: boolean;
  rotationEnabled: boolean;
  hasSelectedService: boolean;
  hasSelectedDestination: boolean;
  journeyOrigin: JourneyPoint;
  journeyDestination: JourneyPoint | null;
  journeyAlternatives: JourneyAlternative[];
  selectedJourneyAlternative: JourneyAlternative | null;
  recentDestinations: JourneyPoint[];
  mapPickMode: "DESTINATION" | null;
  mapPickCandidate: JourneyPoint;
  headingDegrees: number;
  query: string;
  searchState: BusStopSearchState;
  searchMode: TransportSearchMode;
  bottomSheetState: BottomSheetState;
  bottomSheetContent: MapBottomSheetContent;
  nearbyOpen: boolean;
  lastExpandedSheetState: UsefulBottomSheetState;
  nearbyStatus: NearbyStopsState;
  locationStatus: LocationState;
  locationRequested: boolean;
  connectivityStatus: ConnectivityState;
  regionalStopsStatus: RegionalStopsStatus;
  staticServicesStatus: DataLoadStatus;
  largeText: boolean;
  lightMode: boolean;
  highContrast: boolean;
  onChangeSearchQuery: (query: string) => void;
  onOpenSearch: () => void;
  onOpenDestinationSearch: () => void;
  onOpenOriginSearch: () => void;
  onSelectJourneyDestination: (destination: JourneyPoint) => void;
  onSwapJourneyPoints: () => void;
  onChooseDestinationOnMap: () => void;
  onConfirmMapDestination: () => void;
  onSelectJourneyAlternative: (alternativeId: string) => void;
  onStartJourneyPlan: () => void;
  onCloseSearch: () => void;
  onClearSearch: () => void;
  onSelectSearchStop: (stop: StaticSearchStop) => void;
  onSelectSearchPlace: (landmark: MapLandmark) => void;
  onSelectSearchService: (serviceNo: string) => void;
  onSelectStop: (stop: NearbyBusStop) => void;
  onSelectLandmark: (landmark: MapLandmark) => void;
  onMapLayoutChange: (layout: MapLayoutSize) => void;
  onMoveMap: () => void;
  onProviderViewportChange: (viewport: ProviderViewportChange) => void;
  onFocusCluster: (center: MapCoordinate) => void;
  onRecenter: () => void;
  onLocateMap: () => void;
  onOpenNearby: () => void;
  onToggleAccessibleRoutesOnly: () => void;
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
  onRetryDirections: () => void;
  onChangeMobilityMode: (mode: MobilityMode) => void;
  onStartGuidance: () => void;
  onRecalculateDirections: () => void;
  onContinueWithoutRerouting: () => void;
  onRepeatWalkingGuidance: () => void;
  onUseLocationForDirections: () => void;
  onStopDirections: () => void;
  onClearSelectedStop: () => void;
  onExitMap: () => void;
  onConfirm: () => void;
  onSelectService: (serviceNo: string) => void;
  onHear: () => void;
  onHearDirections: () => void;
  onRetryRegionalStops: () => void;
  onRetryStopServices: () => void;
  onSetBottomSheetState: (state: BottomSheetState) => void;
}) {
  const [showMoreControls, setShowMoreControls] = useState(false);
  const [mapProviderRetryKey, setMapProviderRetryKey] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const theme = resolveVisualTheme(lightMode, highContrast);
  const mapProviderConfigured = shouldUseMapProvider(false);
  const searchActive = searchState.isOpen;
  const showNearbySheet = mapReady && nearbyOpen;
  const showMapUnavailableManualSelection =
    !mapReady && nearbyOpen && bottomSheetContent === "NEARBY";
  const plannerActive =
    !hasSelectedService && !selectedStop && !directionsActive;
  const mapInteractionMode: MapInteractionMode =
    mapPickMode === "DESTINATION"
      ? "CHOOSE_DESTINATION_ON_MAP"
      : directionsActive && followState !== "FREE"
        ? "FOLLOW_JOURNEY"
        : mapViewport.mode === "USER_LOCATION"
          ? "FOLLOW_USER"
          : "BROWSE";
  const contextualMapControl =
    mapReady && searchThisAreaVisible && !showMoreControls && !searchActive
      ? {
          accessibilityLabel:
            "Find bus stops in the currently visible map area",
          icon: Search,
          label: "Search this area",
          onPress: onRefreshLocation,
          type: "SEARCH_THIS_AREA",
        }
      : null;
  if (
    __DEV__ &&
    contextualMapControl &&
    (!contextualMapControl.label ||
      !contextualMapControl.icon ||
      !contextualMapControl.onPress)
  ) {
    console.warn("Invalid contextual map control", {
      icon: contextualMapControl.icon,
      label: contextualMapControl.label,
      type: contextualMapControl.type,
    });
  }
  const ContextualMapControlIcon = contextualMapControl?.icon;
  const effectiveBottomSheetState =
    showMoreControls ||
    (bottomSheetContent === "NEARBY" &&
      !showNearbySheet &&
      !showMapUnavailableManualSelection &&
      !selectedStop)
      ? "HIDDEN_PEEK"
      : bottomSheetState;
  const overlayLayout = {
    paddingRight: rightToolbarWidth + mapOverlayMargin,
  };
  const backAccessibilityLabel = searchActive
    ? "Back to nearby bus stops"
    : directionsActive
      ? "Back to bus stop details"
      : selectedStop
        ? "Back to nearby bus stops"
        : bottomSheetState !== "HIDDEN_PEEK"
          ? "Back to map"
          : "Back to previous view";
  const handleBack = () => {
    if (searchActive) {
      onCloseSearch();
      return;
    }
    if (showMoreControls) {
      setShowMoreControls(false);
      return;
    }
    if (directionsActive) {
      onStopDirections();
      return;
    }
    if (selectedStop) {
      onClearSelectedStop();
      return;
    }
    if (bottomSheetState !== "HIDDEN_PEEK") {
      onSetBottomSheetState("HIDDEN_PEEK");
      return;
    }
    onExitMap();
  };
  useEffect(() => {
    if (searchActive) {
      setShowMoreControls(false);
    }
  }, [searchActive]);
  useEffect(() => {
    logMapConfiguration("screen opened");
    if (mapProviderConfigured) {
      return;
    }
    setMapReady(false);
    setShowMoreControls(false);
    if (__DEV__ && process.env.NODE_ENV !== "test") {
      console.warn("[Map] initialization unavailable", {
        platform: Platform.OS,
        reason: mapTechnicalConfigurationMessage(),
      });
    }
  }, [mapProviderConfigured]);
  const handleMapProviderAvailabilityChange = useCallback((ready: boolean) => {
    setMapReady(ready);
    if (!ready) {
      setShowMoreControls(false);
    }
  }, []);
  const retryMapProvider = useCallback(() => {
    setMapReady(false);
    setShowMoreControls(false);
    setMapProviderRetryKey((current) => {
      const nextAttempt = current + 1;
      if (__DEV__ && process.env.NODE_ENV !== "test") {
        console.info("[Map] retry requested", {
          attempt: nextAttempt,
          platform: Platform.OS,
          provider: Platform.OS === "web" ? "OPENSTREETMAP" : "GOOGLE_MAPS",
        });
      }
      return nextAttempt;
    });
  }, []);
  const routeSheetHeight =
    guidanceStatus === "ACTIVE"
      ? 300
      : directionsActive
        ? 430
        : mapBottomSheetHeights[effectiveBottomSheetState];
  const routeFitPadding = {
    top: Math.max(96, mapCameraGeometry.insets.top),
    right: Math.max(
      rightToolbarWidth + mapOverlayMargin * 2,
      mapCameraGeometry.insets.right,
    ),
    bottom: Math.max(
      bottomNavigationHeight + routeSheetHeight + mapOverlayMargin,
      mapCameraGeometry.insets.bottom,
    ),
    left: Math.max(18, mapCameraGeometry.insets.left),
  };
  const visibleMapLayers =
    guidanceStatus === "ACTIVE" ? { ...layers, busStops: false } : layers;

  return (
    <View
      style={[
        styles.mapFirstScreen,
        { backgroundColor: theme.colors.map.background },
      ]}
    >
      <NearbyStopsMap
        stops={stops}
        recommendedStopCode={recommendedStopCode}
        selectedStop={selectedStop}
        selectedLandmark={selectedLandmark}
        landmarks={landmarks}
        currentLocation={currentLocation}
        mapViewport={mapViewport}
        mapCameraGeometry={mapCameraGeometry}
        layers={visibleMapLayers}
        mapManuallyMoved={mapManuallyMoved}
        mapInteractionMode={mapInteractionMode}
        directionsActive={directionsActive}
        followMode={followState !== "FREE"}
        hasSelectedService={hasSelectedService}
        providerRetryKey={mapProviderRetryKey}
        journeyAlternative={plannerActive ? selectedJourneyAlternative : null}
        walkingRoute={walkingRoute}
        routeFitKey={routeFitKey}
        routeFitPadding={routeFitPadding}
        locationPulseKey={locationPulseKey}
        reducedMotion={reducedMotion}
        mapPickCandidate={mapPickMode ? mapPickCandidate : null}
        headingDegrees={headingDegrees}
        largeText={largeText}
        lightMode={lightMode}
        highContrast={highContrast}
        showInlineControls={false}
        onSelectStop={(stop) => {
          setShowMoreControls(false);
          onSetBottomSheetState("HIDDEN_PEEK");
          onSelectStop(stop);
        }}
        onSelectLandmark={(landmark) => {
          setShowMoreControls(false);
          onSelectLandmark(landmark);
        }}
        onMapLayoutChange={onMapLayoutChange}
        onMoveMap={onMoveMap}
        onProviderAvailabilityChange={handleMapProviderAvailabilityChange}
        onProviderViewportChange={onProviderViewportChange}
        onFocusCluster={(center) => {
          setShowMoreControls(false);
          onFocusCluster(center);
        }}
        onRecenter={onRecenter}
        onRetryMap={retryMapProvider}
        onRefreshLocation={onRefreshLocation}
        onSelectBusStopManually={onOpenNearby}
        onShowRoute={onShowRoute}
        onToggleFollow={onToggleFollow}
        onToggleLayer={onToggleLayer}
        onResetHeading={onResetHeading}
      />
      <View
        style={[styles.mapOverlayLayoutManager, overlayLayout]}
        pointerEvents="box-none"
      >
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
              query={searchState.query}
              onChangeQuery={onChangeSearchQuery}
              onFocus={onOpenSearch}
              largeText={largeText}
              lightMode={lightMode}
              highContrast={highContrast}
            />
          </View>
        </View>
        {contextualMapControl && ContextualMapControlIcon ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={contextualMapControl.accessibilityLabel}
            onPress={contextualMapControl.onPress}
            style={[
              styles.mapFirstSearchAreaControl,
              {
                backgroundColor: theme.colors.selectedSurface,
                borderColor: theme.colors.map.selectionAccent,
              },
              lightMode && lightStyles.recenterControl,
              highContrast && !lightMode && styles.highContrastSelectedControl,
              highContrast &&
                lightMode &&
                lightStyles.highContrastSelectedControl,
            ]}
          >
            <ContextualMapControlIcon
              size={17}
              color={controlIconColor({
                active: true,
                lightMode,
                highContrast,
              })}
              strokeWidth={3}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text
              style={[
                styles.mapControlText,
                { color: theme.colors.iconSelected },
                highContrast && styles.highContrastSelectedText,
              ]}
            >
              {contextualMapControl.label}
            </Text>
          </Pressable>
        ) : null}
        {mapReady && regionalStopsStatus === "LOADING" ? (
          <MapStatusPill
            message="Loading stops..."
            lightMode={lightMode}
            highContrast={highContrast}
          />
        ) : null}
        {mapReady && regionalStopsStatus === "ERROR" ? (
          <MapStatusPill
            message={
              stops.length > 0
                ? "Unable to update bus stops"
                : "Unable to load bus stops"
            }
            isAlert
            error
            lightMode={lightMode}
            highContrast={highContrast}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry loading bus stops"
              onPress={onRetryRegionalStops}
              style={styles.regionalStopsRetry}
            >
              <RefreshCw
                size={14}
                color={theme.colors.actionPrimary}
                strokeWidth={2.8}
              />
              <Text
                style={[
                  styles.statusLabel,
                  { color: theme.colors.actionPrimary },
                ]}
              >
                Retry
              </Text>
            </Pressable>
          </MapStatusPill>
        ) : null}
        {mapReady && regionalStopsStatus === "SUCCESS" && stops.length === 0 ? (
          <MapStatusPill
            message="No bus stops in this area."
            lightMode={lightMode}
            highContrast={highContrast}
          />
        ) : null}
      </View>
      {mapReady && mapPickMode === "DESTINATION" && !searchActive ? (
        <MapDestinationPicker
          candidate={mapPickCandidate}
          lightMode={lightMode}
          highContrast={highContrast}
          onConfirm={onConfirmMapDestination}
        />
      ) : null}
      {mapReady && !searchActive ? (
        <MapSideControls
          sheetState={bottomSheetState}
          sheetContent={bottomSheetContent}
          nearbyOpen={nearbyOpen}
          moreOpen={showMoreControls}
          bearingDegrees={mapViewport.bearing}
          followState={followState}
          lightMode={lightMode}
          highContrast={highContrast}
          onLocate={() => {
            onLocateMap();
          }}
          onNearby={() => {
            onOpenNearby();
          }}
          onMore={() => {
            onSetBottomSheetState("HIDDEN_PEEK");
            setShowMoreControls((current) => !current);
          }}
          onResetHeading={onResetHeading}
        />
      ) : null}
      {mapReady && showMoreControls ? (
        <View
          pointerEvents="none"
          style={[
            styles.mapOptionsScrim,
            {
              backgroundColor: lightMode
                ? "rgba(14, 34, 39, 0.12)"
                : "rgba(0, 0, 0, 0.32)",
            },
            highContrast && !lightMode && styles.highContrastMapOptionsScrim,
          ]}
        />
      ) : null}
      {mapReady && showMoreControls ? (
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
          hasSelectedDestination={hasSelectedDestination}
          onClose={() => setShowMoreControls(false)}
          selectedStop={selectedStop}
        />
      ) : null}
      {searchActive ? (
        <BusStopSearchOverlay
          searchState={searchState}
          searchMode={searchMode}
          largeText={largeText}
          lightMode={lightMode}
          highContrast={highContrast}
          onChangeQuery={onChangeSearchQuery}
          onClose={onCloseSearch}
          onClear={onClearSearch}
          onSelectStop={onSelectSearchStop}
          onSelectPlace={onSelectSearchPlace}
          onSelectService={onSelectSearchService}
          onChooseOnMap={onChooseDestinationOnMap}
        />
      ) : (
        <JourneyBottomSheet
          stops={nearbyStops}
          accessibleStopRoutes={accessibleStopRoutes}
          accessibleRoutesOnly={accessibleRoutesOnly}
          recommendedStopCode={recommendedStopCode}
          selectedStop={selectedStop}
          selectedLandmark={selectedLandmark}
          journeyOrigin={journeyOrigin}
          journeyDestination={journeyDestination}
          journeyAlternatives={journeyAlternatives}
          selectedJourneyAlternative={selectedJourneyAlternative}
          recentDestinations={recentDestinations}
          query={query}
          nearbyHeading={nearbyHeading}
          sheetContent={bottomSheetContent}
          landmarks={landmarks}
          nearbyStatus={nearbyStatus}
          locationStatus={locationStatus}
          locationRequested={locationRequested}
          connectivityStatus={connectivityStatus}
          staticServicesStatus={staticServicesStatus}
          state={effectiveBottomSheetState}
          lastExpandedState={lastExpandedSheetState}
          directionsActive={directionsActive}
          directionsStatus={directionsStatus}
          directionsError={directionsError}
          mobilityMode={mobilityMode}
          wheelchairRoutingPreferred={wheelchairRoutingPreferred}
          wheelchairRoutingAvailable={wheelchairRoutingAvailable}
          walkingRoute={walkingRoute}
          walkingRouteProgress={walkingRouteProgress}
          walkingRouteOffRoute={walkingRouteOffRoute}
          walkingLocationAccuracyLimited={walkingLocationAccuracyLimited}
          canRepeatWalkingGuidance={canRepeatWalkingGuidance}
          guidanceStatus={guidanceStatus}
          largeText={largeText}
          lightMode={lightMode}
          highContrast={highContrast}
          onSetState={onSetBottomSheetState}
          onSelectStop={onSelectStop}
          onSelectLandmark={onSelectLandmark}
          onOpenOriginSearch={onOpenOriginSearch}
          onOpenDestinationSearch={onOpenDestinationSearch}
          onSelectJourneyAlternative={onSelectJourneyAlternative}
          onSelectJourneyDestination={onSelectJourneyDestination}
          onSwapJourneyPoints={onSwapJourneyPoints}
          onChooseDestinationOnMap={onChooseDestinationOnMap}
          onStartJourneyPlan={onStartJourneyPlan}
          onRetryNearby={onRefreshLocation}
          onToggleAccessibleRoutesOnly={onToggleAccessibleRoutesOnly}
          onRetryStopServices={onRetryStopServices}
          onSearchForStop={onSearchForStop}
          onConfirm={onConfirm}
          onSelectService={onSelectService}
          onHear={onHear}
          onDirections={onDirections}
          onRetryDirections={onRetryDirections}
          onChangeMobilityMode={onChangeMobilityMode}
          onStartGuidance={onStartGuidance}
          onRecalculateDirections={onRecalculateDirections}
          onContinueWithoutRerouting={onContinueWithoutRerouting}
          onRepeatWalkingGuidance={onRepeatWalkingGuidance}
          onUseLocationForDirections={onUseLocationForDirections}
          onStopDirections={onStopDirections}
          onChooseDifferentStop={onClearSelectedStop}
          onHearDirections={onHearDirections}
        />
      )}
    </View>
  );
}

function JourneyPlannerCard({
  origin,
  destination,
  recentDestinations,
  selectedAlternative,
  embedded = false,
  lightMode,
  highContrast,
  largeText,
  onOpenOriginSearch,
  onOpenDestinationSearch,
  onSwap,
  onChooseOnMap,
  onSelectRecentDestination,
}: {
  origin: JourneyPoint;
  destination: JourneyPoint | null;
  recentDestinations: JourneyPoint[];
  selectedAlternative: JourneyAlternative | null;
  embedded?: boolean;
  lightMode: boolean;
  highContrast: boolean;
  largeText: boolean;
  onOpenOriginSearch: () => void;
  onOpenDestinationSearch: () => void;
  onSwap: () => void;
  onChooseOnMap: () => void;
  onSelectRecentDestination: (point: JourneyPoint) => void;
}) {
  const theme = resolveVisualTheme(lightMode, highContrast);
  const quickDestinations =
    recentDestinations.length > 0
      ? recentDestinations
      : defaultJourneySuggestions;
  const journeyFieldSurface = lightMode
    ? theme.colors.surfaceInteractive
    : theme.colors.surfaceRaised;
  const journeyFieldBorder = highContrast
    ? theme.colors.borderStrong
    : theme.colors.borderInteractive;
  return (
    <View
      style={[
        embedded ? styles.journeyPlannerSheetPanel : styles.journeyPlannerCard,
        !embedded && {
          backgroundColor: theme.colors.map.sheetSurface,
          borderColor: theme.colors.map.sheetBorder,
        },
        !embedded && lightMode && lightStyles.mapBottomSheet,
        !embedded && highContrast && !lightMode && styles.highContrastControl,
        !embedded &&
          highContrast &&
          lightMode &&
          lightStyles.highContrastControl,
      ]}
      accessible
      accessibilityLabel={`Journey planner. From ${origin.label}. To ${destination?.label ?? "not selected"}.`}
    >
      <View style={styles.journeyFields}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Change starting point. Current start ${origin.label}.`}
          onPress={onOpenOriginSearch}
          style={[
            styles.journeyFieldRow,
            {
              backgroundColor: journeyFieldSurface,
              borderColor: journeyFieldBorder,
            },
            highContrast && {
              borderColor: theme.colors.borderSelected,
              borderWidth: 2,
            },
          ]}
        >
          <LocateFixed
            size={20}
            color={theme.colors.locationCurrent}
            strokeWidth={2.75}
          />
          <View style={styles.landmarkSearchTextGroup}>
            <Text
              style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}
            >
              FROM
            </Text>
            <Text
              style={[
                styles.summaryValue,
                largeText && styles.largeBody,
                lightMode && lightStyles.text,
              ]}
            >
              {origin.label}
            </Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Swap origin and destination"
          onPress={onSwap}
          style={styles.swapJourneyButton}
        >
          <RefreshCw
            size={18}
            color={theme.colors.map.controlIcon}
            strokeWidth={2.75}
          />
          <Text
            style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}
          >
            Swap
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            destination
              ? `Change destination. Current destination ${destination.label}.`
              : "Where are you going?"
          }
          onPress={onOpenDestinationSearch}
          style={[
            styles.journeyFieldRow,
            {
              backgroundColor: journeyFieldSurface,
              borderColor: destination
                ? theme.colors.borderSelected
                : journeyFieldBorder,
            },
            destination && {
              backgroundColor: lightMode
                ? theme.colors.surfaceRaised
                : theme.colors.surfacePrimary,
              borderWidth: 2,
            },
            highContrast && {
              borderColor: theme.colors.borderSelected,
              borderWidth: 2,
            },
          ]}
        >
          <MapPinned
            size={20}
            color={theme.colors.destination}
            strokeWidth={2.75}
          />
          <View style={styles.landmarkSearchTextGroup}>
            <Text
              style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}
            >
              TO
            </Text>
            <Text
              style={[
                styles.summaryValue,
                largeText && styles.largeBody,
                lightMode && lightStyles.text,
              ]}
            >
              {destination?.label ?? "Where are you going?"}
            </Text>
          </View>
        </Pressable>
      </View>
      {!destination ? (
        <>
          <View style={styles.quickDestinationRow}>
            {quickDestinations.slice(0, 3).map((point) => (
              <Pressable
                key={point.id}
                accessibilityRole="button"
                accessibilityLabel={`Set destination to ${point.label}`}
                onPress={() => onSelectRecentDestination(point)}
                style={[
                  styles.quickDestinationChip,
                  lightMode && lightStyles.infoPill,
                ]}
              >
                <Text
                  style={[
                    styles.quickDestinationText,
                    lightMode && lightStyles.text,
                  ]}
                >
                  {point.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <SecondaryButton
            label="Choose on map"
            icon={MapPinned}
            onPress={onChooseOnMap}
            lightMode={lightMode}
            highContrast={highContrast}
          />
        </>
      ) : selectedAlternative ? (
        <Text
          style={[
            styles.bodyText,
            largeText && styles.largeBody,
            lightMode && lightStyles.bodyText,
          ]}
        >
          {selectedAlternative.title}: {selectedAlternative.totalMinutes} min
          via Bus {selectedAlternative.serviceNo}.
        </Text>
      ) : (
        <Text
          style={[
            styles.bodyText,
            largeText && styles.largeBody,
            lightMode && lightStyles.bodyText,
          ]}
        >
          No route options found from this starting point.
        </Text>
      )}
    </View>
  );
}

function MapDestinationPicker({
  candidate,
  lightMode,
  highContrast,
  onConfirm,
}: {
  candidate: JourneyPoint;
  lightMode: boolean;
  highContrast: boolean;
  onConfirm: () => void;
}) {
  const theme = resolveVisualTheme(lightMode, highContrast);
  return (
    <>
      <View
        style={[
          styles.fixedDestinationPin,
          {
            backgroundColor: theme.colors.destination,
            borderColor: theme.colors.map.routeOutline,
          },
          highContrast && {
            borderColor: theme.colors.borderStrong,
            borderWidth: 3,
          },
        ]}
        pointerEvents="none"
      >
        <MapPinned
          size={34}
          color={theme.colors.iconSelected}
          strokeWidth={3}
        />
      </View>
      <View
        style={[
          styles.mapDestinationPickerCard,
          {
            backgroundColor: theme.colors.map.sheetSurface,
            borderColor: theme.colors.map.sheetBorder,
          },
          lightMode && lightStyles.mapBottomSheet,
        ]}
      >
        <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>
          {candidate.label}
        </Text>
        {candidate.description ? (
          <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
            {candidate.description}
          </Text>
        ) : null}
        <PrimaryButton
          label="Set as destination"
          icon={CircleCheck}
          onPress={onConfirm}
          lightMode={lightMode}
          highContrast={highContrast}
        />
      </View>
    </>
  );
}

function JourneyPlanBottomSheet({
  origin,
  destination,
  alternatives,
  selectedAlternative,
  expanded,
  largeText,
  lightMode,
  highContrast,
  onSelectAlternative,
  onStartJourney,
}: {
  origin: JourneyPoint;
  destination: JourneyPoint | null;
  alternatives: JourneyAlternative[];
  selectedAlternative: JourneyAlternative;
  expanded: boolean;
  largeText: boolean;
  lightMode: boolean;
  highContrast: boolean;
  onSelectAlternative: (alternativeId: string) => void;
  onStartJourney: () => void;
}) {
  const bodyStyle = [
    styles.bodyText,
    largeText && styles.largeBody,
    lightMode && lightStyles.bodyText,
  ];
  return (
    <ScrollView
      style={styles.mapBottomSheetScroll}
      contentContainerStyle={styles.mapBottomSheetContent}
    >
      <Text style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}>
        RECOMMENDED FOR YOU
      </Text>
      <View
        accessible
        accessibilityLabel={journeyAlternativeAnnouncement(
          selectedAlternative,
          destination,
        )}
        style={[styles.journeyOptionCard, lightMode && lightStyles.surface]}
      >
        <View style={styles.journeyOptionHeader}>
          <ServiceNumberWithAccessibility
            serviceNo={selectedAlternative.serviceNo}
            accessible={false}
            prefix="Bus"
            textStyle={[
              styles.summaryValue,
              largeText && styles.largeBody,
              lightMode && lightStyles.text,
            ]}
            lightMode={lightMode}
            highContrast={highContrast}
          />
          <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>
            {selectedAlternative.totalMinutes} min
          </Text>
        </View>
        <Text style={bodyStyle}>
          {selectedAlternative.recommendation} - Walk{" "}
          {selectedAlternative.walkingMinutes} min -{" "}
          {selectedAlternative.stopCount} stops
        </Text>
        <View style={styles.infoRow}>
          {selectedAlternative.badges.map((badge) => (
            <Text
              key={badge}
              style={[styles.infoPill, lightMode && lightStyles.infoPill]}
            >
              {badge}
            </Text>
          ))}
        </View>
      </View>

      {alternatives.length > 1 ? (
        <>
          <Text
            style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}
          >
            ROUTE OPTIONS
          </Text>
          {alternatives.map((alternative) => (
            <Pressable
              key={alternative.id}
              accessibilityRole="button"
              accessibilityState={{
                selected: alternative.id === selectedAlternative.id,
              }}
              accessibilityLabel={`${alternative.title}. ${alternative.totalMinutes} minutes. ${alternative.recommendation}.`}
              onPress={() => onSelectAlternative(alternative.id)}
              style={[
                styles.routeAlternativeRow,
                alternative.id === selectedAlternative.id &&
                  styles.selectedRouteAlternativeRow,
                lightMode && lightStyles.surface,
              ]}
            >
              <Text style={[styles.statusValue, lightMode && lightStyles.text]}>
                Bus {alternative.serviceNo}
              </Text>
              <Text style={bodyStyle}>
                {alternative.totalMinutes} min - {alternative.stopCount} stops -{" "}
                {alternative.recommendation}
              </Text>
            </Pressable>
          ))}
        </>
      ) : null}

      <Text style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}>
        YOUR JOURNEY
      </Text>
      <JourneyStepList
        alternative={selectedAlternative}
        expanded={expanded}
        lightMode={lightMode}
        largeText={largeText}
      />
      {expanded ? (
        <Text style={bodyStyle}>
          From {origin.label} to{" "}
          {destination?.label ?? selectedAlternative.alightingStop.description}.
        </Text>
      ) : null}
      <PrimaryButton
        label="Start this journey"
        icon={ArrowRight}
        onPress={onStartJourney}
        lightMode={lightMode}
        highContrast={highContrast}
      />
    </ScrollView>
  );
}

function JourneyStepList({
  alternative,
  expanded,
  lightMode,
  largeText,
}: {
  alternative: JourneyAlternative;
  expanded: boolean;
  lightMode: boolean;
  largeText: boolean;
}) {
  const steps = journeyStepsForAlternative(alternative);
  return (
    <View style={styles.journeyStepList}>
      {steps.slice(0, expanded ? steps.length : 3).map((step, index) => (
        <View key={step} style={styles.journeyStepRow}>
          <Text
            style={[styles.routeProgressMarker, lightMode && lightStyles.text]}
          >
            {index + 1}
          </Text>
          <Text
            style={[
              styles.bodyText,
              largeText && styles.largeBody,
              lightMode && lightStyles.bodyText,
            ]}
          >
            {step}
          </Text>
        </View>
      ))}
    </View>
  );
}

function MapSideControls({
  sheetState,
  sheetContent,
  nearbyOpen,
  moreOpen,
  bearingDegrees,
  followState,
  lightMode,
  highContrast,
  onLocate,
  onNearby,
  onMore,
  onResetHeading,
}: {
  sheetState: BottomSheetState;
  sheetContent: MapBottomSheetContent;
  nearbyOpen: boolean;
  moreOpen: boolean;
  bearingDegrees: number;
  followState: MapFollowState;
  lightMode: boolean;
  highContrast: boolean;
  onLocate: () => void;
  onNearby: () => void;
  onMore: () => void;
  onResetHeading: () => void;
}) {
  const runtimeAccessibility = useContext(AccessibilityRuntimeContext);
  const theme = resolveVisualTheme(lightMode, highContrast);
  const mapIsRotated = normalizeBearing(bearingDegrees) !== 0;
  const nearbyActive = nearbyOpen;
  const controls = [
    {
      key: "locate",
      label: followState === "FREE" ? "Locate" : "Following",
      accessibilityLabel:
        followState === "FOLLOW_USER_HEADING"
          ? "Following my location and heading"
          : followState === "FOLLOW_USER"
            ? "Following my location"
            : "Centre map on my current location",
      icon: LocateFixed,
      onPress: onLocate,
      active: followState !== "FREE",
    },
    {
      key: "nearby",
      label: "Nearby",
      accessibilityLabel: "Show nearby bus stops in this area",
      icon: List,
      onPress: onNearby,
      active: nearbyActive,
    },
    {
      key: "more",
      label: "More",
      icon: SlidersHorizontal,
      onPress: onMore,
      active: moreOpen,
    },
  ];

  return (
    <View testID="map-side-control-stack" style={styles.mapSideControls}>
      <CompassResetControl
        bearingDegrees={bearingDegrees}
        prominent={mapIsRotated}
        lightMode={lightMode}
        highContrast={highContrast}
        onPress={onResetHeading}
      />
      {controls.map(
        ({ key, label, accessibilityLabel, icon: Icon, onPress, active }) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityState={{
              expanded: key === "more" ? moreOpen : undefined,
              selected:
                key === "locate"
                  ? followState !== "FREE"
                  : key === "nearby"
                    ? nearbyActive
                    : key === "more"
                      ? moreOpen
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
              active &&
                highContrast &&
                !lightMode &&
                styles.highContrastSelectedControl,
              active &&
                highContrast &&
                lightMode &&
                lightStyles.highContrastSelectedControl,
              active && {
                backgroundColor: theme.colors.selectedSurface,
                borderColor: theme.colors.map.selectionAccent,
              },
              runtimeAccessibility.largerControls && styles.largerMapControl,
            ]}
          >
            <Icon
              size={23}
              color={
                active
                  ? theme.colors.iconSelected
                  : theme.colors.map.controlIcon
              }
              strokeWidth={2.8}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text
              style={[
                styles.mapSideControlText,
                { color: theme.colors.map.controlText },
                lightMode && lightStyles.text,
                active && styles.selectedMapListToggleText,
                active && lightMode && lightStyles.selectedMapListToggleText,
                {
                  color: active
                    ? theme.colors.iconSelected
                    : theme.colors.map.controlText,
                },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ),
      )}
    </View>
  );
}

function CompassResetControl({
  bearingDegrees,
  prominent,
  lightMode,
  highContrast,
  onPress,
}: {
  bearingDegrees: number;
  prominent: boolean;
  lightMode: boolean;
  highContrast: boolean;
  onPress: () => void;
}) {
  const theme = resolveVisualTheme(lightMode, highContrast);
  const bearing = normalizeBearing(bearingDegrees);
  const foreground = theme.colors.iconSelected;
  const northNeedleColor = highContrast
    ? foreground
    : theme.colors.statusAttention;
  const southNeedleColor = highContrast
    ? theme.colors.iconSelected
    : theme.colors.iconSelected;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Reset map to north"
      accessibilityHint={`Returns the map to north-up orientation without changing the current map position. Current bearing ${bearing} degrees.`}
      onPress={onPress}
      style={[
        styles.mapCompassControl,
        {
          backgroundColor: theme.colors.selectedSurface,
          borderColor: theme.colors.map.selectionAccent,
        },
        lightMode && lightStyles.activeMapSideControl,
        !prominent && styles.subtleMapCompassControl,
        highContrast && !lightMode && styles.highContrastSelectedControl,
        highContrast && lightMode && lightStyles.highContrastSelectedControl,
      ]}
    >
      <Text style={[styles.mapCompassText, { color: foreground }]}>N</Text>
      <View
        style={[
          styles.mapCompassDial,
          {
            borderColor: foreground,
          },
          highContrast && styles.highContrastCompassDial,
        ]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        <View
          style={[
            styles.compassNeedleAssembly,
            { transform: [{ rotate: `${-bearing}deg` }] },
          ]}
        >
          <View
            style={[
              styles.compassNeedleNorth,
              { borderBottomColor: northNeedleColor },
            ]}
          />
          <View
            style={[
              styles.compassNeedleSouth,
              { borderTopColor: southNeedleColor },
            ]}
          />
        </View>
        <View style={[styles.compassPivot, { backgroundColor: foreground }]} />
      </View>
    </Pressable>
  );
}

function normalizeBearing(bearingDegrees: number) {
  const bearing = Math.round(bearingDegrees) % 360;
  return bearing < 0 ? bearing + 360 : bearing;
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
  hasSelectedDestination,
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
  hasSelectedDestination: boolean;
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
    {
      layer: "busStops",
      label: "Stops",
      accessibilityLabel: "Stops",
      icon: MapPin,
    },
    {
      layer: "selectedService",
      label: "Bus",
      accessibilityLabel: "Bus vehicles",
      icon: BusFront,
      disabled: !hasSelectedService,
      reason: "Choose a bus service first",
    },
    {
      layer: "landmarks",
      label: "Places",
      accessibilityLabel: "Places",
      icon: MapPinned,
    },
    {
      layer: "walkingRoute",
      label: "Route",
      accessibilityLabel: "Route",
      icon: Route,
      disabled: !selectedStop && !hasSelectedService,
      reason: "Select a stop or bus route first",
    },
    {
      layer: "accessibility",
      label: "Accessibility",
      accessibilityLabel: "Accessibility information",
      icon: Accessibility,
    },
  ];
  const actionRows = [
    {
      label: "View journey",
      accessibilityLabel: "View current journey",
      icon: Navigation,
      onPress: onShowRoute,
      disabled: !hasSelectedDestination,
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
      label: "North up",
      accessibilityLabel: "North up",
      icon: Compass,
      onPress: onResetHeading,
      disabled: isNorthUp,
      reason: "Map is already north up",
      state: undefined,
    },
    {
      label: "Reset map",
      accessibilityLabel: "Reset map view",
      icon: RefreshCw,
      onPress: onResetMap,
      state: undefined,
    },
  ];
  const runCameraAction = (
    action: () => void,
    disabled?: boolean,
    reason?: string,
  ) => {
    if (disabled && reason) {
      announceUnavailable(reason);
      return;
    }
    action();
    onClose();
  };
  const selectedForeground = theme.colors.iconSelected;
  const disabledLabelColor = lightMode ? "#3F4D50" : theme.colors.textSecondary;
  const disabledReasonColor = lightMode ? "#5F7075" : theme.colors.textMuted;
  const disabledRowSurface = lightMode
    ? "#EEF3F4"
    : theme.colors.actionSecondary;
  const normalRowSurface = theme.colors.map.overlaySurface;
  const renderCompactSwitch = ({
    state,
    disabled,
    selected,
  }: {
    state: "ON" | "OFF";
    disabled?: boolean;
    selected?: boolean;
  }) => {
    const switchForeground = selected
      ? selectedForeground
      : disabled
        ? disabledLabelColor
        : theme.colors.textSecondary;
    return (
      <View
        style={[
          styles.mapMoreSwitch,
          {
            backgroundColor: selected ? "transparent" : normalRowSurface,
            borderColor: selected
              ? selectedForeground
              : disabled
                ? theme.colors.borderDefault
                : theme.colors.borderStrong,
          },
        ]}
      >
        <View
          style={[
            styles.mapMoreSwitchKnob,
            { backgroundColor: switchForeground },
            state === "ON" && styles.mapMoreSwitchKnobOn,
          ]}
        />
        <Text style={[styles.mapMoreSwitchText, { color: switchForeground }]}>
          {state}
        </Text>
      </View>
    );
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
        persistentScrollbar={false}
      >
        <View style={styles.mapMoreHeader}>
          <Text
            style={[styles.mapMoreTitle, { color: theme.colors.textPrimary }]}
          >
            Map options
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close map options"
            onPress={onClose}
            hitSlop={8}
            style={styles.mapMoreCloseButton}
          >
            <CircleX
              size={20}
              color={theme.colors.map.controlIcon}
              strokeWidth={2.8}
            />
          </Pressable>
        </View>
        <Text
          style={[
            styles.mapMoreSectionTitle,
            { color: theme.colors.textSecondary },
          ]}
        >
          MAP LAYERS
        </Text>
        {layerRows.map(
          ({
            layer,
            label,
            accessibilityLabel,
            icon: Icon,
            disabled,
            reason,
          }) => {
            const active = layers[layer];
            const visibleActive = active && !disabled;
            const rowTextColor = visibleActive
              ? selectedForeground
              : disabled
                ? disabledLabelColor
                : theme.colors.textPrimary;
            const rowIconColor = visibleActive
              ? selectedForeground
              : disabled
                ? theme.colors.iconDisabled
                : theme.colors.iconPrimary;
            return (
              <Pressable
                key={layer}
                accessibilityRole="switch"
                accessibilityLabel={`${accessibilityLabel}, map layer, ${disabled ? "disabled" : visibleActive ? "on" : "off"}`}
                accessibilityState={{ checked: visibleActive, disabled }}
                onPress={() =>
                  disabled && reason
                    ? announceUnavailable(reason)
                    : onToggleLayer(layer)
                }
                style={[
                  styles.mapMoreRow,
                  {
                    borderColor: theme.colors.borderDefault,
                    backgroundColor: disabled
                      ? disabledRowSurface
                      : visibleActive
                        ? theme.colors.selectedSurface
                        : normalRowSurface,
                  },
                  disabled && styles.disabledMapMoreControl,
                ]}
              >
                <Icon size={18} color={rowIconColor} strokeWidth={2.8} />
                <View style={styles.mapMoreLabelGroup}>
                  <Text
                    style={[styles.mapMoreControlText, { color: rowTextColor }]}
                  >
                    {label}
                  </Text>
                  {disabled && reason ? (
                    <Text
                      style={[
                        styles.mapMoreReasonText,
                        { color: disabledReasonColor },
                      ]}
                    >
                      {reason}
                    </Text>
                  ) : null}
                </View>
                {renderCompactSwitch({
                  state: visibleActive ? "ON" : "OFF",
                  disabled,
                  selected: visibleActive,
                })}
              </Pressable>
            );
          },
        )}
        <View
          style={[
            styles.mapMoreDivider,
            { backgroundColor: theme.colors.borderDefault },
          ]}
        />
        <Text
          style={[
            styles.mapMoreSectionTitle,
            { color: theme.colors.textSecondary },
          ]}
        >
          JOURNEY
        </Text>
        {actionRows.map(
          ({
            label,
            accessibilityLabel,
            icon: Icon,
            onPress,
            disabled,
            reason,
          }) => (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={accessibilityLabel}
              accessibilityState={{ disabled }}
              onPress={() => runCameraAction(onPress, disabled, reason)}
              style={[
                styles.mapMoreRow,
                {
                  borderColor: theme.colors.borderDefault,
                  backgroundColor: disabled
                    ? disabledRowSurface
                    : normalRowSurface,
                },
                disabled && styles.disabledMapMoreControl,
              ]}
            >
              <Icon
                size={17}
                color={controlIconColor({ disabled, lightMode, highContrast })}
                strokeWidth={2.8}
              />
              <View style={styles.mapMoreLabelGroup}>
                <Text
                  style={[
                    styles.mapMoreControlText,
                    {
                      color: disabled
                        ? disabledLabelColor
                        : theme.colors.textPrimary,
                    },
                  ]}
                >
                  {label}
                </Text>
                {disabled && reason ? (
                  <Text
                    style={[
                      styles.mapMoreReasonText,
                      { color: disabledReasonColor },
                    ]}
                  >
                    {reason}
                  </Text>
                ) : null}
              </View>
              <Text
                style={[
                  styles.mapMoreStateText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                ›
              </Text>
            </Pressable>
          ),
        )}
        <View
          style={[
            styles.mapMoreDivider,
            { backgroundColor: theme.colors.borderDefault },
          ]}
        />
        <Text
          style={[
            styles.mapMoreSectionTitle,
            { color: theme.colors.textSecondary },
          ]}
        >
          MAP VIEW
        </Text>
        {orientationRows.map(
          ({
            label,
            accessibilityLabel,
            icon: Icon,
            onPress,
            disabled,
            reason,
            state,
          }) => (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={accessibilityLabel}
              accessibilityState={{ disabled }}
              onPress={() => {
                runCameraAction(onPress, disabled, reason);
              }}
              style={[
                styles.mapMoreRow,
                {
                  borderColor: theme.colors.borderDefault,
                  backgroundColor: disabled
                    ? disabledRowSurface
                    : state === "ON"
                      ? theme.colors.selectedSurface
                      : normalRowSurface,
                },
                state === "ON" && {
                  backgroundColor: theme.colors.selectedSurface,
                },
                disabled && styles.disabledMapMoreControl,
              ]}
            >
              <Icon
                size={17}
                color={
                  state === "ON"
                    ? selectedForeground
                    : disabled
                      ? theme.colors.iconDisabled
                      : theme.colors.iconPrimary
                }
                strokeWidth={2.8}
              />
              <View style={styles.mapMoreLabelGroup}>
                <Text
                  style={[
                    styles.mapMoreControlText,
                    {
                      color:
                        state === "ON"
                          ? selectedForeground
                          : disabled
                            ? disabledLabelColor
                            : theme.colors.textPrimary,
                    },
                  ]}
                >
                  {label}
                </Text>
                {disabled && reason ? (
                  <Text
                    style={[
                      styles.mapMoreReasonText,
                      { color: disabledReasonColor },
                    ]}
                  >
                    {reason}
                  </Text>
                ) : null}
              </View>
              {state ? (
                renderCompactSwitch({
                  state: state as "ON" | "OFF",
                  disabled,
                  selected: state === "ON",
                })
              ) : (
                <Text
                  style={[
                    styles.mapMoreStateText,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  ›
                </Text>
              )}
            </Pressable>
          ),
        )}
      </ScrollView>
    </View>
  );
}

function JourneyBottomSheet({
  stops,
  accessibleStopRoutes,
  accessibleRoutesOnly,
  recommendedStopCode,
  selectedStop,
  selectedLandmark,
  journeyOrigin,
  journeyDestination,
  journeyAlternatives,
  selectedJourneyAlternative,
  recentDestinations,
  query,
  nearbyHeading,
  sheetContent,
  landmarks,
  nearbyStatus,
  locationStatus,
  locationRequested,
  connectivityStatus,
  staticServicesStatus,
  state,
  lastExpandedState,
  directionsActive,
  directionsStatus,
  directionsError,
  mobilityMode,
  wheelchairRoutingPreferred,
  wheelchairRoutingAvailable,
  walkingRoute,
  walkingRouteProgress,
  walkingRouteOffRoute,
  walkingLocationAccuracyLimited,
  canRepeatWalkingGuidance,
  guidanceStatus,
  largeText,
  lightMode,
  highContrast,
  onSetState,
  onSelectStop,
  onSelectLandmark,
  onOpenOriginSearch,
  onOpenDestinationSearch,
  onSelectJourneyAlternative,
  onSelectJourneyDestination,
  onSwapJourneyPoints,
  onChooseDestinationOnMap,
  onStartJourneyPlan,
  onRetryNearby,
  onToggleAccessibleRoutesOnly,
  onRetryStopServices,
  onSearchForStop,
  onConfirm,
  onSelectService,
  onHear,
  onDirections,
  onRetryDirections,
  onChangeMobilityMode,
  onStartGuidance,
  onRecalculateDirections,
  onContinueWithoutRerouting,
  onRepeatWalkingGuidance,
  onUseLocationForDirections,
  onStopDirections,
  onChooseDifferentStop,
  onHearDirections,
}: {
  stops: NearbyBusStop[];
  accessibleStopRoutes: Record<string, AccessibleStopRouteStatus>;
  accessibleRoutesOnly: boolean;
  recommendedStopCode?: string;
  selectedStop: NearbyBusStop | null;
  selectedLandmark: MapLandmark | null;
  journeyOrigin: JourneyPoint;
  journeyDestination: JourneyPoint | null;
  journeyAlternatives: JourneyAlternative[];
  selectedJourneyAlternative: JourneyAlternative | null;
  recentDestinations: JourneyPoint[];
  query: string;
  nearbyHeading: string;
  sheetContent: MapBottomSheetContent;
  landmarks: MapLandmark[];
  nearbyStatus: NearbyStopsState;
  locationStatus: LocationState;
  locationRequested: boolean;
  connectivityStatus: ConnectivityState;
  staticServicesStatus: DataLoadStatus;
  state: BottomSheetState;
  lastExpandedState: UsefulBottomSheetState;
  directionsActive: boolean;
  directionsStatus: DirectionsStatus;
  directionsError: string | null;
  mobilityMode: MobilityMode;
  wheelchairRoutingPreferred: boolean;
  wheelchairRoutingAvailable: boolean;
  walkingRoute: WalkingRoute | null;
  walkingRouteProgress: WalkingRouteProgress | null;
  walkingRouteOffRoute: boolean;
  walkingLocationAccuracyLimited: boolean;
  canRepeatWalkingGuidance: boolean;
  guidanceStatus: GuidanceStatus;
  largeText: boolean;
  lightMode: boolean;
  highContrast: boolean;
  onSetState: (state: BottomSheetState) => void;
  onSelectStop: (stop: NearbyBusStop) => void;
  onSelectLandmark: (landmark: MapLandmark) => void;
  onOpenOriginSearch: () => void;
  onOpenDestinationSearch: () => void;
  onSelectJourneyAlternative: (alternativeId: string) => void;
  onSelectJourneyDestination: (destination: JourneyPoint) => void;
  onSwapJourneyPoints: () => void;
  onChooseDestinationOnMap: () => void;
  onStartJourneyPlan: () => void;
  onRetryNearby: () => void;
  onToggleAccessibleRoutesOnly: () => void;
  onRetryStopServices: () => void;
  onSearchForStop: () => void;
  onConfirm: () => void;
  onSelectService: (serviceNo: string) => void;
  onHear: () => void;
  onDirections: () => void;
  onRetryDirections: () => void;
  onChangeMobilityMode: (mode: MobilityMode) => void;
  onStartGuidance: () => void;
  onRecalculateDirections: () => void;
  onContinueWithoutRerouting: () => void;
  onRepeatWalkingGuidance: () => void;
  onUseLocationForDirections: () => void;
  onStopDirections: () => void;
  onChooseDifferentStop: () => void;
  onHearDirections: () => void;
}) {
  const [previewService, setPreviewService] = useState<string | null>(null);
  const [directionsStepsExpanded, setDirectionsStepsExpanded] = useState(false);
  const { width: sheetViewportWidth } = useWindowDimensions();
  const compactServiceChips = sheetViewportWidth <= 320;
  const numberFirstServiceChips = sheetViewportWidth < 300;
  const theme = resolveVisualTheme(lightMode, highContrast);
  const sheetStyle =
    state === "HIDDEN_PEEK"
      ? styles.mapBottomSheetHiddenPeek
      : state === "EXPANDED"
        ? styles.mapBottomSheetExpanded
        : state === "MEDIUM"
          ? styles.mapBottomSheetMedium
          : styles.mapBottomSheetCollapsed;
  const sheetExpanded = state !== "HIDDEN_PEEK";
  const headerActionState: BottomSheetState = sheetExpanded
    ? "HIDDEN_PEEK"
    : lastExpandedState;
  const walkingMinutes = selectedStop
    ? Math.max(1, Math.round(selectedStop.distanceMeters / 70))
    : 0;
  const services = selectedStop ? busServicesForStop(selectedStop) : [];
  useEffect(() => {
    setPreviewService(null);
    setDirectionsStepsExpanded(false);
  }, [selectedStop?.busStopCode]);
  useEffect(() => {
    if (!directionsActive) {
      setDirectionsStepsExpanded(false);
    }
  }, [directionsActive]);
  const showSearchResults = query.trim().length > 0;
  const nearbyState = resolveNearbyStopsState({
    nearbyStatus,
    locationStatus,
    locationRequested,
    connectivityStatus,
    stopCount: stops.length,
  });
  const shortNearbyState =
    !showSearchResults &&
    !selectedStop &&
    !directionsActive &&
    nearbyState !== "success";
  const nearbySheetClosed =
    state === "HIDDEN_PEEK" &&
    !selectedStop &&
    !showSearchResults &&
    (sheetContent === "NEARBY" || nearbyHeading === "Nearby bus stops");
  const effectiveSheetStyle =
    state === "HIDDEN_PEEK"
      ? sheetStyle
      : directionsActive && guidanceStatus === "ACTIVE"
        ? styles.mapBottomSheetGuidance
        : selectedStop && state === "MEDIUM"
          ? styles.mapBottomSheetSelectedStop
          : shortNearbyState
            ? styles.mapBottomSheetContentFit
            : sheetStyle;
  const headerControlsNearby =
    (state === "HIDDEN_PEEK" && !selectedStop && !showSearchResults) ||
    (sheetContent === "NEARBY" && !selectedStop && !showSearchResults);
  const headerPressDisabled = headerControlsNearby && !sheetExpanded;
  const HeaderIcon = headerPressDisabled
    ? null
    : state === "HIDDEN_PEEK"
      ? APP_ICONS.expand
      : APP_ICONS.collapse;
  const headerAccessibilityLabel = headerControlsNearby
    ? `Nearby bus stops, ${sheetExpanded ? "expanded" : "collapsed"}`
    : sheetExpanded
      ? "Minimize stop panel"
      : `Expand stop panel to ${lastExpandedState.toLowerCase()} height`;
  const collapsedNearbyHeading = nearbyHeading;
  const handleSheetHeaderPress = () => {
    if (headerControlsNearby) {
      if (sheetExpanded) {
        onSetState("HIDDEN_PEEK");
        AccessibilityInfo.announceForAccessibility(
          "Nearby bus stops collapsed",
        );
        return;
      }
      return;
    }

    onSetState(headerActionState);
  };

  if (state === "HIDDEN_PEEK" || nearbySheetClosed) {
    return null;
  }

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
      accessibilityLabel={
        selectedStop
          ? directionsActive
            ? `${mobilityMode === "WHEELCHAIR" ? "Wheelchair" : "Walking"} directions to ${selectedStop.description}`
            : `Selected stop ${selectedStop.description}`
          : "Nearby bus stops"
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={headerAccessibilityLabel}
        accessibilityState={{
          disabled: headerPressDisabled || undefined,
          expanded: sheetExpanded,
        }}
        disabled={headerPressDisabled}
        onPress={handleSheetHeaderPress}
        style={styles.mapBottomSheetHeader}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={[
            styles.mapBottomSheetGrabber,
            { backgroundColor: theme.colors.map.sheetBorder },
          ]}
        />
        <View style={styles.sheetHeaderRow}>
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no"
            numberOfLines={1}
            style={[
              styles.sheetPeekLabel,
              { color: theme.colors.map.controlText },
              lightMode && lightStyles.text,
            ]}
          >
            {headerControlsNearby
              ? collapsedNearbyHeading
              : selectedStop
                ? directionsActive
                  ? guidanceStatus === "ACTIVE"
                    ? mobilityMode === "WHEELCHAIR"
                      ? "Wheelchair guidance"
                      : "Walking guidance"
                    : mobilityMode === "WHEELCHAIR"
                      ? "Wheelchair directions"
                      : "Walking directions"
                  : "Bus stop details"
                : "Journey details"}
          </Text>
          {HeaderIcon ? (
            <HeaderIcon
              size={iconSizes.small}
              color={controlIconColor({
                active: true,
                lightMode,
                highContrast,
              })}
              strokeWidth={highContrast ? 3.2 : 2.8}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          ) : null}
        </View>
      </Pressable>

      {!selectedStop &&
      (sheetContent === "PLANNER" ||
        (sheetContent === "ROUTE_OPTIONS" && !selectedJourneyAlternative)) ? (
        <ScrollView
          style={styles.mapBottomSheetScroll}
          contentContainerStyle={styles.mapBottomSheetContent}
        >
          <JourneyPlannerCard
            origin={journeyOrigin}
            destination={journeyDestination}
            recentDestinations={recentDestinations}
            selectedAlternative={selectedJourneyAlternative}
            embedded
            lightMode={lightMode}
            highContrast={highContrast}
            largeText={largeText}
            onOpenOriginSearch={onOpenOriginSearch}
            onOpenDestinationSearch={onOpenDestinationSearch}
            onSwap={onSwapJourneyPoints}
            onChooseOnMap={onChooseDestinationOnMap}
            onSelectRecentDestination={onSelectJourneyDestination}
          />
        </ScrollView>
      ) : !selectedStop &&
        sheetContent === "ROUTE_OPTIONS" &&
        selectedJourneyAlternative ? (
        <JourneyPlanBottomSheet
          origin={journeyOrigin}
          destination={journeyDestination}
          alternatives={journeyAlternatives}
          selectedAlternative={selectedJourneyAlternative}
          expanded={state === "EXPANDED"}
          largeText={largeText}
          lightMode={lightMode}
          highContrast={highContrast}
          onSelectAlternative={onSelectJourneyAlternative}
          onStartJourney={onStartJourneyPlan}
        />
      ) : showSearchResults && !selectedStop ? (
        <ScrollView
          style={styles.mapBottomSheetScroll}
          contentContainerStyle={styles.mapBottomSheetContent}
        >
          <Text
            style={[
              styles.busTitle,
              largeText && styles.largeBody,
              lightMode && lightStyles.text,
            ]}
          >
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
        <WalkingDirectionsSheet
          stop={selectedStop}
          status={directionsStatus}
          error={directionsError}
          mobilityMode={mobilityMode}
          wheelchairRoutingPreferred={wheelchairRoutingPreferred}
          wheelchairRoutingAvailable={wheelchairRoutingAvailable}
          route={walkingRoute}
          progress={walkingRouteProgress}
          offRoute={walkingRouteOffRoute}
          locationAccuracyLimited={walkingLocationAccuracyLimited}
          canRepeatGuidance={canRepeatWalkingGuidance}
          guidanceStatus={guidanceStatus}
          stepsExpanded={directionsStepsExpanded}
          largeText={largeText}
          lightMode={lightMode}
          highContrast={highContrast}
          onToggleSteps={() =>
            setDirectionsStepsExpanded((current) => !current)
          }
          onRetry={onRetryDirections}
          onChangeMobilityMode={onChangeMobilityMode}
          onUseLocation={onUseLocationForDirections}
          onStartGuidance={onStartGuidance}
          onRecalculate={onRecalculateDirections}
          onContinueWithoutRerouting={onContinueWithoutRerouting}
          onRepeatGuidance={onRepeatWalkingGuidance}
          onHear={onHearDirections}
          onChooseStop={onConfirm}
          onChooseDifferentStop={onChooseDifferentStop}
          onExit={onStopDirections}
        />
      ) : selectedStop ? (
        <View style={styles.selectedStopSheetBody}>
          <ScrollView
            style={styles.mapBottomSheetScroll}
            contentContainerStyle={styles.mapBottomSheetContent}
          >
            <View style={styles.iconTitleRow}>
              <MapPin
                size={26}
                color={controlIconColor({
                  active: true,
                  lightMode,
                  highContrast,
                })}
                strokeWidth={2.8}
              />
              <View style={styles.landmarkSearchTextGroup}>
                <Text
                  style={[
                    styles.busTitle,
                    largeText && styles.largeBody,
                    lightMode && lightStyles.text,
                  ]}
                >
                  {selectedStop.description}
                </Text>
                <Text
                  style={[
                    styles.bodyText,
                    largeText && styles.largeBody,
                    lightMode && lightStyles.bodyText,
                  ]}
                >
                  Bus Stop {selectedStop.busStopCode} · About{" "}
                  {selectedStop.distanceMeters} m away
                </Text>
              </View>
            </View>
            <View style={styles.stopSheetSection}>
              <Text
                style={[styles.statusLabel, lightMode && lightStyles.mutedText]}
              >
                Services
              </Text>
              {services.length > 0 ? (
                <View style={styles.stopServiceRow}>
                  {services.map((service) => {
                    const selected = previewService === service;
                    return (
                      <Pressable
                        key={service}
                        accessibilityRole="button"
                        accessibilityLabel={`Bus service ${service}${selected ? ", selected" : ""}`}
                        accessibilityHint={`Preview Service ${service} at ${selectedStop.description}`}
                        accessibilityState={{ selected }}
                        onPress={() =>
                          setPreviewService(selected ? null : service)
                        }
                        style={[
                          styles.stopServiceChip,
                          compactServiceChips && styles.compactStopServiceChip,
                          {
                            backgroundColor: selected
                              ? theme.colors.surfaceSelected
                              : theme.colors.surfaceInteractive,
                            borderColor: selected
                              ? theme.colors.borderSelected
                              : theme.colors.borderInteractive,
                          },
                          selected && styles.selectedStopServiceChip,
                          highContrast && styles.highContrastServiceChip,
                        ]}
                      >
                        {!numberFirstServiceChips ? (
                          <BusFront
                            size={17}
                            color={
                              selected
                                ? theme.colors.textOnSelected
                                : theme.colors.actionPrimary
                            }
                            strokeWidth={2.8}
                            accessibilityElementsHidden
                            importantForAccessibility="no"
                          />
                        ) : null}
                        <Text
                          style={[
                            styles.stopServiceChipText,
                            {
                              color: selected
                                ? theme.colors.textOnSelected
                                : theme.colors.actionPrimary,
                            },
                          ]}
                        >
                          {service}
                        </Text>
                        {selected ? (
                          <CircleCheck
                            size={17}
                            color={theme.colors.textOnSelected}
                            strokeWidth={3}
                            accessibilityElementsHidden
                            importantForAccessibility="no"
                          />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : staticServicesStatus === "LOADING" ? (
                <View style={styles.serviceUnavailableBlock}>
                  <ActivityIndicator
                    accessibilityLabel="Loading static services"
                    color={theme.colors.actionPrimary}
                  />
                  <Text
                    style={[
                      styles.bodyText,
                      largeText && styles.largeBody,
                      lightMode && lightStyles.bodyText,
                    ]}
                  >
                    Loading scheduled services...
                  </Text>
                </View>
              ) : staticServicesStatus === "ERROR" ? (
                <View style={styles.serviceUnavailableBlock}>
                  <Text
                    style={[
                      styles.bodyText,
                      largeText && styles.largeBody,
                      lightMode && lightStyles.bodyText,
                    ]}
                  >
                    We couldn't load services for this stop.
                  </Text>
                  <SecondaryButton
                    label="Try again"
                    icon={RefreshCw}
                    onPress={onRetryStopServices}
                    lightMode={lightMode}
                    highContrast={highContrast}
                  />
                </View>
              ) : (
                <View style={styles.serviceUnavailableBlock}>
                  <Text
                    style={[
                      styles.bodyText,
                      largeText && styles.largeBody,
                      lightMode && lightStyles.bodyText,
                    ]}
                  >
                    No scheduled services are listed for this stop.
                  </Text>
                </View>
              )}
            </View>
            {previewService ? (
              <View
                style={[
                  styles.servicePreviewPanel,
                  {
                    borderColor: theme.colors.borderDefault,
                    backgroundColor: theme.colors.map.overlaySurfaceElevated,
                  },
                ]}
                accessible
                accessibilityLabel={`Service ${previewService}. Live arrival unavailable before stop confirmation.`}
              >
                <Text
                  style={[
                    styles.statusLabel,
                    lightMode && lightStyles.mutedText,
                  ]}
                >
                  Service {previewService}
                </Text>
                <Text
                  style={[styles.summaryValue, lightMode && lightStyles.text]}
                >
                  Live arrival unavailable
                </Text>
                <Text
                  style={[
                    styles.bodyText,
                    largeText && styles.largeBody,
                    lightMode && lightStyles.bodyText,
                  ]}
                >
                  Choose this stop to load live arrivals for Service{" "}
                  {previewService}.
                </Text>
              </View>
            ) : null}
            {state === "EXPANDED" ? (
              <>
                <Text
                  style={[
                    styles.statusLabel,
                    lightMode && lightStyles.mutedText,
                  ]}
                >
                  Accessibility
                </Text>
                <View style={styles.infoRow}>
                  <Text
                    style={[styles.infoPill, lightMode && lightStyles.infoPill]}
                  >
                    Stop accessibility information unavailable
                  </Text>
                </View>
                {selectedLandmark ? (
                  <>
                    <Text
                      style={[
                        styles.statusLabel,
                        lightMode && lightStyles.mutedText,
                      ]}
                    >
                      Nearby
                    </Text>
                    <Text
                      style={[
                        styles.bodyText,
                        largeText && styles.largeBody,
                        lightMode && lightStyles.bodyText,
                      ]}
                    >
                      {selectedLandmark.name}
                    </Text>
                  </>
                ) : null}
                <SecondaryButton
                  label="Hear stop information"
                  icon={Volume2}
                  onPress={onHear}
                  lightMode={lightMode}
                  highContrast={highContrast}
                />
              </>
            ) : null}
          </ScrollView>
          <View
            style={[
              styles.selectedStopActions,
              { borderColor: theme.colors.map.sheetBorder },
            ]}
          >
            <SecondaryButton
              label={
                mobilityMode === "WHEELCHAIR"
                  ? "Wheelchair directions"
                  : "Directions"
              }
              icon={mobilityMode === "WHEELCHAIR" ? Accessibility : Route}
              onPress={onDirections}
              lightMode={lightMode}
              highContrast={highContrast}
            />
            <PrimaryButton
              label="Choose this stop"
              icon={CircleCheck}
              onPress={
                previewService
                  ? () => onSelectService(previewService)
                  : onConfirm
              }
              lightMode={lightMode}
              highContrast={highContrast}
            />
          </View>
        </View>
      ) : shortNearbyState ? (
        <ScrollView
          style={styles.mapBottomSheetScroll}
          contentContainerStyle={[
            styles.mapBottomSheetContent,
            styles.mapBottomSheetCompactContent,
          ]}
        >
          <Text
            style={[
              styles.mapBottomSheetTitle,
              largeText && styles.largeMapBottomSheetTitle,
              lightMode && lightStyles.text,
            ]}
          >
            {nearbyHeading}
          </Text>
          {nearbyState === "loading" ? (
            <NearbySheetState
              title={
                nearbyHeading === "Nearby bus stops"
                  ? "Finding stops near you..."
                  : "Finding stops in this area..."
              }
              message="This should only take a moment."
              icon={RefreshCw}
              lightMode={lightMode}
              highContrast={highContrast}
            />
          ) : nearbyState === "offline" ||
            nearbyState === "network_error" ||
            nearbyState === "service_error" ? (
            <NearbySheetState
              title={
                nearbyState === "offline"
                  ? "You're offline"
                  : "Couldn't load nearby stops"
              }
              message={
                nearbyState === "offline"
                  ? "Reconnect to refresh nearby stops, or search for a stop."
                  : locationStatus === "available" ||
                      locationStatus === "approximate"
                    ? "Your location is still available. Check your connection and try again."
                    : "Check your connection and try again."
              }
              icon={CircleQuestionMark}
              primaryActionLabel="Try again"
              onPrimaryAction={onRetryNearby}
              secondaryActionLabel="Search for a stop"
              onSecondaryAction={onSearchForStop}
              tone="error"
              lightMode={lightMode}
              highContrast={highContrast}
            />
          ) : nearbyState === "location_approximate" ||
            nearbyState === "location_denied" ||
            nearbyState === "location_unavailable" ? (
            <NearbySheetState
              title={
                nearbyState === "location_denied"
                  ? "Location is off"
                  : nearbyState === "location_unavailable"
                    ? "Couldn't find your location"
                    : "Using your last known location"
              }
              message={
                nearbyState === "location_denied"
                  ? "You can still choose a bus stop manually."
                  : nearbyState === "location_unavailable"
                    ? "Try again or choose a bus stop manually."
                    : "Nearby stops may be a little farther away."
              }
              icon={LocateFixed}
              primaryActionLabel="Try again"
              onPrimaryAction={onRetryNearby}
              secondaryActionLabel="Search stops"
              onSecondaryAction={onSearchForStop}
              tone="info"
              lightMode={lightMode}
              highContrast={highContrast}
            />
          ) : (
            <NearbySheetState
              title={
                showSearchResults
                  ? "No matching stops found"
                  : "No nearby stops found"
              }
              message={
                showSearchResults
                  ? "Try another stop, road or place."
                  : "Move the map or search another area."
              }
              icon={Search}
              primaryActionLabel="Search stops"
              onPrimaryAction={onSearchForStop}
              lightMode={lightMode}
              highContrast={highContrast}
            />
          )}
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.mapBottomSheetScroll}
          contentContainerStyle={styles.mapBottomSheetContent}
        >
          <Text
            style={[
              styles.busTitle,
              largeText && styles.largeBody,
              lightMode && lightStyles.text,
            ]}
          >
            {nearbyHeading}
          </Text>
          {state !== "COLLAPSED" && wheelchairRoutingPreferred ? (
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="Accessible routes only"
              accessibilityHint="Show stops in the checked shortlist with a wheelchair route"
              accessibilityState={{ checked: accessibleRoutesOnly }}
              onPress={onToggleAccessibleRoutesOnly}
              style={styles.nearbyStateTextAction}
            >
              <Accessibility
                size={20}
                color={theme.colors.actionPrimary}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              <Text
                style={[
                  styles.secondaryButtonText,
                  lightMode && lightStyles.secondaryButtonText,
                ]}
              >
                Accessible routes only: {accessibleRoutesOnly ? "On" : "Off"}
              </Text>
            </Pressable>
          ) : null}
          {Object.values(accessibleStopRoutes).some(
            (value) => value === "CHECKING",
          ) ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.bodyText, lightMode && lightStyles.bodyText]}
            >
              Checking wheelchair routes to the 3 closest stops…
            </Text>
          ) : null}
          {state === "COLLAPSED" ? (
            <Text
              style={[
                styles.bodyText,
                largeText && styles.largeBody,
                lightMode && lightStyles.bodyText,
              ]}
            >
              {stops.length} nearby
            </Text>
          ) : stops.length > 0 ? (
            <NearbyStopsList
              stops={state === "MEDIUM" ? stops.slice(0, 3) : stops}
              selectedStop={selectedStop}
              routeStatuses={accessibleStopRoutes}
              recommendedStopCode={recommendedStopCode}
              lightMode={lightMode}
              highContrast={highContrast}
              onSelectStop={(stop) => {
                onSelectStop(stop);
                onSetState("MEDIUM");
              }}
            />
          ) : (
            <Text
              style={[
                styles.bodyText,
                largeText && styles.largeBody,
                lightMode && lightStyles.bodyText,
              ]}
            >
              {accessibleRoutesOnly
                ? "No checked wheelchair routes are available in this shortlist. Try another area or turn the filter off."
                : "No nearby stops match your search. Try a stop code, road or landmark."}
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function routeStepIcon(step: RouteStep): LucideIcon {
  const maneuver = step.maneuver ?? "";
  if (maneuver.includes("left")) return ArrowLeft;
  if (maneuver.includes("right")) return ArrowRight;
  if (maneuver.includes("uturn")) return Undo2;
  if (maneuver.includes("arrive")) return MapPin;
  if (maneuver.includes("depart")) return Footprints;
  return Navigation;
}

function WalkingDirectionsSheet({
  stop,
  status,
  error,
  mobilityMode,
  wheelchairRoutingPreferred,
  wheelchairRoutingAvailable,
  route,
  progress,
  offRoute,
  locationAccuracyLimited,
  canRepeatGuidance,
  guidanceStatus,
  stepsExpanded,
  largeText,
  lightMode,
  highContrast,
  onToggleSteps,
  onRetry,
  onChangeMobilityMode,
  onUseLocation,
  onStartGuidance,
  onRecalculate,
  onContinueWithoutRerouting,
  onRepeatGuidance,
  onHear,
  onChooseStop,
  onChooseDifferentStop,
  onExit,
}: {
  stop: NearbyBusStop;
  status: DirectionsStatus;
  error: string | null;
  mobilityMode: MobilityMode;
  wheelchairRoutingPreferred: boolean;
  wheelchairRoutingAvailable: boolean;
  route: WalkingRoute | null;
  progress: WalkingRouteProgress | null;
  offRoute: boolean;
  locationAccuracyLimited: boolean;
  canRepeatGuidance: boolean;
  guidanceStatus: GuidanceStatus;
  stepsExpanded: boolean;
  largeText: boolean;
  lightMode: boolean;
  highContrast: boolean;
  onToggleSteps: () => void;
  onRetry: () => void;
  onChangeMobilityMode: (mode: MobilityMode) => void;
  onUseLocation: () => void;
  onStartGuidance: () => void;
  onRecalculate: () => void;
  onContinueWithoutRerouting: () => void;
  onRepeatGuidance: () => void;
  onHear: () => void;
  onChooseStop: () => void;
  onChooseDifferentStop: () => void;
  onExit: () => void;
}) {
  const theme = resolveVisualTheme(lightMode, highContrast);
  const activeStepIndex = Math.min(
    progress?.activeStepIndex ?? 0,
    Math.max(0, (route?.steps.length ?? 1) - 1),
  );
  const activeStep = route?.steps[activeStepIndex];
  const nextStep = route?.steps[activeStepIndex + 1];
  const ActiveStepIcon = activeStep ? routeStepIcon(activeStep) : Navigation;
  const routeMinutes = route
    ? friendlyWalkingMinutes(route.durationSeconds)
    : 0;
  const remainingMinutes = progress
    ? friendlyWalkingMinutes(progress.remainingDurationSeconds)
    : routeMinutes;

  return (
    <ScrollView
      style={styles.mapBottomSheetScroll}
      contentContainerStyle={[
        styles.mapBottomSheetContent,
        guidanceStatus === "ACTIVE" && styles.guidanceSheetContent,
      ]}
      accessibilityLabel={
        route
          ? `${mobilityMode === "WHEELCHAIR" ? "Wheelchair" : "Walking"} directions, approximately ${routeMinutes} minutes, ${Math.round(route.distanceMeters)} metres`
          : `${mobilityMode === "WHEELCHAIR" ? "Wheelchair" : "Walking"} directions`
      }
    >
      <View style={styles.directionsTitleRow}>
        {mobilityMode === "WHEELCHAIR" ? (
          <Accessibility
            size={24}
            color={theme.colors.actionPrimary}
            strokeWidth={2.8}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        ) : (
          <Footprints
            size={24}
            color={theme.colors.actionPrimary}
            strokeWidth={2.8}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        )}
        <View style={styles.landmarkSearchTextGroup}>
          <Text
            style={[styles.statusLabel, lightMode && lightStyles.mutedText]}
          >
            {guidanceStatus === "ARRIVED"
              ? "Arrived"
              : guidanceStatus === "ACTIVE"
                ? mobilityMode === "WHEELCHAIR"
                  ? "Wheelchair guidance"
                  : "Walking guidance"
                : mobilityMode === "WHEELCHAIR"
                  ? "Wheelchair directions"
                  : "Walking directions"}
          </Text>
          <Text
            style={[
              styles.busTitle,
              largeText && styles.largeBody,
              lightMode && lightStyles.text,
            ]}
          >
            {stop.description}
          </Text>
          <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
            Bus Stop {stop.busStopCode}
          </Text>
        </View>
      </View>

      <View
        style={styles.mapListToggle}
        accessible
        accessibilityRole="radiogroup"
        accessibilityLabel="Directions mode"
      >
        {(["WHEELCHAIR", "WALKING"] as const).map((mode) => {
          const selected = mobilityMode === mode;
          const ModeIcon = mode === "WHEELCHAIR" ? Accessibility : Footprints;
          return (
            <Pressable
              key={mode}
              accessibilityRole="radio"
              accessibilityLabel={
                mode === "WHEELCHAIR" ? "Wheelchair route" : "Standard walking"
              }
              accessibilityState={{
                checked: selected,
                disabled: mode === "WHEELCHAIR" && !wheelchairRoutingAvailable,
              }}
              disabled={mode === "WHEELCHAIR" && !wheelchairRoutingAvailable}
              onPress={() => onChangeMobilityMode(mode)}
              style={[
                styles.mapListToggleButton,
                selected && styles.selectedMapListToggleButton,
                lightMode && lightStyles.mapListToggleButton,
                lightMode &&
                  selected &&
                  lightStyles.selectedMapListToggleButton,
              ]}
            >
              <ModeIcon
                size={18}
                color={controlIconColor({
                  active: selected,
                  lightMode,
                  highContrast,
                })}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              <Text
                style={[
                  styles.mapListToggleText,
                  selected && styles.selectedMapListToggleText,
                  lightMode && lightStyles.text,
                ]}
              >
                {mode === "WHEELCHAIR" ? "Wheelchair" : "Walking"}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {wheelchairRoutingPreferred && mobilityMode === "WALKING" ? (
        <View style={styles.directionsStatePanel} accessibilityRole="alert">
          <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
            Standard walking route selected. It has not been checked for
            wheelchair access.
          </Text>
        </View>
      ) : null}

      {status === "LOADING" ? (
        <View
          style={styles.directionsLoadingRow}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={
            mobilityMode === "WHEELCHAIR"
              ? "Finding wheelchair-friendly route"
              : "Finding walking route"
          }
          accessibilityState={{ busy: true }}
        >
          <ActivityIndicator color={theme.colors.actionPrimary} />
          <Text
            style={[
              styles.summaryValue,
              largeText && styles.largeBody,
              lightMode && lightStyles.text,
            ]}
          >
            {mobilityMode === "WHEELCHAIR"
              ? "Finding wheelchair-friendly route…"
              : "Finding route…"}
          </Text>
        </View>
      ) : status === "NEEDS_LOCATION" ? (
        <View style={styles.directionsStatePanel} accessibilityRole="alert">
          <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>
            Your location is needed for walking directions.
          </Text>
          <PrimaryButton
            label="Use my location"
            icon={LocateFixed}
            onPress={onUseLocation}
            lightMode={lightMode}
            highContrast={highContrast}
          />
          <SecondaryButton
            label="Exit directions"
            icon={CircleX}
            onPress={onExit}
            lightMode={lightMode}
            highContrast={highContrast}
          />
        </View>
      ) : status === "ERROR" ||
        status === "RATE_LIMITED" ||
        status === "WHEELCHAIR_UNAVAILABLE" ||
        status === "KNOWN_BARRIER" ? (
        <View style={styles.directionsStatePanel} accessibilityRole="alert">
          <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>
            {error ??
              (mobilityMode === "WHEELCHAIR"
                ? "No wheelchair-accessible route found."
                : "Walking route unavailable.")}
          </Text>
          <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
            The bus stop is approximately{" "}
            {friendlyDistance(stop.distanceMeters)} away. The map and bus stop
            details are still available.
          </Text>
          <PrimaryButton
            label="Try again"
            icon={RefreshCw}
            onPress={onRetry}
            lightMode={lightMode}
            highContrast={highContrast}
          />
          {mobilityMode === "WHEELCHAIR" ? (
            <SecondaryButton
              label="Use standard walking directions"
              icon={Footprints}
              onPress={() => onChangeMobilityMode("WALKING")}
              lightMode={lightMode}
              highContrast={highContrast}
            />
          ) : null}
          <SecondaryButton
            label="Try a different stop"
            icon={MapPin}
            onPress={onChooseDifferentStop}
            lightMode={lightMode}
            highContrast={highContrast}
          />
          <SecondaryButton
            label="Open Nearby stops"
            icon={List}
            onPress={onChooseDifferentStop}
            lightMode={lightMode}
            highContrast={highContrast}
          />
          <SecondaryButton
            label="Exit directions"
            icon={CircleX}
            onPress={onExit}
            lightMode={lightMode}
            highContrast={highContrast}
          />
        </View>
      ) : route && guidanceStatus === "ARRIVED" ? (
        <View
          style={styles.arrivalPanel}
          accessible
          accessibilityRole="alert"
          accessibilityLabel={`You've reached the bus stop. ${stop.description}, Bus Stop ${stop.busStopCode}.`}
        >
          <CircleCheck
            size={30}
            color={theme.colors.statusSuccess}
            strokeWidth={3}
          />
          <Text style={[styles.busTitle, lightMode && lightStyles.text]}>
            You've reached the bus stop
          </Text>
          <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
            {stop.description} · Bus Stop {stop.busStopCode}
          </Text>
          <View style={styles.directionsStatePanel}>
            <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>
              Route accessibility
            </Text>
            <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
              {mobilityMode === "WHEELCHAIR"
                ? "Wheelchair-aware route completed."
                : "Standard walking route completed."}
            </Text>
            <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>
              Next bus accessibility
            </Text>
            <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
              Accessibility information unavailable until you choose a bus.
            </Text>
            <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>
              Ramp assistance
            </Text>
            <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
              Not requested. Ramp assistance is handled separately after bus
              selection.
            </Text>
          </View>
          <PrimaryButton
            label="Choose this stop"
            icon={CircleCheck}
            onPress={onChooseStop}
            lightMode={lightMode}
            highContrast={highContrast}
          />
          <SecondaryButton
            label="Exit guidance"
            icon={CircleX}
            onPress={onExit}
            lightMode={lightMode}
            highContrast={highContrast}
          />
        </View>
      ) : route && guidanceStatus === "ACTIVE" ? (
        <>
          <View
            nativeID="walking-current-instruction"
            testID="walking-current-instruction"
            style={[
              styles.currentInstructionCard,
              {
                backgroundColor: theme.colors.map.overlaySurfaceElevated,
                borderColor: theme.colors.map.selectionAccent,
              },
            ]}
            accessible
            accessibilityLabel={`${activeStep?.instruction ?? "Continue toward the bus stop"}, ${friendlyDistance(progress?.distanceToNextManeuverMeters ?? 0)}.`}
          >
            <ActiveStepIcon
              size={largeText ? 40 : 34}
              color={theme.colors.actionPrimary}
              strokeWidth={3}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <View style={styles.landmarkSearchTextGroup}>
              <Text
                style={[
                  styles.walkingInstructionText,
                  largeText && styles.walkingInstructionTextLarge,
                  lightMode && lightStyles.text,
                ]}
              >
                {activeStep?.instruction ?? "Continue toward the bus stop"}
              </Text>
              <Text
                style={[
                  styles.walkingInstructionDistance,
                  largeText && styles.walkingInstructionDistanceLarge,
                  lightMode && lightStyles.text,
                ]}
              >
                {friendlyDistance(progress?.distanceToNextManeuverMeters ?? 0)}
              </Text>
            </View>
          </View>
          <Text
            style={[
              styles.bodyText,
              largeText && styles.largeBody,
              lightMode && lightStyles.bodyText,
            ]}
          >
            {remainingMinutes} min ·{" "}
            {friendlyDistance(
              progress?.remainingDistanceMeters ?? route.distanceMeters,
            )}{" "}
            remaining
          </Text>
          {nextStep ? (
            <Text
              style={[
                styles.bodyText,
                largeText && styles.largeBody,
                lightMode && lightStyles.bodyText,
              ]}
            >
              Next: {nextStep.instruction}
            </Text>
          ) : null}
          {locationAccuracyLimited ? (
            <View
              nativeID="walking-location-accuracy-warning"
              testID="walking-location-accuracy-warning"
              style={styles.directionsStatePanel}
              accessibilityRole="alert"
            >
              <Text
                style={[styles.summaryValue, lightMode && lightStyles.text]}
              >
                Location accuracy is limited
              </Text>
              <Text
                style={[styles.bodyText, lightMode && lightStyles.bodyText]}
              >
                Follow the map and signs around you.
              </Text>
            </View>
          ) : null}
          {offRoute ? (
            <View
              nativeID="walking-off-route-warning"
              testID="walking-off-route-warning"
              style={styles.offRoutePanel}
              accessibilityRole="alert"
            >
              <Text
                style={[styles.summaryValue, lightMode && lightStyles.text]}
              >
                You're off the suggested walking route.
              </Text>
              <SecondaryButton
                label="Recalculate"
                icon={RefreshCw}
                onPress={onRecalculate}
                lightMode={lightMode}
                highContrast={highContrast}
              />
              <SecondaryButton
                label="Continue without rerouting"
                icon={Navigation}
                onPress={onContinueWithoutRerouting}
                lightMode={lightMode}
                highContrast={highContrast}
              />
            </View>
          ) : null}
          {canRepeatGuidance ? (
            <SecondaryButton
              label="Repeat guidance"
              icon={Volume2}
              onPress={onRepeatGuidance}
              lightMode={lightMode}
              highContrast={highContrast}
            />
          ) : null}
          <SecondaryButton
            label="Exit guidance"
            icon={CircleX}
            onPress={onExit}
            lightMode={lightMode}
            highContrast={highContrast}
          />
        </>
      ) : route ? (
        <>
          <View
            style={styles.walkingRouteSummary}
            accessible
            accessibilityLabel={`${mobilityMode === "WHEELCHAIR" ? "Wheelchair-friendly route" : "Walking directions"}, approximately ${routeMinutes} minutes, ${route.distanceMeters} metres`}
          >
            <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>
              {mobilityMode === "WHEELCHAIR"
                ? "Wheelchair-friendly route"
                : "Walking"}
            </Text>
            <Text
              style={[
                styles.directionsSummaryMetric,
                largeText && styles.largeBody,
                lightMode && lightStyles.text,
              ]}
            >
              {routeMinutes} min · {friendlyDistance(route.distanceMeters)}
            </Text>
          </View>
          <PrimaryButton
            label="Start guidance"
            icon={Navigation}
            onPress={onStartGuidance}
            lightMode={lightMode}
            highContrast={highContrast}
          />
          {mobilityMode === "WHEELCHAIR" ? (
            <View
              style={styles.directionsStatePanel}
              accessible
              accessibilityLabel={`Accessibility confidence ${route.accessibility.confidence.toLowerCase().replace("_", " ")}`}
            >
              <Text
                style={[styles.summaryValue, lightMode && lightStyles.text]}
              >
                Accessibility confidence:{" "}
                {route.accessibility.confidence === "LIMITED_DATA"
                  ? "Limited data"
                  : route.accessibility.confidence === "HIGH"
                    ? "High"
                    : "Medium"}
              </Text>
              <Text
                style={[styles.bodyText, lightMode && lightStyles.bodyText]}
              >
                No steps reported by the wheelchair router
                {route.accessibility.maximumInclinePercent !== undefined
                  ? ` · Maximum mapped incline about ${Math.round(route.accessibility.maximumInclinePercent)}%`
                  : " · Incline data incomplete"}
                {route.accessibility.surfaces.length > 0
                  ? ` · ${route.accessibility.surfaces.join(", ")} surfaces`
                  : " · Surface data incomplete"}
              </Text>
              {route.accessibility.warnings.map((warning) => (
                <Text
                  key={warning.code}
                  style={[styles.bodyText, lightMode && lightStyles.bodyText]}
                >
                  {warning.severity === "BARRIER" ? "Barrier: " : ""}
                  {warning.message}
                </Text>
              ))}
              <Text
                style={[styles.bodyText, lightMode && lightStyles.bodyText]}
              >
                Based on available map accessibility data. Conditions may
                differ; check kerbs, surfaces and temporary obstructions before
                travelling.
              </Text>
            </View>
          ) : null}
          <View style={styles.routeEndpointRow}>
            <View style={styles.routeEndpointMarker} />
            <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
              Your location
            </Text>
          </View>
          <View style={styles.routeEndpointLine} />
          <View style={styles.routeEndpointRow}>
            <MapPin
              size={20}
              color={theme.colors.map.stopSelected}
              strokeWidth={3}
            />
            <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
              {stop.description}
            </Text>
          </View>
          <SecondaryButton
            label={stepsExpanded ? "Hide steps" : "View steps"}
            icon={stepsExpanded ? ChevronUp : ChevronDown}
            onPress={onToggleSteps}
            lightMode={lightMode}
            highContrast={highContrast}
          />
          {stepsExpanded ? (
            <View style={styles.walkingStepList}>
              {route.steps.map((step, index) => {
                const StepIcon = routeStepIcon(step);
                return (
                  <View
                    key={`${index}-${step.instruction}`}
                    style={styles.walkingStepRow}
                  >
                    <StepIcon
                      size={20}
                      color={theme.colors.actionPrimary}
                      strokeWidth={2.8}
                    />
                    <View style={styles.landmarkSearchTextGroup}>
                      <Text
                        style={[
                          styles.bodyText,
                          largeText && styles.largeBody,
                          lightMode && lightStyles.bodyText,
                        ]}
                      >
                        {index + 1}. {step.instruction}
                      </Text>
                      {step.distanceMeters > 0 ? (
                        <Text
                          style={[
                            styles.statusLabel,
                            lightMode && lightStyles.mutedText,
                          ]}
                        >
                          {friendlyDistance(step.distanceMeters)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
          <SecondaryButton
            label="Hear directions"
            icon={Volume2}
            onPress={onHear}
            lightMode={lightMode}
            highContrast={highContrast}
          />
          <SecondaryButton
            label="Exit directions"
            icon={CircleX}
            onPress={onExit}
            lightMode={lightMode}
            highContrast={highContrast}
          />
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Routing attribution, ${route.attribution.label}`}
            onPress={() => void Linking.openURL(route.attribution.url)}
          >
            <Text
              style={[
                styles.routingAttribution,
                { color: theme.colors.actionPrimary },
              ]}
            >
              {route.attribution.label}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Report a routing map issue"
            onPress={() =>
              void Linking.openURL("https://www.openstreetmap.org/fixthemap")
            }
          >
            <Text
              style={[
                styles.routingAttribution,
                { color: theme.colors.actionPrimary },
              ]}
            >
              Report a map issue
            </Text>
          </Pressable>
        </>
      ) : null}
    </ScrollView>
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
        .filter((service) => service.toLowerCase().includes(normalizedQuery)),
    ),
  ).slice(0, 4);
  const matchingLandmarks = landmarks
    .filter((landmark) => landmark.name.toLowerCase().includes(normalizedQuery))
    .slice(0, 2);
  const prioritizeServices =
    /^\d{1,3}[a-z]?$/i.test(query.trim()) && matchingServices.length > 0;

  if (
    matchingStops.length === 0 &&
    matchingServices.length === 0 &&
    matchingLandmarks.length === 0
  ) {
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
          <Text
            style={[
              styles.searchGroupLabel,
              lightMode && lightStyles.mutedText,
            ]}
          >
            Bus Services
          </Text>
          {matchingServices.map((service) => {
            const stop = stops.find((candidate) =>
              busServicesForStop(candidate).includes(service),
            );
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
                <Text
                  style={[
                    styles.landmarkIconText,
                    lightMode && lightStyles.landmarkText,
                  ]}
                >
                  {service}
                </Text>
                <View style={styles.landmarkSearchTextGroup}>
                  <Text
                    style={[styles.summaryValue, lightMode && lightStyles.text]}
                  >
                    Service {service}
                  </Text>
                  <Text
                    style={[
                      styles.summaryLabel,
                      lightMode && lightStyles.mutedText,
                    ]}
                  >
                    Serves {stop.description}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </>
      ) : null}
      {matchingStops.length > 0 ? (
        <Text
          style={[styles.searchGroupLabel, lightMode && lightStyles.mutedText]}
        >
          Bus Stops
        </Text>
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
          <Text
            style={[
              styles.landmarkIconText,
              lightMode && lightStyles.landmarkText,
            ]}
          >
            BUS
          </Text>
          <View style={styles.landmarkSearchTextGroup}>
            <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>
              {stop.description}
            </Text>
            <Text
              style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}
            >
              Stop {stop.busStopCode} - {stop.distanceMeters} m -{" "}
              {busServicesForStop(stop).join(", ")}
            </Text>
          </View>
        </Pressable>
      ))}
      {!prioritizeServices && matchingServices.length > 0 ? (
        <Text
          style={[styles.searchGroupLabel, lightMode && lightStyles.mutedText]}
        >
          Bus Services
        </Text>
      ) : null}
      {!prioritizeServices &&
        matchingServices.map((service) => {
          const stop = stops.find((candidate) =>
            busServicesForStop(candidate).includes(service),
          );
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
              <Text
                style={[
                  styles.landmarkIconText,
                  lightMode && lightStyles.landmarkText,
                ]}
              >
                {service}
              </Text>
              <View style={styles.landmarkSearchTextGroup}>
                <Text
                  style={[styles.summaryValue, lightMode && lightStyles.text]}
                >
                  Service {service}
                </Text>
                <Text
                  style={[
                    styles.summaryLabel,
                    lightMode && lightStyles.mutedText,
                  ]}
                >
                  Serves {stop.description}
                </Text>
              </View>
            </Pressable>
          );
        })}
      {matchingLandmarks.length > 0 ? (
        <Text
          style={[styles.searchGroupLabel, lightMode && lightStyles.mutedText]}
        >
          Places
        </Text>
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
          <Text
            style={[
              styles.landmarkIconText,
              lightMode && lightStyles.landmarkText,
            ]}
          >
            {landmarkIcon(landmark)}
          </Text>
          <View style={styles.landmarkSearchTextGroup}>
            <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>
              {landmark.name}
            </Text>
            <Text
              style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}
            >
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
  | "location_approximate"
  | "location_denied"
  | "location_unavailable"
  | "network_error"
  | "service_error"
  | "offline";

function resolveNearbyStopsState({
  nearbyStatus,
  locationStatus,
  locationRequested,
  connectivityStatus,
  stopCount,
}: {
  nearbyStatus: NearbyStopsState;
  locationStatus: LocationState;
  locationRequested: boolean;
  connectivityStatus: ConnectivityState;
  stopCount: number;
}): NearbyStopsUiState {
  if (nearbyStatus === "loading") {
    return "loading";
  }

  if (connectivityStatus === "offline") {
    return "offline";
  }

  if (nearbyStatus === "network_error" || nearbyStatus === "service_error") {
    return nearbyStatus;
  }

  if (nearbyStatus === "empty") {
    return "empty";
  }

  if (stopCount > 0 || nearbyStatus === "success") {
    return "success";
  }

  if (locationStatus === "permission_denied") {
    return "location_denied";
  }

  if (locationStatus === "unavailable" && locationRequested) {
    return "location_unavailable";
  }

  if (locationStatus === "approximate") {
    return "location_approximate";
  }

  return "empty";
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
  const PrimaryActionIcon = primaryActionLabel?.toLowerCase().includes("search")
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
      <StatusConceptVisual
        kind={tone === "info" ? "location" : "generic"}
        compact
        lightMode={lightMode}
        highContrast={highContrast}
      />
      <View style={styles.nearbyStateTitleRow}>
        <Icon size={24} color={iconColor} strokeWidth={2.75} />
        <View style={styles.landmarkSearchTextGroup}>
          <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>
            {title}
          </Text>
          <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
            {message}
          </Text>
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
          <Text
            style={[
              styles.secondaryButtonText,
              lightMode && lightStyles.secondaryButtonText,
            ]}
          >
            {secondaryActionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type NearbyStopsMapProps = {
  stops: NearbyBusStop[];
  recommendedStopCode?: string;
  selectedStop: NearbyBusStop | null;
  selectedLandmark: MapLandmark | null;
  landmarks: MapLandmark[];
  currentLocation: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    headingDegrees?: number;
  } | null;
  mapViewport: MapViewport;
  mapCameraGeometry: MapCameraGeometry;
  layers: MapLayers;
  mapManuallyMoved: boolean;
  mapInteractionMode: MapInteractionMode;
  directionsActive: boolean;
  followMode: boolean;
  hasSelectedService: boolean;
  providerRetryKey?: number;
  journeyAlternative: JourneyAlternative | null;
  walkingRoute?: WalkingRoute | null;
  routeFitKey?: number;
  routeFitPadding?: MapOverlayInsets;
  locationPulseKey?: number;
  reducedMotion?: boolean;
  routeStops?: RouteStop[];
  destinationCoordinate?: MapCoordinate | null;
  activeVehicle?: {
    coordinate: MapCoordinate;
    serviceNo: string;
  } | null;
  mapPickCandidate: JourneyPoint | null;
  headingDegrees: number;
  largeText: boolean;
  lightMode: boolean;
  highContrast: boolean;
  showInlineControls?: boolean;
  onSelectStop: (stop: NearbyBusStop) => void;
  onSelectLandmark: (landmark: MapLandmark) => void;
  onMapLayoutChange?: (layout: MapLayoutSize) => void;
  onMoveMap: () => void;
  onProviderAvailabilityChange?: (ready: boolean) => void;
  onProviderViewportChange?: (viewport: ProviderViewportChange) => void;
  onFocusCluster: (center: MapCoordinate) => void;
  onRecenter: () => void;
  onRetryMap?: () => void;
  onRefreshLocation: () => void;
  onSelectBusStopManually?: () => void;
  onShowRoute: () => void;
  onToggleFollow: () => void;
  onToggleLayer: (layer: MapLayerKey) => void;
  onResetHeading: () => void;
};

function MapProviderUnavailableState({
  message,
  lightMode,
  highContrast,
  onRetryMap,
  onSelectBusStopManually,
}: {
  message: string;
  lightMode: boolean;
  highContrast: boolean;
  onRetryMap?: () => void;
  onSelectBusStopManually?: () => void;
}) {
  const theme = resolveVisualTheme(lightMode, highContrast);
  const fallbackGuidance = onSelectBusStopManually
    ? "You can retry or select a bus stop manually."
    : "Journey details remain available without the map.";

  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel={`Unable to load map. ${message} ${fallbackGuidance}`}
      style={[
        styles.providerMapUnavailable,
        {
          backgroundColor: theme.colors.map.overlaySurface,
          borderColor: theme.colors.map.overlayBorder,
        },
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
      ]}
    >
      <MapIcon
        size={30}
        color={theme.colors.map.controlIcon}
        strokeWidth={2.8}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text
        style={[
          styles.providerMapUnavailableTitle,
          { color: theme.colors.textPrimary },
          highContrast && !lightMode && styles.highContrastText,
          highContrast && lightMode && lightStyles.highContrastText,
        ]}
      >
        Unable to load map
      </Text>
      <Text
        style={[
          styles.providerMapUnavailableText,
          { color: theme.colors.textSecondary },
          highContrast && !lightMode && styles.highContrastText,
          highContrast && lightMode && lightStyles.highContrastText,
        ]}
      >
        {message}
      </Text>
      <Text
        style={[
          styles.providerMapUnavailableText,
          { color: theme.colors.textSecondary },
          highContrast && !lightMode && styles.highContrastText,
          highContrast && lightMode && lightStyles.highContrastText,
        ]}
      >
        {fallbackGuidance}
      </Text>
      <View style={styles.providerMapUnavailableActions}>
        {onRetryMap ? (
          <PrimaryButton
            label="Retry map"
            icon={RefreshCw}
            onPress={onRetryMap}
            lightMode={lightMode}
            highContrast={highContrast}
          />
        ) : null}
        {onSelectBusStopManually ? (
          <SecondaryButton
            label="Select bus stop manually"
            icon={List}
            onPress={onSelectBusStopManually}
            lightMode={lightMode}
            highContrast={highContrast}
          />
        ) : null}
      </View>
    </View>
  );
}

const NearbyStopsMap = memo(function NearbyStopsMap({
  stops,
  recommendedStopCode,
  selectedStop,
  currentLocation,
  mapViewport,
  layers,
  providerRetryKey,
  journeyAlternative,
  walkingRoute,
  routeFitKey = 0,
  routeFitPadding = { top: 92, right: 76, bottom: 280, left: 18 },
  locationPulseKey = 0,
  reducedMotion = false,
  routeStops,
  destinationCoordinate,
  activeVehicle,
  mapPickCandidate,
  lightMode,
  highContrast,
  showInlineControls = true,
  onSelectStop,
  onMapLayoutChange,
  onMoveMap,
  onProviderAvailabilityChange,
  onProviderViewportChange,
  onFocusCluster,
  onRetryMap,
  onSelectBusStopManually,
}: NearbyStopsMapProps) {
  const theme = resolveVisualTheme(lightMode, highContrast);
  const openStreetMapProviderConfigured =
    shouldUseOpenStreetMapProvider(showInlineControls);
  const nativeMapsProviderConfigured =
    shouldUseNativeMapsProvider(showInlineControls);
  const mapProviderConfigured =
    openStreetMapProviderConfigured || nativeMapsProviderConfigured;
  const providerLabel = openStreetMapProviderConfigured
    ? "OpenStreetMap"
    : "Google Maps";

  useEffect(() => {
    if (mapProviderConfigured) {
      return;
    }
    onProviderAvailabilityChange?.(false);
    if (__DEV__ && process.env.NODE_ENV !== "test") {
      console.warn("[Map] initialization unavailable", {
        platform: Platform.OS,
        reason: mapTechnicalConfigurationMessage(),
      });
    }
  }, [mapProviderConfigured, onProviderAvailabilityChange]);

  if (!mapProviderConfigured) {
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
        accessibilityLabel="Map provider unavailable"
        onLayout={(event) =>
          onMapLayoutChange?.({
            height: event.nativeEvent.layout.height,
            width: event.nativeEvent.layout.width,
          })
        }
      >
        <MapProviderUnavailableState
          message={mapConfigurationMessage()}
          lightMode={lightMode}
          highContrast={highContrast}
          onRetryMap={onRetryMap}
          onSelectBusStopManually={onSelectBusStopManually}
        />
      </View>
    );
  }

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
      accessibilityLabel={`Nearby bus stop map powered by ${providerLabel}. ${stops.length} stops available.`}
    >
      <JourneyMap
        stops={stops}
        recommendedStopCode={recommendedStopCode}
        selectedStop={selectedStop}
        currentLocation={currentLocation}
        viewport={mapViewport}
        layers={layers}
        routeStops={
          walkingRoute?.geometry ??
          journeyAlternative?.routeStops ??
          routeStops ??
          []
        }
        routeMobilityMode={walkingRoute?.mobilityMode}
        routeWarnings={
          walkingRoute?.accessibility.warnings.flatMap((warning) =>
            warning.coordinate
              ? [{ coordinate: warning.coordinate, label: warning.message }]
              : [],
          ) ?? []
        }
        routeFitKey={routeFitKey}
        routeFitPadding={routeFitPadding}
        destination={
          walkingRoute && selectedStop
            ? selectedStop
            : (mapPickCandidate?.coordinate ?? destinationCoordinate ?? null)
        }
        destinationAccessibilityLabel={
          walkingRoute && selectedStop
            ? `Destination bus stop, ${selectedStop.description}`
            : undefined
        }
        activeVehicle={activeVehicle ?? null}
        palette={{
          background: theme.colors.map.background,
          currentLocation: theme.colors.map.currentLocation,
          currentLocationHalo: theme.colors.map.currentLocationHalo,
          currentLocationLabelSurface:
            theme.colors.map.currentLocationLabelSurface,
          currentLocationLabelText: theme.colors.map.currentLocationLabelText,
          currentLocationOutline: theme.colors.map.currentLocationOutline,
          routeOutline: theme.colors.map.routeOutline,
          routePrimary: theme.colors.map.routePrimary,
          stopDefault: theme.colors.map.stopDefault,
          stopOutline: theme.colors.map.stopOutline,
          stopRecommended: theme.colors.map.stopRecommended,
          stopSelected: theme.colors.map.stopSelected,
          textOnMarker: theme.colors.iconSelected,
        }}
        highContrast={highContrast}
        lightMode={lightMode}
        locationPulseKey={locationPulseKey}
        reducedMotion={reducedMotion}
        providerRetryKey={providerRetryKey ?? 0}
        fallback={
          <MapProviderUnavailableState
            message={mapConfigurationMessage()}
            lightMode={lightMode}
            highContrast={highContrast}
            onRetryMap={onRetryMap}
            onSelectBusStopManually={onSelectBusStopManually}
          />
        }
        onLayout={(layout) => onMapLayoutChange?.(layout)}
        onMove={onMoveMap}
        onProviderAvailabilityChange={(ready) =>
          onProviderAvailabilityChange?.(ready)
        }
        onViewportChange={(viewport) => onProviderViewportChange?.(viewport)}
        onSelectStop={onSelectStop}
        onFocusCluster={onFocusCluster}
      />
    </View>
  );
});
function MapCameraDebugOverlay({
  geometry,
  lightMode,
}: {
  geometry: MapCameraGeometry;
  lightMode: boolean;
}) {
  const rectStyle = (rect: UsableMapRect) => ({
    height: `${(rect.height / geometry.mapHeight) * 100}%` as const,
    left: `${(rect.x / geometry.mapWidth) * 100}%` as const,
    top: `${(rect.y / geometry.mapHeight) * 100}%` as const,
    width: `${(rect.width / geometry.mapWidth) * 100}%` as const,
  });

  return (
    <View pointerEvents="none" style={styles.mapCameraDebugLayer}>
      <View
        style={[
          styles.mapCameraDebugUsableRect,
          rectStyle(geometry.usableMapRect),
        ]}
      />
      <View
        style={[
          styles.mapCameraDebugSafeZone,
          rectStyle(geometry.centerSafeZone),
        ]}
      />
      <Text
        style={[
          styles.mapCameraDebugText,
          lightMode && styles.mapCameraDebugTextLight,
        ]}
      >
        Insets: T {Math.round(geometry.insets.top)} R{" "}
        {Math.round(geometry.insets.right)} B{" "}
        {Math.round(geometry.insets.bottom)} L{" "}
        {Math.round(geometry.insets.left)}
        {"\n"}
        Map: {Math.round(geometry.mapWidth)} x {Math.round(geometry.mapHeight)}
      </Text>
    </View>
  );
}

function BusStopMarkerIcon({
  selected,
  nearest,
  visualTheme,
}: {
  selected: boolean;
  nearest: boolean;
  visualTheme: ReturnType<typeof resolveVisualTheme>;
}) {
  const mapTheme = visualTheme.colors.map;
  const markerColor = selected
    ? visualTheme.colors.busStopSelected
    : nearest
      ? mapTheme.stopRecommended
      : visualTheme.colors.busStopDefault;
  const markerSurface = selected ? markerColor : mapTheme.stopSurface;
  const markerDetail = selected ? mapTheme.stopOutline : markerColor;
  const iconSize = selected ? 15 : nearest ? 11 : 9;
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
        <BusFront
          size={iconSize}
          color={markerDetail}
          strokeWidth={selected ? 2.8 : 2.2}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
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
  routeStatuses,
  recommendedStopCode,
  lightMode,
  highContrast,
  onSelectStop,
}: {
  stops: NearbyBusStop[];
  selectedStop: NearbyBusStop | null;
  routeStatuses?: Record<string, AccessibleStopRouteStatus>;
  recommendedStopCode?: string;
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
          recommended={
            recommendedStopCode
              ? stop.busStopCode === recommendedStopCode
              : undefined
          }
          accessibleRouteStatus={routeStatuses?.[stop.busStopCode]}
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
      <Text
        style={[
          styles.busTitle,
          largeText && styles.largeBody,
          lightMode && lightStyles.text,
        ]}
      >
        {stop.description}
      </Text>
      <Text
        style={[
          styles.selectedStopMetadata,
          largeText && styles.largeBody,
          lightMode && lightStyles.selectedStopMetadata,
        ]}
      >
        Bus Stop {stop.busStopCode} · About {stop.distanceMeters} m away
      </Text>
      {landmark ? (
        <Text
          style={[
            styles.bodyText,
            largeText && styles.largeBody,
            lightMode && lightStyles.bodyText,
          ]}
        >
          Near {landmark.name}
        </Text>
      ) : null}
      <View style={styles.selectedStopSection}>
        <Text style={[styles.statusLabel, lightMode && lightStyles.mutedText]}>
          Services
        </Text>
        <View style={styles.selectedStopServicesRow}>
          {services.map((service) => (
            <View
              key={service}
              style={[
                styles.selectedStopServicePill,
                lightMode && lightStyles.selectedStopServicePill,
              ]}
            >
              <Text
                style={[
                  styles.selectedStopServicePillText,
                  lightMode && lightStyles.selectedStopServicePillText,
                ]}
              >
                {service}
                {service === "191" ? "  3 min" : ""}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <PrimaryButton
        label="Directions"
        icon={Route}
        accessibilityHint={`Show walking directions to ${stop.description}.`}
        onPress={onDirections}
        lightMode={lightMode}
        highContrast={highContrast}
      />
      {directionsActive ? (
        <View
          style={[
            styles.directionsSummary,
            lightMode && lightStyles.directionsSummary,
          ]}
        >
          <Text
            style={[styles.statusLabel, lightMode && lightStyles.mutedText]}
          >
            Walking to Stop {stop.busStopCode}
          </Text>
          <Text
            style={[
              styles.summaryValue,
              largeText && styles.largeBody,
              lightMode && lightStyles.text,
            ]}
          >
            {stop.distanceMeters} m - ~{walkingMinutes} min walk
          </Text>
          <Text
            style={[
              styles.bodyText,
              largeText && styles.largeBody,
              lightMode && lightStyles.bodyText,
            ]}
          >
            ↑ {firstInstruction}
          </Text>
          {directionsActive ? (
            <Text
              style={[
                styles.infoPill,
                styles.accessibleChip,
                lightMode && lightStyles.accessibleChip,
              ]}
            >
              Accessible route data incomplete
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.selectedStopSection}>
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
          <Text style={[styles.infoPill, lightMode && lightStyles.infoPill]}>
            Route accessibility unavailable
          </Text>
        </View>
      </View>
      {directionsActive ? (
        <SecondaryButton
          label="Hear directions"
          icon={Volume2}
          accessibilityHint="Announces the walking directions to this stop."
          onPress={onHearDirections}
          lightMode={lightMode}
          highContrast={highContrast}
        />
      ) : null}
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
      <SecondaryButton
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
      <Text style={[styles.busTitle, lightMode && lightStyles.text]}>
        {stop.description}
      </Text>
      <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
        Bus Stop {stop.busStopCode}
      </Text>
      <Text style={styles.selectHint}>
        {selected ? "Selected stop" : "Select stop"}
      </Text>
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
  const runtimeAccessibility = useContext(AccessibilityRuntimeContext);
  const Icon = appIcon(icon);
  const theme = resolveVisualTheme(lightMode, highContrast);
  const iconColor = tabIconColor({
    selected,
    disabled,
    lightMode,
    highContrast,
  });
  const iconSize = compact ? 27 : 29;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, tab, ${selected ? "selected, " : ""}${stateDescription ? `${stateDescription}, ` : ""}${index} of 3`}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.tabButton,
        compact && styles.compactTabButton,
        runtimeAccessibility.largerControls && styles.largerTabButton,
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
              ? theme.colors.navigationSelected
              : disabled
                ? theme.colors.actionSecondary
                : theme.colors.map.navigationSurface,
            borderColor: selected
              ? theme.colors.map.selectionAccent
              : theme.colors.map.navigationDivider,
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
        {icon === "assist" &&
        stateDescription === "assistance request active" ? (
          <View
            style={[styles.tabStatusDot, lightMode && lightStyles.tabStatusDot]}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        ) : null}
      </View>
      <Text
        style={[
          styles.tabButtonText,
          compact && styles.compactTabButtonText,
          runtimeAccessibility.textSize !== "STANDARD" &&
            styles.largeTabButtonText,
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
      {selected ? (
        <View
          style={[
            styles.tabSelectionIndicator,
            { backgroundColor: theme.colors.navigationSelected },
          ]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
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
          backgroundColor: lightMode
            ? theme.colors.surfacePrimary
            : theme.colors.surfaceRaised,
          borderColor: highContrast
            ? theme.colors.borderStrong
            : theme.colors.statusSuccess,
        },
        highContrast && lightMode && styles.highContrastLightToast,
        highContrast && !lightMode && styles.highContrastDarkToast,
      ]}
      accessible
      accessibilityLabel={message}
    >
      <CircleCheck
        size={22}
        color={
          highContrast && !lightMode
            ? theme.colors.iconPrimary
            : theme.colors.statusSuccess
        }
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

function JourneyDiscoveryInlineStatus({
  status,
  interactionBusy = false,
  onPrimaryAction,
  onSecondaryAction,
  lightMode,
  highContrast,
}: {
  status: JourneyDiscoveryStatus;
  interactionBusy?: boolean;
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
  lightMode: boolean;
  highContrast: boolean;
}) {
  if (!status) {
    return null;
  }

  const theme = resolveVisualTheme(lightMode, highContrast);
  const iconColor =
    status.tone === "error"
      ? theme.colors.statusError
      : theme.colors.statusInformation;
  const Icon = status.tone === "error" ? CircleQuestionMark : CircleCheck;

  return (
    <View
      style={[
        styles.journeyDiscoveryStatus,
        status.tone === "error" && styles.journeyDiscoveryStatusError,
        lightMode && lightStyles.journeyDiscoveryStatus,
      ]}
      accessible
      accessibilityRole={status.tone === "error" ? "alert" : undefined}
      accessibilityLabel={`${status.title}. ${status.message}`}
    >
      <View style={styles.journeyDiscoveryStatusTitleRow}>
        <Icon size={21} color={iconColor} strokeWidth={2.8} />
        <View style={styles.landmarkSearchTextGroup}>
          <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>
            {status.title}
          </Text>
          <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
            {status.message}
          </Text>
        </View>
      </View>
      {status.primary ? (
        <SecondaryButton
          label={status.primary}
          icon={RefreshCw}
          onPress={onPrimaryAction}
          disabled={interactionBusy}
          lightMode={lightMode}
          highContrast={highContrast}
        />
      ) : null}
      {status.secondary ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={status.secondary}
          accessibilityState={{ disabled: interactionBusy }}
          disabled={interactionBusy}
          onPress={onSecondaryAction}
          style={[
            styles.nearbyStateTextAction,
            interactionBusy && styles.disabledTextAction,
          ]}
        >
          <List
            size={20}
            color={controlIconColor({ lightMode, highContrast })}
            strokeWidth={2.75}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text
            style={[
              styles.secondaryButtonText,
              lightMode && lightStyles.secondaryButtonText,
              interactionBusy && styles.disabledButtonText,
            ]}
          >
            {status.secondary}
          </Text>
        </Pressable>
      ) : null}
    </View>
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
  const kind = loadingVisualKindForMessage(message);
  const supportingMessage = loadingDescriptionForKind(kind);

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
      <StatusConceptVisual
        kind={kind}
        lightMode={lightMode}
        highContrast={highContrast}
      />
      <ActivityIndicator size="large" accessibilityLabel={message} />
      <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
        {message}
      </Text>
      <Text style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}>
        {supportingMessage}
      </Text>
    </View>
  );
}

function ErrorState({
  title = "Action couldn't be completed",
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
  const theme = resolveVisualTheme(lightMode, highContrast);
  return (
    <View
      style={[
        styles.errorPanel,
        {
          backgroundColor: theme.colors.surfaceRaised,
          borderColor: theme.colors.statusError,
        },
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
      ]}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${message}`}
    >
      <Text style={[styles.errorTitle, { color: theme.colors.statusError }]}>
        {title}
      </Text>
      <Text style={[styles.errorText, { color: theme.colors.textPrimary }]}>
        {message}
      </Text>
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
    return active && !lightMode
      ? theme.colors.iconSelected
      : theme.colors.iconPrimary;
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
  largerControls,
}: {
  label: string;
  icon?: LucideIcon;
  accessibilityHint?: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "default" | "attention";
  lightMode?: boolean;
  highContrast?: boolean;
  largerControls?: boolean;
}) {
  const runtimeAccessibility = useContext(AccessibilityRuntimeContext);
  const useLargerControls =
    largerControls ?? runtimeAccessibility.largerControls;
  const Icon = icon;
  const theme = resolveVisualTheme(lightMode, highContrast);
  const buttonForeground = disabled
    ? theme.colors.textDisabled
    : highContrast
      ? theme.colors.actionPrimaryText
      : variant === "attention"
        ? colors.textOnWarning
        : lightMode
          ? lightTheme.textOnPrimary
          : colors.textOnPrimary;
  const iconColor = buttonForeground;
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
        useLargerControls && styles.largerControl,
        disabled && styles.disabledButton,
        disabled && {
          backgroundColor: theme.colors.actionSecondary,
          borderColor: theme.colors.borderStrong,
        },
      ]}
    >
      {Icon ? (
        <Icon
          size={26}
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
          runtimeAccessibility.textSize !== "STANDARD" &&
            styles.largeButtonText,
          runtimeAccessibility.textSize === "EXTRA_LARGE" &&
            styles.extraLargeButtonText,
          disabled && styles.disabledButtonText,
          { color: buttonForeground },
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
  variant = "default",
  lightMode = false,
  highContrast = false,
  largerControls,
}: {
  label: string;
  icon?: LucideIcon;
  accessibilityHint?: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive";
  lightMode?: boolean;
  highContrast?: boolean;
  largerControls?: boolean;
}) {
  const runtimeAccessibility = useContext(AccessibilityRuntimeContext);
  const useLargerControls =
    largerControls ?? runtimeAccessibility.largerControls;
  const Icon = icon;
  const iconColor = disabled
    ? colors.disabledText
    : variant === "destructive" && !highContrast
      ? lightTheme.danger
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
        variant === "destructive" && styles.destructiveSecondaryButton,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
        useLargerControls && styles.largerControl,
        disabled && styles.disabledButton,
      ]}
    >
      {Icon ? (
        <Icon
          size={26}
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
          variant === "destructive" &&
            !highContrast &&
            styles.destructiveSecondaryButtonText,
          runtimeAccessibility.textSize !== "STANDARD" &&
            styles.largeButtonText,
          runtimeAccessibility.textSize === "EXTRA_LARGE" &&
            styles.extraLargeButtonText,
          disabled && styles.disabledButtonText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function TertiaryButton({
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
  const runtimeAccessibility = useContext(AccessibilityRuntimeContext);
  const Icon = icon;
  const theme = resolveVisualTheme(lightMode, highContrast);
  const contentColor = disabled
    ? theme.colors.textDisabled
    : highContrast
      ? theme.colors.textPrimary
      : theme.colors.actionPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.tertiaryButton,
        lightMode && lightStyles.tertiaryButton,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
        runtimeAccessibility.largerControls && styles.largerTertiaryControl,
        disabled && styles.disabledButton,
      ]}
    >
      {Icon ? (
        <Icon
          size={24}
          color={contentColor}
          strokeWidth={2.5}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
      <Text
        style={[
          styles.tertiaryButtonText,
          lightMode && lightStyles.tertiaryButtonText,
          highContrast && !lightMode && styles.highContrastText,
          highContrast && lightMode && lightStyles.highContrastText,
          runtimeAccessibility.textSize !== "STANDARD" &&
            styles.largeButtonText,
          runtimeAccessibility.textSize === "EXTRA_LARGE" &&
            styles.extraLargeButtonText,
          disabled && styles.disabledButtonText,
          { color: contentColor },
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
  valueAccessory,
  lightMode = false,
  highContrast = false,
}: {
  label: string;
  value: string;
  valueAccessory?: React.ReactNode;
  lightMode?: boolean;
  highContrast?: boolean;
}) {
  const runtimeAccessibility = useContext(AccessibilityRuntimeContext);
  return (
    <View
      style={[
        styles.summaryRow,
        lightMode && lightStyles.surface,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
      ]}
    >
      <Text style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}>
        {label}
      </Text>
      <View style={styles.serviceAccessibilityRow}>
        <Text
          style={[
            styles.summaryValue,
            runtimeAccessibility.textSize !== "STANDARD" && styles.largeBody,
            runtimeAccessibility.textSize === "EXTRA_LARGE" &&
              styles.extraLargeBody,
            lightMode && lightStyles.text,
          ]}
        >
          {value}
        </Text>
        {valueAccessory}
      </View>
    </View>
  );
}

function requirementsToAssistanceTypes(
  requirements: AccessibilityRequirements,
): AssistanceType[] {
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

function formatEta(etaSeconds: number) {
  if (etaSeconds <= 45) {
    return "Arriving";
  }
  return `About ${Math.ceil(etaSeconds / 60)} min`;
}

function serviceOptionsFromArrivals(
  stop: NearbyBusStop,
  services: BusArrivalService[],
): BusServiceOption[] {
  const arrivalsByService = new Map(
    services.map((service) => [service.serviceNo, service]),
  );
  return busServicesForStop(stop)
    .map((serviceNo) => {
      const liveService = arrivalsByService.get(serviceNo);
      const buses = [...(liveService?.buses ?? [])].sort(
        (a, b) => a.etaSeconds - b.etaSeconds,
      );
      return {
        serviceNo,
        destination:
          liveService?.destination ??
          buses[0]?.destination ??
          serviceRouteDestination(serviceNo, stop) ??
          "Destination unavailable",
        buses,
        arrivalUnavailable: buses.length === 0,
      };
    })
    .sort((a, b) =>
      a.serviceNo.localeCompare(b.serviceNo, undefined, { numeric: true }),
    );
}

function serviceOptionsFromStopFallback(
  stop: NearbyBusStop,
): BusServiceOption[] {
  return busServicesForStop(stop).map((serviceNo) => ({
    serviceNo,
    destination:
      serviceRouteDestination(serviceNo, stop) ?? "Destination unavailable",
    buses: [],
    arrivalUnavailable: true,
  }));
}

function toStaticSearchStop(
  stop: StaticSearchStop | RouteStop,
): StaticSearchStop {
  return {
    busStopCode: stop.busStopCode,
    roadName: stop.roadName,
    description: stop.description,
    latitude: stop.latitude,
    longitude: stop.longitude,
    services: stop.services ?? [],
  };
}

function toNearbySearchStop(
  stop: StaticSearchStop,
  currentLocation: (MapCoordinate & { accuracyMeters?: number }) | null,
): NearbyBusStop {
  const origin = currentLocation ?? manualStopLookup;
  return {
    ...stop,
    distanceMeters: Math.max(
      1,
      Math.round(distanceBetweenCoordinates(origin, stop)),
    ),
  };
}

function currentLocationJourneyPoint(
  currentLocation: (MapCoordinate & { accuracyMeters?: number }) | null,
): JourneyPoint {
  return {
    id: "current-location",
    type: "CURRENT_LOCATION",
    label: "Current location",
    description: currentLocation
      ? "Using your current position"
      : "Using central Singapore as your current area",
    coordinate: currentLocation ?? manualStopLookup,
  };
}

function journeyPointFromStop(
  stop: StaticSearchStop | RouteStop,
  currentLocation: (MapCoordinate & { accuracyMeters?: number }) | null = null,
): JourneyPoint {
  return {
    id: `stop-${stop.busStopCode}`,
    type: "BUS_STOP",
    label: stop.description,
    description: `Bus Stop ${stop.busStopCode} - ${stop.roadName}`,
    coordinate: {
      latitude: stop.latitude,
      longitude: stop.longitude,
    },
    stop: toStaticSearchStop(stop),
  };
}

function journeyPointFromLandmark(landmark: MapLandmark): JourneyPoint {
  return {
    id: `place-${landmark.id}`,
    type: "LANDMARK",
    label: landmark.name,
    description: `${landmark.category} near ${landmark.relatedStopCodes.map((code) => `Stop ${code}`).join(", ")}`,
    coordinate: {
      latitude: landmark.latitude,
      longitude: landmark.longitude,
    },
    landmark,
  };
}

function mapCandidateJourneyPoint(center: MapCoordinate): JourneyPoint {
  const nearestStop = nearestByDistance(localSearchStops, center);
  const nearestLandmark = nearestByDistance(orientationLandmarks, center);
  const nearestStopDistance = nearestStop
    ? distanceBetweenCoordinates(center, nearestStop)
    : Number.POSITIVE_INFINITY;
  const nearestLandmarkDistance = nearestLandmark
    ? distanceBetweenCoordinates(center, nearestLandmark)
    : Number.POSITIVE_INFINITY;

  if (
    nearestLandmark &&
    nearestLandmarkDistance <= Math.min(nearestStopDistance, 180)
  ) {
    return {
      ...journeyPointFromLandmark(nearestLandmark),
      id: `map-${nearestLandmark.id}`,
      description: `Selected on map near ${nearestLandmark.name}`,
    };
  }

  if (nearestStop && nearestStopDistance <= 220) {
    return {
      ...journeyPointFromStop(nearestStop),
      id: `map-stop-${nearestStop.busStopCode}`,
      description: `Selected on map near Bus Stop ${nearestStop.busStopCode}`,
    };
  }

  return {
    id: `map-${center.latitude.toFixed(5)}-${center.longitude.toFixed(5)}`,
    type: "MAP_LOCATION",
    label: "Map destination",
    description: "Selected point on the map",
    coordinate: center,
  };
}

function nearestByDistance<T extends MapCoordinate>(
  items: T[],
  coordinate: MapCoordinate,
): T | null {
  return items.reduce<T | null>((nearest, item) => {
    if (!nearest) {
      return item;
    }
    return distanceBetweenCoordinates(coordinate, item) <
      distanceBetweenCoordinates(coordinate, nearest)
      ? item
      : nearest;
  }, null);
}

const defaultJourneySuggestions: JourneyPoint[] = [
  journeyPointFromLandmark(
    orientationLandmarks.find((landmark) => landmark.id === "kent-ridge-mrt") ??
      orientationLandmarks[0],
  ),
  journeyPointFromStop(
    localSearchStops.find((stop) => stop.busStopCode === "18121") ??
      localSearchStops[0],
  ),
  journeyPointFromStop(
    localSearchStops.find((stop) => stop.busStopCode === "18341") ??
      localSearchStops[0],
  ),
];

const journeyPlannerService = {
  planJourney(
    origin: JourneyPoint,
    destination: JourneyPoint,
    requirements: AccessibilityRequirements,
  ): { alternatives: JourneyAlternative[] } {
    const alternatives = Object.entries(serviceRoutesByNumber)
      .map(([serviceNo, route]) =>
        buildJourneyAlternative(
          serviceNo,
          route,
          origin,
          destination,
          requirements,
        ),
      )
      .filter((alternative): alternative is JourneyAlternative =>
        Boolean(alternative),
      )
      .sort((a, b) => {
        const accessibilityBiasA =
          requirements.wheelchairRamp && a.accessibilityKnown ? -2 : 0;
        const accessibilityBiasB =
          requirements.wheelchairRamp && b.accessibilityKnown ? -2 : 0;
        return (
          a.totalMinutes +
          a.walkingMinutes * 0.25 +
          accessibilityBiasA -
          (b.totalMinutes + b.walkingMinutes * 0.25 + accessibilityBiasB)
        );
      })
      .slice(0, 4)
      .map((alternative, index) => ({
        ...alternative,
        title: index === 0 ? "Fastest accessible route" : alternative.title,
        recommendation:
          index === 0
            ? recommendationForAlternative(alternative, requirements)
            : alternative.recommendation,
      }));

    return { alternatives };
  },
};

function buildJourneyAlternative(
  serviceNo: string,
  route: RouteStop[],
  origin: JourneyPoint,
  destination: JourneyPoint,
  requirements: AccessibilityRequirements,
): JourneyAlternative | null {
  if (route.length < 2) {
    return null;
  }

  let best: {
    boardingIndex: number;
    alightingIndex: number;
    score: number;
    walkToMeters: number;
    walkFinalMeters: number;
  } | null = null;

  for (
    let boardingIndex = 0;
    boardingIndex < route.length - 1;
    boardingIndex += 1
  ) {
    const boardingStop = route[boardingIndex];
    for (
      let alightingIndex = boardingIndex + 1;
      alightingIndex < route.length;
      alightingIndex += 1
    ) {
      const alightingStop = route[alightingIndex];
      const walkToMeters = distanceBetweenCoordinates(
        origin.coordinate,
        boardingStop,
      );
      const walkFinalMeters = distanceBetweenCoordinates(
        alightingStop,
        destination.coordinate,
      );
      const score =
        walkToMeters + walkFinalMeters + (alightingIndex - boardingIndex) * 95;
      if (!best || score < best.score) {
        best = {
          boardingIndex,
          alightingIndex,
          score,
          walkToMeters,
          walkFinalMeters,
        };
      }
    }
  }

  if (!best) {
    return null;
  }

  const boardingRouteStop = route[best.boardingIndex];
  const alightingRouteStop = route[best.alightingIndex];
  const routeStops = route
    .slice(best.boardingIndex, best.alightingIndex + 1)
    .map((stop, index) => ({ ...stop, sequence: index }));
  const boardingStop: NearbyBusStop = {
    ...toStaticSearchStop(boardingRouteStop),
    distanceMeters: Math.max(1, Math.round(best.walkToMeters)),
  };
  const boardingPoint = journeyPointFromStop(boardingRouteStop);
  const alightingPoint = journeyPointFromStop(alightingRouteStop);
  const walkToMinutes = walkingMinutesFromMeters(best.walkToMeters);
  const walkFinalMinutes = walkingMinutesFromMeters(best.walkFinalMeters);
  const stopCount = best.alightingIndex - best.boardingIndex;
  const busMinutes = Math.max(4, stopCount * 3);
  const totalMinutes = walkToMinutes + busMinutes + walkFinalMinutes;
  const accessibleKnown =
    boardingRouteStop.services?.includes(serviceNo) ?? false;
  const badges = [
    "Direct bus",
    "No transfer",
    walkToMinutes + walkFinalMinutes <= 8 ? "Less walking" : "Extra walking",
    accessibleKnown ? "Accessibility shown" : "Accessibility info limited",
  ];

  return {
    id: `${serviceNo}-${boardingRouteStop.busStopCode}-${alightingRouteStop.busStopCode}`,
    title: `Bus ${serviceNo}`,
    recommendation: recommendationForValues(
      walkToMinutes + walkFinalMinutes,
      stopCount,
      requirements,
    ),
    serviceNo,
    totalMinutes,
    walkingMinutes: walkToMinutes + walkFinalMinutes,
    stopCount,
    transferCount: 0,
    badges,
    boardingStop,
    alightingStop: { ...alightingRouteStop, sequence: routeStops.length - 1 },
    routeStops,
    legs: [
      {
        type: "WALK",
        origin,
        destination: boardingPoint,
        durationMinutes: walkToMinutes,
        distanceMeters: Math.max(1, Math.round(best.walkToMeters)),
        label: `Walk to ${boardingRouteStop.description}`,
      },
      {
        type: "BUS",
        serviceNo,
        origin: boardingPoint,
        destination: alightingPoint,
        durationMinutes: busMinutes,
        stopCount,
        routeStops,
        label: `Take Bus ${serviceNo}`,
      },
      {
        type: "WALK",
        origin: alightingPoint,
        destination,
        durationMinutes: walkFinalMinutes,
        distanceMeters: Math.max(1, Math.round(best.walkFinalMeters)),
        label: `Walk to ${destination.label}`,
      },
    ],
    nextBusEtaSeconds: 180 + stopCount * 30,
    accessibilityKnown:
      accessibleKnown && !requirements.wheelchairRamp ? true : accessibleKnown,
  };
}

function walkingMinutesFromMeters(distanceMeters: number) {
  return Math.max(1, Math.round(distanceMeters / 70));
}

function recommendationForAlternative(
  alternative: JourneyAlternative,
  requirements: AccessibilityRequirements,
) {
  return recommendationForValues(
    alternative.walkingMinutes,
    alternative.stopCount,
    requirements,
  );
}

function recommendationForValues(
  walkingMinutes: number,
  stopCount: number,
  requirements: AccessibilityRequirements,
) {
  if (requirements.wheelchairRamp && walkingMinutes <= 8) {
    return "Best match for your accessibility profile";
  }
  if (walkingMinutes <= 6) {
    return "Shortest walking route";
  }
  if (stopCount <= 2) {
    return "Fewest stops on the bus";
  }
  return "Balanced route";
}

function journeyAlternativeAnnouncement(
  alternative: JourneyAlternative,
  destination: JourneyPoint | null,
) {
  return [
    `${alternative.title}.`,
    `${alternative.totalMinutes} minutes total.`,
    `Walk ${alternative.walkingMinutes} minutes.`,
    `Take Bus ${alternative.serviceNo} for ${alternative.stopCount} stops.`,
    destination ? `Destination ${destination.label}.` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}

function journeyStepsForAlternative(alternative: JourneyAlternative) {
  const firstWalk = alternative.legs.find(
    (leg): leg is Extract<JourneyLeg, { type: "WALK" }> => leg.type === "WALK",
  );
  const busLeg = alternative.legs.find(
    (leg): leg is Extract<JourneyLeg, { type: "BUS" }> => leg.type === "BUS",
  );
  const finalWalk = [...alternative.legs]
    .reverse()
    .find(
      (leg): leg is Extract<JourneyLeg, { type: "WALK" }> =>
        leg.type === "WALK",
    );
  return [
    firstWalk
      ? `Walk ${firstWalk.distanceMeters} m to ${alternative.boardingStop.description}.`
      : `Go to ${alternative.boardingStop.description}.`,
    `Board Bus ${alternative.serviceNo} at Stop ${alternative.boardingStop.busStopCode}.`,
    busLeg
      ? `Ride ${busLeg.stopCount} stops to ${alternative.alightingStop.description}.`
      : `Ride to ${alternative.alightingStop.description}.`,
    finalWalk
      ? `Walk ${finalWalk.distanceMeters} m to your destination.`
      : "Continue to your destination.",
    "Use Assist from the bottom navigation if you need boarding or alighting help.",
  ];
}

function searchTransport(
  query: string,
  availableStops: StaticSearchStop[] = [],
): BusStopSearchResults {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return emptySearchResults;
  }

  const scoredStops = availableStops
    .map((stop) => {
      const description = normalizeSearchText(stop.description);
      const roadName = normalizeSearchText(stop.roadName);
      const services = stop.services;
      let score = Number.POSITIVE_INFINITY;

      if (stop.busStopCode === normalizedQuery) {
        score = 0;
      } else if (description === normalizedQuery) {
        score = 1;
      } else if (description.startsWith(normalizedQuery)) {
        score = 2;
      } else if (description.includes(normalizedQuery)) {
        score = 3;
      } else if (roadName.includes(normalizedQuery)) {
        score = 5;
      } else if (
        services.some(
          (service) => normalizeSearchText(service) === normalizedQuery,
        )
      ) {
        score = 6;
      }

      return { stop, score };
    })
    .filter(({ score }) => Number.isFinite(score))
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.stop.description.localeCompare(b.stop.description),
    )
    .slice(0, 8)
    .map(({ stop }) => stop);

  const places = orientationLandmarks
    .filter((landmark) =>
      [landmark.name, landmark.category].some((value) =>
        normalizeSearchText(value).includes(normalizedQuery),
      ),
    )
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name))
    .slice(0, 5);

  const services = Array.from(
    new Set(availableStops.flatMap((stop) => stop.services)),
  )
    .filter((serviceNo) =>
      normalizeSearchText(serviceNo).includes(normalizedQuery),
    )
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .slice(0, 5);

  return {
    stops: scoredStops,
    places,
    services,
  };
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function regionalStopRadiusForZoom(zoom: number): number {
  if (zoom <= 11) return 25_000;
  if (zoom <= 12) return 18_000;
  if (zoom <= 13) return 10_000;
  if (zoom <= 14) return 6_000;
  if (zoom <= 15) return 3_500;
  if (zoom <= 16) return 2_000;
  return 1_200;
}

function formatServicesForSpeech(services: string[]) {
  if (services.length <= 1) {
    return services[0] ?? "";
  }
  if (services.length === 2) {
    return `${services[0]} and ${services[1]}`;
  }
  return `${services.slice(0, -1).join(", ")} and ${services[services.length - 1]}`;
}

function serviceRouteDestination(
  serviceNo: string,
  stop: NearbyBusStop | null,
) {
  const route = routeForServiceFromStop(serviceNo, stop);
  return route[route.length - 1]?.description;
}

function preferredServiceRoute(
  routes: BusServiceRouteOption[],
  liveDestination?: string,
): BusServiceRouteOption | null {
  if (routes.length === 0) return null;
  const normalizedLiveDestination = liveDestination
    ? normalizeSearchText(liveDestination)
    : "";
  if (normalizedLiveDestination) {
    const matchingRoute = routes.find((route) => {
      const destination = normalizeSearchText(route.destination.description);
      return (
        destination === normalizedLiveDestination ||
        destination.includes(normalizedLiveDestination) ||
        normalizedLiveDestination.includes(destination)
      );
    });
    if (matchingRoute) return matchingRoute;
  }
  return (
    [...routes].sort(
      (a, b) => b.stops.length - a.stops.length || a.direction - b.direction,
    )[0] ?? null
  );
}

function buildFallbackRouteStops(
  selectedStop: NearbyBusStop | null,
  fallbackDestination: string,
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

function routeStopsForBus(
  bus: Bus | null,
  selectedStop: NearbyBusStop | null,
  arrival: ArrivalBus | null,
) {
  if (bus?.busService) {
    const route = routeForServiceFromStop(bus.busService, selectedStop);
    if (route.length > 0) {
      return route;
    }
  }
  return buildFallbackRouteStops(
    selectedStop,
    arrival?.destination ?? bus?.nextStop ?? destination,
  );
}

function routeForServiceFromStop(
  serviceNo: string,
  selectedStop: NearbyBusStop | null,
): RouteStop[] {
  const route = serviceRoutesByNumber[serviceNo] ?? [];
  if (route.length === 0) {
    return [];
  }
  const selectedIndex = selectedStop
    ? route.findIndex((stop) => stop.busStopCode === selectedStop.busStopCode)
    : 0;
  const forwardRoute = route.slice(Math.max(0, selectedIndex));
  return forwardRoute.map((stop, index) => ({ ...stop, sequence: index }));
}

function defaultAlightingStopForRoute(route: RouteStop[]) {
  return (
    route[Math.max(1, route.length - 2)] ?? route[route.length - 1] ?? null
  );
}

function routeStopIndex(routeStops: RouteStop[], stop: RouteStop | null) {
  if (!stop) {
    return -1;
  }
  return routeStops.findIndex(
    (candidate) => candidate.sequence === stop.sequence,
  );
}

function stopsRemainingToDestination(
  routeStops: RouteStop[],
  currentStopIndex: number,
  selectedDestinationStop: RouteStop | null,
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
  destinationStopIndex: number,
) {
  const nextStop = routeStops[currentStopIndex + 1];
  const destinationStop = routeStops[destinationStopIndex];
  const remaining =
    destinationStopIndex >= 0
      ? Math.max(0, destinationStopIndex - currentStopIndex)
      : null;
  return [
    nextStop ? `Next stop, ${nextStop.description}.` : "Final stop.",
    destinationStop
      ? `Destination, ${destinationStop.description}.`
      : "Destination not selected.",
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

function friendlyWalkingMinutes(durationSeconds: number) {
  return Math.max(1, Math.round(durationSeconds / 60));
}

function friendlyDistance(distanceMeters: number) {
  const distance = Math.max(0, distanceMeters);
  if (distance >= 1_000) {
    const kilometres = Math.round((distance / 1_000) * 10) / 10;
    return `${kilometres} km`;
  }
  const increment = distance < 100 ? 5 : 10;
  return `${Math.round(distance / increment) * increment} m`;
}

type WalkingGuidanceDistanceBand = "FAR" | "APPROACHING" | "NEAR" | "NOW";

function walkingGuidanceDistanceBand(
  distanceMeters: number,
): WalkingGuidanceDistanceBand {
  if (distanceMeters <= 25) return "NOW";
  if (distanceMeters <= 50) return "NEAR";
  if (distanceMeters <= 100) return "APPROACHING";
  return "FAR";
}

function roundedGuidanceDistance(distanceMeters: number) {
  const distance = Math.max(0, distanceMeters);
  const increment = distance > 100 ? 50 : distance > 30 ? 10 : 5;
  return Math.max(increment, Math.round(distance / increment) * increment);
}

function withoutFinalPunctuation(instruction: string) {
  return instruction.trim().replace(/[.!?]+$/, "");
}

function walkingStepAnnouncement(instruction: string, distanceMeters: number) {
  const instructionText = withoutFinalPunctuation(instruction);
  if (distanceMeters <= 25) return `${instructionText}.`;
  return `${instructionText}. Continue for ${roundedGuidanceDistance(
    distanceMeters,
  )} metres.`;
}

function walkingManeuverAnnouncement(
  instruction: string,
  distanceMeters: number,
  now: boolean,
) {
  const instructionText = withoutFinalPunctuation(instruction);
  if (/arrive/i.test(instructionText)) return "Your bus stop is ahead.";
  if (now) return `${instructionText} now.`;
  return `${instructionText} in ${roundedGuidanceDistance(
    distanceMeters,
  )} metres.`;
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

function createMapProjection(
  viewportCenter: MapCoordinate = manualStopLookup,
  zoom = 15,
) {
  const centerLatitude = viewportCenter.latitude;
  const metersPerLatitudeDegree = 111320;
  const metersPerLongitudeDegree =
    metersPerLatitudeDegree *
    Math.max(0.2, Math.cos(toRadians(centerLatitude)));
  const viewportCenterProjected = {
    x: viewportCenter.longitude * metersPerLongitudeDegree,
    y: viewportCenter.latitude * metersPerLatitudeDegree,
  };
  const spanMeters = mapSpanMetersForZoom(zoom);
  const spanX = spanMeters;
  const spanY = spanMeters;
  const centerX = viewportCenterProjected.x;
  const centerY = viewportCenterProjected.y;
  const paddedSpanX = spanX / (1 - (mapViewportPaddingPercent * 2) / 100);
  const paddedSpanY = spanY / (1 - (mapViewportPaddingPercent * 2) / 100);
  const leftX = centerX - paddedSpanX / 2;
  const topY = centerY + paddedSpanY / 2;

  function project(point: MapCoordinate): MapProjection {
    const raw = projectRaw(point);
    const left = Math.max(6, Math.min(94, raw.x));
    const top = Math.max(8, Math.min(88, raw.y));
    return {
      left: `${left}%` as `${number}%`,
      top: `${top}%` as `${number}%`,
      x: left,
      y: top,
    };
  }

  function projectRaw(point: MapCoordinate): MapProjection {
    const x = point.longitude * metersPerLongitudeDegree;
    const y = point.latitude * metersPerLatitudeDegree;
    const left = ((x - leftX) / paddedSpanX) * 100;
    const top = ((topY - y) / paddedSpanY) * 100;
    return {
      left: `${left}%` as `${number}%`,
      top: `${top}%` as `${number}%`,
      x: left,
      y: top,
    };
  }

  const scaleMeters = chooseMapScaleMeters(Math.max(spanX, spanY));
  return { project, projectRaw, scaleMeters };
}

function cameraModeForViewportSource(source: ViewportSource): CameraMode {
  if (source === "USER_PAN") {
    return "MANUAL";
  }
  if (source === "USER_LOCATION") {
    return "FOLLOW_USER";
  }
  if (source === "SELECTED_STOP" || source === "DESTINATION_FOCUS") {
    return "STOP_FOCUS";
  }
  if (source === "CLUSTER_EXPAND") {
    return "CLUSTER_FOCUS";
  }
  if (
    source === "ROUTE" ||
    source === "ACTIVE_JOURNEY" ||
    source === "FULL_ROUTE"
  ) {
    return "FOLLOW_JOURNEY";
  }
  return "SEARCH_RESULT";
}

function defaultMapLayoutSize(): MapLayoutSize {
  return {
    height: defaultMapCanvasHeight,
    width: defaultMapCanvasWidth,
  };
}

function measuredMapLayoutSize(layout: MapLayoutSize): MapLayoutSize {
  return {
    height: Math.max(minimumUsableMapDimension, layout.height),
    width: Math.max(minimumUsableMapDimension, layout.width),
  };
}

function getCurrentMapInsets({
  contextualActionVisible = false,
  mapLayout,
  sideControlsVisible = true,
  topControlsVisible = true,
}: {
  contextualActionVisible?: boolean;
  mapLayout: MapLayoutSize;
  sideControlsVisible?: boolean;
  topControlsVisible?: boolean;
}): MapOverlayInsets {
  const measuredLayout = measuredMapLayoutSize(mapLayout);
  const top = topControlsVisible
    ? mapTopOverlayHeight +
      (contextualActionVisible
        ? mapTopControlGap + contextualMapControlHeight + mapCameraInsetSpacing
        : 0)
    : 0;
  const right = sideControlsVisible ? rightToolbarWidth + mapOverlayMargin : 0;
  const left = mapOverlayMargin + 4;

  const insets = {
    bottom: 0,
    left,
    right,
    top,
  };

  if (
    __DEV__ &&
    enableCameraDebugLogs &&
    (insets.left + insets.right > measuredLayout.width * 0.6 ||
      insets.top + insets.bottom > measuredLayout.height * 0.6)
  ) {
    console.warn("Map padding too large", {
      insets,
      mapHeight: measuredLayout.height,
      mapWidth: measuredLayout.width,
    });
  }

  return insets;
}

function usableMapRectForCamera({
  insets,
  mapLayout,
}: {
  insets: MapOverlayInsets;
  mapLayout: MapLayoutSize;
}): UsableMapRect {
  const measuredLayout = measuredMapLayoutSize(mapLayout);
  return {
    height: Math.max(0, measuredLayout.height - insets.top - insets.bottom),
    width: Math.max(0, measuredLayout.width - insets.left - insets.right),
    x: insets.left,
    y: insets.top,
  };
}

function centerSafeZoneForRect(usableMapRect: UsableMapRect): UsableMapRect {
  const width = usableMapRect.width * centerSafeZoneScale;
  const height = usableMapRect.height * centerSafeZoneScale;
  return {
    height,
    width,
    x: usableMapRect.x + (usableMapRect.width - width) / 2,
    y: usableMapRect.y + (usableMapRect.height - height) / 2,
  };
}

function createMapCameraGeometry({
  contextualActionVisible = false,
  mapLayout,
}: {
  contextualActionVisible?: boolean;
  mapLayout: MapLayoutSize;
}): MapCameraGeometry {
  const measuredLayout = measuredMapLayoutSize(mapLayout);
  const insets = getCurrentMapInsets({
    contextualActionVisible,
    mapLayout: measuredLayout,
  });
  const usableMapRect = usableMapRectForCamera({
    insets,
    mapLayout: measuredLayout,
  });
  if (
    __DEV__ &&
    enableCameraDebugLogs &&
    (usableMapRect.width < minimumUsableMapDimension ||
      usableMapRect.height < minimumUsableMapDimension)
  ) {
    console.warn("INVALID MAP VIEWPORT", usableMapRect);
  }
  return {
    centerSafeZone: centerSafeZoneForRect(usableMapRect),
    insets,
    mapHeight: measuredLayout.height,
    mapWidth: measuredLayout.width,
    usableMapRect,
  };
}

function cameraPaddingForProvider(geometry: MapCameraGeometry) {
  return {
    bottom: geometry.insets.bottom,
    left: geometry.insets.left,
    right: geometry.insets.right,
    top: geometry.insets.top,
  };
}

function usableMapTargetPercent(
  geometry: MapCameraGeometry = createMapCameraGeometry({
    mapLayout: defaultMapLayoutSize(),
  }),
) {
  const targetX =
    ((geometry.usableMapRect.x + geometry.usableMapRect.width / 2) /
      geometry.mapWidth) *
    100;
  const targetY =
    ((geometry.usableMapRect.y + geometry.usableMapRect.height / 2) /
      geometry.mapHeight) *
    100;

  return {
    x: Math.max(8, Math.min(92, targetX)),
    y: Math.max(8, Math.min(92, targetY)),
  };
}

function cameraCenterForUserLocation(
  userLocation: MapCoordinate,
  zoom: number,
  geometry: MapCameraGeometry = createMapCameraGeometry({
    mapLayout: defaultMapLayoutSize(),
  }),
): MapCoordinate {
  const target = usableMapTargetPercent(geometry);
  const centerLatitude = userLocation.latitude;
  const metersPerLatitudeDegree = 111320;
  const metersPerLongitudeDegree =
    metersPerLatitudeDegree *
    Math.max(0.2, Math.cos(toRadians(centerLatitude)));
  const spanMeters = mapSpanMetersForZoom(zoom);
  const paddedSpan = spanMeters / (1 - (mapViewportPaddingPercent * 2) / 100);
  const userX = userLocation.longitude * metersPerLongitudeDegree;
  const userY = userLocation.latitude * metersPerLatitudeDegree;
  const cameraX = userX - ((target.x - 50) / 100) * paddedSpan;
  const cameraY = userY + ((target.y - 50) / 100) * paddedSpan;

  return {
    latitude: cameraY / metersPerLatitudeDegree,
    longitude: cameraX / metersPerLongitudeDegree,
  };
}

function projectedPointInRect(
  point: MapProjection,
  rect: UsableMapRect,
  geometry: MapCameraGeometry,
) {
  const x = (point.x / 100) * geometry.mapWidth;
  const y = (point.y / 100) * geometry.mapHeight;
  return (
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  );
}

function coordinateVisibleInGeometry({
  coordinate,
  geometry,
  viewport,
  inset = 18,
}: {
  coordinate: MapCoordinate;
  geometry: MapCameraGeometry;
  viewport: MapViewport;
  inset?: number;
}) {
  const projection = createMapProjection(viewport.center, viewport.zoom);
  return projectedPointInRect(
    projection.projectRaw(coordinate),
    insetUsableMapRect(geometry.usableMapRect, inset),
    geometry,
  );
}

function coordinateVisibleInMapCanvas({
  coordinate,
  geometry,
  viewport,
  inset = 0,
}: {
  coordinate: MapCoordinate;
  geometry: MapCameraGeometry;
  viewport: MapViewport;
  inset?: number;
}) {
  const projection = createMapProjection(viewport.center, viewport.zoom);
  return projectedPointInRect(
    projection.projectRaw(coordinate),
    insetUsableMapRect(
      {
        height: geometry.mapHeight,
        width: geometry.mapWidth,
        x: 0,
        y: 0,
      },
      inset,
    ),
    geometry,
  );
}

function insetUsableMapRect(rect: UsableMapRect, inset: number): UsableMapRect {
  const boundedInset = Math.max(
    0,
    Math.min(inset, rect.width / 2, rect.height / 2),
  );
  return {
    height: Math.max(0, rect.height - boundedInset * 2),
    width: Math.max(0, rect.width - boundedInset * 2),
    x: rect.x + boundedInset,
    y: rect.y + boundedInset,
  };
}

function coordinateWorldMetrics(center: MapCoordinate, zoom: number) {
  const metersPerLatitudeDegree = 111320;
  const metersPerLongitudeDegree =
    metersPerLatitudeDegree *
    Math.max(0.2, Math.cos(toRadians(center.latitude)));
  const spanMeters = mapSpanMetersForZoom(zoom);
  const paddedSpan = spanMeters / (1 - (mapViewportPaddingPercent * 2) / 100);

  return {
    metersPerLatitudeDegree,
    metersPerLongitudeDegree,
    paddedSpanX: paddedSpan,
    paddedSpanY: paddedSpan,
  };
}

function panCameraCenterToRevealCoordinate({
  coordinate,
  geometry,
  viewport,
}: {
  coordinate: MapCoordinate;
  geometry: MapCameraGeometry;
  viewport: MapViewport;
}): MapCoordinate {
  const projection = createMapProjection(viewport.center, viewport.zoom);
  const projected = projection.projectRaw(coordinate);
  const x = (projected.x / 100) * geometry.mapWidth;
  const y = (projected.y / 100) * geometry.mapHeight;
  const revealRect = insetUsableMapRect(geometry.usableMapRect, 18);
  const targetX = Math.max(
    revealRect.x,
    Math.min(revealRect.x + revealRect.width, x),
  );
  const targetY = Math.max(
    revealRect.y,
    Math.min(revealRect.y + revealRect.height, y),
  );
  const deltaX = x - targetX;
  const deltaY = y - targetY;

  if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
    return viewport.center;
  }

  const metrics = coordinateWorldMetrics(viewport.center, viewport.zoom);
  const centerX =
    viewport.center.longitude * metrics.metersPerLongitudeDegree +
    (deltaX / geometry.mapWidth) * metrics.paddedSpanX;
  const centerY =
    viewport.center.latitude * metrics.metersPerLatitudeDegree -
    (deltaY / geometry.mapHeight) * metrics.paddedSpanY;

  return {
    latitude: centerY / metrics.metersPerLatitudeDegree,
    longitude: centerX / metrics.metersPerLongitudeDegree,
  };
}

function midpointCameraCenterForCoordinates(
  a: MapCoordinate,
  b: MapCoordinate,
): MapCoordinate {
  return {
    latitude: (a.latitude + b.latitude) / 2,
    longitude: (a.longitude + b.longitude) / 2,
  };
}

function zoomToFitCoordinates({
  a,
  b,
  geometry,
  viewport,
}: {
  a: MapCoordinate;
  b: MapCoordinate;
  geometry: MapCameraGeometry;
  viewport: MapViewport;
}) {
  const midpoint = midpointCameraCenterForCoordinates(a, b);
  const metrics = coordinateWorldMetrics(midpoint, viewport.zoom);
  const dx =
    Math.abs(a.longitude - b.longitude) * metrics.metersPerLongitudeDegree;
  const dy =
    Math.abs(a.latitude - b.latitude) * metrics.metersPerLatitudeDegree;
  const usableWidthRatio = Math.max(
    0.12,
    geometry.usableMapRect.width / geometry.mapWidth,
  );
  const usableHeightRatio = Math.max(
    0.12,
    geometry.usableMapRect.height / geometry.mapHeight,
  );
  const requiredPaddedSpan = Math.max(
    minimumMapSpanMeters,
    (dx * 1.35) / usableWidthRatio,
    (dy * 1.35) / usableHeightRatio,
  );
  const requiredMapSpan =
    requiredPaddedSpan * (1 - (mapViewportPaddingPercent * 2) / 100);
  const fittedZoom =
    requiredMapSpan <= minimumMapSpanMeters
      ? mapZoomLimits.max
      : 12 + Math.log2(5200 / requiredMapSpan);

  return clampMapZoom(Math.min(viewport.zoom, fittedZoom), "SELECTED_STOP");
}

function stopSelectionCameraViewport({
  currentLocation,
  geometry,
  stop,
  viewport,
}: {
  currentLocation: MapCoordinate | null;
  geometry: MapCameraGeometry;
  stop: MapCoordinate;
  viewport: MapViewport;
}): MapViewport | null {
  const projection = createMapProjection(viewport.center, viewport.zoom);
  const stopProjection = projection.projectRaw(stop);
  const userProjection = currentLocation
    ? projection.projectRaw(currentLocation)
    : null;
  const stopVisible = projectedPointInRect(
    stopProjection,
    geometry.usableMapRect,
    geometry,
  );
  const userVisible =
    !userProjection ||
    projectedPointInRect(userProjection, geometry.usableMapRect, geometry);

  if (stopVisible && userVisible) {
    return null;
  }

  const pannedCenter = panCameraCenterToRevealCoordinate({
    coordinate: stop,
    geometry,
    viewport,
  });
  const pannedViewport = {
    ...viewport,
    center: pannedCenter,
    zoom: clampMapZoom(viewport.zoom, "SELECTED_STOP"),
  };
  if (!currentLocation) {
    return pannedViewport;
  }

  const pannedProjection = createMapProjection(
    pannedViewport.center,
    pannedViewport.zoom,
  );
  const pannedUserVisible = projectedPointInRect(
    pannedProjection.projectRaw(currentLocation),
    geometry.usableMapRect,
    geometry,
  );
  const pannedStopVisible = projectedPointInRect(
    pannedProjection.projectRaw(stop),
    geometry.usableMapRect,
    geometry,
  );

  if (pannedUserVisible && pannedStopVisible) {
    return pannedViewport;
  }

  const midpointViewport = {
    ...viewport,
    center: midpointCameraCenterForCoordinates(currentLocation, stop),
    zoom: clampMapZoom(viewport.zoom, "SELECTED_STOP"),
  };
  const midpointProjection = createMapProjection(
    midpointViewport.center,
    midpointViewport.zoom,
  );
  const midpointUserVisible = projectedPointInRect(
    midpointProjection.projectRaw(currentLocation),
    geometry.usableMapRect,
    geometry,
  );
  const midpointStopVisible = projectedPointInRect(
    midpointProjection.projectRaw(stop),
    geometry.usableMapRect,
    geometry,
  );

  if (midpointUserVisible && midpointStopVisible) {
    return midpointViewport;
  }

  return {
    ...midpointViewport,
    zoom: zoomToFitCoordinates({
      a: currentLocation,
      b: stop,
      geometry,
      viewport,
    }),
  };
}

function handleStopSelectionCamera({
  currentLocation,
  currentGeometry,
  geometry,
  intentId,
  intentRef,
  runCameraCommand,
  stop,
  viewport,
}: {
  currentLocation: MapCoordinate | null;
  currentGeometry: MapCameraGeometry;
  geometry: MapCameraGeometry;
  intentId: number;
  intentRef: { current: number };
  runCameraCommand: (
    command: CameraCommand,
    mode: ViewportSource,
    update: (current: MapViewport) => MapViewport,
    cameraMode?: CameraMode,
  ) => void;
  stop: NearbyBusStop;
  viewport: MapViewport;
}) {
  const stopAlreadyVisible = coordinateVisibleInMapCanvas({
    coordinate: stop,
    geometry: currentGeometry,
    viewport,
    inset: 8,
  });
  if (stopAlreadyVisible) {
    if (__DEV__ && enableCameraDebugLogs) {
      console.debug("NEAREST_STOP_SELECTED", {
        beforeCoordinate: {
          latitude: stop.latitude,
          longitude: stop.longitude,
        },
        cameraCenter: viewport.center,
        selectedCoordinate: {
          latitude: stop.latitude,
          longitude: stop.longitude,
        },
        mapBottomInset: currentGeometry.insets.bottom,
        sheetMode: viewport.mode,
        zoom: viewport.zoom,
      });
    }
    return;
  }

  const nextViewport = stopSelectionCameraViewport({
    currentLocation,
    geometry,
    stop,
    viewport,
  });

  if (__DEV__ && enableCameraDebugLogs) {
    console.debug("STOP_SELECTION_CAMERA", {
      calculatedInsets: geometry.insets,
      cameraCenter: viewport.center,
      cameraMode: viewport.mode,
      mapRect: geometry.usableMapRect,
      selectedStop: {
        latitude: stop.latitude,
        longitude: stop.longitude,
      },
      userLocation: currentLocation,
      zoom: viewport.zoom,
    });
  }

  if (!nextViewport || intentId !== intentRef.current) {
    return;
  }

  runCameraCommand(
    "selectStopReveal",
    "SELECTED_STOP",
    (current) => {
      if (intentId !== intentRef.current) {
        return current;
      }
      return {
        ...current,
        bearing: current.bearing,
        center: nextViewport.center,
        pitch: current.pitch,
        zoom: nextViewport.zoom,
      };
    },
    "STOP_FOCUS",
  );
}

function rectAroundProjection({
  geometry,
  height,
  point,
  priority,
  width,
  xOffset = 0,
  yOffset = 0,
}: {
  geometry: MapCameraGeometry;
  height: number;
  point: Pick<MapProjection, "x" | "y">;
  priority: MarkerPriorityKey;
  width: number;
  xOffset?: number;
  yOffset?: number;
}): ScreenRect {
  const x = (point.x / 100) * geometry.mapWidth + xOffset;
  const y = (point.y / 100) * geometry.mapHeight + yOffset;
  return {
    height,
    priority,
    width,
    x: x - width / 2,
    y: y - height / 2,
  };
}

function rectsOverlap(first: UsableMapRect, second: UsableMapRect) {
  return !(
    first.x + first.width < second.x ||
    second.x + second.width < first.x ||
    first.y + first.height < second.y ||
    second.y + second.height < first.y
  );
}

function clusterVisualSize(count: number) {
  if (count >= 100) {
    return 44;
  }
  if (count >= 10) {
    return 38;
  }
  return 34;
}

function landmarkVisibleAtZoom(landmark: MapLandmark, zoom: number) {
  if (landmark.category === "station" || landmark.tier <= 1) {
    return true;
  }
  if (zoom < 15.4) {
    return false;
  }
  if (zoom < 16.4) {
    return landmark.category === "park";
  }
  return true;
}

function zIndexForMarkerPriority(priority: MarkerPriorityKey) {
  return markerPriority[priority];
}

function debugMapCameraSnapshot({
  bottomSheetState,
  cameraCenter,
  cameraMode,
  geometry,
  phase,
  userLocation,
  zoom,
}: {
  bottomSheetState: BottomSheetState;
  cameraCenter: MapCoordinate;
  cameraMode: CameraMode;
  geometry: MapCameraGeometry;
  phase: "before" | "after";
  userLocation: MapCoordinate | null;
  zoom: number;
}) {
  if (!__DEV__ || !enableCameraDebugLogs) {
    return;
  }
  console.debug({
    bottomSheetState,
    cameraCenter,
    cameraMode,
    mapHeight: geometry.mapHeight,
    mapPadding: geometry.insets,
    mapWidth: geometry.mapWidth,
    phase,
    searchHeight: mapTopOverlayHeight,
    toolbarWidth: rightToolbarWidth,
    userLocation,
    usableMapRect: geometry.usableMapRect,
    zoom,
  });
}

function mapSpanMetersForZoom(zoom: number) {
  return Math.max(minimumMapSpanMeters, 5200 / 2 ** (zoom - 12));
}

function distanceBetweenCoordinates(a: MapCoordinate, b: MapCoordinate) {
  const earthRadiusMeters = 6_371_000;
  const deltaLatitude = toRadians(b.latitude - a.latitude);
  const deltaLongitude = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeA) *
      Math.cos(latitudeB) *
      Math.sin(deltaLongitude / 2) ** 2;
  return (
    2 *
    earthRadiusMeters *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
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
  if (
    mode === "ACTIVE_JOURNEY" ||
    mode === "ROUTE" ||
    mode === "DESTINATION_FOCUS"
  ) {
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

async function readSavedPreferences(): Promise<AccessibilityPreferences | null> {
  try {
    const raw = await AsyncStorage.getItem(localPreferencesKey);
    if (!raw) {
      return null;
    }

    return parsePersistedAccessibilityPreferences(raw);
  } catch {
    return null;
  }
}

async function savePreferencesLocally(preferences: AccessibilityPreferences) {
  try {
    await AsyncStorage.setItem(
      localPreferencesKey,
      serializeAccessibilityPreferences(preferences),
    );
  } catch {
    // Local preference persistence should never block the journey flow.
  }
}

async function readSavedActiveJourney(): Promise<PersistedActiveJourney | null> {
  try {
    const raw = await AsyncStorage.getItem(localActiveJourneyKey);
    if (!raw) {
      return null;
    }
    const parsed = parsePersistedActiveJourney(raw);
    if (!parsed) {
      await AsyncStorage.removeItem(localActiveJourneyKey);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function parsePersistedActiveJourney(
  raw: string,
): PersistedActiveJourney | null {
  try {
    const parsed = JSON.parse(raw) as Partial<
      PersistedActiveJourney | PersistedActiveJourneyV1
    >;
    if (
      (parsed.version !== 1 && parsed.version !== 2) ||
      parsed.journeyPhase === "COMPLETED" ||
      !parsed.selectedStop?.busStopCode ||
      !parsed.selectedServiceOption?.serviceNo ||
      !parsed.selectedBus?.busService
    ) {
      return null;
    }
    if (parsed.version === 2) {
      const current = parsed as PersistedActiveJourney;
      return {
        ...current,
        visualGuidePhase: current.visualGuidePhase ?? current.journeyPhase,
        walkingRoute: current.walkingRoute ?? null,
        guidanceMode: current.guidanceMode ?? "INACTIVE",
      };
    }
    const legacy = parsed as PersistedActiveJourneyV1;
    return {
      ...legacy,
      version: 2,
      visualGuidePhase: legacy.journeyPhase,
      walkingRoute: null,
      guidanceMode: "INACTIVE",
    };
  } catch {
    return null;
  }
}

async function saveActiveJourneyLocally(journey: PersistedActiveJourney) {
  try {
    await AsyncStorage.setItem(localActiveJourneyKey, JSON.stringify(journey));
  } catch {
    // Journey persistence should never block current journey guidance.
  }
}

async function clearSavedActiveJourney() {
  try {
    await AsyncStorage.removeItem(localActiveJourneyKey);
  } catch {
    // Clearing stale local continuity data should not block the app.
  }
}

function screenForPersistedJourney(journey: PersistedActiveJourney): Screen {
  if (
    journey.journeyPhase === "ONBOARD" ||
    journey.journeyPhase === "DESTINATION_APPROACHING" ||
    journey.journeyPhase === "DESTINATION_NEXT" ||
    journey.journeyPhase === "DISEMBARKING" ||
    journey.journeyPhase === "ALIGHTING"
  ) {
    return "ONBOARD";
  }
  if (
    journey.requestId ||
    journey.journeyPhase === "WALKING_TO_STOP" ||
    journey.journeyPhase === "WAITING_FOR_BUS" ||
    journey.journeyPhase === "BUS_ARRIVING" ||
    journey.journeyPhase === "BOARDING"
  ) {
    return "STATUS";
  }
  return journey.journeySetupState === "REVIEWING_JOURNEY" ? "CONFIRM" : "BUS";
}

function readableAssistanceType(type: AssistanceType) {
  const labels: Record<AssistanceType, string> = {
    WHEELCHAIR_RAMP: "Ramp assistance",
    BUS_AUDIO_IDENTIFICATION: "Bus identification",
    EXTENDED_DWELL_TIME: "Extra boarding time",
  };
  return labels[type];
}

function readableAlightingAssistanceType(type: AssistanceType) {
  return type === "EXTENDED_DWELL_TIME"
    ? "Extra alighting time"
    : readableAssistanceType(type);
}

function assistanceConfirmationAnnouncement(
  types: AssistanceType[],
  phase: AssistancePhase = "BOARDING",
) {
  if (types.length === 0) return "Your assistance request was received.";
  const messages: Record<AssistanceType, string> = {
    WHEELCHAIR_RAMP:
      phase === "ALIGHTING"
        ? "Your ramp request has been received."
        : "Ramp request received.",
    BUS_AUDIO_IDENTIFICATION: "Audio identification request received.",
    EXTENDED_DWELL_TIME:
      phase === "ALIGHTING"
        ? "Extra alighting time request received."
        : "Extra boarding time request received.",
  };
  return types.map((type) => messages[type]).join(" ");
}

function requirementsLabel(requirements: AccessibilityRequirements) {
  const labels = requirementsToAssistanceTypes(requirements).map(
    readableAssistanceType,
  );
  return labels.length > 0
    ? labels.join(", ")
    : "No journey assistance selected";
}

function appPreferencesLabel(preferences: AccessibilityPreferences) {
  const labels = [
    preferences.wheelchairRouting ? "wheelchair routing" : undefined,
    preferences.screenReaderOptimised ? "screen-reader guidance" : undefined,
    preferences.spokenGuidance ? "spoken guidance" : undefined,
    preferences.vibrationAlerts !== "OFF"
      ? `${preferences.vibrationAlerts.toLowerCase()} vibration alerts`
      : undefined,
    preferences.textSize !== "STANDARD"
      ? `${preferences.textSize.toLowerCase().replace("_", " ")} text`
      : undefined,
    preferences.highContrast ? "high contrast" : undefined,
    preferences.repeatAudio ? "repeat announcements" : undefined,
    `${preferences.themeMode} mode`,
  ].filter(Boolean);

  return labels.length > 0 ? labels.join(", ") : "standard display and alerts";
}

function locationStateForCoords(coords: {
  accuracyMeters?: number;
}): LocationState {
  return coords.accuracyMeters && coords.accuracyMeters > 100
    ? "approximate"
    : "available";
}

function nearbyStopsFailureStatus(error: unknown): NearbyStopsState {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();
  return message.includes("network") ||
    message.includes("fetch") ||
    message.includes("connection") ||
    message.includes("offline")
    ? "network_error"
    : "service_error";
}

function readConnectivityState(): ConnectivityState {
  const navigatorLike = (globalThis as { navigator?: { onLine?: boolean } })
    .navigator;
  if (navigatorLike?.onLine === false) {
    return "offline";
  }
  return "online";
}

function journeyDiscoveryStatus(
  discovery: TransportDiscoveryState,
): JourneyDiscoveryStatus | null {
  if (discovery.connectivity === "offline") {
    return {
      title: "You're offline",
      message: "Reconnect to refresh nearby stops, or choose a stop manually.",
      tone: "error" as const,
      primary: "Try again",
      secondary: "Select bus stop manually",
    };
  }

  if (discovery.location === "permission_denied") {
    return {
      title: "Location access is off",
      message: "Allow location access to automatically find nearby bus stops.",
      tone: "error" as const,
      primary: "Try again",
      secondary: "Select bus stop manually",
    };
  }

  if (discovery.location === "unavailable" && discovery.locationRequested) {
    return {
      title: "We couldn't find your location",
      message: "Check your location settings or choose a bus stop manually.",
      tone: "error" as const,
      primary: "Try again",
      secondary: "Select bus stop manually",
    };
  }

  if (
    discovery.nearbyStopsStatus === "network_error" ||
    discovery.nearbyStopsStatus === "service_error"
  ) {
    return {
      title: discovery.lastSuccessfulLocation
        ? "Location found"
        : "Couldn't load nearby stops",
      message: discovery.lastSuccessfulLocation
        ? "Nearby stops couldn't be loaded."
        : "Try again or choose a bus stop manually.",
      tone: "error" as const,
      primary: "Try again",
      secondary: "Select bus stop manually",
    };
  }

  if (discovery.nearbyStopsStatus === "empty") {
    return {
      title: "No nearby stops found",
      message: "Move the map or search another area.",
      tone: "info" as const,
      primary: "Try again",
      secondary: "Select bus stop manually",
    };
  }

  if (discovery.location === "approximate") {
    return {
      title: "Using approximate location",
      message: "Nearby stops may be a little farther away.",
      tone: "info" as const,
      primary: undefined,
      secondary: undefined,
    };
  }

  return null;
}

function resolveFindBusPanelState({
  discovery,
  loadingKind,
  loadingMessage,
  loadingVisible,
}: {
  discovery: TransportDiscoveryState;
  loadingKind: "LOCATING" | "MAP_LOADING";
  loadingMessage: string;
  loadingVisible: boolean;
}): FindBusPanelState {
  if (loadingVisible) {
    return {
      kind: loadingKind,
      message: loadingMessage,
    };
  }

  const status = journeyDiscoveryStatus(discovery);
  if (!status) {
    return { kind: "IDLE" };
  }

  if (
    discovery.location === "permission_denied" ||
    (discovery.location === "unavailable" && discovery.locationRequested)
  ) {
    return { kind: "LOCATION_ERROR", status };
  }

  if (
    discovery.connectivity === "offline" ||
    discovery.nearbyStopsStatus === "network_error" ||
    discovery.nearbyStopsStatus === "service_error" ||
    discovery.nearbyStopsStatus === "empty"
  ) {
    return { kind: "DISCOVERY_ERROR", status };
  }

  return { kind: "NOTICE", status };
}

function appPreferencesMatch(
  first: AccessibilityPreferences,
  second: AccessibilityPreferences,
) {
  return (
    JSON.stringify(mergeAccessibilityPreferences(first)) ===
    JSON.stringify(mergeAccessibilityPreferences(second))
  );
}

function profilePreferencesChanged(
  profile: PassengerProfile,
  preferences: AccessibilityPreferences,
) {
  return !appPreferencesMatch(
    accessibilityPreferencesForProfile(profile),
    preferences,
  );
}

function accessibilityPreferencesForProfile(
  profile: PassengerProfile,
): AccessibilityPreferences {
  return mergeAccessibilityPreferences(
    profile.accessibilityPreferences ?? profile.appPreferences,
    profile.assistanceDefaults,
  );
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
  if (!status) {
    return "No assistance requested";
  }
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

function canApplyRequestStatus(
  current: AssistanceRequestStatus | null,
  next: AssistanceRequestStatus,
) {
  return canTransitionAssistanceRequestStatus(current, next);
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

function assistanceCaseStateLabel(state: AssistanceCaseState) {
  const labels: Record<AssistanceCaseState, string> = {
    REQUESTED: "request received",
    VALIDATED: "request confirmed",
    VEHICLE_ASSIGNED: "bus assigned; waiting for safety checks",
    SAFE_TO_ACTUATE: "safety checks passed",
    ACTUATING: "equipment is being prepared",
    READY: "assistance equipment is ready",
    COMPLETED: "assistance completed",
    NEEDS_CONFIRMATION: "confirmation needed",
    ESCALATED: "an operator is helping",
    BLOCKED: "equipment paused for safety",
    FAILED: "equipment needs operator help",
    CANCELLED: "request cancelled",
  };
  return labels[state];
}

function caseStatePassengerMessage(state: AssistanceCaseState) {
  if (state === "READY")
    return "Your requested assistance is ready. Follow the displayed boarding instructions.";
  if (state === "BLOCKED")
    return "The equipment is paused for safety. Please wait for instructions.";
  if (state === "ESCALATED")
    return "A remote operator has been alerted and is checking your assistance.";
  if (state === "FAILED")
    return "The equipment needs assistance from an operator. Please wait in a safe place.";
  return assistanceCaseStateLabel(state);
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
  if (
    screen === "STOP" ||
    screen === "BUS" ||
    screen === "CONFIRM" ||
    screen === "STATUS"
  ) {
    return "JOURNEY";
  }
  if (screen === "ONBOARD" || screen === "ALIGHTING_STOP") {
    return "JOURNEY";
  }
  if (screen === "ACCESSIBILITY") {
    return "ASSISTANCE";
  }
  if (screen === "PROFILE" || screen === "AUTH") {
    return "PROFILE";
  }
  return "JOURNEY";
}

function eventLabel(event: StatusUpdateMessage) {
  if (event.type === "REQUEST_STATUS") {
    return `${requestStatusLabel(event.status)} (${readableSource(event.source)})`;
  }
  if (event.type === "VEHICLE_STATUS") {
    return `Service ${event.busService}: ${vehicleStatusLabel(event.status)}`;
  }
  if (event.type === "EXTERNAL_ANNOUNCEMENT") {
    return event.announcement;
  }
  if (event.type === "CASE_STATUS") {
    return assistanceCaseStateLabel(event.state);
  }
  if (event.type === "SAFETY_TELEMETRY") {
    return event.fresh
      ? "Vehicle safety checks updated"
      : "Vehicle safety checks are out of date";
  }
  if (event.type === "ACTUATOR_STATUS") {
    return `Equipment: ${event.status.state.toLowerCase().replaceAll("_", " ")}`;
  }
  if (event.type === "OPERATOR_ESCALATION") {
    return `Operator alerted: ${event.reason}`;
  }
  if (event.type === "AUTONOMY_STATUS") {
    return `Autonomous bus: ${event.autonomy.state
      .toLowerCase()
      .replaceAll("_", " ")}`;
  }
  return `${event.health.deviceType.toLowerCase().replaceAll("_", " ")} status updated`;
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
  return stop.services;
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

function firstMoveInstruction(
  stop: NearbyBusStop,
  landmark: MapLandmark | null,
) {
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
  return `${stop.description}, bus stop ${stop.busStopCode}, approximately ${stop.distanceMeters} metres away.${services ? ` Services ${services}.` : ""}`;
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
    alignSelf: "center",
    maxWidth: 720,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
    paddingBottom: 170,
    gap: 20,
    width: "100%",
  },
  appScroll: {
    flex: 1,
  },
  mapWorkspaceScroll: {
    overflow: "hidden",
  },
  mapWorkspaceContainer: {
    flexGrow: 1,
    gap: 0,
    minHeight: "100%",
    padding: 0,
    paddingBottom: 0,
  },
  compactContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 132,
    gap: 16,
  },
  journeyEntryContainer: {
    paddingBottom: bottomNavigationHeight + spacing.lg,
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
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  compactBrandHeader: {
    gap: 8,
  },
  brandLogoImage: {
    height: 68,
    width: 68,
  },
  compactBrandLogoImage: {
    height: 52,
    width: 52,
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
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 36,
  },
  compactBrandTitle: {
    fontSize: 24,
    lineHeight: 29,
  },
  brandSubtitle: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 22,
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
    gap: 16,
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
  profileBottomSpacer: {
    height: spacing.xl,
  },
  profileHeaderWithAppearance: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  stackedProfileHeaderAppearance: {
    flexDirection: "column",
  },
  profileHeaderTitle: {
    flex: 1,
    minWidth: 156,
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
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase",
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
    borderColor: colors.primary,
    borderRadius: 12,
    borderWidth: 2,
    flexDirection: "row",
    gap: 8,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  compactDefaultsIconBadge: {
    borderRadius: 12,
    height: 50,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 8,
    paddingVertical: 8,
    width: 50,
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
  appearanceTogglePanel: {
    alignItems: "center",
    alignSelf: "flex-end",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end",
    maxWidth: "100%",
  },
  appearanceCompactLabel: {
    color: colors.metadata,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  appearanceIconToggle: {
    alignItems: "center",
    backgroundColor: colors.primaryDark,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 2,
    justifyContent: "center",
    minHeight: 52,
    padding: 2,
  },
  appearanceIconButton: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: 8,
    borderWidth: 1,
    height: touchTarget.min,
    justifyContent: "center",
    minHeight: touchTarget.min,
    minWidth: touchTarget.min,
    width: touchTarget.min,
  },
  selectedAppearanceIconButton: {
    backgroundColor: colors.primary,
    borderColor: colors.textOnPrimary,
    borderWidth: 3,
  },
  highContrastSelectedText: {
    color: "#000000",
  },
  appearanceIconContainer: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  tabBar: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderTopWidth: 1,
    bottom: 0,
    borderRadius: 0,
    borderWidth: 0,
    flexDirection: "row",
    gap: 8,
    left: 0,
    minHeight: 82,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    position: "absolute",
    right: 0,
    zIndex: mapLayerZ.navigation,
  },
  highContrastTabBar: {
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRadius: 0,
    borderRightWidth: 0,
    borderTopWidth: 2,
  },
  compactTabBar: {
    gap: 4,
    padding: 4,
  },
  largerTabBar: {
    minHeight: 82,
    paddingTop: 7,
  },
  tabButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 16,
    flex: 1,
    gap: 2,
    justifyContent: "center",
    minHeight: 64,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  compactTabButton: {
    gap: 2,
    minHeight: 56,
    paddingHorizontal: 3,
    paddingVertical: 6,
  },
  largerTabButton: {
    minHeight: 68,
    paddingVertical: 7,
  },
  selectedTabButton: {
    backgroundColor: "rgba(134, 197, 218, 0.10)",
  },
  disabledTabButton: {
    backgroundColor: "transparent",
  },
  tabButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  compactTabButtonText: {
    fontSize: 14,
    lineHeight: 18,
  },
  largeTabButtonText: {
    fontSize: 16,
    lineHeight: 20,
  },
  tabIconBadge: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 12,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 44,
  },
  compactTabIconBadge: {
    height: 36,
    width: 40,
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
    borderWidth: 2,
    height: 44,
    width: 52,
  },
  tabSelectionIndicator: {
    borderRadius: radius.pill,
    height: 4,
    marginTop: 1,
    width: 30,
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
    borderLeftColor: colors.primary,
    borderLeftWidth: 4,
    gap: 4,
    paddingLeft: spacing.md,
  },
  journeyIntroPanel: {
    alignItems: "center",
    backgroundColor: "#102C2E",
    borderColor: "#31545B",
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.lg,
    justifyContent: "space-between",
    minHeight: 148,
    overflow: "hidden",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  stackedJourneyIntroPanel: {
    alignItems: "center",
    flexDirection: "column",
    gap: spacing.md,
    justifyContent: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  journeyIntroTextGroup: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  stackedJourneyIntroTextGroup: {
    alignSelf: "stretch",
    flexBasis: "auto",
    flexGrow: 0,
    flexShrink: 0,
    width: "100%",
  },
  journeyIntroCopy: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 28,
  },
  largeJourneyIntroCopy: {
    fontSize: 20,
    lineHeight: 30,
    maxWidth: "100%",
  },
  journeyIntroArtwork: {
    alignItems: "center",
    flexBasis: "36%",
    flexGrow: 0,
    flexShrink: 0,
    justifyContent: "center",
    minWidth: 120,
  },
  stackedJourneyIntroArtwork: {
    flexBasis: "auto",
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    width: "100%",
  },
  journeyLocationLoadingPanel: {
    alignSelf: "stretch",
    borderRadius: 24,
    gap: spacing.lg,
    minHeight: 292,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  journeyLocationLoadingStatus: {
    alignItems: "center",
    gap: spacing.md,
  },
  journeyLocationLoadingTitle: {
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 29,
    textAlign: "center",
  },
  journeyLocationLoadingSupport: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 23,
    textAlign: "center",
  },
  journeyLocationLongWaitActions: {
    gap: spacing.sm,
  },
  journeyFindBusActions: {
    alignSelf: "stretch",
    gap: spacing.md,
  },
  locationLoadingProgress: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 14,
  },
  locationLoadingProgressDot: {
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  locationLoadingProgressLine: {
    height: 2,
    width: 28,
  },
  generatedFeatureArtwork: {
    alignSelf: "center",
    aspectRatio: 1.5,
    borderRadius: 18,
    maxWidth: 440,
    overflow: "hidden",
    width: "100%",
  },
  generatedFeatureArtworkCompact: {
    maxWidth: 360,
  },
  eyebrow: {
    color: colors.primarySoft,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
    textTransform: "uppercase",
  },
  heading: {
    color: colors.text,
    fontSize: typography.sectionTitle,
    fontWeight: "800",
    lineHeight: 36,
  },
  toggleRow: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: borders.default,
    gap: spacing.sm,
    minHeight: 64,
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
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  stackedToggleHeaderRow: {
    alignItems: "flex-start",
    flexDirection: "column",
  },
  toggleIllustrationSlot: {
    alignItems: "center",
    flexShrink: 1,
    justifyContent: "center",
    minHeight: 72,
    minWidth: 84,
  },
  stackedToggleIllustrationSlot: {
    alignSelf: "center",
    minWidth: 0,
    width: "100%",
  },
  featureConceptVisual: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    height: 72,
    justifyContent: "center",
    width: 112,
  },
  smallAaText: {
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 24,
  },
  largeAaText: {
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 40,
  },
  contrastConceptVisual: {
    borderRadius: 8,
    borderWidth: 2,
    gap: 0,
    overflow: "hidden",
  },
  contrastHalf: {
    alignItems: "center",
    flex: 1,
    height: "100%",
    justifyContent: "center",
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
    height: 40,
    justifyContent: "center",
    width: 40,
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
    gap: spacing.xs,
    minWidth: 0,
  },
  toggleTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    minWidth: 0,
  },
  toggleText: {
    color: colors.text,
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 23,
    minWidth: 0,
  },
  textPreviewPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: borders.default,
    gap: spacing.xs,
    padding: spacing.md,
  },
  preferenceOverview: {
    gap: spacing.md,
  },
  preferenceBulkActions: {
    borderRadius: radius.md,
    borderWidth: borders.default,
    gap: spacing.md,
    padding: spacing.md,
  },
  preferenceBulkActionsHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  accessibilityPreviewCard: {
    borderRadius: radius.md,
    borderWidth: borders.default,
    gap: spacing.md,
    minHeight: 254,
    padding: spacing.md,
  },
  accessibilityPreviewHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  accessibilityPreviewAlert: {
    alignItems: "center",
    borderRadius: radius.sm,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 78,
    padding: spacing.md,
  },
  accessibilityPreviewEyebrow: {
    color: colors.metadata,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.35,
    lineHeight: 17,
    textTransform: "uppercase",
  },
  accessibilityPreviewMessage: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 23,
  },
  accessibilityPreviewChannels: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  accessibilityPreviewChannel: {
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 34,
    paddingHorizontal: spacing.sm,
  },
  accessibilityPreviewChannelText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  accessibilityPreviewButton: {
    alignItems: "center",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  accessibilityPreviewButtonText: {
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 21,
  },
  accessibilityPreviewStatus: {
    color: colors.metadata,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center",
  },
  nextActionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: 22,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  simplifiedNextActionCard: {
    borderColor: colors.highlight,
    borderWidth: 3,
    paddingVertical: spacing.xl,
  },
  nextActionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  nextActionStepBadge: {
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  nextActionStepBadgeText: {
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 21,
  },
  nextActionEyebrow: {
    color: colors.primarySoft,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
    textTransform: "uppercase",
  },
  nextActionTitle: {
    color: colors.text,
    fontSize: 23,
    fontWeight: "900",
    lineHeight: 30,
  },
  simplifiedNextActionTitle: {
    fontSize: 28,
    lineHeight: 36,
  },
  nextActionDetail: {
    color: colors.muted,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 25,
  },
  nextActionTextStatus: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21,
    marginTop: spacing.xs,
  },
  preferenceSummaryCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 84,
    overflow: "hidden",
    padding: spacing.lg,
  },
  stackedPreferenceSummaryCard: {
    alignItems: "stretch",
    flexDirection: "column",
  },
  preferenceSummaryEdit: {
    alignItems: "center",
    borderColor: colors.primary,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    flexShrink: 0,
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  preferenceSummaryEditText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 21,
  },
  preferenceSummaryLead: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    flexShrink: 1,
    gap: spacing.md,
    minWidth: 0,
  },
  preferenceSummaryIcon: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    flexShrink: 0,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  preferenceSummaryLabel: {
    fontSize: 13,
    letterSpacing: 0.4,
    lineHeight: 18,
    textTransform: "uppercase",
  },
  preferenceSummaryValue: {
    flexShrink: 1,
    fontSize: 17,
    lineHeight: 24,
    minWidth: 0,
  },
  preferenceCategoryCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  preferencePresetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  featureGlyph: {
    alignItems: "center",
    borderRadius: 14,
    flexShrink: 0,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  smallFeatureGlyph: {
    borderRadius: 12,
    height: 40,
    width: 40,
  },
  largeFeatureGlyph: {
    borderRadius: 16,
    height: 56,
    width: 56,
  },
  selectedFeatureGlyph: {
    borderWidth: 2,
  },
  preferencePresetButton: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: radius.md,
    borderWidth: borders.default,
    flexBasis: "47%",
    flexGrow: 1,
    gap: spacing.sm,
    minHeight: 136,
    minWidth: 200,
    padding: spacing.md,
  },
  stackedPreferencePresetButton: {
    flexBasis: "auto",
    width: "100%",
  },
  preferencePresetMain: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  preferencePresetCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  preferencePresetText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
  },
  preferencePresetDescription: {
    color: colors.metadata,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  preferencePresetAction: {
    alignItems: "center",
    alignSelf: "flex-end",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 34,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  preferencePresetActionText: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.25,
    lineHeight: 16,
    textTransform: "uppercase",
  },
  preferenceCustomizeHeader: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  preferenceSearchField: {
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: borders.default,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 58,
    paddingHorizontal: spacing.md,
  },
  largePreferenceSearchField: {
    minHeight: 68,
  },
  extraLargePreferenceSearchField: {
    minHeight: 76,
  },
  preferenceSearchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
    minHeight: 48,
    minWidth: 0,
    paddingVertical: 0,
    textAlignVertical: "center",
  },
  preferenceSearchClear: {
    alignItems: "center",
    borderRadius: radius.pill,
    flexShrink: 0,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  preferenceSearchResults: {
    borderRadius: radius.md,
    borderWidth: borders.default,
    overflow: "hidden",
  },
  preferenceSearchResultsHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  preferenceSearchResultsTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 21,
  },
  preferenceSearchResult: {
    alignItems: "center",
    borderBottomWidth: borders.default,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 62,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  preferenceSearchResultCopy: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  preferenceSearchResultLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
  },
  preferenceSearchResultCategory: {
    color: colors.metadata,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  preferenceSearchEmptyText: {
    color: colors.metadata,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    padding: spacing.md,
  },
  preferenceBrowseLabel: {
    color: colors.metadata,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.3,
    lineHeight: 18,
    textTransform: "uppercase",
  },
  preferenceCategoryDropdown: {
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: borders.default,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 82,
    padding: spacing.md,
  },
  preferenceCategoryDropdownLabel: {
    color: colors.metadata,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.35,
    lineHeight: 17,
    textTransform: "uppercase",
  },
  preferenceCategoryTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 23,
  },
  preferenceCategoryCount: {
    color: colors.metadata,
    flexShrink: 0,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  expandedPreferenceCategoryChevron: {
    transform: [{ rotate: "180deg" }],
  },
  preferenceCategoryMenuOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(15, 32, 36, 0.58)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  preferenceCategoryMenuBackdrop: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  preferenceCategoryMenu: {
    borderRadius: 22,
    borderWidth: borders.default,
    gap: spacing.md,
    maxWidth: 520,
    padding: spacing.md,
    width: "100%",
    zIndex: 1,
  },
  preferenceCategoryMenuHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  preferenceCategoryMenuTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 26,
  },
  preferenceCategoryMenuClose: {
    alignItems: "center",
    borderRadius: radius.pill,
    flexShrink: 0,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  preferenceCategoryMenuList: {
    gap: spacing.sm,
  },
  preferenceCategoryMenuItem: {
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: borders.default,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 72,
    padding: spacing.sm,
  },
  preferenceSelectedCategory: {
    borderRadius: radius.md,
    borderWidth: borders.default,
    overflow: "hidden",
  },
  preferenceSelectedCategoryHeader: {
    alignItems: "center",
    borderBottomWidth: borders.default,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 88,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  preferenceSelectedCategoryTitleBlock: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  preferenceSelectedCategoryEyebrow: {
    color: colors.metadata,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.7,
    lineHeight: 15,
    textTransform: "uppercase",
  },
  preferenceSelectedCategoryTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 26,
  },
  preferenceCategoryEmptyText: {
    color: colors.metadata,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    paddingHorizontal: spacing.sm,
  },
  preferenceCategorySettings: {
    gap: 0,
  },
  preferenceGroupCount: {
    color: colors.metadata,
    flexShrink: 0,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.25,
    lineHeight: 17,
    textTransform: "uppercase",
  },
  preferenceGroupCountPill: {
    alignItems: "center",
    borderRadius: radius.pill,
    flexShrink: 0,
    minHeight: 30,
    paddingHorizontal: spacing.sm,
  },
  preferenceChecklistItem: {
    borderBottomWidth: borders.default,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  preferenceChecklistMain: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  preferenceChecklistToggle: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 56,
    minWidth: 0,
  },
  preferenceChecklistLabel: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 24,
    minWidth: 0,
  },
  preferenceDetailsButton: {
    alignItems: "center",
    borderRadius: radius.pill,
    flexShrink: 0,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  preferenceChecklistDescription: {
    color: colors.metadata,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginBottom: spacing.xs,
    marginLeft: 56,
    marginRight: 52,
  },
  disabledPreferenceControl: {
    opacity: 0.46,
  },
  largerChecklistControl: {
    minHeight: 52,
  },
  nestedPreferenceChecklistItem: {
    paddingLeft: spacing.xl,
  },
  preferenceChoiceChecklistItem: {
    borderBottomWidth: borders.default,
    gap: spacing.sm,
    padding: spacing.md,
  },
  preferenceChoiceChecklistHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  preferenceChoiceLabelBlock: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  preferenceChoiceType: {
    color: colors.metadata,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
    lineHeight: 15,
    textTransform: "uppercase",
  },
  textSizePreview: {
    borderBottomWidth: borders.default,
    gap: spacing.xs,
    height: 116,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  textSizePreviewEyebrow: {
    color: colors.metadata,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    lineHeight: 15,
    textTransform: "uppercase",
  },
  textSizePreviewText: {
    color: colors.text,
    fontWeight: "900",
  },
  textSizePreviewNote: {
    color: colors.metadata,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  preferenceSectionHeadingContainer: {
    alignItems: "center",
    borderBottomWidth: borders.default,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 68,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  preferenceSectionHeadingCopy: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  preferenceSectionHeadingEyebrow: {
    color: colors.metadata,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.65,
    lineHeight: 15,
    textTransform: "uppercase",
  },
  preferenceSectionHeading: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 23,
  },
  preferenceChoiceSection: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: borders.default,
    gap: spacing.md,
    padding: spacing.md,
  },
  preferenceChoiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  stackedPreferenceChoiceRow: {
    flexDirection: "column",
  },
  preferenceChoiceButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: borders.default,
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 92,
    paddingHorizontal: spacing.sm,
  },
  preferenceChoiceText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
    textAlign: "center",
  },
  selectedPreferenceChoice: {
    backgroundColor: colors.primary,
    borderColor: colors.highlight,
    borderWidth: 3,
  },
  selectedPreferenceChoiceText: {
    color: colors.textOnPrimary,
  },
  largerControl: {
    minHeight: 68,
    paddingVertical: spacing.lg,
  },
  largerTertiaryControl: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  largeButtonText: {
    fontSize: 20,
    lineHeight: 26,
  },
  extraLargeButtonText: {
    fontSize: 23,
    lineHeight: 30,
  },
  compactSelectionIndicator: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
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
    borderRadius: 18,
    flexDirection: "row",
    gap: 10,
    minHeight: 62,
    justifyContent: "center",
    padding: spacing.lg,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: 18,
    borderWidth: borders.default,
    flexDirection: "row",
    gap: 10,
    minHeight: 62,
    justifyContent: "center",
    padding: spacing.lg,
  },
  destructiveSecondaryButton: {
    borderColor: colors.danger,
    borderWidth: 2,
  },
  tertiaryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "transparent",
    borderRadius: radius.sm,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
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
  disabledTextAction: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: colors.textOnPrimary,
    flexShrink: 1,
    fontSize: 19,
    fontWeight: "800",
    textAlign: "center",
  },
  secondaryButtonText: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 19,
    fontWeight: "800",
    textAlign: "center",
  },
  destructiveSecondaryButtonText: {
    color: colors.danger,
  },
  tertiaryButtonText: {
    color: colors.primarySoft,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 22,
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
  compactBoardingCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: borders.default,
    gap: spacing.xs,
    padding: spacing.md,
  },
  inlineSecondaryAction: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
    paddingRight: spacing.md,
    paddingVertical: spacing.xs,
  },
  inlineSecondaryActionText: {
    color: colors.primary,
    fontSize: 17,
    fontWeight: "900",
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
  busStopSearchOverlay: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    bottom: bottomNavigationHeight,
    gap: spacing.sm,
    left: mapOverlayMargin,
    maxHeight: "72%",
    padding: spacing.md,
    position: "absolute",
    right: mapOverlayMargin,
    top: mapTopOverlayMargin,
    zIndex: mapLayerZ.search,
  },
  busStopSearchHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  busStopSearchIconButton: {
    alignItems: "center",
    borderRadius: radius.md,
    justifyContent: "center",
    minHeight: touchTarget.min,
    minWidth: touchTarget.min,
  },
  busStopSearchInputWrap: {
    flex: 1,
    minWidth: 0,
  },
  busStopSearchResultsScroll: {
    flexShrink: 1,
  },
  busStopSearchResultsContent: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  searchSection: {
    gap: spacing.sm,
  },
  searchStateBlock: {
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.sm,
  },
  transportSearchResult: {
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
  transportSearchIcon: {
    fontSize: 15,
    fontWeight: "900",
    minWidth: 34,
    textAlign: "center",
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
    top: mapTopOverlayMargin,
    zIndex: mapLayerZ.overlays,
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
  regionalStopsStatus: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  regionalStopsStatusText: {
    flexShrink: 1,
  },
  regionalStopsRetry: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    minHeight: 44,
    paddingHorizontal: 4,
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
  journeyPlannerCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    maxWidth: 520,
    padding: 12,
    width: "100%",
  },
  journeyPlannerSheetPanel: {
    gap: 10,
    width: "100%",
  },
  journeyFields: {
    gap: 8,
  },
  journeyFieldRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  swapJourneyButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: touchTarget.min,
    paddingHorizontal: 10,
  },
  quickDestinationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  quickDestinationChip: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: touchTarget.min,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  quickDestinationText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17,
  },
  fixedDestinationPin: {
    alignItems: "center",
    backgroundColor: colors.destination,
    borderColor: colors.textOnDestination,
    borderRadius: 24,
    borderWidth: 2,
    height: 48,
    justifyContent: "center",
    left: "50%",
    marginLeft: -24,
    marginTop: -48,
    position: "absolute",
    top: "50%",
    width: 48,
    zIndex: mapLayerZ.overlays + 1,
  },
  mapDestinationPickerCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    bottom: bottomNavigationHeight + mapBottomSheetHeights.HIDDEN_PEEK + 10,
    gap: 8,
    left: mapOverlayMargin,
    padding: 12,
    position: "absolute",
    right: mapOverlayMargin,
    zIndex: mapLayerZ.overlays + 1,
  },
  journeyOptionCard: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.primary,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  journeyOptionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  routeAlternativeRow: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    minHeight: 62,
    padding: 10,
  },
  selectedRouteAlternativeRow: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.primary,
    borderWidth: 2,
  },
  journeyStepList: {
    gap: 8,
  },
  journeyStepRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    minHeight: 34,
  },
  mapSideControls: {
    gap: 8,
    position: "absolute",
    right: mapOverlayMargin,
    top: mapSideControlTopOffset,
    width: rightToolbarWidth,
    zIndex: mapLayerZ.sideControls,
  },
  mapOptionsScrim: {
    bottom: bottomNavigationHeight,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: mapLayerZ.scrim,
  },
  highContrastMapOptionsScrim: {
    backgroundColor: "rgba(0, 0, 0, 0.42)",
  },
  mapCompassControl: {
    alignItems: "center",
    borderColor: colors.highlight,
    borderRadius: 999,
    borderWidth: 1.5,
    height: 56,
    justifyContent: "center",
    minHeight: 56,
    paddingBottom: 5,
    paddingTop: 4,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 5,
    width: 56,
  },
  subtleMapCompassControl: {
    opacity: 0.82,
  },
  mapCompassText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 15,
    textAlign: "center",
  },
  mapCompassDial: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1.5,
    height: 32,
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    width: 32,
  },
  highContrastCompassDial: {
    borderWidth: 2.5,
  },
  compassNeedleAssembly: {
    alignItems: "center",
    height: 28,
    justifyContent: "center",
    position: "absolute",
    width: 16,
  },
  compassNeedleNorth: {
    borderBottomWidth: 15,
    borderLeftColor: "transparent",
    borderLeftWidth: 5,
    borderRightColor: "transparent",
    borderRightWidth: 5,
    height: 0,
    marginBottom: 1,
    width: 0,
  },
  compassNeedleSouth: {
    borderLeftColor: "transparent",
    borderLeftWidth: 4,
    borderRightColor: "transparent",
    borderRightWidth: 4,
    borderTopWidth: 11,
    height: 0,
    opacity: 0.58,
    width: 0,
  },
  compassPivot: {
    borderRadius: 999,
    height: 5,
    position: "absolute",
    width: 5,
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
  largerMapControl: {
    height: 68,
    minHeight: 68,
    paddingVertical: 8,
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
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
    textAlign: "center",
  },
  mapMorePanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    bottom: bottomNavigationHeight + mapOverlayMargin,
    left: 14,
    maxHeight: "70%",
    padding: 8,
    position: "absolute",
    right: rightToolbarWidth + mapOverlayMargin + 8,
    zIndex: mapLayerZ.morePanel,
  },
  mapMoreScroll: {
    flexGrow: 0,
  },
  mapMoreContent: {
    gap: 3,
    paddingBottom: 20,
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
    marginVertical: 7,
    opacity: 0.7,
  },
  mapMoreRow: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  activeMapMoreRow: {
    backgroundColor: "#0F4E5A",
  },
  disabledMapMoreControl: {
    backgroundColor: "rgba(127, 140, 145, 0.12)",
  },
  mapMoreLabelGroup: {
    flex: 1,
    gap: 1,
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
    flexDirection: "row",
    gap: 5,
    justifyContent: "space-between",
    minHeight: 24,
    minWidth: 56,
    paddingHorizontal: 6,
    paddingVertical: 3,
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
  mapMoreSwitchKnob: {
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  mapMoreSwitchKnobOn: {
    height: 13,
    width: 13,
  },
  mapBottomSheet: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    bottom: bottomNavigationHeight,
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    zIndex: mapLayerZ.sheet,
  },
  mapBottomSheetCollapsed: {
    maxHeight: mapBottomSheetHeights.COLLAPSED,
    minHeight: 92,
  },
  mapBottomSheetGuidance: {
    maxHeight: 300,
    minHeight: 190,
  },
  mapBottomSheetHiddenPeek: {
    maxHeight: mapBottomSheetHeights.HIDDEN_PEEK,
    minHeight: mapBottomSheetHeights.HIDDEN_PEEK,
  },
  mapBottomSheetContentFit: {
    maxHeight: 360,
    minHeight: 0,
  },
  mapBottomSheetMedium: {
    maxHeight: mapBottomSheetHeights.MEDIUM,
    minHeight: 250,
  },
  mapBottomSheetSelectedStop: {
    maxHeight: 430,
    minHeight: 430,
  },
  mapBottomSheetExpanded: {
    maxHeight: mapBottomSheetHeights.EXPANDED,
    minHeight: 430,
  },
  mapBottomSheetHeader: {
    alignItems: "center",
    gap: 5,
    justifyContent: "center",
    minHeight: 50,
    paddingBottom: 7,
    paddingHorizontal: 18,
    paddingTop: 7,
  },
  mapBottomSheetGrabber: {
    borderRadius: 999,
    height: 4,
    opacity: 0.78,
    width: 42,
  },
  sheetHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    minHeight: 24,
    width: "100%",
  },
  sheetPeekLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18,
  },
  mapBottomSheetScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  mapBottomSheetContent: {
    gap: 10,
    paddingBottom: 24,
    paddingHorizontal: 16,
  },
  guidanceSheetContent: {
    paddingBottom: 14,
  },
  directionsTitleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  directionsLoadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 58,
  },
  directionsStatePanel: {
    gap: 10,
  },
  walkingRouteSummary: {
    alignItems: "baseline",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  directionsSummaryMetric: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 30,
  },
  routeEndpointRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 28,
  },
  routeEndpointMarker: {
    backgroundColor: colors.location,
    borderColor: "#FFFFFF",
    borderRadius: 999,
    borderWidth: 3,
    height: 18,
    marginHorizontal: 1,
    width: 18,
  },
  routeEndpointLine: {
    backgroundColor: colors.primary,
    height: 20,
    marginLeft: 9,
    width: 3,
  },
  walkingStepList: {
    gap: 10,
  },
  walkingStepRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    minHeight: 40,
  },
  currentInstructionCard: {
    alignItems: "flex-start",
    borderRadius: 12,
    borderWidth: 2,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  walkingInstructionText: {
    color: colors.text,
    fontSize: 25,
    fontWeight: "900",
    lineHeight: 31,
  },
  walkingInstructionTextLarge: {
    fontSize: 32,
    lineHeight: 40,
  },
  walkingInstructionDistance: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 34,
  },
  walkingInstructionDistanceLarge: {
    fontSize: 34,
    lineHeight: 42,
  },
  offRoutePanel: {
    backgroundColor: "rgba(245, 198, 90, 0.16)",
    borderColor: colors.warning,
    borderRadius: 8,
    borderWidth: 2,
    gap: 8,
    padding: 10,
  },
  arrivalPanel: {
    alignItems: "flex-start",
    gap: 10,
  },
  routingAttribution: {
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 16,
    minHeight: 24,
    textDecorationLine: "underline",
  },
  selectedStopSheetBody: {
    flex: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  selectedStopActions: {
    borderTopWidth: 1,
    gap: 8,
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  mapBottomSheetCompactContent: {
    paddingBottom: 24,
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
  journeyDiscoveryStatus: {
    backgroundColor: "rgba(81, 207, 232, 0.12)",
    borderColor: colors.focusIndicator,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  journeyDiscoveryStatusError: {
    backgroundColor: "rgba(239, 133, 133, 0.12)",
    borderColor: colors.error,
  },
  journeyDiscoveryStatusTitleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
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
    flex: 1,
    height: "100%",
    minHeight: 0,
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
  providerMapUnavailable: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 2,
    gap: 8,
    left: 20,
    maxWidth: 360,
    padding: 16,
    position: "absolute",
    right: 20,
    top: 136,
    zIndex: 3,
  },
  providerMapUnavailableTitle: {
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
  },
  providerMapUnavailableText: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19,
    textAlign: "center",
  },
  providerMapUnavailableActions: {
    alignSelf: "stretch",
    gap: 8,
    marginTop: 6,
  },
  mapCameraDebugLayer: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 20,
  },
  mapCameraDebugUsableRect: {
    backgroundColor: "rgba(81, 207, 232, 0.12)",
    borderColor: "#51CFE8",
    borderWidth: 2,
    position: "absolute",
  },
  mapCameraDebugSafeZone: {
    backgroundColor: "rgba(245, 198, 90, 0.16)",
    borderColor: "#F5C65A",
    borderWidth: 2,
    position: "absolute",
  },
  mapCameraDebugText: {
    backgroundColor: "rgba(0, 0, 0, 0.74)",
    borderRadius: 6,
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    left: 12,
    lineHeight: 15,
    paddingHorizontal: 8,
    paddingVertical: 6,
    position: "absolute",
    top: 112,
  },
  mapCameraDebugTextLight: {
    backgroundColor: "rgba(255, 255, 255, 0.86)",
    color: "#000000",
  },
  busStopGlyph: {
    alignItems: "center",
    justifyContent: "center",
  },
  busStopGlyphBody: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: 9,
    borderWidth: 1.2,
    height: 18,
    justifyContent: "center",
    width: 18,
  },
  nearestBusStopGlyphBody: {
    borderColor: colors.location,
    borderRadius: 11,
    height: 22,
    width: 22,
  },
  selectedBusStopGlyphBody: {
    backgroundColor: colors.primary,
    borderColor: colors.textOnPrimary,
    borderRadius: 15,
    borderWidth: 2,
    height: 30,
    width: 30,
  },
  busStopGlyphPointer: {
    borderLeftColor: "transparent",
    borderLeftWidth: 3,
    borderRightColor: "transparent",
    borderRightWidth: 3,
    borderTopColor: colors.primary,
    borderTopWidth: 5,
    height: 0,
    marginTop: -2,
    width: 0,
  },
  selectedBusStopGlyphPointer: {
    borderTopColor: colors.textOnPrimary,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
  },
  nearestBusStopGlyphPointer: {
    borderTopColor: colors.location,
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
    gap: 12,
    padding: spacing.lg,
  },
  selectedStopMetadata: {
    color: colors.metadata,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
  selectedStopSection: {
    gap: 8,
  },
  selectedStopServicesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  selectedStopServicePill: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.primary,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 28,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  selectedStopServicePillText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17,
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
  largerServiceCard: {
    minHeight: 116,
    paddingVertical: spacing.xl,
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
  serviceAccessibilityRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  serviceAccessibilitySymbol: {
    backgroundColor: colors.accessible,
    borderColor: colors.textOnAccessible,
    borderRadius: 15,
    borderWidth: 2,
    color: colors.textOnAccessible,
    fontSize: 18,
    fontWeight: "900",
    height: 30,
    lineHeight: 26,
    overflow: "hidden",
    textAlign: "center",
    width: 30,
  },
  smallServiceAccessibilitySymbol: {
    borderRadius: 12,
    fontSize: 14,
    height: 24,
    lineHeight: 20,
    width: 24,
  },
  largeServiceAccessibilitySymbol: {
    borderRadius: 20,
    fontSize: 24,
    height: 40,
    lineHeight: 36,
    width: 40,
  },
  serviceAccessibilitySymbolOnDark: {
    borderColor: "#FFFFFF",
  },
  highContrastServiceAccessibilitySymbol: {
    backgroundColor: "#000000",
    borderColor: "#FFFFFF",
    color: "#FFFFFF",
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
  selectedServiceBadge: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderColor: colors.textOnPrimary,
    borderRadius: radius.md,
    borderWidth: 2,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 38,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  selectedServiceBadgeText: {
    color: colors.textOnPrimary,
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
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
  arrivalMetadata: {
    gap: spacing.xs,
  },
  arrivalInfoRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  arrivalInfoValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
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
  stopServiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  stopServiceChip: {
    alignItems: "center",
    borderRadius: radius.sm,
    borderWidth: 2,
    flexDirection: "row",
    gap: 7,
    minHeight: touchTarget.min,
    paddingHorizontal: 14,
  },
  compactStopServiceChip: {
    gap: 4,
    paddingHorizontal: 8,
  },
  selectedStopServiceChip: {
    borderWidth: 3,
  },
  highContrastServiceChip: {
    borderWidth: 3,
  },
  stopServiceChipText: {
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22,
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
  buttonPressed: {
    opacity: 0.82,
  },
  focusedAssistPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 2,
    gap: spacing.md,
    padding: spacing.lg,
  },
  focusedAssistEyebrow: {
    color: colors.highlight,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 1.4,
    lineHeight: 25,
    textAlign: "center",
  },
  focusedAssistServicePrefix: {
    color: colors.metadata,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1.2,
    lineHeight: 22,
    textAlign: "center",
  },
  focusedAssistServiceNumber: {
    color: colors.text,
    fontSize: 72,
    fontWeight: "900",
    lineHeight: 82,
    textAlign: "center",
  },
  focusedAssistServiceNumberExtraLarge: {
    fontSize: 86,
    lineHeight: 98,
  },
  focusedAssistAccessibleRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "center",
  },
  focusedAssistRampAction: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "#0B6670",
    borderColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 2,
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 168,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  focusedAssistRampActionLarge: {
    minHeight: 196,
  },
  focusedAssistAlightingAction: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "#0B6670",
    borderColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 2,
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 112,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  focusedAssistHighContrastAction: {
    backgroundColor: "#000000",
    borderColor: "#FFFF00",
    borderWidth: 4,
  },
  focusedAssistActionLabel: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 32,
    textAlign: "center",
  },
  focusedAssistActionService: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "800",
    lineHeight: 26,
    textAlign: "center",
  },
  focusedAssistStopSummary: {
    alignItems: "center",
    gap: spacing.xs,
  },
  focusedAssistDiagnostic: {
    color: colors.metadata,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },
  focusedAssistBusChoice: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 2,
    gap: spacing.xs,
    minHeight: 88,
    padding: spacing.md,
  },
  focusedAssistHighContrastChoice: {
    borderColor: "#FFFFFF",
    borderWidth: 3,
  },
  focusedAssistBusChoiceService: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 36,
  },
  focusedAssistStatus: {
    alignItems: "center",
    borderColor: "#986B16",
    borderRadius: 16,
    borderWidth: 3,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  focusedAssistStatusPending: {
    backgroundColor: "#FFF1CC",
    borderColor: "#A96C00",
  },
  focusedAssistStatusSuccess: {
    backgroundColor: "#DDF6E7",
    borderColor: "#08783F",
  },
  focusedAssistStatusError: {
    backgroundColor: "#FDE3E0",
    borderColor: "#B42318",
  },
  focusedAssistStatusLight: {
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  focusedAssistStatusHighContrast: {
    borderColor: "#000000",
    borderWidth: 4,
  },
  focusedAssistStatusTitle: {
    color: "#102A30",
    fontSize: 23,
    fontWeight: "900",
    lineHeight: 31,
    textAlign: "center",
  },
  focusedAssistStatusMessage: {
    color: "#203438",
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 26,
    textAlign: "center",
  },
  focusedAssistOnboardService: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 43,
    textAlign: "center",
  },
  focusedAssistHelpLabel: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  summaryRow: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  generatedPhysicalHelpVisual: {
    alignSelf: "stretch",
    aspectRatio: 1.5,
    borderRadius: 14,
    marginBottom: 8,
    overflow: "hidden",
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
  waitingScreen: {
    gap: spacing.lg,
  },
  waitingJourneyCard: {
    borderRadius: radius.md,
    borderWidth: 2,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  waitingServiceRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  waitingServiceNumber: {
    flexShrink: 1,
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 37,
  },
  waitingArrivalText: {
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 24,
    marginTop: spacing.xs,
  },
  waitingDetailGroup: {
    gap: 3,
  },
  waitingDetailLabel: {
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 21,
  },
  waitingDetailValue: {
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 27,
  },
  waitingStopCount: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 23,
  },
  waitingDivider: {
    height: 1,
    width: "100%",
  },
  waitingSection: {
    gap: spacing.md,
  },
  waitingSectionTitle: {
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 1.1,
    lineHeight: 23,
    textTransform: "uppercase",
  },
  waitingAssistancePanel: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  waitingAssistanceRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between",
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  waitingAssistanceRowBorder: {
    borderTopWidth: 1,
  },
  waitingAssistanceCopy: {
    flex: 1,
    flexBasis: 142,
    minWidth: 0,
  },
  waitingAssistanceLabel: {
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 25,
  },
  waitingStatusBadge: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 2,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  waitingStatusText: {
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
  },
  waitingAssistanceNote: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21,
  },
  waitingInstructionList: {
    gap: spacing.md,
  },
  waitingInstructionRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
  },
  waitingInstructionNumber: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  waitingInstructionNumberText: {
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 21,
  },
  waitingInstructionText: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 26,
    paddingTop: 3,
  },
  waitingActions: {
    gap: spacing.sm,
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
  boardingConfirmationGroup: {
    gap: spacing.sm,
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
  statusConceptVisual: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    height: 112,
    justifyContent: "center",
    minWidth: 150,
    position: "relative",
    width: 178,
  },
  compactStatusConceptVisual: {
    alignSelf: "flex-start",
    height: 72,
    minWidth: 118,
    width: 132,
  },
  locationPulseRing: {
    borderRadius: 44,
    borderWidth: 3,
    height: 88,
    position: "absolute",
    width: 88,
  },
  statusGroundRow: {
    alignItems: "center",
    bottom: 6,
    flexDirection: "row",
    gap: 18,
    position: "absolute",
  },
  statusBusStopSign: {
    borderRadius: 6,
    borderWidth: 2,
    height: 28,
    width: 22,
  },
  audioWaveGroup: {
    flexDirection: "row",
    gap: 5,
    marginHorizontal: 6,
  },
  audioWave: {
    borderRadius: 12,
    borderRightWidth: 3,
    height: 30,
    width: 10,
  },
  audioWaveWide: {
    borderRadius: 16,
    borderRightWidth: 3,
    height: 42,
    width: 14,
  },
  journeyProgressVisual: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
  journeyProgressDot: {
    borderRadius: 8,
    height: 16,
    width: 16,
  },
  journeyProgressDotOpen: {
    borderRadius: 8,
    borderWidth: 3,
    height: 16,
    width: 16,
  },
  journeyProgressLine: {
    borderRadius: 3,
    height: 6,
    width: 24,
  },
  requestSignalDisc: {
    alignItems: "center",
    borderRadius: 26,
    borderWidth: 2,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  statusSignalMarks: {
    gap: 6,
    marginHorizontal: 8,
  },
  statusSignalMark: {
    borderRadius: 4,
    height: 6,
    width: 18,
  },
  statusSignalMarkWide: {
    width: 28,
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
  extraLargeBody: {
    fontSize: 24,
    lineHeight: 33,
  },
  largeHeading: {
    fontSize: 29,
    lineHeight: 38,
  },
  extraLargeHeading: {
    fontSize: 34,
    lineHeight: 43,
  },
  extraLargeStopSearchInput: {
    fontSize: 22,
    lineHeight: 30,
    minHeight: 60,
  },
  attentionButtonText: {
    color: colors.text,
  },
  onboardHero: {
    backgroundColor: colors.primaryDark,
    borderRadius: 8,
    borderColor: colors.primary,
    borderWidth: 2,
    gap: 8,
    padding: 20,
  },
  onboardDestinationNextHero: {
    borderColor: colors.warning,
    borderWidth: 4,
    padding: 18,
  },
  onboardDestinationReachedHero: {
    borderColor: colors.accessible,
    borderWidth: 4,
    padding: 18,
  },
  highContrastOnboardHero: {
    backgroundColor: "#000000",
    borderColor: "#FFFFFF",
    borderWidth: 4,
  },
  onboardEyebrow: {
    color: colors.highlight,
    fontSize: 16,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  onboardService: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 36,
  },
  onboardAlertLabel: {
    color: colors.warning,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 31,
    marginTop: 4,
  },
  onboardNextStopLabel: {
    color: colors.primarySoft,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 4,
  },
  onboardDestination: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 38,
  },
  onboardInstruction: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "700",
    lineHeight: 27,
  },
  priorityPanel: {
    backgroundColor: colors.accessible,
    borderColor: colors.textOnAccessible,
    borderRadius: 8,
    borderWidth: 3,
    gap: 8,
    padding: 18,
  },
  alightingPriorityPanel: {
    borderColor: colors.warning,
    borderWidth: 4,
  },
  alightingCardTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 31,
  },
  alightingStatusRow: {
    alignItems: "flex-start",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 64,
    padding: 12,
  },
  alightingStatusCopy: {
    flex: 1,
    gap: 2,
  },
  alightingStatusTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 25,
  },
  alightingStatusDetail: {
    color: colors.body,
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 24,
  },
  assistanceRequestedStatus: {
    gap: 6,
    paddingVertical: 4,
  },
  alightingSafetyInstruction: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 27,
  },
  onboardMoreOptions: {
    gap: 8,
    marginTop: 2,
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
  onboardProviderMap: {
    borderRadius: 8,
    height: 320,
    minHeight: 260,
    overflow: "hidden",
    width: "100%",
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
  activeJourneyOptions: {
    backgroundColor: colors.lightSurface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 2,
    gap: 8,
    padding: 12,
  },
  activeJourneyOptionsTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 27,
  },
  journeyEndDivider: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: 4,
    width: "100%",
  },
  journeyEndBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  journeyEndDialog: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 2,
    gap: 12,
    maxWidth: 440,
    padding: 20,
    width: "100%",
  },
  journeyEndTitle: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 34,
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
  journeyIntroPanel: {
    backgroundColor: "#E2F3EF",
    borderColor: "#B8DCD4",
  },
  nextActionCard: {
    backgroundColor: "#F8FCFC",
    borderColor: "#80AEB5",
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
  serviceAccessibilitySymbol: {
    backgroundColor: lightTheme.accessible,
    borderColor: lightTheme.textOnAccessible,
    color: lightTheme.textOnAccessible,
  },
  highContrastServiceAccessibilitySymbol: {
    backgroundColor: "#FFFFFF",
    borderColor: "#000000",
    color: "#000000",
  },
  accessibleChip: {
    backgroundColor: lightTheme.accessible,
    borderColor: lightTheme.accessible,
    color: lightTheme.textOnAccessible,
  },
  createProfilePanel: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.border,
  },
  appearanceIconToggle: {
    backgroundColor: lightTheme.surfaceSecondary,
    borderColor: lightTheme.border,
  },
  appearanceIconButton: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.border,
  },
  selectedAppearanceIconButton: {
    backgroundColor: lightTheme.primary,
    borderColor: lightTheme.primary,
  },
  journeyProgressCell: {
    backgroundColor: lightTheme.surfaceSecondary,
    borderColor: lightTheme.border,
  },
  journeyBusMarker: {
    backgroundColor: lightTheme.primaryStrong,
    borderColor: lightTheme.primary,
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
  journeyDiscoveryStatus: {
    backgroundColor: lightTheme.surfaceSecondary,
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
  selectedStopMetadata: {
    color: lightTheme.textSecondary,
  },
  selectedStopServicePill: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.primary,
  },
  selectedStopServicePillText: {
    color: lightTheme.primary,
  },
  directionsSummary: {
    backgroundColor: lightTheme.surfaceSecondary,
    borderColor: lightTheme.location,
  },
  recenterControl: {
    backgroundColor: "#FFFFFF",
    borderColor: lightTheme.location,
  },
  nearestBusStopGlyphBody: {
    borderColor: lightTheme.location,
  },
  nearestBusStopGlyphPointer: {
    borderTopColor: lightTheme.location,
  },
  selectedBusStopGlyphBody: {
    borderColor: lightTheme.textOnPrimary,
  },
  selectedBusStopGlyphPointer: {
    borderTopColor: lightTheme.textOnPrimary,
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
  tertiaryButton: {
    backgroundColor: "transparent",
  },
  tertiaryButtonText: {
    color: lightTheme.primaryStrong,
  },
  tabBar: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.border,
  },
  tabButton: {
    backgroundColor: "transparent",
  },
  selectedTabButton: {
    backgroundColor: "#EEF7F8",
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
