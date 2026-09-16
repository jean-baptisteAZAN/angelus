import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";

/** Map uid -> pseudo for the given members. */
export function useMembers(memberIds: string[]): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  const key = [...memberIds].sort().join(",");

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(
      memberIds.map(async (uid) => {
        const snap = await getDoc(doc(db, "users", uid));
        return [uid, (snap.get("name") as string | undefined) ?? "Quelqu'un"] as const;
      }),
    ).then((results) => {
      if (cancelled) return;
      const entries = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      setNames((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return names;
}
