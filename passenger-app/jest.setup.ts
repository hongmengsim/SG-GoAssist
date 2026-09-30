import { configure } from "@testing-library/react-native";
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
  getLastKnownPositionAsync: jest.fn(() => Promise.resolve(null)),
  watchPositionAsync: jest.fn(() =>
    Promise.resolve({ remove: jest.fn() }),
  ),
}));

jest.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: {
    abort: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    isRecognitionAvailable: jest.fn(() => false),
    requestPermissionsAsync: jest.fn(() =>
      Promise.resolve({ granted: false, status: "denied" }),
    ),
    start: jest.fn(),
  },
}));

jest.mock("expo-speech", () => ({
  speak: jest.fn(),
  stop: jest.fn(() => Promise.resolve()),
}));

beforeEach(async () => {
  await AsyncStorage.clear();
});

// Async queries (findBy, waitFor) wait longer than the 1 s default: under load (a full test run
// with other suites busy) the journey screens can take longer than that to appear, which made
// different tests fail on different runs.
configure({ asyncUtilTimeout: 5000 });
