import { doc, onSnapshot, type Timestamp } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import type { Day, DayStatus } from "@/lib/types";

export type DayState = { kind: "loading" } | { kind: "waiting" } | { kind: "ready"; day: Day };

const RETRY_MS = 30_000;

/**
 * Today's day document. Rules hide it until the drop, so a denied read means "waiting":
 * we retry every 30 s until the theme is published.
 */
export function useDay(date: string): DayState {
  const [state, setState] = useState<DayState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setState((prev) => (prev.kind === "ready" && prev.day.date === date ? prev : { kind: "loading" }));
    let retry: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onSnapshot(
      doc(db, "days", date),
      (snap) => {
        if (!snap.exists()) {
          setState({ kind: "waiting" });
          retry = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
          return;
        }
        const data = snap.data() as { theme: string; dropAt: Timestamp; status: DayStatus };
        setState({ kind: "ready", day: { date, theme: data.theme, dropAt: data.dropAt.toDate(), status: data.status } });
      },
      () => {
        setState({ kind: "waiting" });
        retry = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
      },
    );
    return () => {
      unsubscribe();
      if (retry) clearTimeout(retry);
    };
  }, [date, attempt]);

  return state;
}
