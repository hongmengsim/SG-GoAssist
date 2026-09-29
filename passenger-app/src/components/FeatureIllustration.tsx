import React, { memo } from "react";
import {
  type ImageStyle,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { ThemedSceneArtwork } from "./ThemedSceneArtwork";

export type FeatureIllustrationSize = "small" | "medium" | "large" | "hero";

const sizeStyles: Record<
  FeatureIllustrationSize,
  { height: number; width: number }
> = {
  small: {
    height: 72,
    width: 88,
  },
  medium: {
    height: 96,
    width: 144,
  },
  large: {
    height: 104,
    width: 160,
  },
  hero: {
    height: 100,
    width: 150,
  },
};

export const FeatureIllustration = memo(function FeatureIllustration({
  source,
  accessibilityLabel,
  decorative = false,
  size = "medium",
  lightMode = true,
  highContrast = false,
  imageStyle,
  style,
  testID,
}: {
  source: ImageSourcePropType;
  accessibilityLabel?: string;
  decorative?: boolean;
  size?: FeatureIllustrationSize;
  lightMode?: boolean;
  highContrast?: boolean;
  imageStyle?: StyleProp<ImageStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <ThemedSceneArtwork
      source={source}
      accessibilityLabel={accessibilityLabel}
      decorative={decorative}
      lightMode={lightMode}
      highContrast={highContrast}
      testID={testID}
      style={[sizeStyles[size], style]}
      imageStyle={imageStyle}
    />
  );
});
