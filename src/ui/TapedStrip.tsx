import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { Tape } from "./Tape";
import { colors } from "./theme";

/** Cut-out strip of fresh paper taped slightly askew (theme, sticker, own post card). */
export function TapedStrip({ children, rotate = -1.5, style }: { children: ReactNode; rotate?: number; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.paperNew,
          paddingHorizontal: 16,
          paddingVertical: 14,
          transform: [{ rotate: `${rotate}deg` }],
          shadowColor: colors.toner,
          shadowOpacity: 0.12,
          shadowRadius: 2,
          shadowOffset: { width: 1, height: 2 },
        },
        style,
      ]}
    >
      <Tape style={{ top: -10, left: -14 }} rotate={-18} />
      <Tape style={{ bottom: -8, right: -12 }} rotate={-12} />
      {children}
    </View>
  );
}
