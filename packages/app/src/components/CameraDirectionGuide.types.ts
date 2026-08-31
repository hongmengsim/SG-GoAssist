import type { RoutingCoordinate } from "../routing/RoutingProvider";

export type CameraDirectionGuideProps = {
  visible: boolean;
  currentLocation?: RoutingCoordinate | null;
  locationAccuracyMeters?: number | null;
  initialHeadingDegrees?: number | null;
  target?: RoutingCoordinate | null;
  distanceMeters?: number | null;
  instruction: string;
  nextInstruction?: string;
  onClose: () => void;
  onRepeat?: () => void;
};
