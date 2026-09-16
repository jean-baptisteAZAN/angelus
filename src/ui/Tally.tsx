import Svg, { Path } from "react-native-svg";
import { colors } from "./theme";

const STROKE = 3;
const HEIGHT = 22;
const GAP = 6;

/** Deterministic small wobble so marks look hand drawn but stay stable across renders. */
function jitter(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 2.4;
}

/** Red marker tally marks: groups of four strokes crossed by a fifth. */
export function Tally({ count, color = colors.marker }: { count: number; color?: string }) {
  if (count <= 0) return null;
  const groups = Math.ceil(count / 5);
  const width = groups * (4 * GAP + 14) - 8;
  const paths: string[] = [];

  for (let g = 0; g < groups; g++) {
    const inGroup = Math.min(5, count - g * 5);
    const x0 = g * (4 * GAP + 14) + 2;
    for (let s = 0; s < Math.min(4, inGroup); s++) {
      const x = x0 + s * GAP;
      paths.push(`M${x + jitter(g * 5 + s, 1)} ${2 + jitter(s, 2)} L${x + jitter(g * 5 + s, 3)} ${HEIGHT - 2}`);
    }
    if (inGroup === 5) {
      paths.push(`M${x0 - 4} ${HEIGHT - 5 + jitter(g, 4)} L${x0 + 3 * GAP + 4} ${5 + jitter(g, 5)}`);
    }
  }

  return (
    <Svg width={width} height={HEIGHT}>
      {paths.map((d, i) => (
        <Path key={i} d={d} stroke={color} strokeWidth={STROKE} strokeLinecap="round" fill="none" />
      ))}
    </Svg>
  );
}
