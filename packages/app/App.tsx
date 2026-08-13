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
import {
  AccessibilityRequirements,
  AssistanceRequestStatus,
  AssistanceType,
  Bus,
  StatusUpdateMessage,
  VehicleStatus,
} from "@buspass/shared";
import {
  cancelAssistanceRequest,
  createAssistanceRequest,
  fetchMockBuses,
} from "./src/api/assistanceApi";
import { subscribeToRequestStatus } from "./src/api/statusSocket";

type Screen = "ACCESSIBILITY" | "BUS" | "CONFIRM" | "STATUS";

const defaultRequirements: AccessibilityRequirements = {
  wheelchairRamp: true,
  busAudioIdentification: false,
};

const destination = "Kent Ridge Terminal";
const boardingStop = "Changi Airport Terminal 1";
const sessionId = "demo-passenger-session";

export default function App() {
  const [screen, setScreen] = useState<Screen>("ACCESSIBILITY");
  const [requirements, setRequirements] = useState(defaultRequirements);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [selectedBus, setSelectedBus] = useState<Bus | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [requestStatus, setRequestStatus] = useState<AssistanceRequestStatus | null>(null);
  const [vehicleStatus, setVehicleStatus] = useState<VehicleStatus | null>(null);
  const [events, setEvents] = useState<StatusUpdateMessage[]>([]);
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
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            AccessibilityInfo.announceForAccessibility(
              `Bus ${message.busService} has received your assistance request.`
            );
          }
        }

        if (message.type === "VEHICLE_STATUS") {
          setVehicleStatus(message.status);
          if (message.status === "APPROACHING") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            AccessibilityInfo.announceForAccessibility(`Bus ${message.busService} is approaching.`);
          }
          if (message.status === "ARRIVED") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            AccessibilityInfo.announceForAccessibility(`Bus ${message.busService} has arrived.`);
          }
        }
      },
      () => setError("Live status connection was interrupted.")
    );
  }, [requestId]);

  async function loadBuses() {
    setIsLoading(true);
    setError(null);
    try {
      const nearbyBuses = await fetchMockBuses("191");
      setBuses(nearbyBuses);
      setSelectedBus(nearbyBuses[0] ?? null);
      setScreen("BUS");
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unable to load buses.");
    } finally {
      setIsLoading(false);
    }
  }

  async function submitRequest() {
    if (!selectedBus || assistanceTypes.length === 0 || isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await createAssistanceRequest({
        sessionId,
        busService: selectedBus.busService,
        busId: selectedBus.busId,
        boardingStop,
        destination,
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
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.appTitle}>BusPass Assistance</Text>
        <Text style={styles.subtitle}>Request assistance from Service 191</Text>

        {screen === "ACCESSIBILITY" && (
          <View style={styles.section}>
            <Text style={styles.heading}>Accessibility Setup</Text>
            <ToggleRow
              label="Mobility Assistance"
              description="Request wheelchair ramp"
              enabled={requirements.wheelchairRamp}
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
              onPress={() =>
                setRequirements((current) => ({
                  ...current,
                  busAudioIdentification: !current.busAudioIdentification,
                }))
              }
            />
            <PrimaryButton
              label="Continue to nearby buses"
              onPress={loadBuses}
              disabled={assistanceTypes.length === 0}
            />
          </View>
        )}

        {screen === "BUS" && (
          <View style={styles.section}>
            <Text style={styles.heading}>Bus Selection</Text>
            {buses.map((bus) => (
              <Pressable
                key={bus.busId}
                accessibilityRole="button"
                accessibilityLabel={`Bus ${bus.busService}, destination ${destination}, arriving in ${Math.ceil(
                  bus.estimatedArrivalSeconds / 60
                )} minutes. Double tap to select.`}
                onPress={() => setSelectedBus(bus)}
                style={[styles.busCard, selectedBus?.busId === bus.busId && styles.selectedCard]}
              >
                <Text style={styles.busTitle}>Bus {bus.busService}</Text>
                <Text style={styles.bodyText}>Vehicle: {bus.busId}</Text>
                <Text style={styles.bodyText}>Destination: {destination}</Text>
                <Text style={styles.bodyText}>Arrives in {Math.ceil(bus.estimatedArrivalSeconds / 60)} min</Text>
                <Text style={styles.bodyText}>Wheelchair spaces: {bus.wheelchairSpaces}</Text>
              </Pressable>
            ))}
            <PrimaryButton label="Review assistance request" onPress={() => setScreen("CONFIRM")} />
          </View>
        )}

        {screen === "CONFIRM" && selectedBus && (
          <View style={styles.section}>
            <Text style={styles.heading}>Confirm Assistance</Text>
            <SummaryRow label="Bus" value={`${selectedBus.busService} (${selectedBus.busId})`} />
            <SummaryRow label="Boarding stop" value={boardingStop} />
            <SummaryRow label="Destination" value={destination} />
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
  onPress,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: enabled }}
      accessibilityLabel={`${label}. ${description}. ${enabled ? "Selected" : "Not selected"}.`}
      onPress={onPress}
      style={styles.toggleRow}
    >
      <Text style={styles.toggleMark}>{enabled ? "[x]" : "[ ]"}</Text>
      <View style={styles.toggleTextGroup}>
        <Text style={styles.toggleText}>{label}</Text>
        <Text style={styles.bodyText}>{description}</Text>
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8faf7",
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
});
