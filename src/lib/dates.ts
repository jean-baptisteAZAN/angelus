const TIME_ZONE = "Europe/Paris";

const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function parisParts(instant: Date) {
  const parts = Object.fromEntries(partsFormat.formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Paris calendar date of an instant, as "YYYY-MM-DD" (same key as the backend). */
export function parisDateKey(instant: Date): string {
  const p = parisParts(instant);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Instant of the next Paris midnight after `instant`. DST switches happen at 2-3 am, never at midnight. */
export function nextParisMidnight(instant: Date): Date {
  const p = parisParts(instant);
  const offsetMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant.getTime() / 1000) * 1000;
  return new Date(Date.UTC(p.year, p.month - 1, p.day + 1) - offsetMs);
}

/** "14:59" in Paris time. */
export function parisTimeLabel(instant: Date): string {
  const p = parisParts(instant);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** "13 sept." from a "YYYY-MM-DD" key. */
export function shortDateLabel(dateKey: string): { day: string; month: string } {
  const [, month, day] = dateKey.split("-").map(Number);
  return { day: String(day), month: MONTHS[month - 1] };
}

/** "44:48" for durations under an hour, else "7 h 55". */
export function durationLabel(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0 ? `${hours} h ${pad(minutes)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export const ON_TIME_WINDOW_MS = 60 * 60 * 1000;
