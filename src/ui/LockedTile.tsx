import Svg, { Path } from "react-native-svg";
import { View } from "react-native";
import { Type } from "./Text";
import { Tape } from "./Tape";
import { colors } from "./theme";

/** A friend's track you can't see yet: failed photocopy with a toner smear and a "caché" tape. */
export function LockedTile({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Path
          d="M6 62 C 20 48, 38 70, 55 56 S 86 50, 95 60 L 94 72 C 80 66, 64 80, 46 72 S 16 76, 5 74 Z"
          fill={colors.toner}
        />
        <Path d="M10 30 L 40 26 M 58 34 L 88 30" stroke={colors.screen} strokeWidth={3} strokeDasharray="1 4" />
      </Svg>
      <Tape style={{ top: -6, left: size / 2 - 30 }} width={60} rotate={-4} />
      <Type size={12} bold style={{ position: "absolute", top: -4, width: size, textAlign: "center" }}>
        caché
      </Type>
    </View>
  );
}
