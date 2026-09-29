import React from "react";
import { NativeJourneyMap } from "./NativeJourneyMap.native";
import type { JourneyMapProps } from "./JourneyMap.types";

export function JourneyMap(props: JourneyMapProps) {
  return <NativeJourneyMap {...props} />;
}
