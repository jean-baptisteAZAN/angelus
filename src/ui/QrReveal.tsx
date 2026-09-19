import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Button } from "./Button";
import { Tape } from "./Tape";
import { Type } from "./Text";
import { colors } from "./theme";

const QR = 200;
const PADDING = 18;
const SHEET = QR + PADDING * 2;

/**
 * The invite QR is hidden until asked for, then photocopied: a fluo scan bar sweeps down
 * and the code appears in its wake. Reduced motion shows the finished sheet instead.
 */
export function QrReveal({ groupId, groupName }: { groupId: string; groupName: string }) {
  const [shown, setShown] = useState(false);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const scan = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => setReduceMotion(false));
  }, []);

  useEffect(() => {
    if (!shown || reduceMotion === null) return;
    if (reduceMotion) {
      scan.setValue(1);
      return;
    }
    scan.setValue(0);
    Animated.timing(scan, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: false }).start();
  }, [shown, reduceMotion, scan]);

  if (!shown) {
    return (
      <View style={{ gap: 10 }}>
        <Button label="Afficher le QR code" onPress={() => setShown(true)} />
        <Type size={13}>Ton ami le scanne, il arrive directement dans {groupName}.</Type>
      </View>
    );
  }

  const revealedHeight = scan.interpolate({ inputRange: [0, 1], outputRange: [0, SHEET] });
  const barTop = scan.interpolate({ inputRange: [0, 1], outputRange: [0, SHEET] });
  const barOpacity = scan.interpolate({ inputRange: [0, 0.9, 1], outputRange: [1, 1, 0] });

  return (
    <View style={{ gap: 12, alignItems: "center" }}>
      <View style={{ width: SHEET, height: SHEET, backgroundColor: colors.paper, transform: [{ rotate: "2deg" }] }}>
        {/* The sheet is clipped to the scanned height, so the code prints from top to bottom. */}
        <Animated.View style={{ height: revealedHeight, overflow: "hidden" }}>
          <View style={{ width: SHEET, height: SHEET, padding: PADDING, backgroundColor: colors.paperNew, borderWidth: 1, borderColor: colors.toner }}>
            <QRCode value={`angelus://join/${groupId}`} size={QR} color={colors.toner} backgroundColor={colors.paperNew} />
          </View>
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={{ position: "absolute", left: -6, right: -6, top: barTop, height: 5, backgroundColor: colors.fluo, opacity: barOpacity }}
        />
        <Tape style={{ top: -10, left: -12 }} rotate={-30} />
        <Tape style={{ bottom: -8, right: -14 }} rotate={-20} />
      </View>
      <Type size={13} style={{ textAlign: "center" }}>
        Ton ami le scanne, il arrive directement dans {groupName}.
      </Type>
      <Button label="Ranger le QR code" variant="secondary" onPress={() => setShown(false)} />
    </View>
  );
}
