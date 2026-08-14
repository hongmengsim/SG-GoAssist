import React, { useEffect, useMemo, useState } from "react";
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
  JourneyPhase,
  NearbyBusStop,
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
  md: 14,
  lg: 18,
  xl: 20,
};
const radius = {
  md: 8,
};
const colors = {
  background: "#071315",
  surface: "#0D1B1E",
  lightSurface: "#111D20",
  primary: "#69C8D8",
  primaryDark: "#071315",
  primarySoft: "#69C8D8",
  highlight: "#69C8D8",
  success: "#83F4E6",
  text: "#F7FBFC",
  muted: "#B7C8CB",
  metadata: "#B7C8CB",
  body: "#F7FBFC",
  border: "#527078",
  error: "#FF5A5F",
  disabledBackground: "#39474A",
  disabledBorder: "#527078",
  disabledText: "#B7C8CB",
  focusIndicator: "#8BE9F4",
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
  const [mapViewMode, setMapViewMode] = useState<"MAP" | "LIST">("MAP");
  const [stopSearchQuery, setStopSearchQuery] = useState("");
  const [mapManuallyMoved, setMapManuallyMoved] = useState(false);
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
    );
  }, [nearbyStops, stopSearchQuery]);
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

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const result = await findNearbyBusStops({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy ?? undefined,
      });

      if (result.stops.length === 0) {
        setError("We couldn't confidently identify a nearby bus stop.");
        setNearbyStops([]);
        setScreen("STOP");
        return;
      }

      setNearbyStops(result.stops);
      setSelectedStop(null);
      setCurrentLocation({
        latitude: result.debug.latitude,
        longitude: result.debug.longitude,
        accuracyMeters: result.debug.accuracyMeters,
      });
      setMapViewMode("MAP");
      setMapManuallyMoved(false);
      setScreen("STOP");
      AccessibilityInfo.announceForAccessibility(
        `${result.stops.length} nearby bus stops found. Please confirm your bus stop.`
      );
    } catch (apiError) {
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
      const result = await findNearbyBusStops({
        latitude: 1.2942,
        longitude: 103.7711,
        accuracyMeters: 0,
      });
      setNearbyStops(result.stops);
      setSelectedStop(null);
      setCurrentLocation({
        latitude: result.debug.latitude,
        longitude: result.debug.longitude,
        accuracyMeters: result.debug.accuracyMeters,
      });
      setMapViewMode("MAP");
      setMapManuallyMoved(false);
      setScreen("STOP");
    } catch (apiError) {
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

    setIsLoading(true);
    setLoadingMessage("Loading buses arriving here...");
    setError(null);
    try {
      const arrivals = await fetchBusStopArrivals(stop.busStopCode);
      const flattened = arrivals.services.flatMap((service) => service.buses);
      setArrivingBuses(flattened);
      setSelectedArrival(null);
      setSelectedBus(null);
      setScreen("BUS");
      if (flattened.length === 0) {
        setError("Bus arrival information is temporarily unavailable.");
      }
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to load buses for this stop.");
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
            <Text style={[styles.bodyText, lightMode && lightStyles.bodyText]}>
              Defaults: {requirementsLabel(requirements)}
            </Text>
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
                <Text style={themedBodyStyle()}>
                  Defaults: {requirementsLabel(profile.assistanceDefaults)}
                </Text>
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
              <Text style={themedBodyStyle()}>
                Saved needs: {requirementsLabel(activeProfile.assistanceDefaults)}
              </Text>
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
                  Credential: {activeProfile.verifiedCredentialLast4 ? `•••• ${activeProfile.verifiedCredentialLast4}` : "Demo credential"}
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
              title="Choose Your Bus Stop"
              highContrast={appPreferences.highContrast}
              lightMode={lightMode}
            />
            <StopSearch
              query={stopSearchQuery}
              onChangeQuery={setStopSearchQuery}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
            <MapListToggle
              value={mapViewMode}
              onChange={setMapViewMode}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
            <Text style={themedBodyStyle()}>Select the bus stop where you are waiting.</Text>
            {mapViewMode === "MAP" ? (
              <NearbyStopsMap
                stops={visibleStops}
                selectedStop={selectedStop}
                currentLocation={currentLocation}
                mapManuallyMoved={mapManuallyMoved}
                largeText={appPreferences.largeText}
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
                onSelectStop={(stop) => {
                  setSelectedStop(stop);
                  AccessibilityInfo.announceForAccessibility(
                    `Selected bus stop, ${stop.description}.`
                  );
                }}
                onMoveMap={() => setMapManuallyMoved(true)}
                onRecenter={() => setMapManuallyMoved(false)}
              />
            ) : (
              <NearbyStopsList
                stops={visibleStops}
                selectedStop={selectedStop}
                lightMode={lightMode}
                highContrast={appPreferences.highContrast}
                onSelectStop={(stop) => {
                  setSelectedStop(stop);
                  AccessibilityInfo.announceForAccessibility(
                    `Selected bus stop, ${stop.description}.`
                  );
                }}
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
                onSelect={() => confirmBusStop(selectedStop)}
                onDirections={() =>
                  AccessibilityInfo.announceForAccessibility(
                    `Directions to ${selectedStop.description}: continue to the marked boarding point, approximately ${selectedStop.distanceMeters} metres away.`
                  )
                }
              />
            )}
            <PrimaryButton
              label="This is my stop"
              accessibilityHint="Confirm this bus stop and show buses arriving here."
              onPress={() => confirmBusStop()}
              disabled={!selectedStop || isLoading}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
            <SecondaryButton
              label="Repeat my bus stop"
              onPress={() => selectedStop && AccessibilityInfo.announceForAccessibility(stopAccessibilityLabel(selectedStop))}
              disabled={!selectedStop}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
            {mapViewMode === "MAP" && (
              <>
                <Text style={themedHeadingStyle()}>
                  List View
                </Text>
                {visibleStops.map((stop) => (
                  <BusStopCard
                    key={stop.busStopCode}
                    stop={stop}
                    selected={selectedStop?.busStopCode === stop.busStopCode}
                    onPress={() => {
                      setSelectedStop(stop);
                      setMapViewMode("LIST");
                    }}
                    lightMode={lightMode}
                    highContrast={appPreferences.highContrast}
                  />
                ))}
              </>
            )}
            <SecondaryButton
              label="Refresh location"
              onPress={findMyBusStop}
              disabled={isLoading}
              lightMode={lightMode}
              highContrast={appPreferences.highContrast}
            />
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
                Bus Stop {selectedStop.busStopCode} · {selectedStop.description}
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
                  ? `${selectedStop.busStopCode} · ${selectedStop.description}, ${selectedStop.roadName}`
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
            message={error}
            primaryActionLabel={screen === "LOCATION" || screen === "STOP" ? "Try again" : "Try again"}
            onPrimaryAction={screen === "LOCATION" || screen === "STOP" ? findMyBusStop : undefined}
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

function ToggleRow({
  label,
  description,
  enabled,
  highContrast = false,
  largeText = false,
  lightMode = false,
  variant = "default",
  iconSource,
  iconSize,
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
                  styles.optionIconImage,
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
          <Text
            style={[
              styles.selectionIndicatorText,
              enabled && styles.selectedSelectionIndicatorText,
              lightMode && lightStyles.text,
              lightMode && enabled && lightStyles.selectedSelectionIndicatorText,
              highContrast && !lightMode && styles.highContrastText,
              highContrast && lightMode && lightStyles.highContrastText,
            ]}
          >
            {enabled ? "✓" : ""}
          </Text>
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
      ? "#145A64"
      : "#7DD7E5";

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
  return (
    <View
      style={[
        styles.sunIcon,
        selected && styles.selectedModeIcon,
        lightMode && lightStyles.modeIcon,
        highContrast && styles.highContrastIndicator,
        selected && styles.selectedSunIcon,
      ]}
      accessible={false}
    >
      <View style={[styles.sunRay, styles.sunRayTop, selected && styles.selectedSunRay]} />
      <View style={[styles.sunRay, styles.sunRayBottom, selected && styles.selectedSunRay]} />
      <View style={[styles.sunRay, styles.sunRayLeft, selected && styles.selectedSunRay]} />
      <View style={[styles.sunRay, styles.sunRayRight, selected && styles.selectedSunRay]} />
      <View style={[styles.sunRay, styles.sunRayTopLeft, selected && styles.selectedSunRay]} />
      <View style={[styles.sunRay, styles.sunRayTopRight, selected && styles.selectedSunRay]} />
      <View style={[styles.sunRay, styles.sunRayBottomLeft, selected && styles.selectedSunRay]} />
      <View style={[styles.sunRay, styles.sunRayBottomRight, selected && styles.selectedSunRay]} />
      <View style={[styles.sunCore, selected && styles.selectedSunCore]} />
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
        customIcon={
          <BoardingTimeIcon
            selected={requirements.extendedDwellTime}
            highContrast={appPreferences.highContrast}
            lightMode={resolvedThemeMode === "light"}
          />
        }
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

function BusStopCard({
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
}

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

function NearbyStopsMap({
  stops,
  selectedStop,
  currentLocation,
  mapManuallyMoved,
  largeText,
  lightMode,
  highContrast,
  onSelectStop,
  onMoveMap,
  onRecenter,
}: {
  stops: NearbyBusStop[];
  selectedStop: NearbyBusStop | null;
  currentLocation: { latitude: number; longitude: number; accuracyMeters?: number } | null;
  mapManuallyMoved: boolean;
  largeText: boolean;
  lightMode: boolean;
  highContrast: boolean;
  onSelectStop: (stop: NearbyBusStop) => void;
  onMoveMap: () => void;
  onRecenter: () => void;
}) {
  const positionedStops = stops.slice(0, 8).map((stop, index) => {
    const angle = (index / Math.max(stops.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const radius = Math.min(38, 16 + stop.distanceMeters / 10);
    return {
      stop,
      left: `${50 + Math.cos(angle) * radius}%` as const,
      top: `${50 + Math.sin(angle) * radius}%` as const,
    };
  });

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
      <View style={styles.mapMetaRow}>
        <Text
          style={[
            styles.mapMetaText,
            largeText && styles.largeBody,
            lightMode && lightStyles.mutedText,
            highContrast && !lightMode && styles.highContrastMutedText,
            highContrast && lightMode && lightStyles.highContrastMutedText,
          ]}
        >
          {currentLocation
            ? `Centred near you · ${currentLocation.accuracyMeters ?? 0} m accuracy`
            : "Manual browsing"}
        </Text>
        <Text style={[styles.mapMetaText, lightMode && lightStyles.mutedText]}>
          {mapManuallyMoved ? "Map moved" : "Auto-centred"}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Move map manually"
        accessibilityHint="Simulates manually panning the nearby bus stop map."
        onPress={onMoveMap}
        style={styles.mapCanvas}
      >
        <View style={styles.mapRoadHorizontal} />
        <View style={styles.mapRoadVertical} />
        <View
          style={[
            styles.currentLocationMarker,
            highContrast && styles.highContrastCurrentLocationMarker,
          ]}
          accessible={false}
        >
          <Text style={styles.currentLocationText}>Me</Text>
        </View>
        {positionedStops.map(({ stop, left, top }, index) => {
          const selected = selectedStop?.busStopCode === stop.busStopCode;
          const clustered = index > 0 && stop.distanceMeters < 80;
          return (
            <Pressable
              key={stop.busStopCode}
              accessibilityRole="button"
              accessibilityLabel={`Bus stop ${stop.busStopCode}, ${stop.description}, ${stop.distanceMeters} metres away.`}
              accessibilityState={{ selected }}
              onPress={() => onSelectStop(stop)}
              style={[
                styles.mapStopMarker,
                { left, top },
                clustered && styles.clusteredMapStopMarker,
                selected && styles.selectedMapStopMarker,
                highContrast && styles.highContrastMapStopMarker,
                selected && highContrast && styles.highContrastSelectedMapStopMarker,
              ]}
            >
              <Text
                style={[
                  styles.mapStopMarkerText,
                  selected && styles.selectedMapStopMarkerText,
                ]}
              >
                {clustered ? `${index + 1}` : "Bus"}
              </Text>
            </Pressable>
          );
        })}
      </Pressable>
      <SecondaryButton
        label="Re-centre on Me"
        accessibilityHint="Centres the nearby bus stop map around your current location."
        onPress={onRecenter}
        lightMode={lightMode}
        highContrast={highContrast}
      />
    </View>
  );
}

function NearbyStopsList({
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
}

function SelectedStopCard({
  stop,
  lightMode,
  highContrast,
  largeText,
  onSelect,
  onDirections,
}: {
  stop: NearbyBusStop;
  lightMode: boolean;
  highContrast: boolean;
  largeText: boolean;
  onSelect: () => void;
  onDirections: () => void;
}) {
  const walkingMinutes = Math.max(1, Math.round(stop.distanceMeters / 70));
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
      <Text style={[styles.busTitle, largeText && styles.largeBody, lightMode && lightStyles.text]}>
        {stop.description} - Bus Stop {stop.busStopCode}
      </Text>
      <Text style={[styles.bodyText, largeText && styles.largeBody, lightMode && lightStyles.bodyText]}>
        Approx. {stop.distanceMeters} m away · {walkingMinutes} min walk
      </Text>
      <View style={styles.infoRow}>
        <Text style={[styles.infoPill, lightMode && lightStyles.infoPill]}>Services load after selection</Text>
        <Text style={[styles.infoPill, lightMode && lightStyles.infoPill]}>Accessible boarding available</Text>
      </View>
      <PrimaryButton
        label="Select This Stop"
        accessibilityHint="Stores this as your boarding stop and loads available buses."
        onPress={onSelect}
        lightMode={lightMode}
        highContrast={highContrast}
      />
      <SecondaryButton
        label="Directions to Stop"
        accessibilityHint="Announces simple walking guidance to the selected stop."
        onPress={onDirections}
        lightMode={lightMode}
        highContrast={highContrast}
      />
    </View>
  );
}

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
  message,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
  lightMode = false,
  highContrast = false,
}: {
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
      <Text style={styles.errorTitle}>Something went wrong</Text>
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  highContrastSafeArea: {
    backgroundColor: "#000000",
  },
  container: {
    padding: 20,
    paddingBottom: 150,
    gap: 18,
  },
  compactContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 132,
    gap: 16,
  },
  appTitle: {
    color: colors.text,
    fontSize: 34,
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
  createProfilePanel: {
    backgroundColor: "#102529",
    borderColor: "#69C8D8",
    borderRadius: 8,
    borderWidth: 2,
    gap: 12,
    padding: 16,
  },
  themeSwitchCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 2,
    gap: 12,
    padding: 14,
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
    borderRadius: 8,
    borderWidth: 2,
    flex: 1,
    gap: 8,
    minHeight: 92,
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  selectedModeLabel: {
    backgroundColor: colors.highlight,
    borderColor: colors.highlight,
  },
  modeLabelText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  selectedModeLabelText: {
    color: colors.primaryDark,
  },
  highContrastSelectedText: {
    color: "#000000",
  },
  modeSwitchTrack: {
    backgroundColor: colors.highlight,
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
    backgroundColor: colors.highlight,
    borderRadius: 9,
    height: 18,
    width: 18,
  },
  selectedSunCore: {
    backgroundColor: "#FFD766",
  },
  selectedSunIcon: {
    backgroundColor: "#FFF9E6",
    borderColor: "#145A64",
  },
  selectedSunRay: {
    backgroundColor: "#FFD766",
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
    backgroundColor: colors.lightSurface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 2,
    height: 44,
    overflow: "hidden",
    width: 44,
  },
  moonInner: {
    backgroundColor: colors.highlight,
    borderRadius: 14,
    height: 28,
    left: 8,
    position: "absolute",
    top: 7,
    width: 28,
  },
  selectedMoonInner: {
    backgroundColor: colors.highlight,
  },
  selectedMoonIcon: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.highlight,
  },
  selectedMoonCutout: {
    backgroundColor: colors.primaryDark,
  },
  moonCutout: {
    backgroundColor: colors.surface,
    borderRadius: 13,
    height: 26,
    left: 19,
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
    fontSize: 26,
    fontWeight: "800",
  },
  toggleRow: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 2,
    gap: 12,
    minHeight: 92,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  assistanceOption: {
    borderColor: colors.primary,
  },
  phoneOption: {
    borderColor: colors.metadata,
  },
  selectedToggleRow: {
    borderWidth: 4,
  },
  selectedAssistanceOption: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.highlight,
  },
  selectedPhoneOption: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.highlight,
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
    borderRadius: 8,
    borderWidth: 2,
    height: 56,
    justifyContent: "center",
    width: 56,
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
    backgroundColor: "#00181D",
    borderColor: colors.primaryDark,
  },
  optionIconText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
  },
  optionIconImage: {
    height: 36,
    tintColor: "#7DD7E5",
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
    fontSize: 18,
    fontWeight: "900",
  },
  selectedSelectionStatus: {
    color: colors.highlight,
  },
  selectionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingLeft: 70,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 8,
    minHeight: 60,
    justifyContent: "center",
    padding: 16,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: 8,
    borderWidth: 2,
    minHeight: 60,
    justifyContent: "center",
    padding: 16,
  },
  disabledButton: {
    backgroundColor: colors.disabledBackground,
    borderColor: colors.disabledBorder,
  },
  attentionButton: {
    backgroundColor: colors.highlight,
    borderColor: colors.primaryDark,
    borderWidth: 2,
  },
  disabledButtonText: {
    color: colors.disabledText,
  },
  primaryButtonText: {
    color: "#ffffff",
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
    borderRadius: 8,
    borderWidth: 2,
    gap: 4,
    padding: 16,
  },
  stopSearchInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 2,
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    backgroundColor: colors.highlight,
  },
  mapListToggleText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  selectedMapListToggleText: {
    color: colors.primaryDark,
  },
  stopMapPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 2,
    gap: 10,
    padding: 12,
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
    backgroundColor: "#0A252B",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 2,
    height: 330,
    overflow: "hidden",
    position: "relative",
  },
  mapRoadHorizontal: {
    backgroundColor: "#24525B",
    height: 28,
    left: "-10%",
    position: "absolute",
    top: "45%",
    transform: [{ rotate: "-10deg" }],
    width: "120%",
  },
  mapRoadVertical: {
    backgroundColor: "#1D464E",
    height: "120%",
    left: "46%",
    position: "absolute",
    top: "-10%",
    transform: [{ rotate: "18deg" }],
    width: 32,
  },
  currentLocationMarker: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: colors.highlight,
    borderRadius: 26,
    borderWidth: 4,
    height: 52,
    justifyContent: "center",
    left: "50%",
    marginLeft: -26,
    marginTop: -26,
    position: "absolute",
    top: "50%",
    width: 52,
  },
  highContrastCurrentLocationMarker: {
    borderColor: "#000000",
    borderWidth: 5,
  },
  currentLocationText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: "900",
  },
  mapStopMarker: {
    alignItems: "center",
    backgroundColor: colors.highlight,
    borderColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 3,
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
    borderRadius: 18,
    height: 44,
    width: 44,
  },
  selectedMapStopMarker: {
    backgroundColor: "#FFFFFF",
    borderColor: colors.highlight,
    borderWidth: 5,
    height: 58,
    marginLeft: -29,
    marginTop: -29,
    width: 58,
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
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: "900",
  },
  selectedMapStopMarkerText: {
    fontSize: 12,
  },
  nearbyStopsList: {
    gap: 10,
  },
  selectedStopSheet: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.highlight,
    borderRadius: 8,
    borderWidth: 3,
    gap: 12,
    padding: 16,
  },
  arrivalCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 2,
    gap: 10,
    padding: 18,
  },
  arrivalTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  serviceNumber: {
    color: colors.highlight,
    fontSize: 48,
    fontWeight: "900",
  },
  etaBlock: {
    alignItems: "center",
    backgroundColor: colors.highlight,
    borderColor: colors.primaryDark,
    borderRadius: 8,
    borderWidth: 2,
    minWidth: 82,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  etaNumber: {
    color: colors.primaryDark,
    fontSize: 32,
    fontWeight: "900",
  },
  etaLabel: {
    color: colors.primaryDark,
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
    backgroundColor: colors.lightSurface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 6,
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
    backgroundColor: colors.highlight,
    borderColor: colors.primaryDark,
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
    backgroundColor: "#2A0508",
    borderColor: colors.error,
    borderRadius: radius.md,
    borderWidth: 2,
    gap: spacing.md,
    padding: spacing.lg,
  },
  visualAlert: {
    backgroundColor: colors.highlight,
    borderColor: colors.primaryDark,
    borderRadius: 8,
    borderWidth: 3,
    gap: 6,
    padding: 16,
  },
  visualAlertTitle: {
    color: colors.primaryDark,
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
    backgroundColor: colors.highlight,
    borderColor: colors.primaryDark,
    borderRadius: 8,
    borderWidth: 3,
    gap: 8,
    padding: 18,
  },
});

const lightStyles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#F6FBFC",
  },
  highContrastSafeArea: {
    backgroundColor: "#FFFFFF",
  },
  surface: {
    backgroundColor: "#FFFFFF",
    borderColor: "#8AB8C0",
  },
  selectedCard: {
    backgroundColor: "#D7F4F7",
    borderColor: "#145A64",
  },
  infoPill: {
    backgroundColor: "#EDF4F5",
    borderColor: "#9DB9BE",
    color: "#0A2A30",
  },
  themeSwitchCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#9DB9BE",
  },
  createProfilePanel: {
    backgroundColor: "#EEF7F8",
    borderColor: "#8EB4BA",
  },
  modeLabel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#9DB9BE",
  },
  selectedModeLabel: {
    backgroundColor: "#A8E4EC",
    borderColor: "#145A64",
  },
  selectedModeLabelText: {
    color: "#082E35",
  },
  modeIcon: {
    backgroundColor: "#EDF4F5",
    borderColor: "#145A64",
  },
  moonCutout: {
    backgroundColor: "#FFFFFF",
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
    backgroundColor: "#E5F8FA",
    borderColor: "#006E7A",
  },
  textInput: {
    backgroundColor: "#FFFFFF",
    borderColor: "#9DB9BE",
    color: "#0A2A30",
  },
  mapListToggle: {
    backgroundColor: "#FFFFFF",
    borderColor: "#9DB9BE",
  },
  mapListToggleButton: {
    backgroundColor: "#FFFFFF",
  },
  selectedMapListToggleButton: {
    backgroundColor: "#A8E4EC",
  },
  selectedMapListToggleText: {
    color: "#082E35",
  },
  stopMapPanel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#9DB9BE",
  },
  selectedStopSheet: {
    backgroundColor: "#EEF7F8",
    borderColor: "#145A64",
  },
  primaryButton: {
    backgroundColor: "#145A64",
    borderColor: "#145A64",
  },
  primaryButtonText: {
    color: "#FFFFFF",
  },
  secondaryButton: {
    backgroundColor: "#FFFFFF",
    borderColor: "#145A64",
  },
  secondaryButtonText: {
    color: "#145A64",
  },
  tabBar: {
    backgroundColor: "#FFFFFF",
    borderColor: "#9DB9BE",
  },
  tabButton: {
    backgroundColor: "#EDF4F5",
  },
  selectedTabButton: {
    backgroundColor: "#A8E4EC",
  },
  disabledTabButton: {
    backgroundColor: "#E7EEF0",
    borderColor: "#C4D4D8",
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
    color: "#183B41",
  },
  selectedTabButtonText: {
    color: "#082E35",
  },
  disabledTabButtonText: {
    color: "#5E777D",
  },
  tabSelectedText: {
    color: "#082E35",
  },
  tabUnavailableText: {
    color: "#6F858A",
  },
  toggleRow: {
    backgroundColor: "#FFFFFF",
    borderColor: "#8AB8C0",
  },
  selectedToggleRow: {
    backgroundColor: "#D7F4F7",
    borderColor: "#145A64",
  },
  optionIcon: {
    backgroundColor: "#EEF7F8",
    borderColor: "#8AB8C0",
  },
  selectedOptionIcon: {
    backgroundColor: "#006E7A",
    borderColor: "#006E7A",
  },
  selectionIndicator: {
    borderColor: "#5F929B",
  },
  selectedSelectionIndicator: {
    backgroundColor: "#006E7A",
    borderColor: "#006E7A",
  },
  text: {
    color: "#0A2A30",
  },
  highContrastText: {
    color: "#000000",
  },
  bodyText: {
    color: "#0A2A30",
  },
  highContrastMutedText: {
    color: "#111111",
  },
  mutedText: {
    color: "#536B70",
  },
  eyebrow: {
    color: "#145A64",
  },
  selectedOptionIconText: {
    color: "#FFFFFF",
  },
  selectedSelectionIndicatorText: {
    color: "#FFFFFF",
  },
  selectedSelectionStatus: {
    color: "#006E7A",
  },
});


