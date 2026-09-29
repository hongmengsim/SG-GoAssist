import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import {
  PassengerPressable as Pressable,
  PassengerText as Text,
} from "../accessibility/PassengerControls";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleHelp,
  CircleX,
  ShieldAlert,
} from "./AppIcons";
import Svg, {
  Circle as SvgCircle,
  G,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import type {
  OperationalCheckpointId,
  OperationalCheckpointStatus,
  OperationalGuidanceViewModel,
  OperationalScenePhase,
} from "../operationalGuidance/operationalGuidance";

type OperationalTheme = ReturnType<typeof operationalTheme>;

export function OperationalGuidancePanel({
  guidance,
  lightMode,
  highContrast,
  simplified = false,
  largeText = false,
  compact = false,
  testID,
}: {
  guidance: OperationalGuidanceViewModel;
  lightMode: boolean;
  highContrast: boolean;
  simplified?: boolean;
  largeText?: boolean;
  compact?: boolean;
  testID?: string;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedCheckpointId, setSelectedCheckpointId] =
    useState<OperationalCheckpointId | null>(null);
  const theme = operationalTheme(lightMode, highContrast);
  const activeCheckpoint = useMemo(
    () =>
      guidance.checkpoints.find((item) => item.status !== "PASSED") ??
      guidance.checkpoints[guidance.checkpoints.length - 1],
    [guidance.checkpoints],
  );
  const selectedCheckpoint = guidance.checkpoints.find(
    (item) => item.id === selectedCheckpointId,
  );

  useEffect(() => {
    if (
      selectedCheckpointId &&
      !guidance.checkpoints.some((item) => item.id === selectedCheckpointId)
    ) {
      setSelectedCheckpointId(null);
    }
  }, [guidance.checkpoints, selectedCheckpointId]);

  return (
    <View
      testID={testID}
      style={[
        styles.panel,
        compact && styles.compactPanel,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View
        accessible
        accessibilityRole="summary"
        accessibilityLabel={`${guidance.headline}. ${guidance.currentAction}${guidance.warning ? `. ${guidance.warning}` : ""}`}
      >
        <Text
          accessibilityRole="header"
          style={[
            styles.headline,
            largeText && styles.largeHeadline,
            { color: theme.text },
          ]}
        >
          {guidance.headline}
        </Text>
        {!compact ? (
          <Text
            style={[
              styles.action,
              largeText && styles.largeAction,
              { color: theme.muted },
            ]}
          >
            {guidance.currentAction}
          </Text>
        ) : null}
      </View>

      <OperationalVehicleDiagram
        guidance={guidance}
        lightMode={lightMode}
        highContrast={highContrast}
        compact={compact}
      />

      {guidance.warning && !simplified && !compact ? (
        <View
          accessibilityRole="alert"
          style={[styles.warning, { borderColor: theme.danger }]}
        >
          <ShieldAlert size={22} color={theme.danger} strokeWidth={2.8} />
          <Text style={[styles.warningText, { color: theme.text }]}>
            {guidance.warning}
          </Text>
        </View>
      ) : null}

      {!simplified && !compact ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              detailsOpen
                ? "Hide safety checks"
                : "Why am I waiting? Show safety checks"
            }
            accessibilityState={{ expanded: detailsOpen }}
            onPress={() => setDetailsOpen((open) => !open)}
            style={({ pressed }) => [
              styles.detailsButton,
              { borderColor: theme.borderStrong },
              pressed && styles.pressed,
            ]}
          >
            <CircleHelp size={22} color={theme.icon} strokeWidth={2.7} />
            <Text style={[styles.detailsButtonText, { color: theme.text }]}>
              Why am I waiting?
            </Text>
            {detailsOpen ? (
              <ChevronUp size={22} color={theme.icon} />
            ) : (
              <ChevronDown size={22} color={theme.icon} />
            )}
          </Pressable>

          {detailsOpen ? (
            <View
              testID="operational-safety-checkpoints"
              style={[styles.checkpointList, { borderColor: theme.border }]}
            >
              {guidance.checkpoints.map((checkpoint) => {
                const selected = checkpoint.id === selectedCheckpointId;
                return (
                  <Pressable
                    key={checkpoint.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${checkpoint.label}. ${checkpoint.status.toLowerCase()}. ${checkpoint.explanation}`}
                    accessibilityState={{ selected }}
                    onPress={() =>
                      setSelectedCheckpointId((current) =>
                        current === checkpoint.id ? null : checkpoint.id,
                      )
                    }
                    style={({ pressed }) => [
                      styles.checkpoint,
                      {
                        backgroundColor: selected
                          ? theme.selectedSurface
                          : theme.surface,
                        borderBottomColor: theme.border,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <CheckpointIcon status={checkpoint.status} theme={theme} />
                    <View style={styles.checkpointCopy}>
                      <Text
                        style={[
                          styles.checkpointLabel,
                          largeText && styles.largeCheckpointLabel,
                          { color: theme.text },
                        ]}
                      >
                        {checkpoint.label}
                      </Text>
                      {selected ? (
                        <Text
                          style={[
                            styles.checkpointExplanation,
                            largeText && styles.largeCheckpointExplanation,
                            { color: theme.muted },
                          ]}
                        >
                          {checkpoint.explanation}
                        </Text>
                      ) : null}
                    </View>
                    <Text
                      style={[
                        styles.checkpointStatus,
                        { color: statusColor(checkpoint.status, theme) },
                      ]}
                    >
                      {checkpointStatusLabel(checkpoint.status)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View
              accessible
              accessibilityLabel={`Current safety check: ${activeCheckpoint.label}. ${activeCheckpoint.explanation}`}
              style={styles.currentCheckpoint}
            >
              <CheckpointIcon status={activeCheckpoint.status} theme={theme} />
              <Text
                style={[styles.currentCheckpointText, { color: theme.muted }]}
              >
                Current check: {activeCheckpoint.label}
              </Text>
            </View>
          )}
        </>
      ) : null}
    </View>
  );
}

export function OperationalVehicleDiagram({
  guidance,
  lightMode,
  highContrast,
  compact = false,
  style,
}: {
  guidance: OperationalGuidanceViewModel;
  lightMode: boolean;
  highContrast: boolean;
  compact?: boolean;
  style?: ViewStyle;
}) {
  const theme = operationalTheme(lightMode, highContrast);
  const doorOpen = checkpointPassed(guidance, "DOOR");
  const pathStatus = checkpointStatus(guidance, "PATH");
  const rampDeploying = guidance.phase === "DEPLOYING";
  const rampReady = guidance.phase === "READY";
  const approaching = guidance.phase === "APPROACHING";
  const stale = guidance.phase === "STALE";
  const diagramLabel = `Service ${guidance.serviceNumber}. ${guidance.headline}. Central door ramp ${rampReady ? "fully deployed" : rampDeploying ? "deploying" : "stowed"}. Ramp area ${pathStatus.toLowerCase()}.`;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={diagramLabel}
      style={[
        styles.diagramFrame,
        compact && styles.compactDiagramFrame,
        {
          backgroundColor: theme.diagramSurface,
          borderColor: theme.borderStrong,
          opacity: stale ? 0.62 : 1,
        },
        style,
      ]}
    >
      <Svg width="100%" height="100%" viewBox="0 0 600 320" accessible={false}>
        <Rect
          x="0"
          y="0"
          width="600"
          height="320"
          fill={theme.diagramSurface}
        />

        {/* Stop marker and kerb are separate from the vehicle. */}
        <Line
          x1="35"
          y1="95"
          x2="35"
          y2="250"
          stroke={theme.outline}
          strokeWidth="8"
        />
        <Rect
          x="14"
          y="58"
          width="74"
          height="54"
          rx="14"
          fill={theme.stopFill}
          stroke={theme.outline}
          strokeWidth="5"
        />
        <SvgText
          x="51"
          y="92"
          textAnchor="middle"
          fontSize="21"
          fontWeight="800"
          fill={theme.stopText}
        >
          STOP
        </SvgText>
        <Line
          x1="10"
          y1="251"
          x2="590"
          y2="251"
          stroke={theme.outline}
          strokeWidth="7"
        />
        <Line
          x1="10"
          y1="278"
          x2="590"
          y2="278"
          stroke={theme.roadLine}
          strokeWidth="4"
          strokeDasharray="18 14"
        />

        {/* Autonomous low-floor bus side profile. */}
        <G transform={approaching ? "translate(42 0)" : "translate(0 0)"}>
          <Path
            d="M112 84 Q112 63 135 63 H480 Q524 63 540 104 L552 135 V218 H104 V111 Q104 95 112 84 Z"
            fill={theme.busFill}
            stroke={theme.outline}
            strokeWidth="6"
          />
          <Path
            d="M118 164 H548 V214 H104 V177 Z"
            fill={theme.teal}
            opacity="0.96"
          />
          <Rect
            x="143"
            y="85"
            width="72"
            height="54"
            rx="8"
            fill={theme.window}
            stroke={theme.outline}
            strokeWidth="4"
          />
          <Rect
            x="225"
            y="85"
            width="72"
            height="54"
            rx="8"
            fill={theme.window}
            stroke={theme.outline}
            strokeWidth="4"
          />
          <Rect
            x="307"
            y="85"
            width="62"
            height="54"
            rx="8"
            fill={theme.window}
            stroke={theme.outline}
            strokeWidth="4"
          />
          <Path
            d="M464 84 H497 Q520 88 532 118 H464 Z"
            fill={theme.window}
            stroke={theme.outline}
            strokeWidth="4"
          />

          {/* Service number is code-rendered and remains independent of colour. */}
          <Rect
            x="382"
            y="93"
            width="68"
            height="43"
            rx="10"
            fill={theme.serviceFill}
            stroke={theme.outline}
            strokeWidth="4"
          />
          <SvgText
            x="416"
            y="122"
            textAnchor="middle"
            fontSize="24"
            fontWeight="900"
            fill={theme.serviceText}
          >
            {guidance.serviceNumber}
          </SvgText>

          {/* Central ramp door. */}
          <Rect
            x="300"
            y="145"
            width="76"
            height="72"
            rx="5"
            fill={doorOpen ? theme.doorOpen : theme.doorClosed}
            stroke={theme.outline}
            strokeWidth="5"
          />
          {doorOpen ? (
            <>
              <Line
                x1="307"
                y1="151"
                x2="307"
                y2="211"
                stroke={theme.outline}
                strokeWidth="3"
              />
              <Line
                x1="369"
                y1="151"
                x2="369"
                y2="211"
                stroke={theme.outline}
                strokeWidth="3"
              />
            </>
          ) : (
            <Line
              x1="338"
              y1="149"
              x2="338"
              y2="214"
              stroke={theme.outline}
              strokeWidth="4"
            />
          )}

          {/* Front door remains visibly separate and never receives a ramp. */}
          <Rect
            x="466"
            y="145"
            width="56"
            height="72"
            rx="5"
            fill={theme.doorClosed}
            stroke={theme.outline}
            strokeWidth="5"
          />
          <Line
            x1="494"
            y1="149"
            x2="494"
            y2="214"
            stroke={theme.outline}
            strokeWidth="4"
          />

          <SvgCircle
            cx="178"
            cy="222"
            r="29"
            fill={theme.wheel}
            stroke={theme.outline}
            strokeWidth="6"
          />
          <SvgCircle cx="178" cy="222" r="10" fill={theme.wheelHub} />
          <SvgCircle
            cx="472"
            cy="222"
            r="29"
            fill={theme.wheel}
            stroke={theme.outline}
            strokeWidth="6"
          />
          <SvgCircle cx="472" cy="222" r="10" fill={theme.wheelHub} />

          {/* Ramp originates only from the central door. */}
          {rampDeploying || rampReady ? (
            <Path
              testID="central-door-ramp"
              d={
                rampReady
                  ? "M305 213 L228 249 L204 249 L292 202 Z"
                  : "M305 211 L258 236 L238 236 L294 201 Z"
              }
              fill={rampReady ? theme.ready : theme.pending}
              stroke={theme.outline}
              strokeWidth="5"
            />
          ) : (
            <Line
              x1="307"
              y1="209"
              x2="370"
              y2="209"
              stroke={theme.rampStowed}
              strokeWidth="7"
            />
          )}
        </G>

        {/* Laser safety envelope and obstacle zone. */}
        <Line
          x1="300"
          y1="196"
          x2="184"
          y2="238"
          stroke={pathStatus === "BLOCKED" ? theme.danger : theme.sensor}
          strokeWidth="4"
          strokeDasharray="10 8"
        />
        <Line
          x1="300"
          y1="184"
          x2="154"
          y2="221"
          stroke={pathStatus === "BLOCKED" ? theme.danger : theme.sensor}
          strokeWidth="4"
          strokeDasharray="10 8"
        />
        <Path
          d="M142 216 Q188 196 242 224 L214 248 H142 Z"
          fill="none"
          stroke={pathStatus === "BLOCKED" ? theme.danger : theme.sensor}
          strokeWidth="4"
          strokeDasharray="9 7"
        />
        {pathStatus === "BLOCKED" ? (
          <>
            <SvgCircle
              cx="178"
              cy="226"
              r="18"
              fill={theme.dangerSurface}
              stroke={theme.danger}
              strokeWidth="4"
            />
            <Line
              x1="166"
              y1="214"
              x2="190"
              y2="238"
              stroke={theme.danger}
              strokeWidth="5"
            />
            <Line
              x1="190"
              y1="214"
              x2="166"
              y2="238"
              stroke={theme.danger}
              strokeWidth="5"
            />
          </>
        ) : null}
      </Svg>
      <View
        style={[
          styles.phaseBadge,
          { backgroundColor: phaseColor(guidance.phase, theme) },
        ]}
      >
        <Text style={[styles.phaseBadgeText, { color: theme.badgeText }]}>
          {phaseLabel(guidance.phase)}
        </Text>
      </View>
    </View>
  );
}

function CheckpointIcon({
  status,
  theme,
}: {
  status: OperationalCheckpointStatus;
  theme: OperationalTheme;
}) {
  if (status === "PASSED") {
    return <CheckCircle2 size={24} color={theme.success} strokeWidth={3} />;
  }
  if (status === "BLOCKED") {
    return <CircleX size={24} color={theme.danger} strokeWidth={3} />;
  }
  if (status === "UNKNOWN") {
    return <CircleHelp size={24} color={theme.unknown} strokeWidth={2.7} />;
  }
  return <Circle size={24} color={theme.pending} strokeWidth={2.7} />;
}

function checkpointPassed(
  guidance: OperationalGuidanceViewModel,
  id: OperationalCheckpointId,
) {
  return checkpointStatus(guidance, id) === "PASSED";
}

function checkpointStatus(
  guidance: OperationalGuidanceViewModel,
  id: OperationalCheckpointId,
) {
  return (
    guidance.checkpoints.find((item) => item.id === id)?.status ?? "UNKNOWN"
  );
}

function checkpointStatusLabel(status: OperationalCheckpointStatus) {
  if (status === "PASSED") return "Ready";
  if (status === "BLOCKED") return "Blocked";
  if (status === "UNKNOWN") return "Unknown";
  return "Waiting";
}

function phaseLabel(phase: OperationalScenePhase) {
  return phase.replaceAll("_", " ");
}

function statusColor(
  status: OperationalCheckpointStatus,
  theme: OperationalTheme,
) {
  if (status === "PASSED") return theme.success;
  if (status === "BLOCKED") return theme.danger;
  if (status === "UNKNOWN") return theme.unknown;
  return theme.pending;
}

function phaseColor(phase: OperationalScenePhase, theme: OperationalTheme) {
  if (phase === "READY") return theme.success;
  if (phase === "BLOCKED" || phase === "FAULT") return theme.danger;
  if (phase === "STALE") return theme.unknown;
  return theme.teal;
}

function operationalTheme(lightMode: boolean, highContrast: boolean) {
  if (highContrast && lightMode) {
    return {
      surface: "#FFFFFF",
      selectedSurface: "#E8F7FA",
      diagramSurface: "#FFFFFF",
      border: "#000000",
      borderStrong: "#000000",
      text: "#000000",
      muted: "#1F2933",
      icon: "#000000",
      outline: "#000000",
      busFill: "#FFFFFF",
      teal: "#005D68",
      window: "#B9E6EE",
      doorOpen: "#FFFFFF",
      doorClosed: "#DCECEF",
      stopFill: "#FFFFFF",
      stopText: "#000000",
      serviceFill: "#FFFFFF",
      serviceText: "#000000",
      roadLine: "#000000",
      wheel: "#FFFFFF",
      wheelHub: "#000000",
      sensor: "#006B78",
      ready: "#FFFFFF",
      pending: "#8A4B00",
      rampStowed: "#000000",
      success: "#006B35",
      danger: "#B00020",
      dangerSurface: "#FFFFFF",
      unknown: "#4B5563",
      badgeText: "#FFFFFF",
    };
  }
  if (!lightMode) {
    return {
      surface: highContrast ? "#000000" : "#102B30",
      selectedSurface: "#173F46",
      diagramSurface: highContrast ? "#000000" : "#15363C",
      border: highContrast ? "#FFFFFF" : "#4E747A",
      borderStrong: "#A3E7EF",
      text: "#FFFFFF",
      muted: highContrast ? "#FFFFFF" : "#C8DADC",
      icon: "#A3E7EF",
      outline: "#EAF7F8",
      busFill: "#F5FAFA",
      teal: "#0B7480",
      window: "#7DB9CD",
      doorOpen: "#102B30",
      doorClosed: "#D6E8EA",
      stopFill: "#0B6670",
      stopText: "#FFFFFF",
      serviceFill: "#FFFFFF",
      serviceText: "#0B3035",
      roadLine: "#93B4B8",
      wheel: "#172126",
      wheelHub: "#DCEAEC",
      sensor: "#77D6E0",
      ready: "#8ED9B2",
      pending: "#F0B35B",
      rampStowed: "#48666B",
      success: "#64D493",
      danger: "#FF8D86",
      dangerSurface: "#351718",
      unknown: "#D7DBDD",
      badgeText: "#FFFFFF",
    };
  }
  return {
    surface: "#FFFFFF",
    selectedSurface: "#EAF5F6",
    diagramSurface: "#F3F8F8",
    border: "#B5CBCD",
    borderStrong: "#7FA6AA",
    text: "#18373B",
    muted: "#526B70",
    icon: "#0B6670",
    outline: "#18373B",
    busFill: "#FFFFFF",
    teal: "#0B6670",
    window: "#86C5DA",
    doorOpen: "#F3F8F8",
    doorClosed: "#DCEAEC",
    stopFill: "#0B6670",
    stopText: "#FFFFFF",
    serviceFill: "#FFFFFF",
    serviceText: "#0B6670",
    roadLine: "#78999D",
    wheel: "#22373B",
    wheelHub: "#DCEAEC",
    sensor: "#0797A7",
    ready: "#87D3AD",
    pending: "#E9B15D",
    rampStowed: "#78999D",
    success: "#08783F",
    danger: "#B42318",
    dangerSurface: "#FDE8E7",
    unknown: "#68777A",
    badgeText: "#FFFFFF",
  };
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 2,
    borderRadius: 22,
    padding: 16,
    gap: 12,
    width: "100%",
    overflow: "hidden",
  },
  compactPanel: { padding: 10, gap: 8, borderRadius: 18 },
  headline: { fontSize: 22, lineHeight: 28, fontWeight: "800" },
  largeHeadline: { fontSize: 26, lineHeight: 34 },
  action: { marginTop: 4, fontSize: 17, lineHeight: 24, fontWeight: "600" },
  largeAction: { fontSize: 20, lineHeight: 29 },
  diagramFrame: {
    width: "100%",
    aspectRatio: 1.875,
    borderWidth: 2,
    borderRadius: 18,
    overflow: "hidden",
    position: "relative",
  },
  compactDiagramFrame: { borderRadius: 14 },
  phaseBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    minHeight: 34,
    maxWidth: "58%",
    justifyContent: "center",
    borderRadius: 17,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  phaseBadgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
    letterSpacing: 0.7,
    textAlign: "center",
  },
  warning: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderRadius: 14,
    padding: 12,
  },
  warningText: { flex: 1, fontSize: 16, lineHeight: 22, fontWeight: "700" },
  detailsButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  detailsButtonText: { flex: 1, fontSize: 17, fontWeight: "800" },
  pressed: { opacity: 0.72 },
  checkpointList: { borderWidth: 2, borderRadius: 14, overflow: "hidden" },
  checkpoint: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkpointCopy: { flex: 1 },
  checkpointLabel: { fontSize: 16, lineHeight: 21, fontWeight: "800" },
  largeCheckpointLabel: { fontSize: 19, lineHeight: 26 },
  checkpointExplanation: { marginTop: 3, fontSize: 14, lineHeight: 20 },
  largeCheckpointExplanation: { fontSize: 17, lineHeight: 24 },
  checkpointStatus: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  currentCheckpoint: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
  },
  currentCheckpointText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
});
