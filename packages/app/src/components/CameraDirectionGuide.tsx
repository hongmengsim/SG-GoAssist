import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraOff, Map } from "lucide-react-native";
import type { CameraDirectionGuideProps } from "./CameraDirectionGuide.types";

export type { CameraDirectionGuideProps } from "./CameraDirectionGuide.types";

export function CameraDirectionGuide({
  visible,
  instruction,
  onClose,
}: CameraDirectionGuideProps) {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <CameraOff size={42} color="#075F73" strokeWidth={2.8} />
          <Text style={styles.title}>Camera guide is unavailable here</Text>
          <Text style={styles.body}>{instruction}</Text>
          <Text style={styles.body}>
            Use the diagrammatic direction guide instead.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={styles.button}
          >
            <Map size={20} color="#FFFFFF" strokeWidth={2.8} />
            <Text style={styles.buttonText}>Use diagram</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  card: {
    alignItems: "center",
    backgroundColor: "#F4F9FA",
    borderColor: "#17383D",
    borderRadius: 24,
    borderWidth: 2,
    gap: 13,
    maxWidth: 520,
    padding: 24,
    width: "100%",
  },
  title: {
    color: "#17383D",
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
  },
  body: { color: "#526A70", fontSize: 17, lineHeight: 24, textAlign: "center" },
  button: {
    alignItems: "center",
    backgroundColor: "#075F73",
    borderRadius: 16,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 4,
    minHeight: 52,
    paddingHorizontal: 20,
  },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
});
