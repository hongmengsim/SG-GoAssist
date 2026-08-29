import React, { memo } from "react";
import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";

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
    width: 112,
  },
  large: {
    height: 104,
    width: 160,
  },
  hero: {
    height: 100,
    width: 120,
  },
};

export const FeatureIllustration = memo(function FeatureIllustration({
  source,
  accessibilityLabel,
  decorative = false,
  size = "medium",
  style,
  testID,
}: {
  source: ImageSourcePropType;
  accessibilityLabel?: string;
  decorative?: boolean;
  size?: FeatureIllustrationSize;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={[styles.container, sizeStyles[size], style]}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? "no" : "auto"}
    >
      <Image
        source={source}
        style={[styles.image, sizeStyles[size]]}
        resizeMode="contain"
        accessible={!decorative}
        accessibilityLabel={decorative ? undefined : accessibilityLabel}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignSelf: "center",
    flexShrink: 0,
    justifyContent: "center",
    maxWidth: "100%",
  },
  image: {
    flexShrink: 0,
  },
});
