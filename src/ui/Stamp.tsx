import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated } from "react-native";
import { Display } from "./Text";
import { colors } from "./theme";

/** Red rubber stamp "Posté 14:59". Slams once when `animate` is true, unless reduced motion is on. */
export function Stamp({ label, animate }: { label: string; animate: boolean }) {
  const progress = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (!animate) return;
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    Animated.spring(progress, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
  }, [animate, reduceMotion, progress]);

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1.8, 1] });
  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [{ rotate: "-9deg" }, { scale }],
        borderWidth: 3,
        borderColor: colors.marker,
        paddingHorizontal: 8,
        paddingVertical: 2,
      }}
    >
      <Display size={20} color={colors.marker}>
        {label}
      </Display>
    </Animated.View>
  );
}
