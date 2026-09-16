import { Pressable } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { colors } from "./theme";

export function PlayButton({ playing, onPress, size = 44 }: { playing: boolean; onPress: () => void; size?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={playing ? "Mettre en pause" : "Écouter l'extrait"}
      onPress={onPress}
      hitSlop={8}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: colors.toner,
        backgroundColor: playing ? colors.toner : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={size * 0.4} height={size * 0.4} viewBox="0 0 10 10">
        {playing ? (
          <>
            <Rect x={1.5} y={1} width={2.5} height={8} fill={colors.paperNew} />
            <Rect x={6} y={1} width={2.5} height={8} fill={colors.paperNew} />
          </>
        ) : (
          <Path d="M2.5 1 L9 5 L2.5 9 Z" fill={colors.toner} />
        )}
      </Svg>
    </Pressable>
  );
}
