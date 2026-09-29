import React from "react";
import { StyleSheet, View } from "react-native";
import { PassengerText as Text } from "../accessibility/PassengerControls";

export type ActiveJourneyContextStripProps = {
  serviceNo?: string;
  phase: string;
  nextStop?: string;
  stopsRemaining?: number;
  assistanceState?: string | null;
  connected: boolean;
  warning?: string | null;
  lightMode: boolean;
  highContrast: boolean;
};

export function ActiveJourneyContextStrip(
  props: ActiveJourneyContextStripProps,
) {
  const palette = props.lightMode
    ? {
        surface: "#EAF5F5",
        text: "#17363A",
        border: props.highContrast ? "#000000" : "#7DA9AD",
      }
    : {
        surface: "#123E44",
        text: "#FFFFFF",
        border: props.highContrast ? "#FFFFFF" : "#76A9AE",
      };
  const chips = [
    props.serviceNo ? `Bus ${props.serviceNo}` : null,
    readablePhase(props.phase),
    props.stopsRemaining !== undefined
      ? `${props.stopsRemaining} ${props.stopsRemaining === 1 ? "stop" : "stops"} left`
      : null,
    props.assistanceState ? readableState(props.assistanceState) : null,
  ]
    .filter((value): value is string => Boolean(value))
    .slice(0, 4);

  return (
    <View
      style={[
        styles.shell,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
      accessibilityLabel={`Journey status. ${chips.join(". ")}. ${props.connected ? "Live updates connected" : "Using last known updates"}.`}
    >
      <View style={styles.row}>
        {chips.map((chip) => (
          <View
            key={chip}
            style={[styles.chip, { borderColor: palette.border }]}
          >
            <Text style={[styles.chipText, { color: palette.text }]}>
              {chip}
            </Text>
          </View>
        ))}
      </View>
      {props.nextStop ? (
        <Text style={[styles.next, { color: palette.text }]}>
          Next: {props.nextStop}
        </Text>
      ) : null}
      {props.warning ? (
        <Text style={[styles.warning, { color: palette.text }]}>
          {props.warning}
        </Text>
      ) : null}
    </View>
  );
}

function readablePhase(phase: string) {
  return phase
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (value) => value.toUpperCase());
}

function readableState(state: string) {
  if (state === "READY") return "Assistance ready";
  if (state === "COMPLETED") return "Assistance complete";
  if (["BLOCKED", "FAILED", "ESCALATED"].includes(state))
    return `Assistance ${state.toLowerCase()}`;
  return "Assistance requested";
}

const styles = StyleSheet.create({
  shell: { borderWidth: 1, borderRadius: 18, padding: 12, gap: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 18,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  chipText: { fontSize: 13, fontWeight: "900" },
  next: { fontSize: 16, lineHeight: 21, fontWeight: "900" },
  warning: { fontSize: 14, lineHeight: 19, fontWeight: "800" },
});
