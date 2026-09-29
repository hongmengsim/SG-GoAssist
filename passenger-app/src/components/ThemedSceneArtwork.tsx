import React, { memo } from "react";
import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export const SCENE_ARTWORK_ASPECT_RATIO = 3 / 2;

export const ThemedSceneArtwork = memo(function ThemedSceneArtwork({
  source,
  accessibilityLabel,
  decorative = false,
  lightMode,
  highContrast,
  bordered = true,
  style,
  imageStyle,
  testID,
}: {
  source: ImageSourcePropType;
  accessibilityLabel?: string;
  decorative?: boolean;
  lightMode: boolean;
  highContrast: boolean;
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  testID?: string;
}) {
  const backgroundColor = lightMode
    ? highContrast
      ? "#FFFFFF"
      : "#F3F8F8"
    : highContrast
      ? "#000000"
      : "#102B31";
  const borderColor = highContrast
    ? lightMode
      ? "#000000"
      : "#FFFFFF"
    : lightMode
      ? "#91B1B7"
      : "#5F858C";

  return (
    <View
      testID={testID}
      accessibilityRole={decorative ? undefined : "image"}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      accessible={!decorative}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? "no" : "auto"}
      style={[
        styles.frame,
        {
          backgroundColor,
          borderColor,
          borderWidth: bordered ? (highContrast ? 3 : 1) : 0,
        },
        style,
      ]}
    >
      <Image
        source={source}
        resizeMode="contain"
        style={[styles.image, imageStyle]}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
});

const styles = StyleSheet.create({
  frame: {
    alignSelf: "stretch",
    aspectRatio: SCENE_ARTWORK_ASPECT_RATIO,
    borderRadius: 18,
    flexShrink: 0,
    justifyContent: "center",
    maxWidth: "100%",
    overflow: "hidden",
    width: "100%",
  },
  image: {
    height: "100%",
    width: "100%",
  },
});
