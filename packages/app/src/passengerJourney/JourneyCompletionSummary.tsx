import { usePresentationSizes } from "../accessibility/AccessibilityRuntime";
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  PassengerPressable as Pressable,
  PassengerText as Text,
} from "../accessibility/PassengerControls";
import {
  Accessibility,
  Bookmark,
  Check,
  Clock,
  RotateCcw,
  Route,
  ThumbsDown,
  ThumbsUp,
} from "../components/AppIcons";

export type JourneyCompletionSummaryProps = {
  serviceNo: string;
  destinationName: string;
  elapsedMinutes: number;
  stopsTravelled: number;
  assistanceOutcome: string;
  destinationSaved: boolean;
  simplified: boolean;
  lightMode: boolean;
  highContrast: boolean;
  onRepeat: () => void;
  onToggleSaveDestination: () => void;
  onPlanAnother: () => void;
};

export function JourneyCompletionSummary({
  serviceNo,
  destinationName,
  elapsedMinutes,
  stopsTravelled,
  assistanceOutcome,
  destinationSaved,
  simplified,
  lightMode,
  highContrast,
  onRepeat,
  onToggleSaveDestination,
  onPlanAnother,
}: JourneyCompletionSummaryProps) {
  const [feedback, setFeedback] = useState<"HELPFUL" | "NOT_HELPFUL" | null>(
    null,
  );
  const sizes = usePresentationSizes();
  const palette = resolvePalette(lightMode, highContrast);

  return (
    <View
      testID="journey-completion-summary"
      accessibilityLabel={`Journey complete. Bus ${serviceNo} to ${destinationName}. ${stopsTravelled} stops travelled in about ${elapsedMinutes} minutes. ${assistanceOutcome}.`}
      style={[
        styles.shell,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <View style={styles.headingRow}>
        <View
          style={[
            styles.completeIcon,
            {
              width: sizes.featureContainer,
              height: sizes.featureContainer,
              flexShrink: 0,
            },
            { backgroundColor: palette.accent },
          ]}
        >
          <Check size={28} strokeWidth={3} color={palette.onAccent} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.eyebrow, { color: palette.secondary }]}>
            ARRIVED
          </Text>
          <Text style={[styles.title, { color: palette.text }]}>
            {destinationName}
          </Text>
          <Text style={[styles.subtitle, { color: palette.secondary }]}>
            Bus {serviceNo}
          </Text>
        </View>
      </View>

      {!simplified ? (
        <View style={styles.metrics}>
          <Metric
            icon={Clock}
            label={`About ${elapsedMinutes} min`}
            palette={palette}
          />
          <Metric
            icon={Route}
            label={`${stopsTravelled} ${stopsTravelled === 1 ? "stop" : "stops"}`}
            palette={palette}
          />
          <Metric
            icon={Accessibility}
            label={assistanceOutcome}
            palette={palette}
          />
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Repeat this journey"
        onPress={onRepeat}
        style={({ pressed }) => [
          styles.primaryAction,
          { backgroundColor: palette.accent, opacity: pressed ? 0.72 : 1 },
        ]}
      >
        <RotateCcw size={22} color={palette.onAccent} strokeWidth={2.8} />
        <Text style={[styles.primaryText, { color: palette.onAccent }]}>
          Repeat journey
        </Text>
      </Pressable>

      {!simplified ? (
        <>
          <View style={styles.secondaryRow}>
            <CompactAction
              icon={Bookmark}
              label={
                destinationSaved ? "Destination saved" : "Save destination"
              }
              selected={destinationSaved}
              palette={palette}
              onPress={onToggleSaveDestination}
            />
            <CompactAction
              icon={Route}
              label="Plan another"
              palette={palette}
              onPress={onPlanAnother}
            />
          </View>
          <View
            style={[styles.feedbackRow, { borderTopColor: palette.border }]}
          >
            <Text style={[styles.feedbackLabel, { color: palette.text }]}>
              Was this journey helpful?
            </Text>
            <CompactAction
              icon={ThumbsUp}
              label="Helpful"
              selected={feedback === "HELPFUL"}
              palette={palette}
              onPress={() => setFeedback("HELPFUL")}
            />
            <CompactAction
              icon={ThumbsDown}
              label="Not helpful"
              selected={feedback === "NOT_HELPFUL"}
              palette={palette}
              onPress={() => setFeedback("NOT_HELPFUL")}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

function Metric({ icon: Icon, label, palette }: any) {
  return (
    <View
      style={[
        styles.metric,
        { backgroundColor: palette.tint, borderColor: palette.border },
      ]}
    >
      <Icon size={18} color={palette.accent} strokeWidth={2.6} />
      <Text style={[styles.metricText, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

function CompactAction({
  icon: Icon,
  label,
  selected = false,
  palette,
  onPress,
}: any) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.compactAction,
        {
          backgroundColor: selected ? palette.accent : palette.surface,
          borderColor: palette.accent,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      <Icon
        size={19}
        color={selected ? palette.onAccent : palette.accent}
        strokeWidth={2.7}
      />
      <Text
        style={[
          styles.compactText,
          { color: selected ? palette.onAccent : palette.accent },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function resolvePalette(lightMode: boolean, highContrast: boolean) {
  if (!lightMode) {
    return {
      surface: "#092F34",
      tint: "#123E44",
      text: "#FFFFFF",
      secondary: "#D9F2F2",
      accent: "#86E6F0",
      onAccent: "#001416",
      border: highContrast ? "#FFFFFF" : "#76A9AE",
    };
  }
  return {
    surface: "#FFFFFF",
    tint: highContrast ? "#FFFFFF" : "#EAF5F5",
    text: "#17363A",
    secondary: "#536C70",
    accent: highContrast ? "#004A51" : "#0B6670",
    onAccent: "#FFFFFF",
    border: highContrast ? "#000000" : "#A8C2C5",
  };
}

const styles = StyleSheet.create({
  shell: { borderWidth: 2, borderRadius: 24, padding: 18, gap: 14 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  completeIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  flex: { flex: 1 },
  eyebrow: { fontSize: 13, fontWeight: "900", letterSpacing: 1 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "900" },
  subtitle: { fontSize: 16, lineHeight: 22, fontWeight: "800" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: {
    minHeight: 48,
    maxWidth: "100%",
    paddingVertical: 6,
    borderRadius: 21,
    borderWidth: 1,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metricText: { fontSize: 16, fontWeight: "800" },
  primaryAction: {
    minHeight: 64,
    borderRadius: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  primaryText: { fontSize: 18, fontWeight: "900" },
  secondaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  compactAction: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 2,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    flexGrow: 1,
  },
  compactText: { fontSize: 14, fontWeight: "900", textAlign: "center" },
  feedbackRow: {
    borderTopWidth: 1,
    paddingTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  feedbackLabel: { width: "100%", fontSize: 15, fontWeight: "900" },
});
