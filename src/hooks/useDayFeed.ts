import { collection, documentId, onSnapshot, query, where, type Timestamp } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { toDate, type Post, type Presence, type Track, type Vote } from "@/lib/types";

/** Who posted today among the group (readable by everyone signed in). */
export function usePresence(date: string, memberIds: string[]): Presence[] {
  const [presence, setPresence] = useState<Presence[]>([]);
  const key = [...memberIds].sort().join(",");

  useEffect(() => {
    if (memberIds.length === 0) {
      setPresence([]);
      return;
    }
    const q = query(collection(db, "days", date, "presence"), where(documentId(), "in", memberIds));
    return onSnapshot(
      q,
      (snap) =>
        setPresence(
          snap.docs.map((d) => {
            const data = d.data() as { postedAt: Timestamp | null; late: boolean };
            return { uid: d.id, postedAt: toDate(data.postedAt), late: data.late };
          }),
        ),
      () => setPresence([]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, key]);

  return presence;
}

/** Tracks posted today by the group. Only readable once I posted, so pass `enabled` accordingly. */
export function usePosts(date: string, memberIds: string[], enabled: boolean): Post[] {
  const [posts, setPosts] = useState<Post[]>([]);
  const key = [...memberIds].sort().join(",");

  useEffect(() => {
    if (!enabled || memberIds.length === 0) {
      setPosts([]);
      return;
    }
    const q = query(collection(db, "days", date, "posts"), where(documentId(), "in", memberIds));
    return onSnapshot(
      q,
      (snap) =>
        setPosts(
          snap.docs.map((d) => {
            const data = d.data() as { track: Track; postedAt: Timestamp | null; late: boolean };
            return { uid: d.id, track: data.track, postedAt: toDate(data.postedAt), late: data.late };
          }),
        ),
      () => setPosts([]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, key, enabled]);

  return posts;
}

export function useVotes(gid: string | null, date: string): Vote[] {
  const [votes, setVotes] = useState<Vote[]>([]);

  useEffect(() => {
    if (!gid) {
      setVotes([]);
      return;
    }
    return onSnapshot(
      collection(db, "groups", gid, "days", date, "votes"),
      (snap) => setVotes(snap.docs.map((d) => ({ voterUid: d.id, postUid: d.get("postUid") as string }))),
      () => setVotes([]),
    );
  }, [gid, date]);

  return votes;
}
