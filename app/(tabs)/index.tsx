import { router } from "expo-router";
import { useEffect, useMemo, useRef } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useDay } from "@/hooks/useDay";
import { usePosts, usePresence, useVotes } from "@/hooks/useDayFeed";
import { useGroups } from "@/hooks/useGroups";
import { useMembers } from "@/hooks/useMembers";
import { useNow } from "@/hooks/useNow";
import { useSession } from "@/hooks/useSession";
import { castVote, removeVote } from "@/lib/data";
import { durationLabel, nextParisMidnight, ON_TIME_WINDOW_MS, parisDateKey, parisTimeLabel } from "@/lib/dates";
import { fetchPreviewUrl } from "@/lib/deezer";
import { usePlayer } from "@/lib/player";
import { syncWidget } from "@/lib/widget";
import type { Day, Group, Post, Vote } from "@/lib/types";
import { LateBadge } from "@/ui/Badge";
import { GroupSwitcher } from "@/ui/GroupSwitcher";
import { HalftoneCover } from "@/ui/HalftoneCover";
import { Highlight } from "@/ui/Highlight";
import { LockedTile } from "@/ui/LockedTile";
import { NoGroup } from "@/ui/NoGroup";
import { Paper } from "@/ui/Paper";
import { PlayButton } from "@/ui/PlayButton";
import { Stamp } from "@/ui/Stamp";
import { Tally } from "@/ui/Tally";
import { TapedStrip } from "@/ui/TapedStrip";
import { Display, Type } from "@/ui/Text";
import { Button } from "@/ui/Button";
import { colors } from "@/ui/theme";

export default function TodayScreen() {
  const { selected, loading } = useGroups();
  const now = useNow();
  const date = parisDateKey(now);
  const dayState = useDay(date);

  if (loading) return <Paper>{null}</Paper>;
  if (!selected) return <NoGroup />;

  return (
    <Paper>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 20 }}>
        <GroupSwitcher />
        {dayState.kind === "loading" && <Type>Chargement du thème…</Type>}
        {dayState.kind === "waiting" && <Waiting />}
        {dayState.kind === "ready" && <DayFeed day={dayState.day} group={selected} now={now} />}
      </ScrollView>
    </Paper>
  );
}

function Waiting() {
  return (
    <View style={{ gap: 16, marginTop: 24 }}>
      <TapedStrip>
        <Display size={34}>Le thème n'est pas encore tombé</Display>
      </TapedStrip>
      <Type>Il arrive à une heure surprise, entre 10 h et 20 h. Tu reçois une notif à ce moment-là.</Type>
    </View>
  );
}

function DayFeed({ day, group, now }: { day: Day; group: Group; now: Date }) {
  const { user } = useSession();
  const uid = user!.uid;
  const presence = usePresence(day.date, group.memberIds);
  const iPosted = presence.some((p) => p.uid === uid);
  const posts = usePosts(day.date, group.memberIds, iPosted);
  const votes = useVotes(group.id, day.date);
  const names = useMembers(group.memberIds);

  const deadline = day.dropAt.getTime() + ON_TIME_WINDOW_MS;
  const closed = day.status === "closed";

  // Keep the home screen widget in step with what this screen shows.
  useEffect(() => {
    syncWidget({ day, iPosted, postedCount: presence.length, memberCount: group.memberIds.length });
  }, [day, iPosted, presence.length, group.memberIds.length]);

  return (
    <View style={{ gap: 20 }}>
      <TapedStrip>
        <Display size={36}>{day.theme}</Display>
      </TapedStrip>

      {iPosted ? (
        <PostedFeed day={day} group={group} uid={uid} posts={posts} votes={votes} names={names} now={now} closed={closed} />
      ) : (
        <View style={{ gap: 16 }}>
          {closed ? (
            <Type bold>C'est fini pour aujourd'hui. Reviens demain.</Type>
          ) : now.getTime() < deadline ? (
            <View>
              <Highlight>
                <Display size={64}>{durationLabel(deadline - now.getTime())}</Display>
              </Highlight>
              <Type>avant d'être en retard. Passé ce délai, tu peux encore poster jusqu'à minuit.</Type>
            </View>
          ) : (
            <Highlight>
              <Type bold>Tu es en retard. Tu peux quand même poster jusqu'à minuit.</Type>
            </Highlight>
          )}

          <Display size={26}>Ils ont déjà posté</Display>
          {presence.length === 0 ? (
            <Type>Personne n'a encore posté. À toi d'ouvrir le bal.</Type>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}>
              {presence.map((p) => (
                <View key={p.uid} style={{ gap: 6 }}>
                  <LockedTile size={92} />
                  <Display size={20}>{names[p.uid] ?? "…"}</Display>
                </View>
              ))}
            </View>
          )}
          <Missing memberIds={group.memberIds.filter((m) => m !== uid && !presence.some((p) => p.uid === m))} names={names} />
          <Type bold>Poste ton son pour écouter les leurs.</Type>
          {!closed && <Button label="Poster mon son" onPress={() => router.push("/search")} />}
        </View>
      )}
    </View>
  );
}

function Missing({ memberIds, names }: { memberIds: string[]; names: Record<string, string> }) {
  if (memberIds.length === 0) return null;
  const list = memberIds.map((m) => names[m] ?? "…");
  const text = list.length === 1 ? `${list[0]} n'a pas encore posté.` : `${list.slice(0, -1).join(", ")} et ${list.at(-1)} n'ont pas encore posté.`;
  return <Type>{text}</Type>;
}

type FeedProps = {
  day: Day;
  group: Group;
  uid: string;
  posts: Post[];
  votes: Vote[];
  names: Record<string, string>;
  now: Date;
  closed: boolean;
};

function PostedFeed({ day, group, uid, posts, votes, names, now, closed }: FeedProps) {
  const player = usePlayer();
  const mine = posts.find((p) => p.uid === uid);
  const others = posts.filter((p) => p.uid !== uid).sort((a, b) => a.postedAt.getTime() - b.postedAt.getTime());
  const postedUids = new Set(posts.map((p) => p.uid));
  const myVote = votes.find((v) => v.voterUid === uid)?.postUid ?? null;

  // Same counting rule as the backend: members who posted, no self vote.
  const votersByPost = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const v of votes) {
      if (v.voterUid === v.postUid || !postedUids.has(v.voterUid) || !postedUids.has(v.postUid)) continue;
      (map[v.postUid] ??= []).push(v.voterUid);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [votes, posts]);

  // Stamp slams only when my post appears during this session, not when reopening the app.
  const hadMine = useRef<boolean | null>(null);
  const animateStamp = hadMine.current === false && !!mine;
  useEffect(() => {
    if (hadMine.current === null || mine) hadMine.current = !!mine;
  }, [mine]);

  const play = (post: Post) =>
    player.toggle(`post:${post.uid}`, () => fetchPreviewUrl(post.track.deezerId), post.track.deezerId);

  const onVote = async (postUid: string) => {
    if (closed) return;
    try {
      if (myVote === postUid) await removeVote(group.id, day.date, uid);
      else await castVote(group.id, day.date, uid, postUid);
    } catch {
      Alert.alert("Vote impossible", "Vérifie ta connexion et réessaie.");
    }
  };

  const voterNames = (postUid: string) => (votersByPost[postUid] ?? []).map((v) => (v === uid ? "Toi" : names[v] ?? "…"));

  return (
    <View style={{ gap: 18 }}>
      <Highlight>
        <Display size={30}>{closed ? "Votes terminés" : `Fin des votes dans ${durationLabel(nextParisMidnight(now).getTime() - now.getTime())}`}</Display>
      </Highlight>

      {mine && (
        <View style={{ borderWidth: 2, borderColor: colors.toner, backgroundColor: colors.paperNew, padding: 12, flexDirection: "row", gap: 12 }}>
          <Pressable onPress={() => play(mine)} accessibilityLabel="Écouter ton son">
            <HalftoneCover uri={mine.track.cover} size={84} />
          </Pressable>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Type size={13}>Ton son du jour</Type>
              <LateBadge late={mine.late} />
            </View>
            <Display size={26} numberOfLines={2}>
              {mine.track.title}
            </Display>
            <Type size={13}>{mine.track.artist}</Type>
            <VoteLine names={voterNames(uid)} />
          </View>
          <View style={{ position: "absolute", right: 8, bottom: 6 }}>
            <Stamp label={`Posté ${parisTimeLabel(mine.postedAt)}`} animate={animateStamp} />
          </View>
        </View>
      )}

      <Type size={13}>Tu as un vote. Tu peux en changer jusqu'à minuit.</Type>

      {others.map((post) => {
        const voted = myVote === post.uid;
        const count = votersByPost[post.uid]?.length ?? 0;
        const playing = player.currentKey === `post:${post.uid}` && player.playing;
        return (
          <View key={post.uid} style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <View>
              <HalftoneCover uri={post.track.cover} size={64} />
              <View style={{ position: "absolute", left: 4, bottom: 4 }}>
                <PlayButton size={28} playing={playing} onPress={() => play(post)} />
              </View>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Type size={13} bold>
                  {names[post.uid] ?? "…"}
                </Type>
                {post.late && <LateBadge late />}
              </View>
              <Display size={22} numberOfLines={1}>
                {post.track.title}
              </Display>
              <Type size={13} numberOfLines={1}>
                {post.track.artist}
              </Type>
              <VoteLine names={voterNames(post.uid)} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: voted, disabled: closed }}
              onPress={() => onVote(post.uid)}
              disabled={closed}
              style={{
                minWidth: 76,
                minHeight: 52,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: voted ? 3 : 2,
                borderColor: voted ? colors.marker : colors.toner,
                borderRadius: voted ? 30 : 0,
                paddingHorizontal: 8,
                opacity: closed ? 0.4 : 1,
              }}
            >
              <Display size={26}>{count}</Display>
              <Type size={12} bold>
                {voted ? "Ton vote" : "Voter"}
              </Type>
            </Pressable>
          </View>
        );
      })}

      <Missing memberIds={group.memberIds.filter((m) => !postedUids.has(m))} names={names} />
    </View>
  );
}

function VoteLine({ names }: { names: string[] }) {
  if (names.length === 0) return <Type size={12}>Aucun vote pour l'instant</Type>;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Tally count={names.length} />
      <Type size={12} bold numberOfLines={1} style={{ flexShrink: 1 }}>
        {names.join(", ")}
      </Type>
    </View>
  );
}
