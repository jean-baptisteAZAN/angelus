import { collection, documentId, onSnapshot, query, where, type Timestamp } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { db } from "@/lib/firebase";
import { toDate, type Post, type Presence, type Track, type Vote } from "@/lib/types";

const RETRY_MS = 3_000;

/**
 * Firestore kills a listener as soon as a read is denied, and posts are denied until my own
 * post is acknowledged by the server. Retrying re-arms the listener a few seconds later.
 */
function useRetry(): [number, () => void] {
  const [attempt, setAttempt] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retry = () => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      setAttempt((n) => n + 1);
    }, RETRY_MS);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return [attempt, retry];
}

/** Who posted today among the group (readable by everyone signed in). */
export function usePresence(date: string, memberIds: string[]): Presence[] {
  const [presence, setPresence] = useState<Presence[]>([]);
  const [attempt, retry] = useRetry();
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
      () => {
        setPresence([]);
        retry();
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, key, attempt]);

  return presence;
}

/** Tracks posted today by the group. Only readable once I posted, so pass `enabled` accordingly. */
export function usePosts(date: string, memberIds: string[], enabled: boolean): Post[] {
  const [posts, setPosts] = useState<Post[]>([]);
  const [attempt, retry] = useRetry();
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
      () => {
        setPosts([]);
        retry();
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, key, enabled, attempt]);

  return posts;
}

export function useVotes(gid: string | null, date: string): Vote[] {
  const [votes, setVotes] = useState<Vote[]>([]);
  const [attempt, retry] = useRetry();

  useEffect(() => {
    if (!gid) {
      setVotes([]);
      return;
    }
    return onSnapshot(
      collection(db, "groups", gid, "days", date, "votes"),
      (snap) => setVotes(snap.docs.map((d) => ({ voterUid: d.id, postUid: d.get("postUid") as string }))),
      () => {
        setVotes([]);
        retry();
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gid, date, attempt]);

  return votes;
}
