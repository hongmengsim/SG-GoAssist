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
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import type {
  AccessibilityRequirements,
  AppAccessibilityPreferences,
  AssistanceRequestStatus,
  AssistanceType,
  Bus,
  ArrivalBus,
  NearbyBusStop,
  PassengerProfile,
  StatusUpdateMessage,
  VerificationMethod,
  VehicleStatus,
} from "@buspass/shared";
import {
  cancelAssistanceRequest,
  createAssistanceRequest,
  fetchBusStopArrivals,
  findNearbyBusStops,
} from "./src/api/assistanceApi";
import { subscribeToRequestStatus } from "./src/api/statusSocket";

const brandLogo = Platform.OS === "web" ? { uri: "/icon.png" } : require("./assets/icon.png");
type TabIconName = "home" | "bus" | "assist" | "profile";

type Screen =
  | "AUTH"
  | "PROFILE"
  | "LOCATION"
  | "STOP"
  | "BUS"
  | "ACCESSIBILITY"
  | "CONFIRM"
  | "STATUS";

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
};

const destination = "Kent Ridge Terminal";
const boardingStop = "Changi Airport Terminal 1";
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
  background: "#F7F8F6",
  surface: "#ffffff",
  primary: "#1F4D49",
  primaryDark: "#123936",
  primarySoft: "#7FA08F",
  softSage: "#CFE0D6",
  text: "#2B2F33",
  muted: "#3f6f68",
  body: "#2B2F33",
  border: "#CFE0D6",
  error: "#9f1239",
  disabledBackground: "#eef3ef",
  disabledText: "#2f4f49",
  focusIndicator: "#0f766e",
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
  const [arrivingBuses, setArrivingBuses] = useState<ArrivalBus[]>([]);
  const [selectedBus, setSelectedBus] = useState<Bus | null>(null);
  const [selectedArrival, setSelectedArrival] = useState<ArrivalBus | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [requestStatus, setRequestStatus] = useState<AssistanceRequestStatus | null>(null);
  const [vehicleStatus, setVehicleStatus] = useState<VehicleStatus | null>(null);
  const [events, setEvents] = useState<StatusUpdateMessage[]>([]);
  const [visualAlert, setVisualAlert] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assistanceTypes = useMemo(() => requirementsToAssistanceTypes(requirements), [requirements]);
  const selectedNeeds = useMemo(
    () => assistanceTypes.map(readableAssistanceType).join(", "),
    [assistanceTypes]
  );
  const sessionId = activeProfile?.profileId ?? "demo-passenger-session";
  const activeTab = getActiveTab(screen);

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
      setScreen(selectedStop ? (selectedArrival ? "BUS" : "STOP") : "LOCATION");
      return;
    }
    if (tab === "JOURNEY") {
      setScreen(requestId ? "STATUS" : selectedBus ? "CONFIRM" : "LOCATION");
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
      const Location = await import("expo-location");
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
      setSelectedStop(result.stops[0]);
      setScreen("STOP");
      AccessibilityInfo.announceForAccessibility(
        `Nearest bus stop: ${result.stops[0].description}, ${result.stops[0].roadName}, bus stop ${result.stops[0].busStopCode}, approximately ${result.stops[0].distanceMeters} metres away.`
      );
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to find nearby bus stops.");
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
      setSelectedStop(result.stops[0] ?? null);
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
      setSelectedArrival(flattened[0] ?? null);
      setSelectedBus(
        flattened[0]
          ? {
              busId: flattened[0].busId,
              busService: flattened[0].serviceNo,
              routeNumber: flattened[0].serviceNo,
              currentStop: stop.description,
              nextStop: flattened[0].destination,
              isAccessible: flattened[0].wheelchairAccessible,
              wheelchairSpaces: flattened[0].wheelchairAccessible ? 1 : 0,
              latitude: stop.latitude,
              longitude: stop.longitude,
              estimatedArrivalSeconds: flattened[0].etaSeconds,
            }
          : null
      );
      setScreen("BUS");
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

  return (
    <SafeAreaView style={[styles.safeArea, appPreferences.highContrast && styles.highContrastSafeArea]}>
      <ScrollView contentContainerStyle={styles.container}>
        <BrandHeader highContrast={appPreferences.highContrast} />
        {activeProfile && (
          <View style={styles.profileBar}>
            <Text style={styles.profileName}>{activeProfile.displayName}</Text>
            <Text style={styles.bodyText}>Defaults: {requirementsLabel(requirements)}</Text>
          </View>
        )}

        {(screen === "AUTH" || (screen === "PROFILE" && !activeProfile)) && (
          <View style={styles.section}>
            <SectionHeader
              eyebrow="Profile"
              title="Your SG GoAssist profile"
              highContrast={appPreferences.highContrast}
            />
            <Text style={[styles.bodyText, appPreferences.largeText && styles.largeBody]}>
              Save your assistance needs for easier, safer and more independent bus journeys.
            </Text>
            <View style={styles.statusPanel}>
              <Text style={styles.statusLabel}>Designed for accessible journeys</Text>
              <Text style={styles.statusValue}>Guided with care</Text>
              <Text style={styles.bodyText}>
                SG GoAssist helps less-abled passengers travel with confidence by making bus journeys easier, safer and more independent.
              </Text>
              <Text style={styles.bodyText}>
                Current app support: {appPreferencesLabel(appPreferences)}
              </Text>
            </View>
            <Text style={[styles.heading, appPreferences.highContrast && styles.highContrastText]}>
              Create Profile
            </Text>
            <LabeledInput
              label="Name"
              value={authName}
              onChangeText={setAuthName}
              placeholder="Passenger name"
            />
            <LabeledInput
              label="Email"
              value={authEmail}
              onChangeText={setAuthEmail}
              placeholder="name@example.com"
              keyboardType="email-address"
            />
            <PrimaryButton label="Create profile" onPress={createProfile} />
            <Text style={[styles.heading, appPreferences.highContrast && styles.highContrastText]}>
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
                style={styles.busCard}
              >
                <Text style={styles.busTitle}>{profile.displayName}</Text>
                <Text style={styles.bodyText}>{profile.email}</Text>
                <Text style={styles.bodyText}>
                  Verification: {verificationStatusLabel(profile)}
                </Text>
                <Text style={styles.bodyText}>
                  Defaults: {requirementsLabel(profile.assistanceDefaults)}
                </Text>
              </Pressable>
            ))}
            <SecondaryButton label="Continue as guest" onPress={() => setScreen("LOCATION")} />
          </View>
        )}

        {screen === "PROFILE" && activeProfile && (
          <View style={styles.section}>
            <SectionHeader
              eyebrow="Profile"
              title="My profile"
              highContrast={appPreferences.highContrast}
            />
            <View style={styles.statusPanel}>
              <Text style={styles.statusLabel}>Account</Text>
              <Text style={styles.statusValue}>{activeProfile.displayName}</Text>
              <Text style={styles.bodyText}>{activeProfile.email}</Text>
              <Text style={styles.bodyText}>
                Verification: {verificationStatusLabel(activeProfile)}
              </Text>
              <Text style={styles.bodyText}>
                Saved needs: {requirementsLabel(activeProfile.assistanceDefaults)}
              </Text>
              <Text style={styles.bodyText}>
                App support: {appPreferencesLabel(activeProfile.appPreferences)}
              </Text>
            </View>
            {!isEditingProfileNeeds && (
              <>
                <PrimaryButton label="Edit needs" onPress={() => setIsEditingProfileNeeds(true)} />
                <SecondaryButton
                  label="Use saved needs for this trip"
                  onPress={() => applyProfile(activeProfile, "PROFILE")}
                />
              </>
            )}
            {!isEditingProfileNeeds && activeProfile.verificationStatus !== "VERIFIED" && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Accessibility Verification</Text>
                <Text style={styles.summaryValue}>Verify eligibility separately from your needs</Text>
                <Text style={styles.bodyText}>
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
                />
                <PrimaryButton label="Verify accessibility profile" onPress={verifyActiveProfile} />
              </View>
            )}
            {!isEditingProfileNeeds && activeProfile.verificationStatus === "VERIFIED" && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Accessibility Verification</Text>
                <Text style={styles.summaryValue}>Verified accessibility user</Text>
                <Text style={styles.bodyText}>
                  Method: {readableVerificationMethod(activeProfile.verificationMethod)}
                </Text>
                <Text style={styles.bodyText}>
                  Credential: {activeProfile.verifiedCredentialLast4 ? `•••• ${activeProfile.verifiedCredentialLast4}` : "Demo credential"}
                </Text>
              </View>
            )}
            {isEditingProfileNeeds && (
              <>
                <Text style={[styles.heading, appPreferences.highContrast && styles.highContrastText]}>
                  Bus Assistance Defaults
                </Text>
                <AssistancePreferenceToggles
                  requirements={requirements}
                  appPreferences={appPreferences}
                  setRequirements={setRequirements}
                />
                <Text style={[styles.heading, appPreferences.highContrast && styles.highContrastText]}>
                  App Accessibility Defaults
                </Text>
                <AppPreferenceToggles
                  appPreferences={appPreferences}
                  setAppPreferences={setAppPreferences}
                />
                <PrimaryButton label="Save needs" onPress={saveActiveProfile} />
                <SecondaryButton
                  label="Cancel editing"
                  onPress={() => {
                    setRequirements(activeProfile.assistanceDefaults);
                    setAppPreferences(activeProfile.appPreferences);
                    setIsEditingProfileNeeds(false);
                  }}
                />
              </>
            )}
            <SecondaryButton label="Continue journey" onPress={() => setScreen("LOCATION")} />
            <SecondaryButton
              label="Sign out"
              onPress={signOut}
            />
          </View>
        )}

        {visualAlert && (
          <StatusBanner
            message={visualAlert}
            detail={appPreferences.hapticAlerts ? "Haptic alert sent." : "Haptic alerts are off."}
            highContrast={appPreferences.highContrast}
          />
        )}

        {screen === "LOCATION" && (
          <View style={styles.section}>
            <SectionHeader
              eyebrow="Journey"
              title="Find your bus"
              highContrast={appPreferences.highContrast}
            />
            <Text style={[styles.bodyText, appPreferences.largeText && styles.largeBody]}>
              Use your location to find nearby bus stops.
            </Text>
            <Text style={[styles.bodyText, appPreferences.largeText && styles.largeBody]}>
              You will always choose the stop and bus yourself.
            </Text>
            <PrimaryButton
              label="Use my location"
              accessibilityHint="Find nearby bus stops using your current location."
              onPress={findMyBusStop}
              disabled={isLoading}
            />
            <SecondaryButton
              label="Select bus stop manually"
              accessibilityHint="Opens a list of nearby bus stops."
              onPress={loadManualStops}
              disabled={isLoading}
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
            />
          </View>
        )}

        {screen === "STOP" && (
          <View style={styles.section}>
            <SectionHeader
              eyebrow="Journey"
              title="Confirm bus stop"
              highContrast={appPreferences.highContrast}
            />
            {selectedStop ? (
              <BusStopCard stop={selectedStop} selected />
            ) : (
              <Text style={styles.bodyText}>No nearby bus stop selected.</Text>
            )}
            <PrimaryButton label="Yes, this stop" onPress={() => confirmBusStop()} disabled={!selectedStop || isLoading} />
            <SecondaryButton
              label="Repeat my bus stop"
              onPress={() => selectedStop && AccessibilityInfo.announceForAccessibility(stopAccessibilityLabel(selectedStop))}
              disabled={!selectedStop}
            />
            <Text style={[styles.heading, appPreferences.highContrast && styles.highContrastText]}>
              Other nearby stops
            </Text>
            {nearbyStops.map((stop) => (
              <BusStopCard
                key={stop.busStopCode}
                stop={stop}
                selected={selectedStop?.busStopCode === stop.busStopCode}
                onPress={() => setSelectedStop(stop)}
              />
            ))}
            <SecondaryButton label="Refresh location" onPress={findMyBusStop} disabled={isLoading} />
          </View>
        )}

        {screen === "ACCESSIBILITY" && (
          <View style={styles.section}>
            <SectionHeader
              eyebrow="Assistance"
              title="How can we assist?"
              highContrast={appPreferences.highContrast}
            />
            {activeProfile ? (
              <AssistancePreferenceToggles
                requirements={requirements}
                appPreferences={appPreferences}
                setRequirements={setRequirements}
              />
            ) : (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Bus Assistance</Text>
                <Text style={styles.summaryValue}>Profile required</Text>
                <Text style={styles.bodyText}>
                  Sign in or create a profile to request wheelchair ramp, bus identification, or additional boarding time.
                </Text>
                <SecondaryButton label="Go to profile" onPress={() => setScreen("PROFILE")} />
              </View>
            )}
            <Text style={[styles.heading, appPreferences.highContrast && styles.highContrastText]}>
              Phone Accessibility
            </Text>
            <AppPreferenceToggles
              appPreferences={appPreferences}
              setAppPreferences={setAppPreferences}
            />
            <PrimaryButton
              label="Review assistance request"
              onPress={() => setScreen("CONFIRM")}
              disabled={!activeProfile || assistanceTypes.length === 0 || !selectedBus}
            />
            {!activeProfile && (
              <Text style={styles.bodyText}>
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
            />
            {selectedStop && (
              <Text style={styles.bodyText}>
                Bus Stop {selectedStop.busStopCode} · {selectedStop.description}
              </Text>
            )}
            {arrivingBuses.map((bus) => (
              <BusArrivalCard
                key={`${bus.busId}-${bus.arrivalSlot}`}
                bus={bus}
                selected={selectedArrival?.busId === bus.busId}
                onPress={() => selectArrival(bus)}
              />
            ))}
            <SecondaryButton
              label="Repeat selected bus"
              onPress={announceCurrentJourney}
              disabled={!selectedArrival || !appPreferences.repeatAudio}
            />
            <PrimaryButton
              label={activeProfile ? "Choose assistance" : "Set app accessibility"}
              onPress={() => setScreen("ACCESSIBILITY")}
              disabled={!selectedArrival}
            />
          </View>
        )}

        {screen === "CONFIRM" && selectedBus && (
          <View style={styles.section}>
            <SectionHeader
              eyebrow="Assistance"
              title="Confirm request"
              highContrast={appPreferences.highContrast}
            />
            <SummaryRow label="Bus" value={`${selectedBus.busService} (${selectedBus.busId})`} />
            <SummaryRow
              label="Boarding stop"
              value={
                selectedStop
                  ? `${selectedStop.busStopCode} · ${selectedStop.description}, ${selectedStop.roadName}`
                  : boardingStop
              }
            />
            <SummaryRow label="Destination" value={selectedArrival?.destination ?? destination} />
            <SummaryRow label="Assistance" value={selectedNeeds} />
            <SecondaryButton
              label="Repeat request summary"
              onPress={announceCurrentJourney}
              disabled={!appPreferences.repeatAudio}
            />
            <PrimaryButton label="Send assistance request" onPress={submitRequest} disabled={isLoading} />
          </View>
        )}

        {screen === "STATUS" && selectedBus && (
          <View style={styles.section}>
            <SectionHeader
              eyebrow="Status"
              title="Live journey status"
              highContrast={appPreferences.highContrast}
            />
            <View
              style={styles.statusPanel}
              accessible
              accessibilityLabel={`Request status ${requestStatusLabel(
                requestStatus
              )}. Vehicle status ${vehicleStatusLabel(vehicleStatus)}.`}
            >
              <Text style={styles.statusLabel}>Request</Text>
              <Text style={styles.statusValue}>{requestStatusLabel(requestStatus)}</Text>
              <Text style={styles.bodyText}>{selectedNeeds} requested for Bus {selectedBus.busService}.</Text>
              {requestStatus === "ACKNOWLEDGED" && (
                <Text style={styles.confirmationText}>Bus {selectedBus.busService} has received your request.</Text>
              )}
              <Text style={styles.bodyText}>Every spoken update is also displayed on this screen.</Text>
              <Text style={styles.bodyText}>
                {appPreferences.hapticAlerts ? "Haptic alerts are enabled." : "Haptic alerts are off."}
              </Text>
              <Text style={styles.statusLabel}>Vehicle</Text>
              <Text style={styles.statusValue}>{vehicleStatusLabel(vehicleStatus)}</Text>
            </View>

            {requestStatus === "ACKNOWLEDGED" && (
              <SecondaryButton label="Cancel request" onPress={cancelRequest} disabled={isLoading} />
            )}

            <SecondaryButton
              label="Repeat journey status"
              onPress={announceCurrentJourney}
              disabled={!appPreferences.repeatAudio}
            />

            {requestStatus === "FAILED" && (
              <PrimaryButton label="Retry" onPress={submitRequest} disabled={isLoading} />
            )}

            {events.map((event) => (
              <View key={`${event.type}-${event.timestamp}`} style={styles.eventRow}>
                <Text style={styles.eventStatus}>{eventLabel(event)}</Text>
                <Text style={styles.bodyText}>{new Date(event.timestamp).toLocaleTimeString()}</Text>
              </View>
            ))}
          </View>
        )}

        {isLoading && <LoadingState message={loadingMessage ?? "Loading..."} />}
        {error && (
          <ErrorState
            message={error}
            primaryActionLabel={screen === "LOCATION" || screen === "STOP" ? "Try again" : "Try again"}
            onPrimaryAction={screen === "LOCATION" || screen === "STOP" ? findMyBusStop : undefined}
            secondaryActionLabel={screen === "LOCATION" || screen === "STOP" ? "Select stop manually" : undefined}
            onSecondaryAction={screen === "LOCATION" || screen === "STOP" ? loadManualStops : undefined}
          />
        )}
      </ScrollView>
      <TabBar
        activeTab={activeTab}
        hasSelectedBus={Boolean(selectedBus)}
        hasRequest={Boolean(requestId)}
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
  variant = "default",
  icon,
  onPress,
}: {
  label: string;
  description: string;
  enabled: boolean;
  highContrast?: boolean;
  largeText?: boolean;
  variant?: "default" | "assistance" | "phone";
  icon?: string;
  onPress: () => void;
}) {
  const isAssistance = variant === "assistance";
  const isPhone = variant === "phone";

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: enabled }}
      accessibilityLabel={`${label}. ${description}. ${enabled ? "Selected" : "Not selected"}.`}
      onPress={onPress}
      style={[
        styles.toggleRow,
        isAssistance && styles.assistanceOption,
        isPhone && styles.phoneOption,
        enabled && styles.selectedToggleRow,
        enabled && isAssistance && styles.selectedAssistanceOption,
        enabled && isPhone && styles.selectedPhoneOption,
        highContrast && styles.highContrastControl,
      ]}
    >
      <View style={styles.optionVisualGroup}>
        <View
          style={[
            styles.optionIcon,
            isAssistance && styles.assistanceIcon,
            isPhone && styles.phoneIcon,
            enabled && styles.selectedOptionIcon,
            highContrast && styles.highContrastIndicator,
          ]}
        >
          <Text
            style={[
              styles.optionIconText,
              enabled && styles.selectedOptionIconText,
              highContrast && styles.highContrastText,
            ]}
          >
            {icon ?? "OK"}
          </Text>
        </View>
        <View
          style={[
            styles.selectionIndicator,
            enabled && styles.selectedSelectionIndicator,
            highContrast && styles.highContrastIndicator,
          ]}
        >
          <Text
            style={[
              styles.selectionIndicatorText,
              enabled && styles.selectedSelectionIndicatorText,
              highContrast && styles.highContrastText,
            ]}
          >
            {enabled ? "✓" : ""}
          </Text>
        </View>
      </View>
      <View style={styles.toggleTextGroup}>
        <Text
          style={[
            styles.toggleText,
            largeText && styles.largeBody,
            highContrast && styles.highContrastText,
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.bodyText,
            largeText && styles.largeBody,
            highContrast && styles.highContrastMutedText,
          ]}
        >
          {description}
        </Text>
      </View>
      <Text
        style={[
          styles.selectionStatus,
          enabled && styles.selectedSelectionStatus,
          highContrast && styles.highContrastMutedText,
        ]}
      >
        {enabled ? "Selected" : "Tap to select"}
      </Text>
    </Pressable>
  );
}

function AssistancePreferenceToggles({
  requirements,
  appPreferences,
  setRequirements,
}: {
  requirements: AccessibilityRequirements;
  appPreferences: AppAccessibilityPreferences;
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
        variant="assistance"
        icon="WC"
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
        variant="assistance"
        icon="+T"
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
        variant="assistance"
        icon="profile"
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
  setAppPreferences,
}: {
  appPreferences: AppAccessibilityPreferences;
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
        variant="phone"
        icon="SR"
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
        variant="phone"
        icon="RE"
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
        variant="phone"
        icon="HB"
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
        variant="phone"
        icon="Aa"
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
        variant="phone"
        icon="HC"
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
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "default" | "email-address";
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={keyboardType === "email-address" ? "none" : "words"}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        style={styles.textInput}
        value={value}
      />
    </View>
  );
}

function SectionHeader({
  eyebrow,
  title,
  highContrast = false,
}: {
  eyebrow: string;
  title: string;
  highContrast?: boolean;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.eyebrow, highContrast && styles.highContrastMutedText]}>
        {eyebrow}
      </Text>
      <Text style={[styles.heading, highContrast && styles.highContrastText]}>{title}</Text>
    </View>
  );
}

function BrandHeader({ highContrast = false }: { highContrast?: boolean }) {
  return (
    <View
      style={styles.brandHeader}
      accessible
      accessibilityRole="header"
      accessibilityLabel="SG GoAssist"
    >
      <Image
        source={brandLogo}
        style={styles.brandLogoImage}
        resizeMode="contain"
        accessible={false}
      />
      <View style={styles.brandTextGroup}>
        <Text style={[styles.brandTitle, highContrast && styles.highContrastText]}>
          SG GoAssist
        </Text>
        <Text style={[styles.brandSubtitle, highContrast && styles.highContrastMutedText]}>
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
  onSelect,
}: {
  activeTab: AppTab;
  hasSelectedBus: boolean;
  hasRequest: boolean;
  onSelect: (tab: AppTab) => void;
}) {
  return (
    <View style={styles.tabBar}>
      <TabButton
        label="Home"
        icon="home"
        selected={activeTab === "HOME"}
        onPress={() => onSelect("HOME")}
      />
      <TabButton
        label="Journey"
        icon="bus"
        selected={activeTab === "JOURNEY"}
        disabled={!hasSelectedBus}
        onPress={() => onSelect("JOURNEY")}
      />
      <TabButton
        label="Assist"
        icon="assist"
        selected={activeTab === "ASSISTANCE"}
        disabled={!hasSelectedBus}
        onPress={() => onSelect("ASSISTANCE")}
      />
      <TabButton
        label="Profile"
        icon="profile"
        selected={activeTab === "PROFILE"}
        onPress={() => onSelect("PROFILE")}
      />
    </View>
  );
}

function BusStopCard({
  stop,
  selected = false,
  onPress,
}: {
  stop: NearbyBusStop;
  selected?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text style={styles.statusLabel}>{selected ? "Your bus stop" : "Nearby stop"}</Text>
      <Text style={styles.busTitle}>{stop.description}</Text>
      <Text style={styles.bodyText}>{stop.roadName}</Text>
      <View style={styles.infoRow}>
        <Text style={styles.infoPill}>Bus Stop {stop.busStopCode}</Text>
        <Text style={styles.infoPill}>{stop.distanceMeters} m away</Text>
      </View>
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.busCard, selected && styles.selectedCard]} accessible accessibilityLabel={stopAccessibilityLabel(stop)}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${stop.description}, ${stop.roadName}, bus stop ${stop.busStopCode}, approximately ${stop.distanceMeters} metres away. Double tap to select this stop.`}
      onPress={onPress}
      style={[styles.busCard, selected && styles.selectedCard]}
    >
      {content}
    </Pressable>
  );
}

function BusArrivalCard({
  bus,
  selected,
  onPress,
}: {
  bus: ArrivalBus;
  selected: boolean;
  onPress: () => void;
}) {
  const etaMinutes = Math.ceil(bus.etaSeconds / 60);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Bus ${bus.serviceNo} towards ${bus.destination}, arriving in approximately ${etaMinutes} minutes, ${
        bus.wheelchairAccessible ? "wheelchair accessible" : "accessibility not indicated"
      }. Double tap to select bus.`}
      onPress={onPress}
      style={[styles.arrivalCard, selected && styles.selectedCard]}
    >
      <View style={styles.arrivalTopRow}>
        <Text style={styles.serviceNumber}>{bus.serviceNo}</Text>
        <View style={styles.etaBlock}>
          <Text style={styles.etaNumber}>{etaMinutes}</Text>
          <Text style={styles.etaLabel}>MIN</Text>
        </View>
      </View>
      <Text style={styles.destinationText}>{bus.destination}</Text>
      <View style={styles.infoRow}>
        <Text style={styles.infoPill}>
          {bus.wheelchairAccessible ? "Accessible" : "Accessibility not indicated"}
        </Text>
      </View>
      <Text style={styles.selectHint}>{selected ? "Selected bus" : "Select bus"}</Text>
    </Pressable>
  );
}

function TabButton({
  label,
  icon,
  selected,
  disabled = false,
  onPress,
}: {
  label: string;
  icon: TabIconName;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.tabButton, selected && styles.selectedTabButton, disabled && styles.disabledButton]}
    >
      <View style={[styles.tabIconBadge, selected && styles.selectedTabIconBadge]}>
        {selected ? <SelectedIcon /> : <TabIcon name={icon} />}
      </View>
      <Text style={[styles.tabButtonText, selected && styles.selectedTabButtonText]}>
        {label}
      </Text>
      {selected && <Text style={styles.tabSelectedText}>Selected</Text>}
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
}: {
  message: string;
  detail?: string;
  highContrast?: boolean;
}) {
  return (
    <View
      style={[styles.visualAlert, highContrast && styles.highContrastAlert]}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={detail ? `${message}. ${detail}` : message}
    >
      <Text style={[styles.visualAlertTitle, highContrast && styles.highContrastText]}>
        {message.toUpperCase()}
      </Text>
      {detail && (
        <Text style={[styles.bodyText, highContrast && styles.highContrastMutedText]}>
          {detail}
        </Text>
      )}
    </View>
  );
}

function LoadingState({ message }: { message: string }) {
  return (
    <View
      style={styles.feedbackPanel}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={message}
      accessibilityState={{ busy: true }}
    >
      <ActivityIndicator size="large" accessibilityLabel={message} />
      <Text style={styles.bodyText}>{message}</Text>
    </View>
  );
}

function ErrorState({
  message,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
}: {
  message: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}) {
  return (
    <View style={styles.errorPanel} accessible accessibilityRole="alert" accessibilityLabel={message}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorText}>{message}</Text>
      {primaryActionLabel && onPrimaryAction && (
        <PrimaryButton label={primaryActionLabel} onPress={onPrimaryAction} />
      )}
      {secondaryActionLabel && onSecondaryAction && (
        <SecondaryButton label={secondaryActionLabel} onPress={onSecondaryAction} />
      )}
    </View>
  );
}

function PrimaryButton({
  label,
  accessibilityHint,
  onPress,
  disabled = false,
}: {
  label: string;
  accessibilityHint?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.primaryButton, disabled && styles.disabledButton]}
    >
      <Text style={[styles.primaryButtonText, disabled && styles.disabledButtonText]}>
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
}: {
  label: string;
  accessibilityHint?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.secondaryButton, disabled && styles.disabledButton]}
    >
      <Text style={[styles.secondaryButtonText, disabled && styles.disabledButtonText]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
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
    paddingBottom: 110,
    gap: 18,
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
  brandLogoImage: {
    borderRadius: 18,
    height: 84,
    width: 84,
  },
  brandMark: {
    alignItems: "center",
    backgroundColor: "#fbfaf5",
    borderColor: "#ebe7dd",
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
    backgroundColor: "#d8e1d8",
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
    color: colors.primaryDark,
    fontSize: 32,
    fontWeight: "900",
  },
  brandSubtitle: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0,
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
  tabBar: {
    backgroundColor: "#e8f1ee",
    borderColor: "#c3cbc6",
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
  tabButton: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    gap: 3,
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  selectedTabButton: {
    backgroundColor: "#115e59",
  },
  tabButtonText: {
    color: "#28332d",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  tabIconBadge: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: 14,
    borderWidth: 2,
    height: 28,
    justifyContent: "center",
    minWidth: 34,
    paddingHorizontal: 6,
  },
  selectedTabIconBadge: {
    backgroundColor: colors.surface,
    borderColor: colors.surface,
  },
  tabIconText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 16,
    textAlign: "center",
  },
  selectedTabIconText: {
    color: colors.primaryDark,
  },
  selectedIcon: {
    height: 18,
    position: "relative",
    width: 22,
  },
  selectedIconShort: {
    backgroundColor: colors.primaryDark,
    borderRadius: 2,
    height: 4,
    left: 3,
    position: "absolute",
    top: 10,
    transform: [{ rotate: "45deg" }],
    width: 9,
  },
  selectedIconLong: {
    backgroundColor: colors.primaryDark,
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
    borderColor: colors.primary,
    borderRightWidth: 4,
    borderTopWidth: 4,
    height: 16,
    position: "absolute",
    top: 1,
    transform: [{ rotate: "-45deg" }],
    width: 16,
  },
  homeBody: {
    backgroundColor: colors.primary,
    borderRadius: 2,
    height: 11,
    width: 16,
  },
  navBusIcon: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 4,
    height: 22,
    justifyContent: "space-between",
    padding: 4,
    width: 22,
  },
  navBusWindow: {
    backgroundColor: colors.surface,
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
    backgroundColor: colors.surface,
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
    backgroundColor: colors.primary,
    borderRadius: 2,
    height: 20,
    position: "absolute",
    width: 5,
  },
  assistIconHorizontal: {
    backgroundColor: colors.primary,
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
    backgroundColor: colors.primary,
    borderRadius: 6,
    height: 11,
    marginBottom: 2,
    width: 11,
  },
  profileIconBody: {
    backgroundColor: colors.primary,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    height: 8,
    width: 18,
  },
  tabSelectedText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
  },
  selectedTabButtonText: {
    color: "#ffffff",
  },
  sectionHeader: {
    gap: 4,
  },
  eyebrow: {
    color: "#115e59",
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
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#6a756f",
    borderRadius: 8,
    borderWidth: 2,
    flexDirection: "row",
    gap: 14,
    minHeight: 92,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  assistanceOption: {
    borderColor: "#0f766e",
  },
  phoneOption: {
    borderColor: "#4b5563",
  },
  selectedToggleRow: {
    borderWidth: 4,
  },
  selectedAssistanceOption: {
    backgroundColor: "#ecfdf5",
    borderColor: "#047857",
  },
  selectedPhoneOption: {
    backgroundColor: "#eff6ff",
    borderColor: "#1d4ed8",
  },
  optionVisualGroup: {
    alignItems: "center",
    gap: 8,
  },
  optionIcon: {
    alignItems: "center",
    backgroundColor: "#f8faf7",
    borderColor: "#6a756f",
    borderRadius: 8,
    borderWidth: 2,
    height: 48,
    justifyContent: "center",
    width: 54,
  },
  assistanceIcon: {
    backgroundColor: "#d1fae5",
    borderColor: "#0f766e",
  },
  phoneIcon: {
    backgroundColor: "#dbeafe",
    borderColor: "#1d4ed8",
  },
  selectedOptionIcon: {
    backgroundColor: "#115e59",
    borderColor: "#115e59",
  },
  optionIconText: {
    color: "#10231b",
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
  },
  selectedOptionIconText: {
    color: "#ffffff",
  },
  selectionIndicator: {
    alignItems: "center",
    borderColor: "#6a756f",
    borderRadius: 18,
    borderWidth: 2,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  selectedSelectionIndicator: {
    backgroundColor: "#115e59",
    borderColor: "#115e59",
  },
  highContrastIndicator: {
    borderColor: "#ffffff",
  },
  selectionIndicatorText: {
    color: "#10231b",
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 28,
  },
  selectedSelectionIndicatorText: {
    color: "#ffffff",
  },
  toggleTextGroup: {
    flex: 1,
    gap: 2,
  },
  toggleText: {
    color: "#10231b",
    fontSize: 20,
    fontWeight: "700",
  },
  selectionStatus: {
    color: "#44524a",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "right",
    width: 78,
  },
  selectedSelectionStatus: {
    color: "#115e59",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#115e59",
    borderRadius: 8,
    minHeight: 60,
    justifyContent: "center",
    padding: 16,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#115e59",
    borderRadius: 8,
    borderWidth: 2,
    minHeight: 60,
    justifyContent: "center",
    padding: 16,
  },
  disabledButton: {
    backgroundColor: colors.disabledBackground,
    borderColor: colors.border,
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
    color: "#115e59",
    fontSize: 19,
    fontWeight: "800",
    textAlign: "center",
  },
  busCard: {
    backgroundColor: "#ffffff",
    borderColor: "#6a756f",
    borderRadius: 8,
    borderWidth: 2,
    gap: 4,
    padding: 16,
  },
  arrivalCard: {
    backgroundColor: "#ffffff",
    borderColor: "#6a756f",
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
    color: "#10231b",
    fontSize: 48,
    fontWeight: "900",
  },
  etaBlock: {
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderColor: "#115e59",
    borderRadius: 8,
    borderWidth: 2,
    minWidth: 82,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  etaNumber: {
    color: "#115e59",
    fontSize: 32,
    fontWeight: "900",
  },
  etaLabel: {
    color: "#115e59",
    fontSize: 13,
    fontWeight: "900",
  },
  destinationText: {
    color: "#10231b",
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
    backgroundColor: "#f1f5f3",
    borderColor: "#c3cbc6",
    borderRadius: 8,
    borderWidth: 1,
    color: "#28332d",
    fontSize: 15,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  selectHint: {
    color: "#115e59",
    fontSize: 16,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  selectedCard: {
    borderColor: "#115e59",
    borderWidth: 4,
  },
  busTitle: {
    color: "#10231b",
    fontSize: 24,
    fontWeight: "800",
  },
  bodyText: {
    color: colors.body,
    fontSize: 17,
    lineHeight: 24,
  },
  summaryRow: {
    backgroundColor: "#ffffff",
    borderColor: "#c3cbc6",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  summaryLabel: {
    color: "#44524a",
    fontSize: 15,
    fontWeight: "700",
  },
  summaryValue: {
    color: "#10231b",
    fontSize: 19,
    fontWeight: "700",
    lineHeight: 26,
  },
  inputGroup: {
    gap: 6,
  },
  textInput: {
    backgroundColor: "#ffffff",
    borderColor: "#6a756f",
    borderRadius: 8,
    borderWidth: 2,
    color: "#10231b",
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
    backgroundColor: "#ffffff",
    borderColor: "#6a756f",
    borderRadius: 8,
    borderWidth: 2,
    flex: 1,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  selectedMethodButton: {
    backgroundColor: "#115e59",
    borderColor: "#115e59",
  },
  methodButtonText: {
    color: "#28332d",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  selectedMethodButtonText: {
    color: "#ffffff",
  },
  statusPanel: {
    backgroundColor: "#ffffff",
    borderColor: "#115e59",
    borderRadius: 8,
    borderWidth: 3,
    gap: 8,
    padding: 18,
  },
  statusLabel: {
    color: "#44524a",
    fontSize: 16,
    fontWeight: "700",
  },
  statusValue: {
    color: "#10231b",
    fontSize: 28,
    fontWeight: "900",
  },
  confirmationText: {
    color: "#10231b",
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 25,
  },
  eventRow: {
    backgroundColor: "#ffffff",
    borderColor: "#c3cbc6",
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  eventStatus: {
    color: "#10231b",
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
    backgroundColor: "#fff1f2",
    borderColor: colors.error,
    borderRadius: radius.md,
    borderWidth: 2,
    gap: spacing.md,
    padding: spacing.lg,
  },
  visualAlert: {
    backgroundColor: "#fff7ed",
    borderColor: "#9a3412",
    borderRadius: 8,
    borderWidth: 3,
    gap: 6,
    padding: 16,
  },
  visualAlertTitle: {
    color: "#10231b",
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 30,
  },
  highContrastAlert: {
    backgroundColor: "#000000",
    borderColor: "#ffffff",
  },
  highContrastControl: {
    backgroundColor: "#000000",
    borderColor: "#ffffff",
  },
  highContrastText: {
    color: "#ffffff",
  },
  highContrastMutedText: {
    color: "#f3f4f6",
  },
  largeBody: {
    fontSize: 21,
    lineHeight: 29,
  },
});


