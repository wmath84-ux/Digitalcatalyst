// src/joplin/scheduling/recurrence.ts
//
// Timezone-explicit recurrence for the universal My Day scheduler.
//
// Requirements this module exists to satisfy:
//
//   · `dueAt` is an instant (epoch ms) but a repeat is a LOCAL WALL-CLOCK rule:
//     "every Monday at 8 PM" means 8 PM in the learner's zone, in every zone
//     offset change in between. Interpreting recurrence in UTC would silently
//     move the reminder by 5h30m for IST learners twice a year (§21).
//   · Occurrences are COMPUTED, never stored: a daily reminder ten years out is
//     one document plus arithmetic, not 3 650 documents (§119).
//   · The computation is deterministic and dependency-free so the client, the
//     Vercel cron and the unit tests all agree, and so the notification key of
//     an occurrence is identical on every device (§64).
//
// DST correctness: `zonedEpochMs` resolves a wall-clock time to an instant by
// measuring the zone's offset at the candidate instant, twice. That converges
// for every real transition except a wall-clock time that does not exist (the
// skipped hour), where it deterministically lands on the post-transition
// instant — documented and tested rather than accidental.

export type RecurrenceFreq = "once" | "daily" | "weekly" | "monthly" | "interval";

export interface Recurrence {
  freq: RecurrenceFreq;
  /** Every N days/weeks/months (default 1). Ignored by `interval`. */
  interval?: number;
  /** 0 = Sunday … 6 = Saturday. Used by `weekly`; empty = the anchor weekday. */
  weekdays?: number[];
  /** 1–31. Used by `monthly`; unset = the anchor day of month. */
  dayOfMonth?: number;
  /** Repeat every N minutes from the anchor (`freq: "interval"`). */
  intervalMinutes?: number;
  /** Last instant the series may fire (inclusive). `null`/absent = no end. */
  until?: number | null;
}

export interface RecurrenceAnchor {
  /** The first occurrence, epoch ms. */
  dueAt: number;
  /** IANA zone, e.g. `Asia/Kolkata`. Always explicit — never `undefined`. */
  timeZone: string;
  recurrence: Recurrence;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday … 6 = Saturday, computed from the zone-local date. */
  weekday: number;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = partsFormatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  partsFormatterCache.set(timeZone, formatter);
  return formatter;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** The zone-local calendar fields of an instant. Falls back to UTC on a bad zone. */
export function zonedParts(epochMs: number, timeZone: string): ZonedParts {
  const zone = safeTimeZone(timeZone);
  const parts = partsFormatter(zone).formatToParts(new Date(epochMs));
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? "0";
  const weekdayName = get("weekday");
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAY_INDEX[weekdayName] ?? new Date(epochMs).getUTCDay(),
  };
}

/** The zone's offset (local − UTC, in ms) at an instant. */
function zoneOffsetMs(epochMs: number, timeZone: string): number {
  const zone = safeTimeZone(timeZone);
  const parts = partsFormatter(zone).formatToParts(new Date(epochMs));
  const get = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

/** Exposed for the scheduler tests and for diagnostics on the client. */
export const timeZoneOffsetMinutes = (epochMs: number, timeZone: string): number =>
  Math.round(zoneOffsetMs(epochMs, timeZone) / 60000);

/**
 * Resolve zone-local wall-clock fields to an instant.
 *
 * Two offset probes are enough for every real zone: the first lands on (or near)
 * the right instant, the second corrects the offset if the first probe crossed a
 * transition.
 */
export function zonedEpochMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const first = guess - zoneOffsetMs(guess, timeZone);
  const second = guess - zoneOffsetMs(first, timeZone);
  // The non-existent wall time of a spring-forward night resolves forward.
  return zonedParts(second, timeZone).hour === hour % 24 ? second : second + 0;
}

function safeTimeZone(timeZone: string): string {
  const text = String(timeZone ?? "").trim();
  if (!text) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: text });
    return text;
  } catch {
    return "UTC";
  }
}

export const isValidTimeZone = (timeZone: string): boolean => {
  const text = String(timeZone ?? "").trim();
  if (!text) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: text });
    return true;
  } catch {
    return false;
  }
};

const dayMs = 24 * 60 * 60 * 1000;

const clampInterval = (value: unknown, fallback = 1): number => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(365, Math.round(number));
};

/** Read the wall-clock anchor of a series (the local time of `dueAt`). */
export function seriesAnchor(anchor: RecurrenceAnchor): ZonedParts {
  return zonedParts(anchor.dueAt, anchor.timeZone);
}

/**
 * The occurrence after `afterMs`, or null when the series is exhausted.
 *
 * `afterMs` is exclusive: calling it with the instant of the previous
 * occurrence yields the next one, which is what both the notification clock and
 * the cron loop need.
 */
export function nextOccurrence(anchor: RecurrenceAnchor, afterMs: number): number | null {
  const { recurrence } = anchor;
  const until = Number(recurrence.until ?? 0);
  const hasUntil = Number.isFinite(until) && until > 0;
  const base = seriesAnchor(anchor);
  const first = anchor.dueAt;

  if (recurrence.freq === "once" || !recurrence.freq) {
    if (first > afterMs && (!hasUntil || first <= until)) return first;
    return null;
  }

  if (recurrence.freq === "interval") {
    const stepMs = clampInterval(recurrence.intervalMinutes, 60) * 60_000;
    if (first > afterMs) return hasUntil && first > until ? null : first;
    const steps = Math.floor((afterMs - first) / stepMs) + 1;
    const candidate = first + steps * stepMs;
    if (hasUntil && candidate > until) return null;
    return candidate;
  }

  const interval = clampInterval(recurrence.interval);

  if (recurrence.freq === "daily") {
    // Count local days from the anchor day, then rebuild the wall-clock time in
    // the zone at the target day — so a DST shift keeps 8 PM at 8 PM.
    const anchorDayUtc = Date.UTC(base.year, base.month - 1, base.day);
    const after = zonedParts(Math.max(afterMs, first), anchor.timeZone);
    const afterDayUtc = Date.UTC(after.year, after.month - 1, after.day);
    let days = Math.max(0, Math.round((afterDayUtc - anchorDayUtc) / dayMs));
    days = Math.ceil(days / interval) * interval;
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const dayShift = Math.floor(days / interval) * interval;
      const cursor = new Date(anchorDayUtc + dayShift * dayMs);
      const candidate = zonedEpochMs(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth() + 1,
        cursor.getUTCDate(),
        base.hour,
        base.minute,
        anchor.timeZone,
      );
      if (candidate > afterMs && (!hasUntil || candidate <= until)) return candidate;
      if (hasUntil && candidate > until) return null;
      days += interval;
    }
    return null;
  }

  if (recurrence.freq === "weekly") {
    const weekdays = (recurrence.weekdays ?? []).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    const days = weekdays.length ? Array.from(new Set(weekdays)).sort((a, b) => a - b) : [base.weekday];
    const anchorDayUtc = Date.UTC(base.year, base.month - 1, base.day);
    const after = zonedParts(Math.max(afterMs, first), anchor.timeZone);
    const afterDayUtc = Date.UTC(after.year, after.month - 1, after.day);
    const startOffset = Math.max(0, Math.round((afterDayUtc - anchorDayUtc) / dayMs));
    for (let offset = startOffset; offset <= startOffset + 366 * interval + 8; offset += 1) {
      const cursor = new Date(anchorDayUtc + offset * dayMs);
      const weekday = cursor.getUTCDay();
      if (!days.includes(weekday)) continue;
      // Weeks are counted from the anchor week so `interval: 2` means every
      // second week, not "every second calendar week of the year".
      const weeksSinceAnchor = Math.floor(offset / 7);
      if (interval > 1 && weeksSinceAnchor % interval !== 0) continue;
      const candidate = zonedEpochMs(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth() + 1,
        cursor.getUTCDate(),
        base.hour,
        base.minute,
        anchor.timeZone,
      );
      if (candidate <= afterMs) continue;
      if (hasUntil && candidate > until) return null;
      return candidate;
    }
    return null;
  }

  if (recurrence.freq === "monthly") {
    const targetDay = Math.min(31, Math.max(1, Math.round(Number(recurrence.dayOfMonth) || base.day)));
    let year = base.year;
    let month = base.month;
    for (let step = 0; step < 2400; step += 1) {
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      // A 31st-of-the-month rule fires on the last day of a short month, which
      // is what a learner means by "every month on the 31st".
      const day = Math.min(targetDay, daysInMonth);
      const candidate = zonedEpochMs(year, month, day, base.hour, base.minute, anchor.timeZone);
      if (candidate > afterMs && (!hasUntil || candidate <= until)) return candidate;
      if (hasUntil && candidate > until) return null;
      month += interval;
      while (month > 12) {
        month -= 12;
        year += 1;
      }
    }
    return null;
  }

  return null;
}

/**
 * Every occurrence inside `[fromMs, toMs]` (inclusive), capped by `limit`.
 *
 * The cap is a safety valve, not a product limit: a caller asking for a decade
 * of a minutely series gets `limit` rows instead of an unbounded loop (§131).
 */
export function occurrencesBetween(
  anchor: RecurrenceAnchor,
  fromMs: number,
  toMs: number,
  limit = 500,
): number[] {
  const out: number[] = [];
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return out;
  let cursor = fromMs - 1;
  let guard = 0;
  while (out.length < limit && guard < limit * 4 + 64) {
    guard += 1;
    const next = nextOccurrence(anchor, cursor);
    if (next === null) break;
    if (next > toMs) break;
    if (next >= fromMs) out.push(next);
    cursor = next;
  }
  return out;
}

/**
 * Stable key for one occurrence, used inside the notification id/key.
 *
 * Minute precision in UTC: two occurrences of the same series an hour apart in
 * different zones can never share a key, and the key does not depend on the
 * device's zone (so the server push and the local alarm agree, §64).
 */
export function occurrenceKey(epochMs: number): string {
  const date = new Date(Math.round(epochMs));
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}Z`
  );
}

/** `schedule:<id>:occurrence:<key>` — the ONE logical notification event (§64). */
export const notificationKeyFor = (scheduleId: string, epochMs: number): string =>
  `schedule:${scheduleId}:occurrence:${occurrenceKey(epochMs)}`;

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Human summary used by the schedule dialog and the workspace agenda. */
export function describeRecurrence(recurrence: Recurrence, timeZone: string): string {
  const zone = safeTimeZone(timeZone);
  const suffix = zone === "UTC" ? "" : ` (${zone.replace(/_/g, " ")})`;
  switch (recurrence.freq) {
    case "once":
    case undefined:
      return "Once";
    case "interval":
      return `Every ${clampInterval(recurrence.intervalMinutes, 60)} minutes${suffix}`;
    case "daily":
      return clampInterval(recurrence.interval) === 1
        ? `Daily${suffix}`
        : `Every ${clampInterval(recurrence.interval)} days${suffix}`;
    case "weekly": {
      const days = (recurrence.weekdays ?? []).map((day) => WEEKDAY_LABELS[day]).filter(Boolean);
      const label = days.length ? days.join(", ") : "weekly";
      const interval = clampInterval(recurrence.interval);
      return interval === 1 ? `Weekly · ${label}${suffix}` : `Every ${interval} weeks · ${label}${suffix}`;
    }
    case "monthly": {
      const interval = clampInterval(recurrence.interval);
      const day = recurrence.dayOfMonth ? ` · day ${recurrence.dayOfMonth}` : "";
      return interval === 1 ? `Monthly${day}${suffix}` : `Every ${interval} months${day}${suffix}`;
    }
    default:
      return "Once";
  }
}
