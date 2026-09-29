import React, { forwardRef, useContext } from "react";
import {
  Pressable,
  Text,
  StyleSheet,
  type PressableProps,
  type TextProps,
  type View,
} from "react-native";
import {
  PassengerControlContext,
  usePresentationSizes,
} from "./AccessibilityRuntime";

/** Keep labelled actions large enough even when legacy callers use small styles. */
export const PassengerPressable = forwardRef<View, PressableProps>(
  function PassengerPressable({ style, children, ...props }, ref) {
    const sizes = usePresentationSizes();
    return (
      <Pressable
        {...props}
        ref={ref}
        style={(state) => {
          const original = typeof style === "function" ? style(state) : style;
          const flat = StyleSheet.flatten(original) ?? {};
          // Full-screen dismiss backdrops are not visible controls.
          const backdrop =
            flat.position === "absolute" && flat.top === 0 && flat.bottom === 0;
          if (backdrop) return original;
          const minimum =
            typeof flat.minHeight === "number" && flat.minHeight >= 64
              ? sizes.primaryHeight
              : sizes.controlHeight;
          return [
            original,
            {
              minHeight: Math.max(
                minimum,
                typeof flat.minHeight === "number" ? flat.minHeight : 0,
              ),
              minWidth: Math.max(
                sizes.controlHeight,
                typeof flat.minWidth === "number" ? flat.minWidth : 0,
              ),
              ...(typeof flat.height === "number" && flat.height < minimum
                ? { height: minimum }
                : {}),
              ...(typeof flat.width === "number" &&
              flat.width < sizes.controlHeight
                ? { width: sizes.controlHeight }
                : {}),
              flexShrink: 0,
            },
          ];
        }}
      >
        {(state) => (
          <PassengerControlContext.Provider value={true}>
            {typeof children === "function" ? children(state) : children}
          </PassengerControlContext.Provider>
        )}
      </Pressable>
    );
  },
);

/** Shared text for feature modules which previously bypassed app text preferences. */
export const PassengerText = forwardRef<Text, TextProps>(function PassengerText(
  { style, ...props },
  ref,
) {
  const sizes = usePresentationSizes();
  const control = useContext(PassengerControlContext);
  const flat = StyleSheet.flatten(style) ?? {};
  const base = flat.fontSize ?? 16;
  const minimum = control
    ? sizes.buttonText
    : base < 16
      ? sizes.metadataText
      : sizes.bodyText;
  const fontSize = Math.max(base, minimum);
  return (
    <Text
      {...props}
      ref={ref}
      style={[
        style,
        {
          fontSize,
          lineHeight: Math.max(
            flat.lineHeight ?? 0,
            Math.ceil(fontSize * 1.35),
          ),
          flexShrink: 1,
        },
      ]}
    />
  );
});
