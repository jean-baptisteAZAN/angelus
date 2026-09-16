import { Text, type TextProps } from "react-native";
import { colors, fonts } from "./theme";

type Props = TextProps & { size?: number; color?: string };

/** Big Shoulders Display: themes, track titles, big numbers, buttons. */
export function Display({ size = 28, color = colors.toner, style, ...rest }: Props) {
  return (
    <Text
      {...rest}
      style={[{ fontFamily: fonts.display, fontSize: size, lineHeight: size * 1.02, color, letterSpacing: -0.3 }, style]}
    />
  );
}

/** Courier Prime: everything else, like typed on a typewriter. */
export function Type({ size = 15, color = colors.toner, bold = false, style, ...rest }: Props & { bold?: boolean }) {
  return (
    <Text
      {...rest}
      style={[{ fontFamily: bold ? fonts.typeBold : fonts.type, fontSize: size, lineHeight: size * 1.35, color }, style]}
    />
  );
}
