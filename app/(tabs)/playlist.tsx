import { useEffect, useRef } from "react";
import { FlatList, View } from "react-native";
import { useGroups } from "@/hooks/useGroups";
import { usePlaylist } from "@/hooks/usePlaylist";
import { shortDateLabel } from "@/lib/dates";
import { fetchPreviewUrl } from "@/lib/deezer";
import { usePlayer } from "@/lib/player";
import type { PlaylistEntry } from "@/lib/types";
import { Button } from "@/ui/Button";
import { GroupSwitcher } from "@/ui/GroupSwitcher";
import { HalftoneCover } from "@/ui/HalftoneCover";
import { NoGroup } from "@/ui/NoGroup";
import { Paper } from "@/ui/Paper";
import { PlayButton } from "@/ui/PlayButton";
import { Tally } from "@/ui/Tally";
import { Display, Type } from "@/ui/Text";
import { colors } from "@/ui/theme";

export default function PlaylistScreen() {
  const { selected, loading } = useGroups();
  const { entries, loading: loadingEntries } = usePlaylist(selected?.id ?? null);
  const player = usePlayer();
  const queue = useRef<number | null>(null);

  const playAt = (index: number) => {
    const entry = entries[index];
    if (!entry) {
      queue.current = null;
      return;
    }
    player.toggle(`playlist:${entry.id}`, () => fetchPreviewUrl(entry.track.deezerId), entry.track.deezerId);
  };

  // "Tout écouter": when a preview ends, move on to the next winner.
  useEffect(() => {
    if (queue.current === null || !player.didJustFinish) return;
    const next = queue.current + 1;
    queue.current = next < entries.length ? next : null;
    if (queue.current !== null) playAt(queue.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.didJustFinish]);

  if (loading || loadingEntries) return <Paper>{null}</Paper>;
  if (!selected) return <NoGroup />;

  return (
    <Paper>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 0 }}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 16 }}>
            <GroupSwitcher title={(name) => `Playlist de ${name}`} />
            <Type>Le son gagnant de chaque jour.</Type>
            {entries.length > 0 && (
              <Button
                label="Tout écouter"
                onPress={() => {
                  // Restart from the top even if the first winner is the track already loaded.
                  player.stop();
                  queue.current = 0;
                  setTimeout(() => playAt(0), 0);
                }}
                style={{ alignSelf: "flex-start" }}
              />
            )}
          </View>
        }
        ListEmptyComponent={
          <Type style={{ marginTop: 12 }}>Pas encore de gagnant. Le premier sera annoncé le lendemain du premier vote, à 9 h.</Type>
        }
        renderItem={({ item }) => (
          <PlaylistRow
            entry={item}
            playing={player.currentKey === `playlist:${item.id}` && player.playing}
            onPlay={() => {
              queue.current = null;
              player.toggle(`playlist:${item.id}`, () => fetchPreviewUrl(item.track.deezerId), item.track.deezerId);
            }}
          />
        )}
        style={{ borderLeftWidth: 0 }}
      />
      <View
        pointerEvents="none"
        style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 22, backgroundColor: colors.toner, alignItems: "center", justifyContent: "center" }}
      >
        <Type size={12} bold color={colors.paperNew} style={{ transform: [{ rotate: "-90deg" }], width: 300, textAlign: "center" }} numberOfLines={1}>
          {selected.name}, face A
        </Type>
      </View>
    </Paper>
  );
}

function PlaylistRow({ entry, playing, onPlay }: { entry: PlaylistEntry; playing: boolean; onPlay: () => void }) {
  const { day, month } = shortDateLabel(entry.date);
  return (
    <View style={{ flexDirection: "row", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.screen }}>
      <View style={{ width: 44, alignItems: "center" }}>
        <Display size={30}>{day}</Display>
        <Type size={12}>{month}</Type>
      </View>
      <HalftoneCover uri={entry.track.cover} size={56} />
      <View style={{ flex: 1, gap: 2 }}>
        <Type size={12} style={{ fontStyle: "italic" }} numberOfLines={2}>
          {entry.theme}
        </Type>
        <Display size={22} numberOfLines={1}>
          {entry.track.title}
        </Display>
        <Type size={12} numberOfLines={1}>
          {entry.track.artist}
        </Type>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Tally count={entry.votes} />
          <Type size={12} bold>
            {entry.winnerName}, {entry.votes} vote{entry.votes > 1 ? "s" : ""}
          </Type>
        </View>
      </View>
      <PlayButton playing={playing} onPress={onPlay} />
    </View>
  );
}
