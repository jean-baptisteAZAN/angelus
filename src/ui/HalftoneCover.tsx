import { Canvas, Fill, ImageShader, Shader, Skia, useImage } from "@shopify/react-native-skia";
import { View } from "react-native";
import { colors } from "./theme";

// Black & white halftone: one dot per cell, dot radius driven by the cell's luminance.
const HALFTONE = Skia.RuntimeEffect.Make(`
uniform shader image;
uniform float cell;
uniform vec3 paper;

half4 main(vec2 xy) {
  vec2 center = (floor(xy / cell) + 0.5) * cell;
  half4 c = image.eval(center);
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  lum = clamp((lum - 0.5) * 1.5 + 0.5, 0.0, 1.0);
  float radius = (1.0 - lum) * cell * 0.75;
  float ink = 1.0 - smoothstep(radius - 0.7, radius + 0.7, distance(xy, center));
  return half4(mix(paper, vec3(0.0), ink), 1.0);
}
`)!;

const PAPER = [0xf7 / 255, 0xf7 / 255, 0xf3 / 255];

/** Album cover printed like a photocopy. */
export function HalftoneCover({ uri, size }: { uri: string; size: number }) {
  const image = useImage(uri);
  const rect = { x: 0, y: 0, width: size, height: size };

  return (
    <View style={{ width: size, height: size, borderWidth: 1, borderColor: colors.toner, backgroundColor: colors.paperNew }}>
      <Canvas style={{ width: size - 2, height: size - 2 }}>
        {image && (
          <Fill>
            <Shader source={HALFTONE} uniforms={{ cell: Math.max(2.5, size / 28), paper: PAPER }}>
              <ImageShader image={image} fit="cover" rect={rect} />
            </Shader>
          </Fill>
        )}
      </Canvas>
    </View>
  );
}
