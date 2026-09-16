import { collection, onSnapshot, query, where } from "firebase/firestore";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { db } from "@/lib/firebase";
import type { Group } from "@/lib/types";
import { useSession } from "./useSession";

interface Groups {
  loading: boolean;
  groups: Group[];
  selected: Group | null;
  select: (gid: string) => void;
}

const GroupsContext = createContext<Groups | null>(null);

export function GroupsProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, "groups"), where("memberIds", "array-contains", user.uid));
    return onSnapshot(
      q,
      (snap) => {
        const next = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Group, "id">) }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setGroups(next);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [user]);

  const selected = groups.find((g) => g.id === selectedId) ?? groups[0] ?? null;
  const value: Groups = { loading, groups, selected, select: setSelectedId };
  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
}

export function useGroups(): Groups {
  const value = useContext(GroupsContext);
  if (!value) throw new Error("useGroups must be used inside GroupsProvider");
  return value;
}
