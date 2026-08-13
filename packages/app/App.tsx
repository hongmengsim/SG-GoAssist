import React, { useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
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
  StatusUpdateMessage,
  VehicleStatus,
} from "@buspass/shared";
import {
  cancelAssistanceRequest,
  createAssistanceRequest,
  fetchBusStopArrivals,
  findNearbyBusStops,
} from "./src/api/assistanceApi";
import { subscribeToRequestStatus } from "./src/api/statusSocket";

type Screen = "LOCATION" | "STOP" | "BUS" | "ACCESSIBILITY" | "CONFIRM" | "STATUS";

const defaultRequirements: AccessibilityRequirements = {
  wheelchairRamp: true,
  busAudioIdentification: false,
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
const sessionId = "demo-passenger-session";

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
            <Text style={styles.appTitle}>BusPass Assistance</Text>
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
      <BusPassApp />
    </AppErrorBoundary>
  );
}

function BusPassApp() {
  const [screen, setScreen] = useState<Screen>("LOCATION");
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assistanceTypes = useMemo(() => requirementsToAssistanceTypes(requirements), [requirements]);
  const selectedNeeds = useMemo(
    () => assistanceTypes.map(readableAssistanceType).join(", "),
    [assistanceTypes]
  );

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
              Haptics.NotificationFeedbackType.Warning
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

  function notifyPassenger(message: string, feedbackType: Haptics.NotificationFeedbackType) {
    setVisualAlert(message);
    AccessibilityInfo.announceForAccessibility(message);
    if (appPreferences.hapticAlerts) {
      Haptics.notificationAsync(feedbackType);
    }
  }

  async function findMyBusStop() {
    setIsLoading(true);
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
    }
  }

  async function loadManualStops() {
    const result = await findNearbyBusStops({
      latitude: 1.2942,
      longitude: 103.7711,
      accuracyMeters: 0,
    });
    setNearbyStops(result.stops);
    setSelectedStop(result.stops[0] ?? null);
    setScreen("STOP");
  }

  async function confirmBusStop(stop = selectedStop) {
    if (!stop) {
      return;
    }

    setIsLoading(true);
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
  }

  async function submitRequest() {
    if (!selectedBus || !selectedStop || assistanceTypes.length === 0 || isLoading) {
      return;
    }

    setIsLoading(true);
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
    }
  }

  async function cancelRequest() {
    if (!requestId) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await cancelAssistanceRequest(requestId);
    } catch {
      setError("Unable to cancel request. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, appPreferences.highContrast && styles.highContrastSafeArea]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.appTitle, appPreferences.highContrast && styles.highContrastText]}>
          BusPass Assistance
        </Text>
        <Text style={[styles.subtitle, appPreferences.highContrast && styles.highContrastMutedText]}>
          Request assistance from Service 191
        </Text>

        {visualAlert && (
          <View
            style={[styles.visualAlert, appPreferences.highContrast && styles.highContrastAlert]}
            accessible
            accessibilityRole="alert"
            accessibilityLabel={visualAlert}
          >
            <Text style={[styles.visualAlertTitle, appPreferences.highContrast && styles.highContrastText]}>
              {visualAlert.toUpperCase()}
            </Text>
            <Text style={[styles.bodyText, appPreferences.highContrast && styles.highContrastMutedText]}>
              {appPreferences.hapticAlerts ? "Haptic alert sent." : "Haptic alerts are off."}
            </Text>
          </View>
        )}

        {screen === "LOCATION" && (
          <View style={styles.section}>
            <Text style={[styles.heading, appPreferences.highContrast && styles.highContrastText]}>
              Find your bus
            </Text>
            <Text style={[styles.bodyText, appPreferences.largeText && styles.largeBody]}>
              We use your location once to identify nearby bus stops. You will still choose the bus stop and bus yourself.
            </Text>
            <PrimaryButton label="Use my location" onPress={findMyBusStop} disabled={isLoading} />
            <SecondaryButton label="Select bus stop manually" onPress={loadManualStops} disabled={isLoading} />
          </View>
        )}

        {screen === "STOP" && (
          <View style={styles.section}>
            <Text style={[styles.heading, appPreferences.highContrast && styles.highContrastText]}>
              Confirm Bus Stop
            </Text>
            {selectedStop ? (
              <View style={styles.statusPanel} accessible accessibilityLabel={stopAccessibilityLabel(selectedStop)}>
                <Text style={styles.statusLabel}>Nearest bus stop</Text>
                <Text style={styles.statusValue}>{selectedStop.description}</Text>
                <Text style={styles.bodyText}>{selectedStop.roadName}</Text>
                <Text style={styles.bodyText}>Bus Stop {selectedStop.busStopCode}</Text>
                <Text style={styles.bodyText}>About {selectedStop.distanceMeters} m away</Text>
              </View>
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
              <Pressable
                key={stop.busStopCode}
                accessibilityRole="button"
                accessibilityLabel={`${stop.description}, ${stop.roadName}, bus stop ${stop.busStopCode}, approximately ${stop.distanceMeters} metres away. Select bus stop.`}
                onPress={() => setSelectedStop(stop)}
                style={[styles.busCard, selectedStop?.busStopCode === stop.busStopCode && styles.selectedCard]}
              >
                <Text style={styles.busTitle}>{stop.description}</Text>
                <Text style={styles.bodyText}>{stop.roadName}</Text>
                <Text style={styles.bodyText}>Bus Stop {stop.busStopCode}</Text>
                <Text style={styles.bodyText}>{stop.distanceMeters} m away</Text>
              </Pressable>
            ))}
            <SecondaryButton label="Refresh location" onPress={findMyBusStop} disabled={isLoading} />
          </View>
        )}

        {screen === "ACCESSIBILITY" && (
          <View style={styles.section}>
            <Text style={styles.heading}>Accessibility Setup</Text>
            <ToggleRow
              label="Mobility Assistance"
              description="Request wheelchair ramp"
              enabled={requirements.wheelchairRamp}
              highContrast={appPreferences.highContrast}
              largeText={appPreferences.largeText}
              onPress={() =>
                setRequirements((current) => ({
                  ...current,
                  wheelchairRamp: !current.wheelchairRamp,
                }))
              }
            />
            <ToggleRow
              label="Bus Identification Assistance"
              description="Receive assistance identifying the correct approaching bus"
              enabled={requirements.busAudioIdentification}
              highContrast={appPreferences.highContrast}
              largeText={appPreferences.largeText}
              onPress={() =>
                setRequirements((current) => ({
                  ...current,
                  busAudioIdentification: !current.busAudioIdentification,
                }))
              }
            />
            <Text style={[styles.heading, appPreferences.highContrast && styles.highContrastText]}>
              Phone Accessibility
            </Text>
            <ToggleRow
              label="Screen-reader optimised"
              description="Use longer labels and spoken announcements"
              enabled={appPreferences.screenReaderOptimised}
              highContrast={appPreferences.highContrast}
              largeText={appPreferences.largeText}
              onPress={() =>
                setAppPreferences((current) => ({
                  ...current,
                  screenReaderOptimised: !current.screenReaderOptimised,
                }))
              }
            />
            <ToggleRow
              label="Haptic alerts"
              description="Vibrate for acknowledgement, approach, and arrival"
              enabled={appPreferences.hapticAlerts}
              highContrast={appPreferences.highContrast}
              largeText={appPreferences.largeText}
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
              onPress={() =>
                setAppPreferences((current) => ({
                  ...current,
                  highContrast: !current.highContrast,
                }))
              }
            />
            <PrimaryButton
              label="Review assistance request"
              onPress={() => setScreen("CONFIRM")}
              disabled={assistanceTypes.length === 0 || !selectedBus}
            />
          </View>
        )}

        {screen === "BUS" && (
          <View style={styles.section}>
            <Text style={styles.heading}>Which bus are you taking?</Text>
            {selectedStop && (
              <Text style={styles.bodyText}>
                Bus Stop {selectedStop.busStopCode} · {selectedStop.description}
              </Text>
            )}
            {arrivingBuses.map((bus) => (
              <Pressable
                key={`${bus.busId}-${bus.arrivalSlot}`}
                accessibilityRole="button"
                accessibilityLabel={`Bus ${bus.serviceNo}, towards ${bus.destination}, arriving in approximately ${Math.ceil(
                  bus.etaSeconds / 60
                )} minutes, ${bus.wheelchairAccessible ? "wheelchair accessible" : "accessibility not indicated"}. Select bus.`}
                onPress={() => selectArrival(bus)}
                style={[styles.busCard, selectedArrival?.busId === bus.busId && styles.selectedCard]}
              >
                <Text style={styles.busTitle}>Bus {bus.serviceNo}</Text>
                <Text style={styles.bodyText}>Towards: {bus.destination}</Text>
                <Text style={styles.bodyText}>Arrives in {Math.ceil(bus.etaSeconds / 60)} min</Text>
                <Text style={styles.bodyText}>Mapped AV: {bus.busId}</Text>
                <Text style={styles.bodyText}>
                  {bus.wheelchairAccessible ? "Wheelchair accessible" : "Accessibility not indicated"}
                </Text>
              </Pressable>
            ))}
            <PrimaryButton label="Choose assistance" onPress={() => setScreen("ACCESSIBILITY")} disabled={!selectedArrival} />
          </View>
        )}

        {screen === "CONFIRM" && selectedBus && (
          <View style={styles.section}>
            <Text style={styles.heading}>Confirm Assistance</Text>
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
            <PrimaryButton label="Send assistance request" onPress={submitRequest} disabled={isLoading} />
          </View>
        )}

        {screen === "STATUS" && selectedBus && (
          <View style={styles.section}>
            <Text style={styles.heading}>Assistance Status</Text>
            <View
              style={styles.statusPanel}
              accessible
              accessibilityLabel={`Request status ${requestStatus ?? "pending"}. Vehicle status ${
                vehicleStatus ?? "not reported"
              }.`}
            >
              <Text style={styles.statusLabel}>Request</Text>
              <Text style={styles.statusValue}>{requestStatus ?? "CONNECTING"}</Text>
              <Text style={styles.bodyText}>{selectedNeeds} requested for Bus {selectedBus.busService}.</Text>
              {requestStatus === "ACKNOWLEDGED" && (
                <Text style={styles.confirmationText}>Bus {selectedBus.busService} has received your request.</Text>
              )}
              <Text style={styles.bodyText}>Every spoken update is also displayed on this screen.</Text>
              <Text style={styles.bodyText}>
                {appPreferences.hapticAlerts ? "Haptic alerts are enabled." : "Haptic alerts are off."}
              </Text>
              <Text style={styles.statusLabel}>Vehicle</Text>
              <Text style={styles.statusValue}>{vehicleStatus ?? "WAITING"}</Text>
              <Text style={styles.bodyText}>Request ID: {requestId}</Text>
            </View>

            {requestStatus === "ACKNOWLEDGED" && (
              <SecondaryButton label="Cancel request" onPress={cancelRequest} disabled={isLoading} />
            )}

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

        {isLoading && <ActivityIndicator size="large" accessibilityLabel="Loading" />}
        {error && <Text style={styles.errorText}>{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleRow({
  label,
  description,
  enabled,
  highContrast = false,
  largeText = false,
  onPress,
}: {
  label: string;
  description: string;
  enabled: boolean;
  highContrast?: boolean;
  largeText?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: enabled }}
      accessibilityLabel={`${label}. ${description}. ${enabled ? "Selected" : "Not selected"}.`}
      onPress={onPress}
      style={[styles.toggleRow, highContrast && styles.highContrastControl]}
    >
      <Text style={[styles.toggleMark, highContrast && styles.highContrastText]}>{enabled ? "[x]" : "[ ]"}</Text>
      <View style={styles.toggleTextGroup}>
        <Text style={[styles.toggleText, largeText && styles.largeBody, highContrast && styles.highContrastText]}>
          {label}
        </Text>
        <Text style={[styles.bodyText, largeText && styles.largeBody, highContrast && styles.highContrastMutedText]}>
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.primaryButton, disabled && styles.disabledButton]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.secondaryButton, disabled && styles.disabledButton]}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
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
  return types;
}

function readableAssistanceType(type: AssistanceType) {
  const labels: Record<AssistanceType, string> = {
    WHEELCHAIR_RAMP: "Wheelchair ramp",
    BUS_AUDIO_IDENTIFICATION: "Bus identification assistance",
  };
  return labels[type];
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
    backgroundColor: "#f8faf7",
  },
  highContrastSafeArea: {
    backgroundColor: "#000000",
  },
  container: {
    padding: 20,
    gap: 18,
  },
  appTitle: {
    color: "#10231b",
    fontSize: 34,
    fontWeight: "800",
  },
  subtitle: {
    color: "#44524a",
    fontSize: 18,
    lineHeight: 26,
  },
  section: {
    gap: 14,
  },
  heading: {
    color: "#10231b",
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
    minHeight: 76,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  toggleMark: {
    color: "#10231b",
    fontSize: 22,
    fontWeight: "800",
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
    opacity: 0.45,
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
    color: "#28332d",
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
    color: "#9f1239",
    fontSize: 18,
    fontWeight: "700",
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
