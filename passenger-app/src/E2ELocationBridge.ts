import { Platform } from "react-native";

export const e2eLocationEvent = "goassist:e2e-location";

export type E2ELocationUpdate = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number;
};

/** Development-only browser location seam used by the real-backend E2E run. */
export function subscribeToDevelopmentE2ELocation(
  listener: (update: E2ELocationUpdate) => void,
) {
  if (
    !__DEV__ ||
    Platform.OS !== "web" ||
    typeof window === "undefined" ||
    typeof window.addEventListener !== "function" ||
    typeof window.removeEventListener !== "function"
  ) {
    return () => undefined;
  }
  const handle = (event: Event) => {
    const update = (event as CustomEvent<E2ELocationUpdate>).detail;
    if (
      !update ||
      !Number.isFinite(update.latitude) ||
      !Number.isFinite(update.longitude)
    ) {
      return;
    }
    listener(update);
  };
  window.addEventListener(e2eLocationEvent, handle);
  return () => window.removeEventListener(e2eLocationEvent, handle);
}
