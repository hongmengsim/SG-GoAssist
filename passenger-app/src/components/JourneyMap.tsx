import React, { useEffect } from "react";
import { View } from "react-native";
import type { JourneyMapProps } from "./JourneyMap.types";

// Metro selects JourneyMap.web.tsx or JourneyMap.native.tsx at runtime.
// This neutral implementation keeps non-platform tooling deterministic.
export function JourneyMap({
  fallback,
  onProviderAvailabilityChange,
}: JourneyMapProps) {
  useEffect(() => {
    onProviderAvailabilityChange(false);
  }, [onProviderAvailabilityChange]);

  return <View style={{ flex: 1 }}>{fallback}</View>;
}
