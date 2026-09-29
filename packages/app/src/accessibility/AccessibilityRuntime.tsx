import { createContext, useContext, useMemo } from "react";
import type { View } from "react-native";
import type { AccessibilityTextSize } from "@buspass/shared";
import { resolvePresentationSizes } from "./presentationSizes";

export type AccessibilityRuntimeValue = {
  largerControls: boolean;
  reducedMotion: boolean;
  textSize: AccessibilityTextSize;
  navigationHeight?: number;
  preserveViewport: (getAnchor: () => View | null, update: () => void) => void;
};

export const AccessibilityRuntimeContext =
  createContext<AccessibilityRuntimeValue>({
    largerControls: false,
    reducedMotion: false,
    textSize: "STANDARD",
    navigationHeight: 86,
    preserveViewport: (_getAnchor, update) => update(),
  });

export const PassengerControlContext = createContext(false);

export function usePresentationSizes() {
  const { textSize, largerControls } = useContext(AccessibilityRuntimeContext);
  return useMemo(
    () => resolvePresentationSizes({ textSize, largerControls }),
    [textSize, largerControls],
  );
}

export function useNavigationInset(extra = 0) {
  return (
    (useContext(AccessibilityRuntimeContext).navigationHeight ?? 86) + extra
  );
}
