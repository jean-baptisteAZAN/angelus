import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Pressable, TextInput, View } from "react-native";
import { useDay } from "@/hooks/useDay";
import { useGroups } from "@/hooks/useGroups";
import { useSession } from "@/hooks/useSession";
import { postTrack } from "@/lib/data";
import { parisDateKey } from "@/lib/dates";
import { searchTracks, type SearchResult } from "@/lib/deezer";
import { usePlayer } from "@/lib/player";
import { Button } from "@/ui/Button";
import { HalftoneCover } from "@/ui/HalftoneCover";
import { Highlight } from "@/ui/Highlight";
import { Paper } from "@/ui/Paper";
import { PlayButton } from "@/ui/PlayButton";
import { Display, Type } from "@/ui/Text";
import { colors, fonts } from "@/ui/theme";

type SearchState = { kind: "idle" } | { kind: "loading" } | { kind: "error" } | { kind: "done"; results: SearchResult[] };

export default function SearchScreen() {
  const { user } = useSession();
  const { groups } = useGroups();
  const player = usePlayer();
  const date = parisDateKey(new Date());
  const dayState = useDay(date);
  const [queryText, setQueryText] = useState("");
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    const q = queryText.trim();
    if (q.length < 2) {
      setState({ kind: "idle" });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState({ kind: "loading" });
      try {
        setState({ kind: "done", results: await searchTracks(q, controller.signal) });
      } catch {
        if (!controller.signal.aborted) setState({ kind: "error" });
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [queryText, attempt]);

  useEffect(() => () => player.stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const onPost = () => {
    if (!user || !selected || dayState.kind !== "ready") return;
    Alert.alert(`Poster ${selected.title} ?`, "Tu ne pourras plus changer de son aujourd'hui.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Poster",
        onPress: async () => {
          setPosting(true);
          try {
            const { preview: _preview, ...track } = selected;
            await postTrack(date, user.uid, track, dayState.day.dropAt);
            router.back();
          } catch {
            setPosting(false);
            Alert.alert("Impossible de poster", "La journée est peut-être terminée, ou la connexion a coupé. Réessaie.");
          }
        },
      },
    ]);
  };

  const groupCount = groups.length;
  return (
    <Paper edges={["bottom"]}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
              <Type>Annuler</Type>
            </Pressable>
            <Display size={30}>Trouve ton son</Display>
          </View>
          {dayState.kind === "ready" && <Type size={13}>Thème : {dayState.day.theme}</Type>}
          <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 2, borderColor: colors.toner, backgroundColor: colors.paperNew, paddingHorizontal: 12 }}>
            <TextInput
              value={queryText}
              onChangeText={setQueryText}
              placeholder="Un titre, un artiste"
              placeholderTextColor={colors.screen}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
              style={{ flex: 1, height: 48, fontFamily: fonts.typeBold, fontSize: 18, color: colors.toner }}
            />
            {state.kind === "loading" && <ActivityIndicator color={colors.toner} />}
          </View>
          <Type size={12}>Résultats Deezer. Touche ▶ pour écouter 30 s.</Type>
        </View>

        {state.kind === "error" ? (
          <View style={{ padding: 20, gap: 12 }}>
            <Type bold>La recherche Deezer ne répond pas.</Type>
            <Button label="Réessayer" variant="secondary" onPress={() => setAttempt((n) => n + 1)} />
          </View>
        ) : (
          <FlatList
            data={state.kind === "done" ? state.results : []}
            keyExtractor={(item) => String(item.deezerId)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
            ListEmptyComponent={state.kind === "done" ? <Type style={{ marginTop: 16 }}>Aucun résultat. Essaie une autre orthographe.</Type> : null}
            renderItem={({ item }) => {
              const isSelected = selected?.deezerId === item.deezerId;
              const key = `search:${item.deezerId}`;
              const playing = player.currentKey === key && player.playing;
              return (
                <Pressable
                  onPress={() => setSelected(item)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.screen, gap: 8 }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <HalftoneCover uri={item.cover} size={52} />
                    <View style={{ flex: 1 }}>
                      {isSelected ? (
                        <Highlight>
                          <Display size={22} numberOfLines={1}>
                            {item.title}
                          </Display>
                        </Highlight>
                      ) : (
                        <Display size={22} numberOfLines={1}>
                          {item.title}
                        </Display>
                      )}
                      <Type size={13} numberOfLines={1}>
                        {item.artist}
                      </Type>
                    </View>
                    <PlayButton
                      playing={playing}
                      onPress={() => {
                        setSelected(item);
                        player.toggle(key, async () => item.preview);
                      }}
                    />
                  </View>
                  {player.currentKey === key && (
                    <View style={{ height: 3, backgroundColor: colors.screen, marginLeft: 64 }}>
                      <View style={{ height: 3, width: `${Math.round(player.progress * 100)}%`, backgroundColor: colors.toner }} />
                    </View>
                  )}
                </Pressable>
              );
            }}
          />
        )}

        <View style={{ paddingHorizontal: 20, paddingTop: 12, gap: 10, borderTopWidth: 2, borderColor: colors.toner }}>
          <Type size={13}>
            Une fois posté, tu ne peux plus le changer. Il part dans {groupCount > 1 ? `tes ${groupCount} groupes` : "ton groupe"}.
          </Type>
          <Button label="Poster ce son" onPress={onPost} disabled={!selected || dayState.kind !== "ready"} loading={posting} />
        </View>
      </KeyboardAvoidingView>
    </Paper>
  );
}
