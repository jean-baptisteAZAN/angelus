import { View, type ViewStyle } from "react-native";
import { colors } from "./theme";

/** A strip of translucent tape. Position it absolutely over the element it holds. */
export function Tape({ style, width = 56, rotate = -8 }: { style?: ViewStyle; width?: number; rotate?: number }) {
  return (
    <View
      pointerEvents="none"
      style={[
        { position: "absolute", width, height: 20, backgroundColor: colors.tape, transform: [{ rotate: `${rotate}deg` }] },
        style,
      ]}
    />
  );
}
