import { Canvas, ColorMatrix, FractalNoise, Rect } from "@shopify/react-native-skia";
import { useState, type ReactNode } from "react";
import { StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "./theme";

// Keeps only the darkest noise specks, as sparse toner grain (same matrix as the mockup's SVG filter).
const GRAIN = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, -4.35];

/** Screen background: photocopy paper with light toner grain, safe-area aware. */
export function Paper({ children, style, edges = ["top"] }: { children: ReactNode; style?: ViewStyle; edges?: ("top" | "bottom")[] }) {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => setSize(e.nativeEvent.layout);

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.root,
        { paddingTop: edges.includes("top") ? insets.top : 0, paddingBottom: edges.includes("bottom") ? insets.bottom : 0 },
        style,
      ]}
    >
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Rect x={0} y={0} width={size.width} height={size.height} opacity={0.5}>
          <FractalNoise freqX={1.05} freqY={1.05} octaves={2} seed={4} />
          <ColorMatrix matrix={GRAIN} />
        </Rect>
      </Canvas>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
});
