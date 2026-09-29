import { usePresentationSizes } from "../accessibility/AccessibilityRuntime";
import React from "react";
import { StyleSheet, View } from "react-native";
import {
  PassengerPressable as Pressable,
  PassengerText as Text,
} from "../accessibility/PassengerControls";
import {
  Accessibility,
  BusFront,
  Clock,
  Footprints,
  MapPin,
  ShieldCheck,
  TriangleAlert,
  Umbrella,
} from "../components/AppIcons";
import type {
  PassengerContextSnapshot,
  PassengerStopContext,
} from "@buspass/shared";

type JourneyHubProps = {
  snapshot: PassengerContextSnapshot;
  simplified: boolean;
  highContrast: boolean;
  lightMode: boolean;
  onChooseStop: (stop: PassengerStopContext["stop"]) => void;
  onCompareNearby: () => void;
  onFocusedAssist: () => void;
  onRefresh: () => void;
  favourite: boolean;
  savedStopNames: string[];
  recentJourneyLabel?: string;
  onToggleFavourite: () => void;
  onRepeatRecent?: () => void;
};

export function JourneyHub({
  snapshot,
  simplified,
  highContrast,
  lightMode,
  onChooseStop,
  onCompareNearby,
  onFocusedAssist,
  onRefresh,
  favourite,
  savedStopNames,
  recentJourneyLabel,
  onToggleFavourite,
  onRepeatRecent,
}: JourneyHubProps) {
  const stop = snapshot.nearbyStops[0];
  if (!stop) return null;
  const sizes = usePresentationSizes();
  const palette = resolvePalette(lightMode, highContrast);
  const services = stop.arrivals.slice(0, 3);
  const advisory = snapshot.advisories[0];
  const ageMinutes = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(snapshot.generatedAt)) / 60_000),
  );

  return (
    <View
      style={[
        styles.shell,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
      accessibilityLabel={`Journey hub. Recommended stop ${stop.stop.description}, bus stop ${stop.stop.busStopCode}.`}
    >
      <View style={styles.eyebrowRow}>
        <View
          style={[
            styles.iconTile,
            {
              width: sizes.featureContainer,
              height: sizes.featureContainer,
              flexShrink: 0,
            },
            { backgroundColor: palette.tint },
          ]}
        >
          <MapPin size={28} color={palette.accent} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.eyebrow, { color: palette.secondary }]}>
            RECOMMENDED STOP
          </Text>
          <Text style={[styles.title, { color: palette.text }]}>
            {stop.stop.description}
          </Text>
          <Text style={[styles.meta, { color: palette.secondary }]}>
            Stop {stop.stop.busStopCode}
          </Text>
        </View>
      </View>

      <View style={styles.chipRow}>
        <StatusChip
          icon={Footprints}
          label={`${stop.distanceMeters} m`}
          palette={palette}
        />
        <StatusChip
          icon={Clock}
          label={`${stop.walkingMinutes} min walk`}
          palette={palette}
        />
        <StatusChip
          icon={Umbrella}
          label={availabilityLabel(stop.amenities.shelter, "Sheltered")}
          palette={palette}
        />
        <StatusChip
          icon={ShieldCheck}
          label={availabilityLabel(stop.amenities.stepFreeKerb, "Step-free")}
          palette={palette}
        />
      </View>

      {!simplified ? (
        <>
          <View
            style={[styles.servicesPanel, { backgroundColor: palette.tint }]}
          >
            <View style={styles.servicesHeading}>
              <BusFront size={22} color={palette.accent} />
              <Text style={[styles.servicesTitle, { color: palette.text }]}>
                Next services
              </Text>
            </View>
            <View style={styles.serviceRow}>
              {services.length ? (
                services.map((service) => (
                  <View
                    key={service.serviceNo}
                    style={[
                      styles.serviceBadge,
                      { borderColor: palette.accent },
                    ]}
                  >
                    <Text style={[styles.serviceNo, { color: palette.text }]}>
                      {service.serviceNo}
                    </Text>
                    <Text
                      style={[styles.serviceEta, { color: palette.secondary }]}
                    >
                      {arrivalLabel(service.buses[0]?.etaSeconds)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={[styles.meta, { color: palette.secondary }]}>
                  Arrival information unavailable
                </Text>
              )}
            </View>
          </View>
          {advisory ? (
            <View style={styles.advisoryRow}>
              <TriangleAlert size={20} color={palette.warning} />
              <Text
                style={[styles.advisoryText, { color: palette.text }]}
                numberOfLines={2}
              >
                {advisory.title}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}

      <Text style={[styles.provenance, { color: palette.secondary }]}>
        {snapshot.provenance.sourceLabel} ·{" "}
        {ageMinutes === 0 ? "Updated now" : `Updated ${ageMinutes} min ago`}
      </Text>

      <ActionButton
        label="Choose this stop"
        onPress={() => onChooseStop(stop.stop)}
        primary
        palette={palette}
      />
      {!simplified ? (
        <View style={styles.secondaryActions}>
          <ActionButton
            label="Compare nearby"
            onPress={onCompareNearby}
            palette={palette}
          />
          <ActionButton label="Refresh" onPress={onRefresh} palette={palette} />
        </View>
      ) : null}
      {!simplified ? (
        <View style={[styles.savedPanel, { borderColor: palette.border }]}>
          <Text style={[styles.servicesTitle, { color: palette.text }]}>
            Saved and recent
          </Text>
          {savedStopNames.length ? (
            <Text
              style={[styles.meta, { color: palette.secondary }]}
              numberOfLines={2}
            >
              Saved stops: {savedStopNames.slice(0, 2).join(" · ")}
            </Text>
          ) : null}
          <View style={styles.secondaryActions}>
            <ActionButton
              label={favourite ? "Remove saved stop" : "Save this stop"}
              onPress={onToggleFavourite}
              palette={palette}
            />
            {recentJourneyLabel && onRepeatRecent ? (
              <ActionButton
                label={`Repeat ${recentJourneyLabel}`}
                onPress={onRepeatRecent}
                palette={palette}
              />
            ) : null}
          </View>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="I'm at a bus stop"
        onPress={onFocusedAssist}
        style={({ pressed }) => [
          styles.focusedAction,
          { opacity: pressed ? 0.72 : 1 },
        ]}
      >
        <Accessibility size={24} color={palette.accent} />
        <Text style={[styles.focusedText, { color: palette.accent }]}>
          I’m at a bus stop
        </Text>
      </Pressable>
    </View>
  );
}

function StatusChip({ icon: Icon, label, palette }: any) {
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: palette.tint, borderColor: palette.border },
      ]}
    >
      <Icon size={18} color={palette.accent} />
      <Text style={[styles.chipText, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

function ActionButton({ label, onPress, primary = false, palette }: any) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: primary ? palette.accent : palette.surface,
          borderColor: palette.accent,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.actionText,
          { color: primary ? palette.onAccent : palette.accent },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function availabilityLabel(value: "YES" | "NO" | "UNKNOWN", label: string) {
  if (value === "YES") return label;
  if (value === "NO") return `No ${label.toLowerCase()}`;
  return `${label} unknown`;
}

function arrivalLabel(seconds?: number) {
  if (seconds === undefined) return "No live time";
  if (seconds < 60) return "Arriving";
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

function resolvePalette(lightMode: boolean, highContrast: boolean) {
  if (!lightMode)
    return {
      surface: "#092F34",
      tint: "#123E44",
      text: "#FFFFFF",
      secondary: "#D9F2F2",
      accent: "#86E6F0",
      onAccent: "#001416",
      border: highContrast ? "#FFFFFF" : "#76A9AE",
      warning: "#FFD166",
    };
  return {
    surface: "#FFFFFF",
    tint: highContrast ? "#FFFFFF" : "#EAF5F5",
    text: "#17363A",
    secondary: "#536C70",
    accent: highContrast ? "#004A51" : "#0B6670",
    onAccent: "#FFFFFF",
    border: highContrast ? "#000000" : "#A8C2C5",
    warning: "#8A4B00",
  };
}

const styles = StyleSheet.create({
  shell: { borderWidth: 2, borderRadius: 24, padding: 18, gap: 14 },
  eyebrowRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  iconTile: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  flex: { flex: 1 },
  eyebrow: { fontSize: 13, fontWeight: "900", letterSpacing: 1 },
  title: { fontSize: 25, lineHeight: 31, fontWeight: "900" },
  meta: { fontSize: 16, lineHeight: 22, fontWeight: "600" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 48,
    maxWidth: "100%",
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 21,
    paddingHorizontal: 11,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  chipText: { fontSize: 16, fontWeight: "800", flexShrink: 1 },
  servicesPanel: { borderRadius: 16, padding: 12, gap: 10 },
  servicesHeading: { flexDirection: "row", gap: 8, alignItems: "center" },
  servicesTitle: { fontSize: 17, fontWeight: "900" },
  serviceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  serviceBadge: {
    minHeight: 52,
    minWidth: 82,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  serviceNo: { fontSize: 19, fontWeight: "900" },
  serviceEta: { fontSize: 13, fontWeight: "700" },
  advisoryRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  advisoryText: { flex: 1, fontSize: 15, lineHeight: 21, fontWeight: "700" },
  provenance: { fontSize: 13, lineHeight: 18, fontWeight: "700" },
  action: {
    minHeight: 64,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  actionText: { fontSize: 17, fontWeight: "900", textAlign: "center" },
  secondaryActions: { flexDirection: "column", alignItems: "stretch", gap: 10 },
  savedPanel: { borderTopWidth: 1, gap: 8, paddingTop: 12 },
  focusedAction: {
    minHeight: 48,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  focusedText: { fontSize: 16, fontWeight: "900" },
});
