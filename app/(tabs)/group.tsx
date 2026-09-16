import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, AppState, Linking, Pressable, ScrollView, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useGroups } from "@/hooks/useGroups";
import { useMembers } from "@/hooks/useMembers";
import { useSession } from "@/hooks/useSession";
import { deleteAccount, isAppleCancel } from "@/lib/auth";
import { MAX_GROUP_SIZE, removeFromGroup } from "@/lib/data";
import { getPushPermission, registerForPush, type PushPermission } from "@/lib/notifications";
import { Avatar } from "@/ui/Avatar";
import { Button } from "@/ui/Button";
import { GroupSwitcher } from "@/ui/GroupSwitcher";
import { Highlight } from "@/ui/Highlight";
import { NoGroup, promptCreateGroup } from "@/ui/NoGroup";
import { Paper } from "@/ui/Paper";
import { Tape } from "@/ui/Tape";
import { Display, Type } from "@/ui/Text";
import { colors } from "@/ui/theme";

export default function GroupScreen() {
  const { user } = useSession();
  const { selected, loading, select } = useGroups();
  const names = useMembers(selected?.memberIds ?? []);
  const permission = usePushPermission();
  const [deleting, setDeleting] = useState(false);

  if (loading) return <Paper>{null}</Paper>;
  if (!selected || !user) return <NoGroup />;

  const isOwner = selected.ownerId === user.uid;

  const confirmRemove = (uid: string) =>
    Alert.alert(`Retirer ${names[uid] ?? "ce membre"} ?`, "Il pourra revenir en rescannant le QR code.", [
      { text: "Annuler", style: "cancel" },
      { text: "Retirer", style: "destructive", onPress: () => removeFromGroup(selected.id, uid).catch(() => {}) },
    ]);

  const confirmLeave = () =>
    Alert.alert(`Quitter ${selected.name} ?`, "Tes sons passés restent dans sa playlist.", [
      { text: "Annuler", style: "cancel" },
      { text: "Quitter", style: "destructive", onPress: () => removeFromGroup(selected.id, user.uid).catch(() => {}) },
    ]);

  const confirmDelete = () =>
    Alert.alert(
      "Supprimer ton compte ?",
      "Tu quittes tes groupes, ceux que tu as créés sont supprimés, et ton pseudo disparaît. Apple te demandera de confirmer.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
            } catch (error) {
              if (!isAppleCancel(error)) Alert.alert("Suppression impossible", "Réessaie dans un instant.");
              setDeleting(false);
            }
          },
        },
      ],
    );

  return (
    <Paper>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 24 }}>
        <GroupSwitcher />

        {permission === "denied" && (
          <Pressable onPress={() => Linking.openSettings()} accessibilityRole="button">
            <Highlight>
              <Type bold>Notifs désactivées : tu rateras le thème. Touche ici pour les réactiver.</Type>
            </Highlight>
          </Pressable>
        )}

        <View style={{ alignItems: "center", gap: 12 }}>
          <View style={{ backgroundColor: colors.paperNew, padding: 18, transform: [{ rotate: "2deg" }], borderWidth: 1, borderColor: colors.toner }}>
            <Tape style={{ top: -10, left: -12 }} rotate={-30} />
            <Tape style={{ bottom: -8, right: -14 }} rotate={-20} />
            <QRCode value={`angelus://join/${selected.id}`} size={200} color={colors.toner} backgroundColor={colors.paperNew} />
          </View>
          <Type style={{ textAlign: "center" }}>Fais scanner ce code par tes amis. Il les ajoute directement au groupe.</Type>
        </View>

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
                <Pressable onPress={() => confirmRemove(uid)} hitSlop={10} accessibilityRole="button">
                  <Type bold color={colors.marker}>
                    Retirer
                  </Type>
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

        <Button label="Supprimer mon compte" variant="danger" onPress={confirmDelete} loading={deleting} />
      </ScrollView>
    </Paper>
  );
}

function usePushPermission(): PushPermission | null {
  const { user } = useSession();
  const [permission, setPermission] = useState<PushPermission | null>(null);

  const refresh = useCallback(() => {
    getPushPermission().then(setPermission).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      refresh();
      if (user) registerForPush(user.uid).catch(() => {});
    });
    return () => sub.remove();
  }, [refresh, user]);

  return permission;
}
