import { View } from "react-native";
import { Type } from "./Text";
import { colors } from "./theme";

export function LateBadge({ late }: { late: boolean }) {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        borderWidth: 1.5,
        borderColor: late ? colors.marker : colors.toner,
        backgroundColor: late ? colors.marker : "transparent",
        paddingHorizontal: 6,
      }}
    >
      <Type size={12} bold color={late ? colors.paperNew : colors.toner}>
        {late ? "en retard" : "à l'heure"}
      </Type>
    </View>
  );
}
