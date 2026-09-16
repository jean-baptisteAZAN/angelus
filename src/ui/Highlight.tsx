import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { colors } from "./theme";

/** Fluo highlighter swipe behind a whole line (never a single word). */
export function Highlight({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{ alignSelf: "flex-start" }, style]}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: -4,
          right: -6,
          top: "4%",
          bottom: "4%",
          backgroundColor: colors.fluo,
          transform: [{ skewX: "-6deg" }, { rotate: "-0.6deg" }],
        }}
      />
      {children}
    </View>
  );
}
