import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/ui/Button";
import { Highlight } from "@/ui/Highlight";
import { Paper } from "@/ui/Paper";
import { Display, Type } from "@/ui/Text";
import { colors } from "@/ui/theme";

const JOIN_LINK = /^angelus:\/\/join\/([A-Za-z0-9_-]+)$/;

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  const onScanned = ({ data }: { data: string }) => {
    if (handled.current) return;
    const match = JOIN_LINK.exec(data.trim());
    if (!match) {
      setError("Ce QR code n'est pas un groupe Angelus.");
      return;
    }
    handled.current = true;
    router.replace(`/join/${match[1]}`);
  };

  return (
    <Paper edges={["bottom"]} style={{ padding: 20, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Type>Fermer</Type>
        </Pressable>
        <Display size={30}>Rejoindre un groupe</Display>
      </View>

      {!permission ? null : !permission.granted ? (
        <View style={{ gap: 12 }}>
          <Type>Angelus utilise la caméra pour lire le QR code d'un groupe.</Type>
          {permission.canAskAgain ? (
            <Button label="Autoriser la caméra" onPress={requestPermission} />
          ) : (
            <Button label="Ouvrir les réglages" onPress={() => Linking.openSettings()} />
          )}
        </View>
      ) : (
        <>
          <View style={{ flex: 1, borderWidth: 3, borderColor: colors.toner, overflow: "hidden" }}>
            <CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={onScanned} />
          </View>
          {error ? (
            <Highlight>
              <Type bold>{error}</Type>
            </Highlight>
          ) : (
            <Type>Vise le QR code que ton ami affiche depuis son onglet Groupe.</Type>
          )}
        </>
      )}
    </Paper>
  );
}
