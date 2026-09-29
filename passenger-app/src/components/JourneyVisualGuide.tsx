import React, { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from "react-native";
import {
  PassengerPressable as Pressable,
  PassengerText as Text,
} from "../accessibility/PassengerControls";
import { ThemedSceneArtwork } from "./ThemedSceneArtwork";
import { usePresentationSizes } from "../accessibility/AccessibilityRuntime";
import {
  Accessibility,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  BusFront,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock,
  DoorOpen,
  Footprints,
  ListChecks,
  MapPin,
  Navigation,
  RefreshCw,
  RotateCcw,
  Volume2,
  X,
  type LucideIcon,
} from "./AppIcons";
import type {
  JourneyGuideStage,
  JourneyInstructionStep,
  JourneyVisualInstruction,
} from "../guidance/visualJourneyGuidance";
import type { RouteManeuverDirection } from "../routing/RoutingProvider";

const stages: Array<{ id: JourneyGuideStage; label: string }> = [
  { id: "WALK", label: "Walk" },
  { id: "WAIT", label: "Wait" },
  { id: "BOARD", label: "Board" },
  { id: "RIDE", label: "Ride" },
  { id: "EXIT", label: "Exit" },
];

const stageIndex: Record<JourneyGuideStage, number> = {
  WALK: 0,
  WAIT: 1,
  BOARD: 2,
  RIDE: 3,
  EXIT: 4,
};

const stepIcons: Record<JourneyInstructionStep["icon"], LucideIcon> = {
  WALK: Footprints,
  WAIT: Clock,
  BUS: BusFront,
  RAMP: Accessibility,
  SEAT: Accessibility,
  BELL: Bell,
  EXIT: DoorOpen,
  CHECK: CheckCircle2,
  WARNING: CircleAlert,
};

function maneuverIcon(direction: RouteManeuverDirection): LucideIcon {
  if (["LEFT", "SLIGHT_LEFT", "SHARP_LEFT"].includes(direction))
    return ArrowLeft;
  if (["RIGHT", "SLIGHT_RIGHT", "SHARP_RIGHT"].includes(direction))
    return ArrowRight;
  if (direction === "U_TURN") return RotateCcw;
  if (direction === "ARRIVE") return MapPin;
  if (direction === "DEPART") return Navigation;
  return ArrowUp;
}

function colors(lightMode: boolean, highContrast: boolean) {
  if (lightMode) {
    return {
      surface: highContrast ? "#FFFFFF" : "#F4F9FA",
      raised: "#FFFFFF",
      selected: highContrast ? "#000000" : "#075F73",
      text: "#17383D",
      muted: highContrast ? "#000000" : "#526A70",
      border: highContrast ? "#000000" : "#91B1B7",
      action: highContrast ? "#000000" : "#087588",
      onAction: "#FFFFFF",
      warning: highContrast ? "#000000" : "#9B4B00",
      success: highContrast ? "#000000" : "#267342",
      dangerSurface: highContrast ? "#FFFFFF" : "#FFF2E5",
      successSurface: highContrast ? "#FFFFFF" : "#EAF7EF",
    };
  }
  return {
    surface: highContrast ? "#000000" : "#102B31",
    raised: highContrast ? "#000000" : "#17383F",
    selected: highContrast ? "#FFFFFF" : "#8DD6E8",
    text: "#FFFFFF",
    muted: highContrast ? "#FFFFFF" : "#C4D5D8",
    border: highContrast ? "#FFFFFF" : "#5F858C",
    action: highContrast ? "#FFFFFF" : "#8DD6E8",
    onAction: "#061115",
    warning: highContrast ? "#FFFFFF" : "#FFD38A",
    success: highContrast ? "#FFFFFF" : "#A8D9B8",
    dangerSurface: "#3B2417",
    successSurface: "#173B2A",
  };
}

function sceneAccessibilityLabel(instruction: JourneyVisualInstruction) {
  const labels: Record<JourneyVisualInstruction["scene"], string> = {
    walkingToStop:
      "Passenger following an accessible path toward a sheltered bus stop.",
    waitingForBus:
      "Passengers waiting safely while an accessible autonomous bus approaches.",
    safeBoarding:
      "Wheelchair passenger waiting beside the central door ramp of an autonomous bus.",
    onboardJourney:
      "Passengers travelling inside an accessible autonomous bus with a next-stop display.",
    safeAlighting:
      "Wheelchair passenger leaving an autonomous bus using its central door ramp.",
    journeyComplete: "Passenger safely arriving at the destination.",
  };
  return labels[instruction.scene];
}

export function JourneyVisualGuide({
  instruction,
  illustration,
  lightMode,
  highContrast,
  largeText,
  simplified,
  reducedMotion,
  onRepeat,
  onUseCamera,
  onRecalculate,
  onContinueWithoutRerouting,
}: {
  instruction: JourneyVisualInstruction;
  illustration: ImageSourcePropType;
  lightMode: boolean;
  highContrast: boolean;
  largeText: boolean;
  simplified: boolean;
  reducedMotion: boolean;
  onRepeat?: () => void;
  onUseCamera?: () => void;
  onRecalculate?: () => void;
  onContinueWithoutRerouting?: () => void;
}) {
  const [detailsVisible, setDetailsVisible] = useState(false);
  const sizes = usePresentationSizes();
  const palette = colors(lightMode, highContrast);
  const currentStageIndex = stageIndex[instruction.stage];
  const toneSurface =
    instruction.tone === "BLOCKED" || instruction.tone === "ATTENTION"
      ? palette.dangerSurface
      : instruction.tone === "SUCCESS"
        ? palette.successSurface
        : palette.surface;
  const ManeuverIcon = instruction.maneuver
    ? maneuverIcon(instruction.maneuver.direction)
    : Navigation;
  const detailAnimation = reducedMotion ? "none" : "fade";
  const cameraActionAvailable =
    instruction.actions.includes("CAMERA_GUIDE") && Boolean(onUseCamera);
  const recalculateActionAvailable =
    instruction.actions.includes("RECALCULATE") && Boolean(onRecalculate);
  const showStepsAction =
    !simplified || (!cameraActionAvailable && !recalculateActionAvailable);

  return (
    <View
      testID="journey-visual-guide"
      style={[
        styles.card,
        {
          backgroundColor: toneSurface,
          borderColor: palette.border,
          borderWidth: highContrast ? 3 : 2,
        },
      ]}
      accessible={false}
    >
      <View
        style={[styles.stageRail, { flexWrap: "wrap", rowGap: 12 }]}
        accessible
        accessibilityLabel={`Journey progress. Current stage ${instruction.stage.toLowerCase()}.`}
      >
        {stages.map((stage, index) => {
          const current = stage.id === instruction.stage;
          const complete = index < currentStageIndex;
          return (
            <View
              key={stage.id}
              style={[
                styles.stageItem,
                sizes.enlarged && { flexBasis: "30%", flexGrow: 0 },
              ]}
              accessible={false}
            >
              <View
                style={[
                  styles.stageMarker,
                  {
                    width: sizes.statusIcon + 16,
                    height: sizes.statusIcon + 16,
                    backgroundColor:
                      current || complete ? palette.selected : palette.raised,
                    borderColor:
                      current || complete ? palette.selected : palette.border,
                  },
                ]}
              >
                {complete ? (
                  <Check
                    size={14}
                    color={lightMode ? "#FFFFFF" : "#061115"}
                    strokeWidth={3.2}
                  />
                ) : (
                  <Text
                    style={[
                      styles.stageNumber,
                      {
                        color: current
                          ? lightMode
                            ? "#FFFFFF"
                            : "#061115"
                          : palette.muted,
                      },
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stageLabel,
                  { fontSize: sizes.bodyText, textAlign: "center" },
                  { color: current ? palette.text : palette.muted },
                  current && styles.stageLabelCurrent,
                ]}
              >
                {stage.label}
              </Text>
            </View>
          );
        })}
      </View>

      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${instruction.title}. ${instruction.summary}`}
      >
        <Text
          style={[
            styles.eyebrow,
            {
              color:
                instruction.tone === "BLOCKED"
                  ? palette.warning
                  : palette.action,
            },
          ]}
        >
          NOW
        </Text>
        <Text
          style={[
            styles.title,
            largeText && styles.titleLarge,
            { color: palette.text },
          ]}
        >
          {instruction.title}
        </Text>
        <Text
          style={[
            styles.summary,
            largeText && styles.summaryLarge,
            { color: palette.muted },
          ]}
        >
          {instruction.summary}
        </Text>
        {instruction.statusLine ? (
          <Text
            accessibilityRole={
              instruction.tone === "BLOCKED" ? "alert" : undefined
            }
            style={[
              styles.statusLine,
              largeText && styles.summaryLarge,
              {
                color:
                  instruction.tone === "BLOCKED"
                    ? palette.warning
                    : palette.text,
              },
            ]}
          >
            {instruction.statusLine}
          </Text>
        ) : null}
      </View>

      {instruction.visualKind === "MANEUVER" && instruction.maneuver ? (
        <View
          testID="journey-maneuver-diagram"
          style={[
            styles.maneuverCard,
            { backgroundColor: palette.raised, borderColor: palette.border },
          ]}
          accessible
          accessibilityLabel={`${instruction.title}. ${instruction.maneuver.distanceMeters} metres to the next maneuver.`}
        >
          <View
            style={[styles.maneuverIcon, { backgroundColor: palette.action }]}
          >
            <ManeuverIcon
              size={54}
              color={palette.onAction}
              strokeWidth={3.4}
            />
          </View>
          <View style={styles.maneuverText}>
            <Text style={[styles.distance, { color: palette.text }]}>
              {instruction.maneuver.distanceMeters} m
            </Text>
            <Text style={[styles.roadName, { color: palette.muted }]}>
              {instruction.maneuver.roadName ?? "Follow the route ahead"}
            </Text>
            {instruction.maneuver.nextInstruction ? (
              <Text
                numberOfLines={2}
                style={[styles.nextInstruction, { color: palette.muted }]}
              >
                Next: {instruction.maneuver.nextInstruction}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {instruction.routeStrip && !simplified ? (
        <View
          testID="journey-route-strip"
          style={[
            styles.routeStrip,
            { backgroundColor: palette.raised, borderColor: palette.border },
          ]}
          accessible
          accessibilityLabel={`Current stop ${instruction.routeStrip.currentStopName ?? "unknown"}. Next stop ${instruction.routeStrip.nextStopName ?? "unknown"}. Destination ${instruction.routeStrip.destinationName ?? "unknown"}.`}
        >
          {[
            { label: "Current", value: instruction.routeStrip.currentStopName },
            { label: "Next", value: instruction.routeStrip.nextStopName },
            { label: "Exit", value: instruction.routeStrip.destinationName },
          ].map((item, index) => (
            <React.Fragment key={item.label}>
              <View style={styles.routeStop} accessible={false}>
                <View
                  style={[
                    styles.routeDot,
                    {
                      backgroundColor:
                        index === 1 ? palette.action : palette.raised,
                      borderColor: palette.action,
                    },
                  ]}
                />
                <Text style={[styles.routeLabel, { color: palette.muted }]}>
                  {item.label}
                </Text>
                <Text
                  numberOfLines={2}
                  style={[styles.routeValue, { color: palette.text }]}
                >
                  {item.value ?? "—"}
                </Text>
              </View>
              {index < 2 ? (
                <View
                  style={[
                    styles.routeLine,
                    { backgroundColor: palette.action },
                  ]}
                />
              ) : null}
            </React.Fragment>
          ))}
        </View>
      ) : null}

      <Pressable
        testID="journey-guide-illustration"
        accessibilityRole={simplified ? "image" : "button"}
        accessibilityLabel={
          simplified
            ? sceneAccessibilityLabel(instruction)
            : `${sceneAccessibilityLabel(instruction)} Show detailed visual instructions.`
        }
        accessibilityHint={
          simplified
            ? undefined
            : "Opens an enlarged visual with numbered journey steps."
        }
        disabled={simplified}
        onPress={() => setDetailsVisible(true)}
        style={({ pressed }) => [
          styles.illustrationButton,
          { backgroundColor: palette.raised, borderColor: palette.border },
          pressed && styles.pressed,
        ]}
      >
        <ThemedSceneArtwork
          source={illustration}
          decorative
          lightMode={lightMode}
          highContrast={highContrast}
          bordered={false}
          style={styles.illustration}
        />
        {!simplified ? (
          <View
            style={[
              styles.visualHint,
              { backgroundColor: palette.raised, borderColor: palette.border },
            ]}
          >
            <ListChecks size={18} color={palette.action} strokeWidth={2.8} />
            <Text style={[styles.visualHintText, { color: palette.text }]}>
              View visual steps
            </Text>
          </View>
        ) : null}
      </Pressable>

      <View style={styles.actions}>
        {showStepsAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: detailsVisible }}
            onPress={() => setDetailsVisible(true)}
            style={[
              styles.secondaryAction,
              { backgroundColor: palette.raised, borderColor: palette.border },
            ]}
          >
            <ChevronDown size={20} color={palette.action} strokeWidth={2.8} />
            <Text style={[styles.secondaryActionText, { color: palette.text }]}>
              Show steps
            </Text>
          </Pressable>
        ) : null}
        {cameraActionAvailable && onUseCamera ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Use camera direction guide"
            accessibilityHint="Requests camera permission and overlays the current direction. No image is recorded or sent."
            onPress={onUseCamera}
            style={[
              styles.primaryAction,
              { backgroundColor: palette.action, borderColor: palette.action },
            ]}
          >
            <Camera size={20} color={palette.onAction} strokeWidth={2.8} />
            <Text
              style={[styles.primaryActionText, { color: palette.onAction }]}
            >
              Camera guide
            </Text>
          </Pressable>
        ) : null}
        {recalculateActionAvailable && onRecalculate ? (
          <Pressable
            accessibilityRole="button"
            onPress={onRecalculate}
            style={[
              styles.primaryAction,
              { backgroundColor: palette.action, borderColor: palette.action },
            ]}
          >
            <RefreshCw size={20} color={palette.onAction} strokeWidth={2.8} />
            <Text
              style={[styles.primaryActionText, { color: palette.onAction }]}
            >
              Recalculate
            </Text>
          </Pressable>
        ) : null}
        {!simplified && onRepeat ? (
          <Pressable
            accessibilityRole="button"
            onPress={onRepeat}
            style={[
              styles.secondaryAction,
              { backgroundColor: palette.raised, borderColor: palette.border },
            ]}
          >
            <Volume2 size={20} color={palette.action} strokeWidth={2.8} />
            <Text style={[styles.secondaryActionText, { color: palette.text }]}>
              Repeat
            </Text>
          </Pressable>
        ) : null}
      </View>

      {!simplified &&
      instruction.actions.includes("CONTINUE_WITHOUT_REROUTING") &&
      onContinueWithoutRerouting ? (
        <Pressable
          accessibilityRole="button"
          onPress={onContinueWithoutRerouting}
          style={styles.textAction}
        >
          <Text style={[styles.textActionLabel, { color: palette.action }]}>
            Continue without rerouting
          </Text>
        </Pressable>
      ) : null}

      <Modal
        transparent
        visible={detailsVisible}
        animationType={detailAnimation}
        onRequestClose={() => setDetailsVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            testID="journey-visual-instruction-sheet"
            accessibilityViewIsModal
            style={[
              styles.detailSheet,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <View style={styles.detailHeader}>
              <View style={styles.detailHeaderText}>
                <Text style={[styles.eyebrow, { color: palette.action }]}>
                  VISUAL GUIDE
                </Text>
                <Text style={[styles.detailTitle, { color: palette.text }]}>
                  {instruction.title}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close visual instructions"
                onPress={() => setDetailsVisible(false)}
                style={[
                  styles.closeButton,
                  {
                    backgroundColor: palette.raised,
                    borderColor: palette.border,
                  },
                ]}
              >
                <X size={24} color={palette.text} strokeWidth={2.8} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.detailContent}>
              <ThemedSceneArtwork
                source={illustration}
                accessibilityLabel={sceneAccessibilityLabel(instruction)}
                lightMode={lightMode}
                highContrast={highContrast}
                style={styles.detailIllustration}
              />
              {!simplified ? (
                <View style={styles.stepList}>
                  {instruction.steps.slice(0, 3).map((step, index) => {
                    const StepIcon = stepIcons[step.icon];
                    return (
                      <View
                        key={step.id}
                        style={[
                          styles.stepRow,
                          {
                            backgroundColor: palette.raised,
                            borderColor: palette.border,
                          },
                          step.state === "CURRENT" && {
                            borderColor: palette.action,
                            borderWidth: 3,
                          },
                        ]}
                        accessible
                        accessibilityLabel={`Step ${index + 1} of ${Math.min(3, instruction.steps.length)}. ${step.title}. ${step.description}. ${step.state.toLowerCase()}.`}
                      >
                        <View
                          style={[
                            styles.stepNumber,
                            { backgroundColor: palette.action },
                          ]}
                        >
                          <Text
                            style={[
                              styles.stepNumberText,
                              { color: palette.onAction },
                            ]}
                          >
                            {index + 1}
                          </Text>
                        </View>
                        <StepIcon
                          size={24}
                          color={palette.action}
                          strokeWidth={2.8}
                        />
                        <View style={styles.stepText}>
                          <Text
                            style={[styles.stepTitle, { color: palette.text }]}
                          >
                            {step.title}
                          </Text>
                          <Text
                            style={[
                              styles.stepDescription,
                              { color: palette.muted },
                            ]}
                          >
                            {step.description}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}
              {!simplified ? (
                <View
                  style={[
                    styles.cuePanel,
                    {
                      backgroundColor: palette.raised,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <Text style={[styles.cueTitle, { color: palette.text }]}>
                    What to look for
                  </Text>
                  {instruction.environmentalCues.map((cue) => (
                    <View key={cue} style={styles.cueRow}>
                      <CheckCircle2
                        size={18}
                        color={palette.success}
                        strokeWidth={2.8}
                      />
                      <Text style={[styles.cueText, { color: palette.muted }]}>
                        {cue}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <View
                style={[
                  styles.safetyPanel,
                  {
                    backgroundColor: palette.dangerSurface,
                    borderColor: palette.warning,
                  },
                ]}
                accessible
                accessibilityRole="alert"
              >
                <CircleAlert
                  size={22}
                  color={palette.warning}
                  strokeWidth={2.8}
                />
                <Text style={[styles.safetyText, { color: palette.text }]}>
                  {instruction.safetyNote}
                </Text>
              </View>
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              onPress={() => setDetailsVisible(false)}
              style={[
                styles.primaryAction,
                styles.fullAction,
                {
                  backgroundColor: palette.action,
                  borderColor: palette.action,
                },
              ]}
            >
              <ChevronUp size={20} color={palette.onAction} strokeWidth={2.8} />
              <Text
                style={[styles.primaryActionText, { color: palette.onAction }]}
              >
                Back to journey
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 26,
    gap: 16,
    overflow: "hidden",
    padding: 18,
  },
  stageRail: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  stageItem: {
    alignItems: "center",
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  stageMarker: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 2,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  stageNumber: { fontSize: 12, fontWeight: "900" },
  stageLabel: { fontSize: 11, fontWeight: "700" },
  stageLabelCurrent: { fontWeight: "900" },
  eyebrow: { fontSize: 13, fontWeight: "900", letterSpacing: 1.2 },
  title: { fontSize: 28, fontWeight: "900", lineHeight: 34, marginTop: 4 },
  titleLarge: { fontSize: 32, lineHeight: 39 },
  summary: { fontSize: 18, lineHeight: 25, marginTop: 7 },
  summaryLarge: { fontSize: 21, lineHeight: 29 },
  statusLine: { fontSize: 16, fontWeight: "800", lineHeight: 22, marginTop: 8 },
  maneuverCard: {
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 2,
    flexDirection: "row",
    gap: 16,
    padding: 15,
  },
  maneuverIcon: {
    alignItems: "center",
    borderRadius: 18,
    height: 86,
    justifyContent: "center",
    width: 86,
  },
  maneuverText: { flex: 1, gap: 3, minWidth: 0 },
  distance: { fontSize: 30, fontWeight: "900" },
  roadName: { fontSize: 17, fontWeight: "800", lineHeight: 22 },
  nextInstruction: { fontSize: 14, fontWeight: "600", lineHeight: 19 },
  routeStrip: {
    alignItems: "flex-start",
    borderRadius: 18,
    borderWidth: 2,
    flexDirection: "row",
    padding: 14,
  },
  routeStop: { alignItems: "center", flex: 1, gap: 4, minWidth: 0 },
  routeDot: { borderRadius: 9, borderWidth: 3, height: 18, width: 18 },
  routeLine: { height: 4, marginHorizontal: -8, marginTop: 7, width: 24 },
  routeLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  routeValue: { fontSize: 13, fontWeight: "800", textAlign: "center" },
  illustrationButton: {
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 2,
    minHeight: 176,
    overflow: "hidden",
    position: "relative",
  },
  illustration: { width: "100%" },
  visualHint: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    bottom: 10,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: "absolute",
    right: 10,
  },
  visualHintText: { fontSize: 13, fontWeight: "900" },
  pressed: { opacity: 0.82 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  primaryAction: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 2,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  primaryActionText: { fontSize: 15, fontWeight: "900" },
  secondaryAction: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 2,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  secondaryActionText: { fontSize: 15, fontWeight: "900" },
  textAction: { alignSelf: "flex-start", paddingVertical: 4 },
  textActionLabel: {
    fontSize: 15,
    fontWeight: "900",
    textDecorationLine: "underline",
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    flex: 1,
    justifyContent: "center",
    padding: 16,
  },
  detailSheet: {
    borderRadius: 24,
    borderWidth: 2,
    maxHeight: "92%",
    maxWidth: 620,
    padding: 18,
    width: "100%",
  },
  detailHeader: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  detailHeaderText: { flex: 1, minWidth: 0 },
  detailTitle: {
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 30,
    marginTop: 3,
  },
  closeButton: {
    alignItems: "center",
    borderRadius: 15,
    borderWidth: 2,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  detailContent: { gap: 15, paddingBottom: 14, paddingTop: 12 },
  detailIllustration: { alignSelf: "center", width: "100%" },
  stepList: { gap: 10 },
  stepRow: {
    alignItems: "center",
    borderRadius: 17,
    borderWidth: 2,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  stepNumber: {
    alignItems: "center",
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  stepNumberText: { fontSize: 14, fontWeight: "900" },
  stepText: { flex: 1, gap: 3, minWidth: 0 },
  stepTitle: { fontSize: 17, fontWeight: "900", lineHeight: 22 },
  stepDescription: { fontSize: 15, lineHeight: 21 },
  cuePanel: { borderRadius: 17, borderWidth: 2, gap: 8, padding: 14 },
  cueTitle: { fontSize: 17, fontWeight: "900" },
  cueRow: { alignItems: "flex-start", flexDirection: "row", gap: 9 },
  cueText: { flex: 1, fontSize: 15, lineHeight: 21 },
  safetyPanel: {
    alignItems: "flex-start",
    borderRadius: 17,
    borderWidth: 2,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  safetyText: { flex: 1, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  fullAction: { width: "100%" },
});
