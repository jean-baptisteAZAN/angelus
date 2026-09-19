import { router } from "expo-router";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useGroups } from "@/hooks/useGroups";
import { useMembers } from "@/hooks/useMembers";
import { useSession } from "@/hooks/useSession";
import { MAX_GROUP_SIZE, removeFromGroup } from "@/lib/data";
import { Avatar } from "@/ui/Avatar";
import { Button } from "@/ui/Button";
import { GroupSwitcher } from "@/ui/GroupSwitcher";
import { NoGroup, promptCreateGroup } from "@/ui/NoGroup";
import { Paper } from "@/ui/Paper";
import { QrReveal } from "@/ui/QrReveal";
import { Display, Type } from "@/ui/Text";
import { colors } from "@/ui/theme";

export default function GroupScreen() {
  const { user } = useSession();
  const { selected, loading, select } = useGroups();
  const names = useMembers(selected?.memberIds ?? []);

  if (loading) return <Paper>{null}</Paper>;
  if (!selected || !user) return <NoGroup />;

  const isOwner = selected.ownerId === user.uid;

  const confirmRemove = (uid: string) =>
    Alert.alert(`Retirer ${names[uid] ?? "ce membre"} ?`, "Il pourra revenir en rescannant le QR code.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Retirer",
        style: "destructive",
        onPress: () =>
          removeFromGroup(selected.id, uid).catch(() =>
            Alert.alert("Impossible de retirer ce membre", "Vérifie ta connexion et réessaie."),
          ),
      },
    ]);

  const confirmLeave = () =>
    Alert.alert(`Quitter ${selected.name} ?`, "Tes sons passés restent dans sa playlist.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Quitter",
        style: "destructive",
        onPress: () =>
          removeFromGroup(selected.id, user.uid).catch(() =>
            Alert.alert("Impossible de quitter le groupe", "Vérifie ta connexion et réessaie."),
          ),
      },
    ]);

  return (
    <Paper>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <GroupSwitcher />
          </View>
          <Pressable
            onPress={() => router.push("/settings")}
            hitSlop={10}
            accessibilityRole="button"
            style={{ borderBottomWidth: 2, borderColor: colors.toner, paddingBottom: 2 }}
          >
            <Type bold>Réglages</Type>
          </Pressable>
        </View>



        <QrReveal groupId={selected.id} groupName={selected.name} />

        <View style={{ gap: 12 }}>
          <Display size={26}>
            Membres {selected.memberIds.length} / {MAX_GROUP_SIZE}
          </Display>
          {selected.memberIds.map((uid) => (
            <View key={uid} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar name={names[uid] ?? "?"} />
              <View style={{ flex: 1 }}>
                <Display size={22}>{uid === user.uid ? `${names[uid] ?? "Toi"} (toi)` : names[uid] ?? "…"}</Display>
                {uid === selected.ownerId && <Type size={12}>créateur</Type>}
              </View>
              {isOwner && uid !== user.uid && (
                <Pressable
                  onPress={() => confirmRemove(uid)}
                  hitSlop={10}
                  accessibilityRole="button"
                  style={{ borderBottomWidth: 2, borderColor: colors.marker }}
                >
                  <Type bold>Retirer</Type>
                </Pressable>
              )}
            </View>
          ))}
        </View>

        <View style={{ gap: 12 }}>
          <Button label="Scanner un code" variant="secondary" onPress={() => router.push("/scan")} />
          <Button label="Créer un groupe" variant="secondary" onPress={() => promptCreateGroup(user.uid, select)} />
          {!isOwner && <Button label="Quitter le groupe" variant="danger" onPress={confirmLeave} />}
        </View>
      </ScrollView>
    </Paper>
  );
}
