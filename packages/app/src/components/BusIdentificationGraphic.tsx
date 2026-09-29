import React from "react";
import { View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { usePresentationSizes } from "../accessibility/AccessibilityRuntime";

/** Decorative, scalable bus identification cue. It never conveys live readiness. */
export function BusIdentificationGraphic({
  lightMode,
  highContrast,
}: {
  lightMode: boolean;
  highContrast: boolean;
}) {
  const sizes = usePresentationSizes();
  const ink = highContrast
    ? lightMode
      ? "#000000"
      : "#FFFFFF"
    : lightMode
      ? "#075969"
      : "#A4E8F1";
  const surface = lightMode ? "#F3F8F8" : "#12363E";
  const glass = lightMode ? "#D1EBF0" : "#24505B";
  return (
    <View
      testID="bus-identification-graphic"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: sizes.enlarged ? 256 : 224,
        maxWidth: "100%",
        aspectRatio: 2,
        flexShrink: 0,
      }}
    >
      <Svg width="100%" height="100%" viewBox="0 0 256 128" aria-hidden={true}>
        <Rect
          x="2"
          y="2"
          width="252"
          height="124"
          rx="24"
          fill={surface}
          stroke={ink}
          strokeWidth={highContrast ? 3 : 1.5}
        />
        <Path
          d="M26 111h132"
          stroke={ink}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <Rect x="52" y="101" width="16" height="13" rx="5" fill={ink} />
        <Rect x="117" y="101" width="16" height="13" rx="5" fill={ink} />
        <Rect
          x="46"
          y="21"
          width="93"
          height="85"
          rx="17"
          fill={lightMode ? "#FFFFFF" : "#12363E"}
          stroke={ink}
          strokeWidth="4"
        />
        <Rect x="78" y="15" width="29" height="8" rx="4" fill={ink} />
        <Circle cx="85" cy="19" r="2" fill={surface} />
        <Circle cx="100" cy="19" r="2" fill={surface} />
        <Rect
          x="57"
          y="33"
          width="71"
          height="40"
          rx="8"
          fill={glass}
          stroke={ink}
          strokeWidth="3"
        />
        <Path
          d="M46 47h-7v19m100-19h7v19M61 95h62M75 81h35"
          fill="none"
          stroke={ink}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx="63" cy="85" r="5" fill={ink} />
        <Circle cx="122" cy="85" r="5" fill={ink} />
        <Path d="M162 52h8l13-10v44l-13-10h-8z" fill={ink} />
        <Path
          d="M195 52q10 12 0 24m12-35q20 23 0 46m12-57q30 34 0 68"
          fill="none"
          stroke={ink}
          strokeWidth="5"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}
