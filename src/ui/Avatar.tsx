import { View } from "react-native";
import { Display } from "./Text";
import { colors } from "./theme";

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: colors.toner,
        backgroundColor: colors.paperNew,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Display size={size * 0.5}>{name.slice(0, 1).toUpperCase()}</Display>
    </View>
  );
}
