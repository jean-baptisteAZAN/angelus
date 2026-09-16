import { doc, getDoc } from "firebase/firestore";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { useGroups } from "@/hooks/useGroups";
import { useSession } from "@/hooks/useSession";
import { joinGroup, MAX_GROUP_SIZE } from "@/lib/data";
import { db } from "@/lib/firebase";
import type { Group } from "@/lib/types";
import { Button } from "@/ui/Button";
import { Paper } from "@/ui/Paper";
import { TapedStrip } from "@/ui/TapedStrip";
import { Display, Type } from "@/ui/Text";

type State = { kind: "loading" } | { kind: "missing" } | { kind: "error" } | { kind: "found"; group: Group };

export default function JoinScreen() {
  const { gid } = useLocalSearchParams<{ gid: string }>();
  const { user } = useSession();
  const { select } = useGroups();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "groups", gid))
      .then((snap) =>
        setState(snap.exists() ? { kind: "found", group: { id: snap.id, ...(snap.data() as Omit<Group, "id">) } } : { kind: "missing" }),
      )
      .catch(() => setState({ kind: "error" }));
  }, [gid]);

  const open = () => {
    select(gid);
    router.dismissTo("/");
  };

  const onJoin = async () => {
    if (!user) return;
    setJoining(true);
    try {
      await joinGroup(gid, user.uid);
      open();
    } catch {
      setJoining(false);
      Alert.alert("Impossible de rejoindre", "Le groupe est peut-être complet. Réessaie plus tard.");
    }
  };

  return (
    <Paper edges={["bottom"]} style={{ padding: 20, justifyContent: "center", gap: 24 }}>
      {state.kind === "loading" && <Type>Recherche du groupe…</Type>}
      {state.kind === "missing" && (
        <>
          <Display size={36}>Ce groupe n'existe pas</Display>
          <Type>Le code est peut-être abîmé, ou le groupe a été supprimé.</Type>
          <Button label="Fermer" variant="secondary" onPress={() => router.back()} />
        </>
      )}
      {state.kind === "error" && (
        <>
          <Display size={36}>Groupe introuvable pour l'instant</Display>
          <Type>Vérifie ta connexion, puis rescanne le code.</Type>
          <Button label="Fermer" variant="secondary" onPress={() => router.back()} />
        </>
      )}
      {state.kind === "found" && user && (
        <>
          <TapedStrip>
            <Display size={40}>Rejoindre {state.group.name}</Display>
          </TapedStrip>
          <Type>
            {state.group.memberIds.length} / {MAX_GROUP_SIZE} membres
          </Type>
          <View style={{ gap: 12 }}>
            {state.group.memberIds.includes(user.uid) ? (
              <>
                <Type bold>Tu fais déjà partie de ce groupe.</Type>
                <Button label="Ouvrir le groupe" onPress={open} />
              </>
            ) : state.group.memberIds.length >= MAX_GROUP_SIZE ? (
              <Type bold>Ce groupe est complet.</Type>
            ) : (
              <Button label="Rejoindre" onPress={onJoin} loading={joining} />
            )}
            <Button label="Annuler" variant="secondary" onPress={() => router.back()} />
          </View>
        </>
      )}
    </Paper>
  );
}
