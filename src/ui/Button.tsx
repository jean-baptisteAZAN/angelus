import { ActivityIndicator, Pressable, type ViewStyle } from "react-native";
import { Display } from "./Text";
import { colors } from "./theme";

type Props = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

export function Button({ label, onPress, variant = "primary", disabled, loading, style }: Props) {
  const primary = variant === "primary";
  const tint = variant === "danger" ? colors.marker : colors.toner;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          minHeight: 52,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 18,
          backgroundColor: primary ? colors.toner : "transparent",
          borderWidth: 2,
          borderColor: tint,
          opacity: disabled ? 0.35 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? colors.paperNew : tint} />
      ) : (
        <Display size={24} color={primary ? colors.paperNew : colors.toner}>
          {label}
        </Display>
      )}
    </Pressable>
  );
}
