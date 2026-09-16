import * as AppleAuthentication from "expo-apple-authentication";
import { useState } from "react";
import { Alert, View } from "react-native";
import { useSession } from "@/hooks/useSession";
import { isAppleCancel, signInWithApple } from "@/lib/auth";
import { Highlight } from "@/ui/Highlight";
import { Paper } from "@/ui/Paper";
import { TapedStrip } from "@/ui/TapedStrip";
import { Display, Type } from "@/ui/Text";

export default function SignInScreen() {
  const { setSuggestedName } = useSession();
  const [busy, setBusy] = useState(false);

  const onSignIn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setSuggestedName(await signInWithApple());
    } catch (error) {
      if (!isAppleCancel(error)) Alert.alert("Connexion impossible", "La connexion avec Apple a échoué. Réessaie.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper edges={["top", "bottom"]} style={{ paddingHorizontal: 24, justifyContent: "space-between" }}>
      <View style={{ marginTop: 72, gap: 28 }}>
        <Display size={96} style={{ lineHeight: 88 }}>
          Angelus
        </Display>
        <TapedStrip rotate={-2}>
          <Display size={30}>Un thème absurde par jour. Un son. Tes potes votent.</Display>
        </TapedStrip>
        <Highlight>
          <Type size={16}>Le thème tombe à une heure surprise. Tu as 1 h pour poster.</Type>
        </Highlight>
      </View>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={0}
        style={{ height: 56, marginBottom: 24 }}
        onPress={onSignIn}
      />
    </Paper>
  );
}
