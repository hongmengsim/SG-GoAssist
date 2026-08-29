import { AccessibilityInfo } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

Object.defineProperty(global, "fetch", {
  writable: true,
  value: jest.fn(),
});

jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(jest.fn());

jest.mock("expo-haptics", () => ({
  NotificationFeedbackType: {
    Success: "success",
    Warning: "warning",
    Error: "error",
  },
  notificationAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock("expo-location", () => ({
  Accuracy: {
    Balanced: 3,
  },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(() =>
    Promise.resolve({ remove: jest.fn() }),
  ),
}));

beforeEach(async () => {
  await AsyncStorage.clear();
});
