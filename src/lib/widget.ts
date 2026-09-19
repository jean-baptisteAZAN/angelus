import TodayWidget, { type TodayWidgetProps } from "@/widgets/TodayWidget";
import { nextParisMidnight, ON_TIME_WINDOW_MS, parisTimeLabel } from "./dates";
import type { Day } from "./types";

export interface WidgetInput {
  day: Day | null;
  iPosted: boolean;
  postedCount: number;
  memberCount: number;
}

/**
 * Pushes today's state to the home screen widget, plus the two moments it changes on its own:
 * the end of the on-time window, and Paris midnight when a new day starts.
 */
export function syncWidget({ day, iPosted, postedCount, memberCount }: WidgetInput): void {
  const now = new Date();
  const waiting: TodayWidgetProps = {
    state: "waiting",
    theme: "",
    deadline: "",
    postedCount: 0,
    memberCount,
  };

  if (!day) {
    TodayWidget.updateTimeline([{ date: now, props: waiting }]);
    return;
  }

  const deadlineAt = new Date(day.dropAt.getTime() + ON_TIME_WINDOW_MS);
  const base: TodayWidgetProps = {
    state: "open",
    theme: day.theme,
    deadline: parisTimeLabel(deadlineAt),
    postedCount,
    memberCount,
  };

  const stateNow: TodayWidgetProps["state"] =
    day.status === "closed" ? "closed" : iPosted ? "posted" : now < deadlineAt ? "open" : "late";

  const entries: { date: Date; props: TodayWidgetProps }[] = [{ date: now, props: { ...base, state: stateNow } }];

  if (stateNow === "open") {
    entries.push({ date: deadlineAt, props: { ...base, state: "late" } });
  }
  entries.push({ date: nextParisMidnight(now), props: waiting });

  TodayWidget.updateTimeline(entries);
}
