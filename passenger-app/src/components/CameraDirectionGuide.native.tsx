import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  SafeAreaView,
  StyleSheet,
  View,
} from "react-native";
import {
  PassengerPressable as Pressable,
  PassengerText as Text,
} from "../accessibility/PassengerControls";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import {
  CameraOff,
  Compass,
  Map,
  Navigation,
  ShieldCheck,
  Volume2,
  X,
} from "./AppIcons";
import {
  directionFrame,
  smoothHeading,
} from "../guidance/visualJourneyGuidance";
import type { CameraDirectionGuideProps } from "./CameraDirectionGuide.types";

export type { CameraDirectionGuideProps } from "./CameraDirectionGuide.types";

function alignmentLabel(
  alignment: ReturnType<typeof directionFrame>["alignment"],
) {
  if (alignment === "ALIGNED") return "Direction aligned";
  if (alignment === "TURN_LEFT") return "Turn the phone left";
  if (alignment === "TURN_RIGHT") return "Turn the phone right";
  if (alignment === "BROAD_DIRECTION") return "Approximate direction only";
  return "Compass direction unavailable";
}

export function CameraDirectionGuide({
  visible,
  currentLocation,
  locationAccuracyMeters,
  initialHeadingDegrees,
  target,
  distanceMeters,
  instruction,
  nextInstruction,
  onClose,
  onRepeat,
}: CameraDirectionGuideProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [heading, setHeading] = useState<number | null>(
    initialHeadingDegrees ?? null,
  );
  const [headingAccuracy, setHeadingAccuracy] = useState<number | null>(null);
  const [headingError, setHeadingError] = useState(false);
  const smoothedHeadingRef = useRef<number | null>(
    initialHeadingDegrees ?? null,
  );

  useEffect(() => {
    if (!visible || (permission && permission.status !== "undetermined"))
      return;
    void requestPermission();
  }, [permission, requestPermission, visible]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    let subscription: Location.LocationSubscription | null = null;
    setHeadingError(false);
    void Location.watchHeadingAsync((next) => {
      if (!active) return;
      const rawHeading =
        next.trueHeading >= 0 ? next.trueHeading : next.magHeading;
      const smoothed = smoothHeading(smoothedHeadingRef.current, rawHeading);
      smoothedHeadingRef.current = smoothed;
      setHeading(smoothed);
      setHeadingAccuracy(next.accuracy);
    })
      .then((nextSubscription) => {
        if (active) subscription = nextSubscription;
        else nextSubscription.remove();
      })
      .catch(() => {
        if (active) setHeadingError(true);
      });
    return () => {
      active = false;
      subscription?.remove();
    };
  }, [visible]);

  const frame = useMemo(
    () =>
      directionFrame({
        currentLocation,
        target,
        headingDegrees: heading,
        headingAccuracy: headingError ? 0 : headingAccuracy,
        locationAccuracyMeters,
        distanceMeters,
      }),
    [
      currentLocation,
      distanceMeters,
      heading,
      headingAccuracy,
      headingError,
      locationAccuracyMeters,
      target,
    ],
  );
  const permissionPending = !permission || permission.status === "undetermined";
  const permissionDenied = permission?.status === "denied";
  const precise =
    frame.alignment !== "UNAVAILABLE" &&
    frame.alignment !== "BROAD_DIRECTION" &&
    frame.relativeAngle !== null;
  const arrowRotation = precise ? (frame.relativeAngle ?? 0) : 0;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.container} accessibilityViewIsModal>
        {permission?.granted ? (
          <CameraView style={StyleSheet.absoluteFill} facing="back" />
        ) : (
          <View style={styles.permissionBackground}>
            {permissionPending ? (
              <ActivityIndicator size="large" color="#8DD6E8" />
            ) : (
              <CameraOff size={62} color="#8DD6E8" strokeWidth={2.6} />
            )}
          </View>
        )}
        <View style={[styles.scrim, { pointerEvents: "none" }]} />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.topRow}>
            <View
              style={styles.privacyBadge}
              accessible
              accessibilityLabel="Camera view is live only and is not recorded."
            >
              <ShieldCheck size={19} color="#FFFFFF" strokeWidth={2.8} />
              <Text style={styles.privacyText}>Live only · not recorded</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close camera guide"
              onPress={onClose}
              style={styles.roundButton}
            >
              <X size={25} color="#FFFFFF" strokeWidth={3} />
            </Pressable>
          </View>

          <View style={styles.guideArea}>
            {permissionPending ? (
              <View style={styles.messageCard} accessibilityRole="progressbar">
                <Text style={styles.messageTitle}>Preparing camera guide…</Text>
                <Text style={styles.messageBody}>
                  The camera is used live on this device only.
                </Text>
              </View>
            ) : permissionDenied ? (
              <View style={styles.messageCard} accessibilityRole="alert">
                <CameraOff size={38} color="#8DD6E8" strokeWidth={2.8} />
                <Text style={styles.messageTitle}>Camera access is off</Text>
                <Text style={styles.messageBody}>
                  Your diagrammatic directions are still available.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={onClose}
                  style={styles.primaryButton}
                >
                  <Map size={21} color="#07161A" strokeWidth={2.8} />
                  <Text style={styles.primaryButtonText}>Use diagram</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View
                  testID="camera-direction-arrow"
                  style={[
                    styles.directionRing,
                    frame.alignment === "BROAD_DIRECTION" &&
                      styles.approximateRing,
                  ]}
                  accessible
                  accessibilityLabel={`${alignmentLabel(frame.alignment)}. ${instruction}. ${Math.round(frame.distanceMeters ?? 0)} metres.`}
                >
                  {frame.alignment === "UNAVAILABLE" ? (
                    <Compass size={70} color="#FFFFFF" strokeWidth={2.8} />
                  ) : (
                    <View
                      style={{ transform: [{ rotate: `${arrowRotation}deg` }] }}
                    >
                      <Navigation
                        size={94}
                        color={
                          frame.alignment === "ALIGNED" ? "#B8F5C9" : "#FFFFFF"
                        }
                        fill={
                          frame.alignment === "ALIGNED" ? "#267342" : "#075F73"
                        }
                        strokeWidth={2.7}
                      />
                    </View>
                  )}
                </View>
                <View style={styles.alignmentBadge}>
                  <Text style={styles.alignmentText}>
                    {alignmentLabel(frame.alignment)}
                  </Text>
                </View>
              </>
            )}
          </View>

          {!permissionDenied ? (
            <View style={styles.instructionCard}>
              <Text style={styles.distanceText}>
                {frame.distanceMeters === null
                  ? "—"
                  : `${Math.round(frame.distanceMeters)} m`}
              </Text>
              <Text style={styles.instructionText}>{instruction}</Text>
              {nextInstruction ? (
                <Text style={styles.nextText}>Next: {nextInstruction}</Text>
              ) : null}
              {frame.locationQuality !== "GOOD" ||
              frame.headingQuality !== "GOOD" ? (
                <Text style={styles.qualityText} accessibilityRole="alert">
                  Direction accuracy is limited. Match this guide with signs and
                  the diagram.
                </Text>
              ) : null}
              <View style={styles.actionRow}>
                {onRepeat ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={onRepeat}
                    style={styles.secondaryButton}
                  >
                    <Volume2 size={21} color="#FFFFFF" strokeWidth={2.8} />
                    <Text style={styles.secondaryButtonText}>Repeat</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={onClose}
                  style={styles.primaryButton}
                >
                  <Map size={21} color="#07161A" strokeWidth={2.8} />
                  <Text style={styles.primaryButtonText}>Use diagram</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#07161A", flex: 1 },
  permissionBackground: {
    alignItems: "center",
    backgroundColor: "#102B31",
    flex: 1,
    justifyContent: "center",
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 0, 0, 0.22)",
  },
  safeArea: { flex: 1, justifyContent: "space-between", padding: 16 },
  topRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  privacyBadge: {
    alignItems: "center",
    backgroundColor: "rgba(7, 22, 26, 0.88)",
    borderColor: "rgba(255,255,255,0.8)",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  privacyText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  roundButton: {
    alignItems: "center",
    backgroundColor: "rgba(7, 22, 26, 0.9)",
    borderColor: "#FFFFFF",
    borderRadius: 23,
    borderWidth: 2,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  guideArea: { alignItems: "center", flex: 1, justifyContent: "center" },
  directionRing: {
    alignItems: "center",
    backgroundColor: "rgba(7, 22, 26, 0.54)",
    borderColor: "#FFFFFF",
    borderRadius: 86,
    borderWidth: 4,
    height: 172,
    justifyContent: "center",
    width: 172,
  },
  approximateRing: { borderStyle: "dashed", opacity: 0.86 },
  alignmentBadge: {
    backgroundColor: "rgba(7, 22, 26, 0.88)",
    borderRadius: 18,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  alignmentText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  messageCard: {
    alignItems: "center",
    backgroundColor: "rgba(7, 22, 26, 0.94)",
    borderColor: "#8DD6E8",
    borderRadius: 22,
    borderWidth: 2,
    gap: 12,
    maxWidth: 420,
    padding: 22,
    width: "100%",
  },
  messageTitle: {
    color: "#FFFFFF",
    fontSize: 23,
    fontWeight: "900",
    textAlign: "center",
  },
  messageBody: {
    color: "#D5E5E8",
    fontSize: 16,
    lineHeight: 23,
    textAlign: "center",
  },
  instructionCard: {
    backgroundColor: "rgba(7, 22, 26, 0.94)",
    borderColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 2,
    gap: 7,
    padding: 18,
  },
  distanceText: { color: "#8DD6E8", fontSize: 30, fontWeight: "900" },
  instructionText: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 31,
  },
  nextText: { color: "#D5E5E8", fontSize: 16, lineHeight: 22 },
  qualityText: {
    color: "#FFD38A",
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 21,
  },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#8DD6E8",
    borderRadius: 16,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 17,
  },
  primaryButtonText: { color: "#07161A", fontSize: 16, fontWeight: "900" },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 2,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 17,
  },
  secondaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
});
