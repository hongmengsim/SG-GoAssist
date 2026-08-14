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
const tabIcons: Record<TabIconName, ImageSourcePropType> = {
  home: require("./assets/homelogo.png"),
  bus: require("./assets/journeylogo.png"),
  assist: require("./assets/buslogo.png"),
  profile: require("./assets/profilelogo.png"),
};
type TabIconName = "home" | "bus" | "assist" | "profile";

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
  const [appPreferences, setAppPreferences] = useState(defaultAppPreferences);
  const [nearbyStops, setNearbyStops] = useState<NearbyBusStop[]>([]);
  const [selectedStop, setSelectedStop] = useState<NearbyBusStop | null>(null);
  const [selectedLandmarkId, setSelectedLandmarkId] = useState<string | null>(null);
  const [mapViewMode, setMapViewMode] = useState<"MAP" | "LIST">("MAP");
  const [stopSearchQuery, setStopSearchQuery] = useState("");
  const [mapManuallyMoved, setMapManuallyMoved] = useState(false);
  const [directionsActive, setDirectionsActive] = useState(false);
  const [followMode, setFollowMode] = useState(false);
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

  const assistanceTypes = useMemo(
    () => assistanceTypesForPhase(requirements, "BOARDING"),
    [requirements]
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

    return nearbyStops.filter((stop) =>
      [stop.description, stop.roadName, stop.busStopCode]
        .join(" ")
        .toLowerCase()
        .includes(query)
        || orientationLandmarks.some(
          (landmark) =>
            landmark.relatedStopCodes.includes(stop.busStopCode) &&
            [landmark.name, landmark.category].join(" ").toLowerCase().includes(query)
        )
    );
  }, [nearbyStops, stopSearchQuery]);
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
  const selectStopForBoarding = useCallback((stop: NearbyBusStop) => {
    setSelectedStop(stop);
    setSelectedLandmarkId(null);
    setDirectionsActive(false);
    setFollowMode(false);
    setMapManuallyMoved(false);
    AccessibilityInfo.announceForAccessibility(`Selected bus stop, ${stop.description}.`);
  }, []);
  const markMapMoved = useCallback(() => {
    setMapManuallyMoved(true);
    setFollowMode(false);
  }, []);
  const recenterStopMap = useCallback(() => {
    setMapManuallyMoved(false);
    setFollowMode(false);
  }, []);
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
    setFollowMode(false);
    setMapManuallyMoved(false);
    AccessibilityInfo.announceForAccessibility(firstMoveInstruction(selectedStop, selectedLandmark));
  }, [selectedLandmark, selectedStop]);
  const toggleFollowMode = useCallback(() => {
    setFollowMode((current) => !current);
    setMapManuallyMoved(false);
  }, []);
  const showWholeRoute = useCallback(() => {
    setDirectionsActive(true);
    setMapManuallyMoved(false);
  }, []);
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
    setMapManuallyMoved(false);
    AccessibilityInfo.announceForAccessibility(`${landmark.name}. Nearby bus stops are shown.`);
  }, []);
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
    setAppPreferences(saved.appPreferences);
  }, []);

  useEffect(() => {
    savePreferencesLocally({
      assistanceDefaults: requirements,
      appPreferences,
    });
  }, [appPreferences, requirements]);

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
              `Bus ${message.busService} has received your assistance request.`,
              Haptics.NotificationFeedbackType.Success
            );
          }
        }

        if (message.type === "VEHICLE_STATUS") {
          setVehicleStatus(message.status);
          if (message.status === "APPROACHING") {
            notifyPassenger(
              `Bus ${message.busService} is approaching.`,
              Haptics.NotificationFeedbackType.Warning,
              2
            );
          }
          if (message.status === "ARRIVED") {
            notifyPassenger(
              `Bus ${message.busService} has arrived. Your selected bus is at the stop.`,
              Haptics.NotificationFeedbackType.Success
            );
          }
        }
      },
      () => setError("Live status connection was interrupted.")
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
      requestStatus ? `Request status ${requestStatus}.` : undefined,
      vehicleStatus ? `Vehicle status ${vehicleStatus}.` : undefined,
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
    setVisualAlert("Profile preferences saved.");
    AccessibilityInfo.announceForAccessibility("Profile preferences saved.");
    setIsEditingProfileNeeds(false);
  }

  function signOut() {
    setActiveProfile(null);
    setIsEditingProfileNeeds(false);
    setRequirements(defaultRequirements);
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
      if (journeyPhase === "ONBOARD" || journeyPhase === "ALIGHTING") {
        setScreen("ONBOARD");
        return;
      }
      setScreen(selectedStop ? (selectedArrival ? "BUS" : "STOP") : "LOCATION");
      return;
    }
    if (tab === "JOURNEY") {
      setScreen(
        journeyPhase === "ONBOARD" || journeyPhase === "ALIGHTING"
          ? "ONBOARD"
          : journeyPhase === "COMPLETED"
            ? "COMPLETED"
            : requestId
              ? "STATUS"
              : selectedBus
                ? "CONFIRM"
                : "LOCATION"
      );
      return;
    }
    if (tab === "ASSISTANCE") {
      setScreen(selectedBus ? "ACCESSIBILITY" : "LOCATION");
      return;
    }
    setScreen("PROFILE");
    setIsEditingProfileNeeds(false);
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

  function applyNearbyStopsResult(result: NearbyBusStopsResponse) {
    setNearbyStops(result.stops);
    setSelectedStop(null);
    setSelectedLandmarkId(null);
    setDirectionsActive(false);
    setFollowMode(false);
    setCurrentLocation({
      latitude: result.debug.latitude,
      longitude: result.debug.longitude,
      accuracyMeters: result.debug.accuracyMeters,
    });
    setMapViewMode("MAP");
    setMapManuallyMoved(false);
    setScreen("STOP");
  }

  async function loadNearbyStopsFor(
    payload: { latitude: number; longitude: number; accuracyMeters?: number },
    options: { useCache: boolean; announce: boolean }
  ) {
    const cacheKey = nearbyStopsCacheKey(payload);
    const cached = nearbyStopsCacheRef.current.get(cacheKey);
    const now = Date.now();

    if (options.useCache && cached && now - cached.timestamp < nearbyStopsCacheMs) {
      applyNearbyStopsResult(cached.result);
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
    applyNearbyStopsResult(result);
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
        setError("Location access is unavailable.");
        await loadManualStops();
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
      const result = await loadNearbyStopsFor(position.coords, { useCache: true, announce: true });
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
      await loadNearbyStopsFor(manualStopLookup, { useCache: true, announce: false });
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
    setJourneyPhase("DISCOVERY");
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
            ? "Existing active request found."
            : "Request sent to assistance engine.",
        },
      ]);
      setJourneyPhase("WAITING_FOR_BUS");
      setScreen("STATUS");
    } catch (apiError) {
      setError(`Unable to send assistance request to Bus ${selectedBus.busService}.`);
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  }

  async function cancelRequest() {
    if (!requestId) {
      return;
    }

    setIsLoading(true);
    setLoadingMessage("Cancelling assistance request...");
    setError(null);
    try {
      await cancelAssistanceRequest(requestId);
    } catch {
      setError("Unable to cancel request. Please try again.");
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  }

  function enterOnboardMode() {
    if (!selectedBus) {
      return;
    }

    const route =
      selectedBus.busService === "95"
        ? kentRidgeRouteStops
        : buildFallbackRouteStops(selectedStop, selectedArrival?.destination ?? destination);
    setRouteStops(route);
    setCurrentStopIndex(0);
    setSelectedAlightingStop(route[route.length - 1] ?? null);
    setJourneyPhase("ONBOARD");
    setScreen("ONBOARD");
    notifyPassenger(
      `You are onboard Bus ${selectedBus.busService} towards ${selectedArrival?.destination ?? selectedBus.nextStop}.`,
      Haptics.NotificationFeedbackType.Success
    );
  }

  function chooseAlightingStop(stop: RouteStop) {
    setSelectedAlightingStop(stop);
    setScreen("ONBOARD");
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
      setJourneyPhase("ALIGHTING");
      notifyPassenger(
        `You have arrived at ${nextStop.description}.`,
        Haptics.NotificationFeedbackType.Success
      );
      return;
    }

    const followingStop = routeStops[nextIndex + 1];
    if (selectedAlightingStop && followingStop?.busStopCode === selectedAlightingStop.busStopCode) {
      notifyPassenger(
        `Your selected stop, ${selectedAlightingStop.description}, is next.`,
        Haptics.NotificationFeedbackType.Warning
      );
    }
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
      setJourneyPhase("ALIGHTING");
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
      setJourneyPhase("ALIGHTING");
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
        contentContainerStyle={[styles.container, isCompactWidth && styles.compactContainer]}
      >
        <BrandHeader
          highContrast={appPreferences.highContrast}
          lightMode={lightMode}
          compact={isCompactWidth}
        />
        {activeProfile && (
          <View style={[styles.profileBar, lightMode && lightStyles.surface]}>
            <Text style={[styles.profileName, lightMode && lightStyles.text]}>
              {activeProfile.displayName}
            </Text>
            <PassengerDefaultsIcons
              requirements={requirements}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
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
                  label="Edit needs"
                  onPress={() => setIsEditingProfileNeeds(true)}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
                <SecondaryButton
                  label="Use saved needs for this trip"
                  onPress={() => applyProfile(activeProfile, "PROFILE")}
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
                  Bus Assistance Defaults
                </Text>
                <AssistancePreferenceToggles
                  requirements={requirements}
                  appPreferences={appPreferences}
                  resolvedThemeMode={resolvedThemeMode}
                  setRequirements={setRequirements}
                />
                <Text style={themedHeadingStyle()}>
                  App Accessibility Defaults
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

        {visualAlert && (
          <StatusBanner
            message={visualAlert}
            detail={appPreferences.hapticAlerts ? "Haptic alert sent." : "Haptic alerts are off."}
            highContrast={appPreferences.highContrast}
            lightMode={lightMode}
          />
        )}

        {screen === "LOCATION" && (
          <View style={styles.section}>
            <SectionHeader
              eyebrow="Journey"
              title="Find your bus"
              highContrast={appPreferences.highContrast}
              lightMode={lightMode}
            />
            <Text style={themedBodyStyle()}>
              Use your location to find nearby bus stops.
            </Text>
            <Text style={themedBodyStyle()}>
              You will always choose the stop and bus yourself.
            </Text>
            <PrimaryButton
              label="Use my location"
              accessibilityHint="Find nearby bus stops using your current location."
              onPress={findMyBusStop}
              disabled={isLoading}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
            <SecondaryButton
              label="Select bus stop manually"
              accessibilityHint="Opens a list of nearby bus stops."
              onPress={loadManualStops}
              disabled={isLoading}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
            <SecondaryButton
              label="Repeat guidance"
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
          <View style={styles.section}>
            <SectionHeader
              eyebrow="Journey"
              title="Select Bus Stop"
              highContrast={appPreferences.highContrast}
              lightMode={lightMode}
            />
            <StopSearch
              query={stopSearchQuery}
              onChangeQuery={(query) => {
                setStopSearchQuery(query);
                setSelectedLandmarkId(null);
              }}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
            {stopSearchQuery.trim() ? (
              <LandmarkSearchResults
                query={stopSearchQuery}
                landmarks={visibleLandmarks}
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
                onSelectLandmark={selectLandmark}
              />
            ) : null}
            <MapListToggle
              value={mapViewMode}
              onChange={setMapViewMode}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
            <Text style={themedBodyStyle()}>Select a bus stop from the map or list.</Text>
            {currentLocation?.accuracyMeters && currentLocation.accuracyMeters > 100 ? (
              <View
                style={[
                  styles.locationWarning,
                  lightMode && lightStyles.locationWarning,
                  appPreferences.highContrast && !lightMode && styles.highContrastControl,
                  appPreferences.highContrast && lightMode && lightStyles.highContrastControl,
                ]}
                accessible
                accessibilityRole="alert"
              >
                <Text
                  style={[
                    styles.locationWarningTitle,
                    lightMode && lightStyles.text,
                    appPreferences.highContrast && !lightMode && styles.highContrastText,
                    appPreferences.highContrast && lightMode && lightStyles.highContrastText,
                  ]}
                >
                  Location may be imprecise
                </Text>
                <Text
                  style={[
                    styles.bodyText,
                    appPreferences.largeText && styles.largeBody,
                    lightMode && lightStyles.bodyText,
                  ]}
                >
                  Confirm your bus stop using its name or stop number.
                </Text>
              </View>
            ) : null}
            {mapViewMode === "MAP" ? (
              <NearbyStopsMap
                stops={visibleStops}
                selectedStop={selectedStop}
                selectedLandmark={selectedLandmark}
                landmarks={visibleLandmarks}
                currentLocation={currentLocation}
                mapManuallyMoved={mapManuallyMoved}
                directionsActive={directionsActive}
                followMode={followMode}
                headingDegrees={mapHeadingDegrees}
                largeText={appPreferences.largeText}
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
                onSelectStop={selectStopForBoarding}
                onSelectLandmark={selectLandmark}
                onMoveMap={markMapMoved}
                onRecenter={recenterStopMap}
                onRefreshLocation={findMyBusStop}
                onShowRoute={showWholeRoute}
                onToggleFollow={toggleFollowMode}
              />
            ) : (
              <NearbyStopsList
                stops={visibleStops}
                selectedStop={selectedStop}
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
                onSelectStop={selectStopForBoarding}
              />
            )}
            {visibleStops.length === 0 && (
              <Text style={themedBodyStyle()}>
                No nearby stops match your search. Try a stop code, road or landmark.
              </Text>
            )}
            {selectedStop && (
              <SelectedStopCard
                stop={selectedStop}
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
                largeText={appPreferences.largeText}
                directionsActive={directionsActive}
                landmark={selectedLandmark}
                onConfirm={confirmSelectedStop}
                onHear={hearSelectedStop}
                onDirections={startDirections}
                onHearDirections={hearDirections}
              />
            )}
          </View>
        )}

        {screen === "ACCESSIBILITY" && (
          <View style={styles.section}>
            <SectionHeader
              eyebrow="Assistance"
              title="How can we assist?"
              highContrast={appPreferences.highContrast}
              lightMode={lightMode}
            />
            {activeProfile ? (
              <AssistancePreferenceToggles
                requirements={requirements}
                appPreferences={appPreferences}
                resolvedThemeMode={resolvedThemeMode}
                setRequirements={setRequirements}
              />
            ) : (
              <View style={[styles.summaryRow, lightMode && lightStyles.surface]}>
                <Text style={[styles.summaryLabel, lightMode && lightStyles.mutedText]}>Bus Assistance</Text>
                <Text style={[styles.summaryValue, lightMode && lightStyles.text]}>Profile required</Text>
                <Text style={themedBodyStyle()}>
                  Sign in or create a profile to request wheelchair ramp, bus identification, or additional boarding time.
                </Text>
                <SecondaryButton
                  label="Go to profile"
                  onPress={() => setScreen("PROFILE")}
                  lightMode={lightMode}
                  highContrast={appPreferences.highContrast}
                />
              </View>
            )}
            <Text style={themedHeadingStyle()}>
              Phone Accessibility
            </Text>
            <AppPreferenceToggles
              appPreferences={appPreferences}
              resolvedThemeMode={resolvedThemeMode}
              setAppPreferences={setAppPreferences}
            />
            <PrimaryButton
              label="Review assistance request"
              onPress={() => setScreen("CONFIRM")}
              disabled={!activeProfile || assistanceTypes.length === 0 || !selectedBus}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
            {!activeProfile && (
              <Text style={themedBodyStyle()}>
                Create a profile to request bus-side assistance.
              </Text>
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
              <Text style={themedBodyStyle()}>
                Bus Stop {selectedStop.busStopCode} - {selectedStop.description}
              </Text>
            )}
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
              onPress={announceCurrentJourney}
              disabled={!selectedArrival || !appPreferences.repeatAudio}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
            <PrimaryButton
              label={activeProfile ? "Choose assistance" : "Set app accessibility"}
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
              title="Confirm request"
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
              value={selectedArrival?.destination ?? destination}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
            <SummaryRow
              label="Assistance"
              value={selectedNeeds}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
            <SecondaryButton
              label="Repeat request summary"
              onPress={announceCurrentJourney}
              disabled={!appPreferences.repeatAudio}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
            <PrimaryButton
              label="Send assistance request"
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
              title="Live journey status"
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
              accessibilityLabel={`Request status ${requestStatusLabel(
                requestStatus
              )}. Vehicle status ${vehicleStatusLabel(vehicleStatus)}.`}
            >
              <Text style={themedLabelStyle()}>Request</Text>
              <Text style={themedValueStyle()}>{requestStatusLabel(requestStatus)}</Text>
              <Text style={themedBodyStyle()}>{selectedNeeds} requested for Bus {selectedBus.busService}.</Text>
              {requestStatus === "ACKNOWLEDGED" && (
                <Text style={[styles.confirmationText, lightMode && lightStyles.text]}>Bus {selectedBus.busService} has received your request.</Text>
              )}
              <Text style={themedBodyStyle()}>Every spoken update is also displayed on this screen.</Text>
              <Text style={themedBodyStyle()}>
                {appPreferences.hapticAlerts ? "Haptic alerts are enabled." : "Haptic alerts are off."}
              </Text>
              <Text style={themedLabelStyle()}>Vehicle</Text>
              <Text style={themedValueStyle()}>{vehicleStatusLabel(vehicleStatus)}</Text>
            </View>

            {requestStatus === "ACKNOWLEDGED" && (
              <SecondaryButton label="Cancel request" onPress={cancelRequest} disabled={isLoading} lightMode={lightMode} highContrast={appPreferences.highContrast} />
            )}

            {vehicleStatus === "ARRIVED" && (
              <PrimaryButton
                label="Passenger is onboard"
                accessibilityHint="Development control. Enter onboard journey mode after boarding."
                onPress={enterOnboardMode}
                disabled={isLoading}
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
              />
            )}

            <SecondaryButton
              label="Repeat journey status"
              onPress={announceCurrentJourney}
              disabled={!appPreferences.repeatAudio}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />

            {requestStatus === "FAILED" && (
              <PrimaryButton label="Retry" onPress={submitRequest} disabled={isLoading} lightMode={lightMode} highContrast={appPreferences.highContrast} />
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
            selectedAlightingStop={selectedAlightingStop}
            alightingAssistanceTypes={alightingAssistanceTypes}
            selectedStopIsNext={selectedStopIsNext}
            selectedStopReached={selectedStopReached}
            journeyPhase={journeyPhase}
            onChangeStop={() => setScreen("ALIGHTING_STOP")}
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

        {isLoading && (
          <LoadingState
            message={loadingMessage ?? "Loading..."}
            lightMode={lightMode}
            highContrast={appPreferences.highContrast}
          />
        )}
        {error && (
          <ErrorState
            title={screen === "BUS" ? "Arrival info unavailable" : undefined}
            message={error}
            primaryActionLabel={
              screen === "LOCATION" || screen === "STOP" || screen === "BUS" ? "Try again" : undefined
            }
            onPrimaryAction={
              screen === "LOCATION" || screen === "STOP"
                ? findMyBusStop
                : screen === "BUS" && selectedStop
                  ? () => confirmBusStop(selectedStop)
                  : undefined
            }
            secondaryActionLabel={screen === "LOCATION" || screen === "STOP" ? "Select stop manually" : undefined}
            onSecondaryAction={screen === "LOCATION" || screen === "STOP" ? loadManualStops : undefined}
            lightMode={lightMode}
            highContrast={appPreferences.highContrast}
          />
        )}
      </ScrollView>
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
                  highContrast && styles.highContrastOptionIconImage,
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
}: {
  requirements: AccessibilityRequirements;
  lightMode: boolean;
  highContrast: boolean;
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
      preserveIconColors: true,
    },
  };
  const defaults = requirementsToAssistanceTypes(requirements).map((type) => metadata[type]);
  const label = requirementsLabel(requirements);

  return (
    <View
      style={styles.defaultsIconGroup}
      accessible
      accessibilityLabel={`Passenger defaults: ${label}.`}
    >
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
      {defaults.length > 0 ? (
        <View style={styles.defaultsIconRow}>
          {defaults.map((item) => (
            <View
              key={item.label}
              style={[
                styles.defaultsIconChip,
                lightMode && lightStyles.defaultsIconChip,
                highContrast && !lightMode && styles.highContrastControl,
                highContrast && lightMode && lightStyles.highContrastControl,
              ]}
            >
              <Image
                source={item.icon}
                style={item.preserveIconColors ? styles.defaultsIconImageOriginal : styles.defaultsIconImage}
                resizeMode="contain"
                accessible={false}
              />
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
            </View>
          ))}
        </View>
      ) : (
        <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
          No bus assistance defaults
        </Text>
      )}
    </View>
  );
});

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
      : colors.warning;
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
        preserveIconColors
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
        <Text
          style={[
            styles.brandSubtitle,
            compact && styles.compactBrandSubtitle,
            lightMode && lightStyles.eyebrow,
            highContrast && !lightMode && styles.highContrastMutedText,
            highContrast && lightMode && lightStyles.highContrastMutedText,
          ]}
        >
          Accessible journeys. Guided with care.
        </Text>
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
  return (
    <View
      style={[
        styles.tabBar,
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
        icon="bus"
        index={2}
        selected={activeTab === "JOURNEY"}
        disabled={!hasSelectedBus}
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
        disabled={!hasSelectedBus}
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
  const content = (
    <>
      <Text style={[styles.statusLabel, lightMode && lightStyles.mutedText]}>
        {selected ? "Your bus stop" : "Nearby stop"}
      </Text>
      <Text style={[styles.busTitle, lightMode && lightStyles.text]}>{stop.description}</Text>
      <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>{stop.roadName}</Text>
      <View style={styles.infoRow}>
        <Text style={[styles.infoPill, lightMode && lightStyles.infoPill]}>
          Bus Stop {stop.busStopCode}
        </Text>
        <Text style={[styles.infoPill, lightMode && lightStyles.infoPill]}>
          {stop.distanceMeters} m away
        </Text>
      </View>
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
      accessibilityLabel={`${stop.description}, ${stop.roadName}, bus stop ${stop.busStopCode}, approximately ${stop.distanceMeters} metres away. Double tap to select this stop.`}
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
        <Text style={styles.serviceNumber}>{bus.serviceNo}</Text>
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
  selectedAlightingStop,
  alightingAssistanceTypes,
  selectedStopIsNext,
  selectedStopReached,
  journeyPhase,
  onChangeStop,
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
  selectedAlightingStop: RouteStop | null;
  alightingAssistanceTypes: AssistanceType[];
  selectedStopIsNext: boolean;
  selectedStopReached: boolean;
  journeyPhase: JourneyPhase;
  onChangeStop: () => void;
  onRequestDisembarkation: () => void;
  onRepeat: () => void;
  onSimulateNextStop: () => void;
  onEndJourney: () => void;
}) {
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

  return (
    <View style={styles.section}>
      <View
        style={styles.onboardHero}
        accessible
        accessibilityRole="header"
        accessibilityLabel={`You are onboard Bus ${selectedBus.busService} towards ${destination}.`}
      >
        <Text style={styles.onboardEyebrow}>You're on board</Text>
        <Text style={styles.onboardBus}>Bus {selectedBus.busService}</Text>
        <Text style={styles.onboardDestination}>Towards {destination}</Text>
      </View>

      {selectedStopIsNext && (
        <View style={styles.priorityPanel} accessible accessibilityRole="alert">
          <Text style={styles.statusLabel}>Your stop is next</Text>
          <Text style={styles.statusValue}>{selectedAlightingStop?.description}</Text>
          <Text style={styles.bodyText}>Your alighting request is ready.</Text>
        </View>
      )}

      {selectedStopReached && (
        <View style={styles.priorityPanel} accessible accessibilityRole="alert">
          <Text style={styles.statusLabel}>You have arrived</Text>
          <Text style={styles.statusValue}>{selectedAlightingStop?.description}</Text>
          <Text style={styles.bodyText}>Your disembarkation request has been sent.</Text>
        </View>
      )}

      <View style={panelStyle}>
        <Text style={labelStyle}>Current stop</Text>
        <Text style={valueStyle}>{currentStop?.description ?? "Journey starting"}</Text>
        <Text style={labelStyle}>Next stop</Text>
        <Text style={valueStyle}>{nextStop?.description ?? "Final stop"}</Text>
      </View>

      <View style={panelStyle}>
        <Text style={labelStyle}>Where would you like to get off?</Text>
        <Text style={[styles.statusValue, lightMode && lightStyles.text]}>
          {selectedAlightingStop?.description ?? "Choose alighting stop"}
        </Text>
        {alightingAssistanceTypes.length > 0 && (
          <Text style={bodyStyle}>
            {alightingAssistanceTypes.map(readableAssistanceType).join(", ")} will be requested for your selected stop.
          </Text>
        )}
        <SecondaryButton label="Change alighting stop" onPress={onChangeStop} lightMode={lightMode} highContrast={highContrast} />
      </View>

      <PrimaryButton
        label={selectedStopReached ? "Disembark at this stop" : "Request to alight here"}
        accessibilityHint="Send passenger intent to alight. The bus remains responsible for safe operation."
        onPress={onRequestDisembarkation}
        variant="attention"
        lightMode={lightMode}
        highContrast={highContrast}
      />
      {selectedStopReached && (
        <PrimaryButton label="End journey" onPress={onEndJourney} variant="attention" lightMode={lightMode} highContrast={highContrast} />
      )}
      <SecondaryButton
        label="Repeat journey information"
        onPress={onRepeat}
        disabled={!appPreferences.repeatAudio}
        lightMode={lightMode}
        highContrast={highContrast}
      />
      <SecondaryButton
        label="Simulate next stop"
        accessibilityHint="Development control for onboard stop progress."
        onPress={onSimulateNextStop}
        disabled={!nextStop || journeyPhase === "COMPLETED"}
        lightMode={lightMode}
        highContrast={highContrast}
      />
    </View>
  );
}

function StopSearch({
  query,
  onChangeQuery,
  lightMode,
  highContrast,
}: {
  query: string;
  onChangeQuery: (query: string) => void;
  lightMode: boolean;
  highContrast: boolean;
}) {
  return (
    <TextInput
      accessibilityLabel="Search bus stop or location"
      placeholder="Search bus stop or location"
      placeholderTextColor={lightMode ? "#536B70" : colors.metadata}
      value={query}
      onChangeText={onChangeQuery}
      style={[
        styles.stopSearchInput,
        lightMode && lightStyles.textInput,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
      ]}
    />
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
      {(["MAP", "LIST"] as const).map((mode) => (
        <Pressable
          key={mode}
          accessibilityRole="button"
          accessibilityLabel={`${mode === "MAP" ? "Map" : "List"} view`}
          accessibilityState={{ selected: value === mode }}
          onPress={() => onChange(mode)}
          style={[
            styles.mapListToggleButton,
            value === mode && styles.selectedMapListToggleButton,
            lightMode && lightStyles.mapListToggleButton,
            lightMode && value === mode && lightStyles.selectedMapListToggleButton,
          ]}
        >
          <Text
            style={[
              styles.mapListToggleText,
              value === mode && styles.selectedMapListToggleText,
              lightMode && lightStyles.text,
              lightMode && value === mode && lightStyles.selectedMapListToggleText,
              highContrast && !lightMode && styles.highContrastText,
              highContrast && lightMode && lightStyles.highContrastText,
            ]}
          >
            {mode === "MAP" ? "Map" : "List"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const LandmarkSearchResults = memo(function LandmarkSearchResults({
  query,
  landmarks,
  lightMode,
  highContrast,
  onSelectLandmark,
}: {
  query: string;
  landmarks: MapLandmark[];
  lightMode: boolean;
  highContrast: boolean;
  onSelectLandmark: (landmark: MapLandmark) => void;
}) {
  const matchingLandmarks = landmarks.filter((landmark) =>
    landmark.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  if (matchingLandmarks.length === 0) {
    return null;
  }

  return (
    <View style={styles.landmarkSearchResults}>
      {matchingLandmarks.slice(0, 2).map((landmark) => (
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

const NearbyStopsMap = memo(function NearbyStopsMap({
  stops,
  selectedStop,
  selectedLandmark,
  landmarks,
  currentLocation,
  mapManuallyMoved,
  directionsActive,
  followMode,
  headingDegrees,
  largeText,
  lightMode,
  highContrast,
  onSelectStop,
  onSelectLandmark,
  onMoveMap,
  onRecenter,
  onRefreshLocation,
  onShowRoute,
  onToggleFollow,
}: {
  stops: NearbyBusStop[];
  selectedStop: NearbyBusStop | null;
  selectedLandmark: MapLandmark | null;
  landmarks: MapLandmark[];
  currentLocation: { latitude: number; longitude: number; accuracyMeters?: number } | null;
  mapManuallyMoved: boolean;
  directionsActive: boolean;
  followMode: boolean;
  headingDegrees: number;
  largeText: boolean;
  lightMode: boolean;
  highContrast: boolean;
  onSelectStop: (stop: NearbyBusStop) => void;
  onSelectLandmark: (landmark: MapLandmark) => void;
  onMoveMap: () => void;
  onRecenter: () => void;
  onRefreshLocation: () => void;
  onShowRoute: () => void;
  onToggleFollow: () => void;
}) {
  const [expandedCluster, setExpandedCluster] = useState(false);
  const mapTileCells = useMemo(
    () => Array.from({ length: 12 }).map((_, index) => <View key={index} style={styles.mapTileCell} />),
    []
  );
  const positionedStops = useMemo(() => {
    const latitudeBasis = currentLocation?.latitude ?? stops[0]?.latitude ?? manualStopLookup.latitude;
    const longitudeBasis = currentLocation?.longitude ?? stops[0]?.longitude ?? manualStopLookup.longitude;

    return stops.slice(0, maxRenderedMapStops).map((stop, index) => {
      const fallbackAngle = (index / Math.max(stops.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const latOffset = (latitudeBasis - stop.latitude) * 9000;
      const lngOffset = (stop.longitude - longitudeBasis) * 9000;
      return {
        stop,
        left: `${Math.max(8, Math.min(92, 50 + (lngOffset || Math.cos(fallbackAngle) * 24)))}%` as const,
        top: `${Math.max(10, Math.min(88, 50 + (latOffset || Math.sin(fallbackAngle) * 24)))}%` as const,
      };
    });
  }, [currentLocation?.latitude, currentLocation?.longitude, stops]);
  const positionedLandmarks = useMemo(() => {
    const latitudeBasis = currentLocation?.latitude ?? stops[0]?.latitude ?? manualStopLookup.latitude;
    const longitudeBasis = currentLocation?.longitude ?? stops[0]?.longitude ?? manualStopLookup.longitude;

    return landmarks.slice(0, 4).map((landmark) => {
      const latOffset = (latitudeBasis - landmark.latitude) * 9000;
      const lngOffset = (landmark.longitude - longitudeBasis) * 9000;
      return {
        landmark,
        left: `${Math.max(10, Math.min(90, 50 + lngOffset))}%` as const,
        top: `${Math.max(12, Math.min(82, 50 + latOffset))}%` as const,
      };
    });
  }, [currentLocation?.latitude, currentLocation?.longitude, landmarks, stops]);
  const selectedPosition = useMemo(
    () => positionedStops.find(({ stop }) => stop.busStopCode === selectedStop?.busStopCode),
    [positionedStops, selectedStop?.busStopCode]
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
        style={[styles.mapCanvas, mapManuallyMoved && styles.mapCanvasMoved]}
      >
        <View style={styles.mapTileGrid}>
          {mapTileCells}
        </View>
        <View style={styles.mapParkPatch} />
        <View style={styles.mapWaterPatch} />
        <View style={styles.mapRoadMajor} />
        <View style={styles.mapRoadMinorOne} />
        <View style={styles.mapRoadMinorTwo} />
        <Text style={[styles.mapRoadLabel, largeText && styles.largeBody]}>Kent Ridge Cres</Text>
        {positionedLandmarks.map(({ landmark, left, top }) => {
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
            Boolean(currentLocation?.accuracyMeters && currentLocation.accuracyMeters > 100) &&
              styles.largeAccuracyRadius,
            highContrast && styles.highContrastAccuracyRadius,
          ]}
          accessible={false}
        />
        {selectedPosition ? (
          <>
            <View
              style={[
                styles.selectedStopRoute,
                directionsActive && styles.activeWalkingRoute,
                {
                  left: selectedPosition.left,
                  top: selectedPosition.top,
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
            {directionsActive ? (
              <View
                style={[
                  styles.routeArrow,
                  {
                    left: selectedPosition.left,
                    top: selectedPosition.top,
                  },
                  lightMode && lightStyles.routeArrow,
                  highContrast && styles.highContrastRouteArrow,
                ]}
                accessible={false}
              >
                <Text style={styles.routeArrowText}>›</Text>
              </View>
            ) : null}
          </>
        ) : null}
        <View
          style={[
            styles.currentLocationMarker,
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
          <View style={styles.currentLocationDot} />
          <Text style={styles.currentLocationText}>You</Text>
        </View>
        {shouldClusterCloseStops && clusterPosition ? (
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
              { left: clusterPosition.left, top: clusterPosition.top },
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
              ]}
            >
              <BusStopMarkerIcon selected={selected} nearest={nearest} lightMode={lightMode} />
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
          <View style={styles.recenterGlyph}>
            <View style={styles.recenterGlyphDot} />
          </View>
        </Pressable>
        {directionsActive ? (
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
            <Text style={[styles.mapControlText, lightMode && lightStyles.text]}>Route</Text>
          </Pressable>
        ) : null}
        {selectedStop ? (
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
        {mapManuallyMoved ? (
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
          <Text style={[styles.mapScaleText, lightMode && lightStyles.mutedText]}>100 m</Text>
        </View>
      </Pressable>
    </View>
  );
});

function BusStopMarkerIcon({
  selected,
  nearest,
  lightMode,
}: {
  selected: boolean;
  nearest: boolean;
  lightMode: boolean;
}) {
  return (
    <View style={styles.busStopGlyph} accessible={false}>
      <View
        style={[
          styles.busStopGlyphBody,
          nearest && styles.nearestBusStopGlyphBody,
          selected && styles.selectedBusStopGlyphBody,
          nearest && lightMode && lightStyles.nearestBusStopGlyphBody,
          selected && lightMode && lightStyles.selectedBusStopGlyphBody,
        ]}
      >
        <View
          style={[
            styles.busStopGlyphWindow,
            nearest && styles.nearestBusStopGlyphWindow,
            selected && styles.selectedBusStopGlyphWindow,
            nearest && lightMode && lightStyles.nearestBusStopGlyphWindow,
            selected && lightMode && lightStyles.selectedBusStopGlyphWindow,
          ]}
        />
        <View style={styles.busStopGlyphWheels}>
          <View
            style={[
              styles.busStopGlyphWheel,
              nearest && styles.nearestBusStopGlyphWheel,
              selected && styles.selectedBusStopGlyphWheel,
              nearest && lightMode && lightStyles.nearestBusStopGlyphWheel,
              selected && lightMode && lightStyles.selectedBusStopGlyphWheel,
            ]}
          />
          <View
            style={[
              styles.busStopGlyphWheel,
              nearest && styles.nearestBusStopGlyphWheel,
              selected && styles.selectedBusStopGlyphWheel,
              nearest && lightMode && lightStyles.nearestBusStopGlyphWheel,
              selected && lightMode && lightStyles.selectedBusStopGlyphWheel,
            ]}
          />
        </View>
      </View>
      <View
        style={[
          styles.busStopGlyphPointer,
          nearest && styles.nearestBusStopGlyphPointer,
          selected && styles.selectedBusStopGlyphPointer,
          nearest && lightMode && lightStyles.nearestBusStopGlyphPointer,
          selected && lightMode && lightStyles.selectedBusStopGlyphPointer,
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
        {stop.distanceMeters} m away - approx. {walkingMinutes} min
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
          {stop.distanceMeters} m - approx. {walkingMinutes} min
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
            {service}
          </Text>
        ))}
      </View>
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
      </View>
      <SecondaryButton
        label={directionsActive ? "Hear directions" : "Directions"}
        accessibilityHint="Announces the selected bus stop name, code, distance and services."
        onPress={directionsActive ? onHearDirections : onDirections}
        lightMode={lightMode}
        highContrast={highContrast}
      />
      <SecondaryButton
        label="I can't find this stop"
        accessibilityHint="Repeats the first direction and keeps nearby stops available."
        onPress={onHearDirections}
        lightMode={lightMode}
        highContrast={highContrast}
      />
      <SecondaryButton
        label="Hear stop information"
        accessibilityHint="Announces the selected bus stop name, code, distance and services."
        onPress={onHear}
        lightMode={lightMode}
        highContrast={highContrast}
      />
      <PrimaryButton
        label="THIS IS MY STOP"
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
  disabled?: boolean;
  lightMode: boolean;
  highContrast: boolean;
  compact: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, tab, ${selected ? "selected, " : ""}${index} of 4`}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.tabButton,
        compact && styles.compactTabButton,
        lightMode && lightStyles.tabButton,
        selected && styles.selectedTabButton,
        lightMode && selected && lightStyles.selectedTabButton,
        highContrast && !lightMode && styles.highContrastControl,
        highContrast && lightMode && lightStyles.highContrastControl,
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
        ]}
      >
        <Image
          source={tabIcons[icon]}
          style={[
            styles.tabLogoImage,
            compact && styles.compactTabLogoImage,
            selected && styles.selectedTabLogoImage,
            compact && selected && styles.compactSelectedTabLogoImage,
            disabled && styles.disabledTabLogoImage,
          ]}
          resizeMode="contain"
          accessible={false}
        />
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
        ]}
      >
        {label}
      </Text>
      {selected && (
        <Text style={[styles.tabSelectedText, lightMode && lightStyles.tabSelectedText]}>
          Selected
        </Text>
      )}
      {disabled && (
        <Text style={[styles.tabUnavailableText, lightMode && lightStyles.tabUnavailableText]}>
          Unavailable
        </Text>
      )}
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

function TabIcon({ name }: { name: TabIconName }) {
  if (name === "home") {
    return (
      <View style={styles.homeIcon}>
        <View style={styles.homeRoof} />
        <View style={styles.homeBody} />
      </View>
    );
  }

  if (name === "bus") {
    return (
      <View style={styles.navBusIcon}>
        <View style={styles.navBusWindow} />
        <View style={styles.navBusLights}>
          <View style={styles.navBusLight} />
          <View style={styles.navBusLight} />
        </View>
      </View>
    );
  }

  if (name === "assist") {
    return (
      <View style={styles.assistIcon}>
        <View style={styles.assistIconVertical} />
        <View style={styles.assistIconHorizontal} />
      </View>
    );
  }

  return (
    <View style={styles.profileIcon}>
      <View style={styles.profileIconHead} />
      <View style={styles.profileIconBody} />
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

function StatusBanner({
  message,
  detail,
  highContrast = false,
  lightMode = false,
}: {
  message: string;
  detail?: string;
  highContrast?: boolean;
  lightMode?: boolean;
}) {
  return (
    <View
      style={[
        styles.visualAlert,
        lightMode && lightStyles.visualAlert,
        highContrast && !lightMode && styles.highContrastAlert,
        highContrast && lightMode && lightStyles.highContrastControl,
      ]}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={detail ? `${message}. ${detail}` : message}
    >
      <Text
        style={[
          styles.visualAlertTitle,
          lightMode && lightStyles.highContrastText,
          highContrast && !lightMode && styles.highContrastText,
          highContrast && lightMode && lightStyles.highContrastText,
        ]}
      >
        {message.toUpperCase()}
      </Text>
      {detail && (
        <Text
          style={[
            styles.bodyText,
            lightMode && lightStyles.bodyText,
            highContrast && !lightMode && styles.highContrastMutedText,
            highContrast && lightMode && lightStyles.highContrastMutedText,
          ]}
        >
          {detail}
        </Text>
      )}
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

function PrimaryButton({
  label,
  accessibilityHint,
  onPress,
  disabled = false,
  variant = "default",
  lightMode = false,
  highContrast = false,
}: {
  label: string;
  accessibilityHint?: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "default" | "attention";
  lightMode?: boolean;
  highContrast?: boolean;
}) {
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
  accessibilityHint,
  onPress,
  disabled = false,
  lightMode = false,
  highContrast = false,
}: {
  label: string;
  accessibilityHint?: string;
  onPress: () => void;
  disabled?: boolean;
  lightMode?: boolean;
  highContrast?: boolean;
}) {
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
    return "Bus approaching";
  }
  if (status === "ARRIVED") {
    return "Bus arrived";
  }
  if (status === "DEPARTED") {
    return "Bus departed";
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
  if (screen === "ONBOARD" || screen === "ALIGHTING_STOP" || screen === "COMPLETED") {
    return "JOURNEY";
  }
  if (screen === "ACCESSIBILITY" || screen === "CONFIRM") {
    return "ASSISTANCE";
  }
  if (screen === "STATUS") {
    return "JOURNEY";
  }
  if (screen === "PROFILE" || screen === "AUTH") {
    return "PROFILE";
  }
  return "HOME";
}

function eventLabel(event: StatusUpdateMessage) {
  if (event.type === "REQUEST_STATUS") {
    return `Request ${event.status} from ${readableSource(event.source)}`;
  }
  if (event.type === "VEHICLE_STATUS") {
    return `Bus ${event.busService} ${event.status}`;
  }
  return `External announcement simulated: ${event.announcement}`;
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
    "19011": ["95", "A1", "A2"],
  };

  return knownServices[stop.busStopCode] ?? ["Services available after confirmation"];
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
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: 14,
  },
  profileName: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  defaultsIconGroup: {
    gap: 8,
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
    borderColor: colors.border,
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
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    left: 0,
    padding: 6,
    position: "absolute",
    right: 0,
  },
  compactTabBar: {
    gap: 4,
    padding: 4,
  },
  tabButton: {
    alignItems: "center",
    backgroundColor: colors.lightSurface,
    borderRadius: 6,
    flex: 1,
    gap: 4,
    justifyContent: "center",
    minHeight: 72,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  compactTabButton: {
    gap: 2,
    minHeight: 62,
    paddingHorizontal: 3,
    paddingVertical: 6,
  },
  selectedTabButton: {
    backgroundColor: colors.highlight,
  },
  disabledTabButton: {
    backgroundColor: "#162225",
    borderColor: "#33474C",
    borderWidth: 1,
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
    borderRadius: 0,
    height: 50,
    justifyContent: "center",
    width: 56,
  },
  compactTabIconBadge: {
    height: 40,
    width: 46,
  },
  tabLogoImage: {
    height: 46,
    width: 54,
  },
  compactTabLogoImage: {
    height: 38,
    width: 44,
  },
  selectedTabLogoImage: {
    height: 50,
    width: 58,
  },
  compactSelectedTabLogoImage: {
    height: 40,
    width: 46,
  },
  disabledTabLogoImage: {
    opacity: 0.72,
  },
  selectedTabIconBadge: {
    backgroundColor: "transparent",
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
    color: colors.primaryDark,
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
    height: 18,
    position: "relative",
    width: 22,
  },
  selectionCheckShort: {
    backgroundColor: colors.primaryDark,
    borderRadius: 2,
    height: 4,
    left: 2,
    position: "absolute",
    top: 10,
    transform: [{ rotate: "45deg" }],
    width: 9,
  },
  selectionCheckLong: {
    backgroundColor: colors.primaryDark,
    borderRadius: 2,
    height: 4,
    left: 8,
    position: "absolute",
    top: 8,
    transform: [{ rotate: "-45deg" }],
    width: 15,
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
  busCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: borders.default,
    gap: 4,
    padding: spacing.lg,
  },
  stopSearchInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: borders.default,
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  landmarkSearchResults: {
    gap: spacing.sm,
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
  stopMapPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 2,
    padding: 12,
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
    borderRightWidth: 1,
    borderTopWidth: 1,
    height: "33.3333%",
    width: "25%",
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
    fontSize: 11,
    fontWeight: "600",
    left: "34%",
    position: "absolute",
    top: "42%",
    transform: [{ rotate: "-11deg" }],
  },
  accuracyRadius: {
    backgroundColor: "rgba(141, 214, 232, 0.14)",
    borderColor: "rgba(141, 214, 232, 0.22)",
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
    borderRadius: 82,
    height: 164,
    marginLeft: -82,
    marginTop: -82,
    width: 164,
  },
  highContrastAccuracyRadius: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderColor: "#000000",
  },
  currentLocationMarker: {
    alignItems: "center",
    backgroundColor: "transparent",
    height: 58,
    justifyContent: "center",
    left: "50%",
    marginLeft: -29,
    marginTop: -29,
    position: "absolute",
    top: "50%",
    width: 58,
  },
  headingCone: {
    borderBottomColor: colors.location,
    borderBottomWidth: 22,
    borderLeftColor: "transparent",
    borderLeftWidth: 10,
    borderRightColor: "transparent",
    borderRightWidth: 10,
    height: 0,
    opacity: 0.35,
    position: "absolute",
    top: -16,
    width: 0,
  },
  highContrastCurrentLocationMarker: {
    borderColor: "#000000",
  },
  currentLocationDot: {
    backgroundColor: colors.location,
    borderColor: colors.text,
    borderRadius: 9,
    borderWidth: 4,
    height: 18,
    width: 18,
  },
  currentLocationText: {
    color: colors.location,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 2,
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
    backgroundColor: "rgba(134, 197, 218, 0.18)",
    borderColor: colors.primary,
    borderWidth: 3,
    borderRadius: 32,
    height: 64,
    marginLeft: -32,
    marginTop: -32,
    width: 64,
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
    height: 3,
    marginLeft: -55,
    marginTop: -2,
    opacity: 0.8,
    position: "absolute",
    transform: [{ rotate: "-35deg" }],
    width: 110,
    zIndex: 1,
  },
  activeWalkingRoute: {
    backgroundColor: colors.location,
    height: 5,
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
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: 1,
    marginLeft: -36,
    marginTop: -16,
    minWidth: 72,
    paddingHorizontal: 5,
    paddingVertical: 3,
    position: "absolute",
    zIndex: 2,
  },
  destinationLandmarkMarker: {
    borderColor: colors.assistance,
    borderWidth: 2,
  },
  landmarkIconText: {
    color: colors.metadata,
    fontSize: 14,
    fontWeight: "900",
  },
  landmarkLabel: {
    color: colors.metadata,
    fontSize: 9,
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
    top: 58,
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
    borderWidth: 4,
  },
  highContrastSelectedControl: {
    backgroundColor: "#BFF4FF",
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
  landmarkSearchResult: {
    backgroundColor: lightTheme.surface,
    borderColor: lightTheme.border,
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
    backgroundColor: lightTheme.surfaceSecondary,
  },
  selectedTabButton: {
    backgroundColor: lightTheme.surfaceSecondary,
  },
  disabledTabButton: {
    backgroundColor: lightTheme.surfaceSecondary,
    borderColor: lightTheme.border,
    borderWidth: 1,
  },
  tabIconBadge: {
    backgroundColor: "transparent",
  },
  selectedTabIconBadge: {
    backgroundColor: "transparent",
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
    backgroundColor: lightTheme.surfaceSecondary,
    borderColor: lightTheme.primary,
  },
  optionIcon: {
    backgroundColor: lightTheme.surfaceSecondary,
    borderColor: lightTheme.border,
  },
  selectedOptionIcon: {
    backgroundColor: lightTheme.primary,
    borderColor: lightTheme.primary,
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
    color: "#FFFFFF",
  },
  selectedSelectionIndicatorText: {
    color: "#FFFFFF",
  },
  selectedSelectionStatus: {
    color: lightTheme.primary,
  },
});
