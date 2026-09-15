import { addMinutes, parisTimeToDate } from "./dates.js";
import type { DayStatus } from "./types.js";

export const FIRST_DROP_MINUTE = 10 * 60;
export const LAST_DROP_MINUTE = 19 * 60 + 45;
export const SLOT_MINUTES = 15;
export const REMINDER_DELAY_MINUTES = 45;
export const RESULTS_MINUTE = 9 * 60;

export interface DayState {
  date: string;
  status: DayStatus;
  dropAt: Date;
  remindedAt: Date | null;
  resultsSentAt: Date | null;
}

export interface TickState {
  now: Date;
  todayKey: string;
  today: DayState | null;
  yesterday: DayState | null;
  unclosedPastKeys: string[];
}

export type Action =
  | { type: "close"; date: string }
  | { type: "create"; date: string }
  | { type: "drop"; date: string }
  | { type: "remind"; date: string }
  | { type: "results"; date: string };

export function pickDropAt(dateKey: string, random: () => number): Date {
  const slotCount = (LAST_DROP_MINUTE - FIRST_DROP_MINUTE) / SLOT_MINUTES + 1;
  const index = Math.min(Math.floor(random() * slotCount), slotCount - 1);
  return parisTimeToDate(dateKey, FIRST_DROP_MINUTE + index * SLOT_MINUTES);
}

export function decideActions(state: TickState): Action[] {
  const { now, todayKey, today, yesterday } = state;
  const actions: Action[] = state.unclosedPastKeys.map((date): Action => ({ type: "close", date }));

  if (!today) {
    actions.push({ type: "create", date: todayKey });
  } else if (today.status === "pending" && isAtOrAfter(now, today.dropAt)) {
    actions.push({ type: "drop", date: todayKey });
  } else if (
    today.status === "live" &&
    !today.remindedAt &&
    isAtOrAfter(now, addMinutes(today.dropAt, REMINDER_DELAY_MINUTES))
  ) {
    actions.push({ type: "remind", date: todayKey });
  }

  if (
    yesterday?.status === "closed" &&
    !yesterday.resultsSentAt &&
    isAtOrAfter(now, parisTimeToDate(todayKey, RESULTS_MINUTE))
  ) {
    actions.push({ type: "results", date: yesterday.date });
  }

  return actions;
}

function isAtOrAfter(instant: Date, reference: Date): boolean {
  return instant.getTime() >= reference.getTime();
}
