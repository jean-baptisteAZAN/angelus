import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, AppState, Linking, Pressable, ScrollView, View } from "react-native";
import { useSession } from "@/hooks/useSession";
import { deleteAccount, isAppleCancel, signOut } from "@/lib/auth";
import { getPushPermission, registerForPush, type PushPermission } from "@/lib/notifications";
import { Button } from "@/ui/Button";
import { Highlight } from "@/ui/Highlight";
import { Paper } from "@/ui/Paper";
import { Display, Type } from "@/ui/Text";
import { colors } from "@/ui/theme";

export default function SettingsScreen() {
  const { user, profile, setDeleting } = useSession();
  const { permission, tokenSaved, refresh } = usePushStatus();
  const [deletingLocal, setDeletingLocal] = useState(false);

  const confirmSignOut = () =>
    Alert.alert("Se déconnecter ?", "Tes groupes et tes sons restent. Tu te reconnecteras avec Apple.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Se déconnecter",
        onPress: () => signOut().catch(() => Alert.alert("Déconnexion impossible", "Réessaie dans un instant.")),
      },
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
            setDeletingLocal(true);
            setDeleting(true);
            try {
              await deleteAccount();
            } catch (error) {
              if (!isAppleCancel(error)) {
                Alert.alert("Suppression incomplète", "Relance la suppression pour terminer : rien n'a été perdu.");
              }
              setDeletingLocal(false);
              setDeleting(false);
            }
          },
        },
      ],
    );

  return (
    <Paper edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 28 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
            <Type>Fermer</Type>
          </Pressable>
          <Display size={34}>Réglages</Display>
        </View>

        <View style={{ gap: 8 }}>
          <Display size={24}>Ton pseudo</Display>
          <Type>{profile?.name ?? "—"}</Type>
        </View>

        <View style={{ gap: 10 }}>
          <Display size={24}>Notifications</Display>
          <Type size={13}>
            Angelus en envoie trois par jour : le thème quand il tombe, un rappel avant d'être en retard, et les
            résultats de la veille le matin.
          </Type>

          {permission === "granted" && tokenSaved && <Type bold>Activées sur cet appareil.</Type>}

          {permission === "denied" && (
            <>
              <Highlight>
                <Type bold>Refusées : tu ne sauras pas quand le thème tombe.</Type>
              </Highlight>
              <Button label="Ouvrir les réglages iOS" variant="secondary" onPress={() => Linking.openSettings()} />
            </>
          )}

          {permission === "granted" && !tokenSaved && (
            <>
              <Highlight>
                <Type bold>Autorisées, mais cet appareil n'est pas encore enregistré.</Type>
              </Highlight>
              <Button label="Réessayer" variant="secondary" onPress={refresh} />
            </>
          )}

          {permission === "undetermined" && (
            <Button label="Activer les notifications" onPress={refresh} />
          )}
        </View>

        <View style={{ gap: 10 }}>
          <Display size={24}>Compte</Display>
          <Type size={13}>
            La suppression retire ton pseudo, tes groupes et tes notifs. Les sons que tu as déjà postés restent
            dans les playlists de tes groupes.
          </Type>
          <Button label="Se déconnecter" variant="secondary" onPress={confirmSignOut} />
          <Button label="Supprimer mon compte" variant="danger" onPress={confirmDelete} loading={deletingLocal} />
        </View>

        <Type size={12} color={colors.screen}>
          Connecté avec Apple{user?.email ? ` (${user.email})` : ""}.
        </Type>
      </ScrollView>
    </Paper>
  );
}

function usePushStatus(): { permission: PushPermission | null; tokenSaved: boolean; refresh: () => void } {
  const { user } = useSession();
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [tokenSaved, setTokenSaved] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    const status = await registerForPush(user.uid).catch(() => null);
    if (status) {
      setPermission(status.permission);
      setTokenSaved(status.tokenSaved);
      return;
    }
    setPermission(await getPushPermission().catch(() => null));
    setTokenSaved(false);
  }, [user]);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return { permission, tokenSaved, refresh: () => void refresh() };
}
