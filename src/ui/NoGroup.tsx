import { router } from "expo-router";
import { Alert, View } from "react-native";
import { useGroups } from "@/hooks/useGroups";
import { useSession } from "@/hooks/useSession";
import { createGroup } from "@/lib/data";
import { Button } from "./Button";
import { Paper } from "./Paper";
import { TapedStrip } from "./TapedStrip";
import { Display, Type } from "./Text";

export function promptCreateGroup(uid: string, onCreated: (gid: string) => void) {
  Alert.prompt("Créer un groupe", "Donne-lui un nom, tes amis le verront.", async (name) => {
    if (!name?.trim()) return;
    try {
      onCreated(await createGroup(uid, name.slice(0, 30)));
    } catch {
      Alert.alert("Création impossible", "Vérifie ta connexion et réessaie.");
    }
  });
}

/** Empty state shown by every tab while the user has no group. */
export function NoGroup() {
  const { user } = useSession();
  const { select } = useGroups();
  return (
    <Paper style={{ paddingHorizontal: 20, justifyContent: "center", gap: 28 }}>
      <TapedStrip>
        <Display size={36}>Tu n'as pas encore de groupe</Display>
      </TapedStrip>
      <Type>Crée le tien et fais scanner son QR code à tes amis, ou scanne le code d'un groupe existant.</Type>
      <View style={{ gap: 12 }}>
        <Button label="Créer un groupe" onPress={() => user && promptCreateGroup(user.uid, select)} />
        <Button label="Scanner un code" variant="secondary" onPress={() => router.push("/scan")} />
      </View>
    </Paper>
  );
}
