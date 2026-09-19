import { useState } from "react";
import { Alert, KeyboardAvoidingView, TextInput, View } from "react-native";
import { useSession } from "@/hooks/useSession";
import { createProfile } from "@/lib/data";
import { Button } from "@/ui/Button";
import { Paper } from "@/ui/Paper";
import { Display, Type } from "@/ui/Text";
import { colors, fonts } from "@/ui/theme";

export default function OnboardingScreen() {
  const { user, suggestedName } = useSession();
  const [name, setName] = useState(suggestedName ?? "");
  const [saving, setSaving] = useState(false);
  const valid = name.trim().length > 0 && name.trim().length <= 30;

  const onContinue = async () => {
    if (!user || !valid) return;
    setSaving(true);
    try {
      await createProfile(user.uid, name);
    } catch {
      Alert.alert("Enregistrement impossible", "Vérifie ta connexion et réessaie.");
      setSaving(false);
    }
  };

  return (
    <Paper edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, paddingHorizontal: 24, justifyContent: "space-between" }}>
        <View style={{ marginTop: 64, gap: 16 }}>
          <Display size={48}>Comment on t'appelle ?</Display>
          <Type>Ce nom apparaît à côté de tes sons et de tes votes.</Type>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Ton prénom ou ton pseudo"
            placeholderTextColor={colors.screen}
            maxLength={30}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={onContinue}
            style={{
              borderWidth: 2,
              borderColor: colors.toner,
              backgroundColor: colors.paperNew,
              paddingHorizontal: 14,
              height: 56,
              fontFamily: fonts.typeBold,
              fontSize: 20,
              color: colors.toner,
            }}
          />
        </View>
        <Button label="Continuer" onPress={onContinue} disabled={!valid} loading={saving} style={{ marginBottom: 16 }} />
      </KeyboardAvoidingView>
    </Paper>
  );
}
