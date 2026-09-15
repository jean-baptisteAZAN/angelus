const TIME_ZONE = "Europe/Paris";

const dateKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

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

/** Paris calendar date of an instant, as "YYYY-MM-DD". */
export function parisDateKey(instant: Date): string {
  return dateKeyFormat.format(instant);
}

export function previousDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

/** Instant at which Paris wall-clock time `minutesOfDay` occurs on `dateKey`. */
export function parisTimeToDate(dateKey: string, minutesOfDay: number): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day, 0, minutesOfDay);
  return new Date(guess - parisOffsetMinutes(new Date(guess)) * 60_000);
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

function parisOffsetMinutes(instant: Date): number {
  const parts = Object.fromEntries(partsFormat.formatToParts(instant).map((p) => [p.type, p.value]));
  const wallClockAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (wallClockAsUtc - instant.getTime()) / 60_000;
}
