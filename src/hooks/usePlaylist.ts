import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import type { PlaylistEntry } from "@/lib/types";

export function usePlaylist(gid: string | null): { loading: boolean; entries: PlaylistEntry[] } {
  const [state, setState] = useState<{ loading: boolean; entries: PlaylistEntry[] }>({ loading: true, entries: [] });

  useEffect(() => {
    if (!gid) {
      setState({ loading: false, entries: [] });
      return;
    }
    setState((prev) => ({ ...prev, loading: true }));
    const q = query(collection(db, "groups", gid, "playlist"), orderBy("date", "desc"));
    return onSnapshot(
      q,
      (snap) =>
        setState({
          loading: false,
          entries: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PlaylistEntry, "id">) })),
        }),
      () => setState({ loading: false, entries: [] }),
    );
  }, [gid]);

  return state;
}
