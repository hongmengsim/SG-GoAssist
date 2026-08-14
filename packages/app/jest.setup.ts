import { AccessibilityInfo } from "react-native";

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
}));
