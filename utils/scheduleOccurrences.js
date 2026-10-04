// utils/scheduleOccurrences.js
//
// The server's copy of the canonical schedule maths.
//
// WHY A COPY: the cron function (`api/cron/subscription-renewals.ts`) is plain
// Node and the scheduler's implementation lives in TypeScript next to the client
// (`src/joplin/scheduling/recurrence.ts`). Rather than make the serverless
// function reach across into client sources, the maths is mirrored here — and
// `tests/joplinScheduleParity.test.mjs` drives BOTH implementations over the same
// fixtures (daily/weekly/weekdays/monthly/interval, DST, `until`, `count`) and
// fails if any occurrence instant, key or id differs. The mirror is allowed to
// exist only because that test can prove it agrees.
//
// Everything here is pure: no Firebase, no Intl caching beyond a formatter map.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatterCache = new Map();

function partsFormatter(timeZone) {
  const key = String(timeZone || "UTC");
  const cached = formatterCache.get(key);
  if (cached) return cached;
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: key,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
  } catch {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
  }
  formatterCache.set(key, formatter);
  return formatter;
}

const safeTimeZone = (timeZone) => {
  const text = String(timeZone ?? "").trim();
  if (!text) return "UTC";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: text }).format(new Date());
    return text;
  } catch {
    return "UTC";
  }
};

/** Zone-local calendar fields of an instant. */
function zonedParts(epochMs, timeZone) {
  const zone = safeTimeZone(timeZone);
  const parts = partsFormatter(zone).formatToParts(new Date(epochMs));
  const get = (type) => parts.find((part) => part.type === type).value || "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? new Date(epochMs).getUTCDay(),
  };
}

function zoneOffsetMs(epochMs, timeZone) {
  const zone = safeTimeZone(timeZone);
  const parts = partsFormatter(zone).formatToParts(new Date(epochMs));
  const get = (type) => Number(parts.find((part) => part.type === type).value || "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

export const timeZoneOffsetMinutes = (epochMs, timeZone) => Math.round(zoneOffsetMs(epochMs, timeZone) / 60000);

/** Wall-clock fields → instant (two offset probes, DST-safe). */
export function zonedEpochMs(year, month, day, hour, minute, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const first = guess - zoneOffsetMs(guess, timeZone);
  const second = guess - zoneOffsetMs(first, timeZone);
  return zonedParts(second, timeZone).hour === hour % 24 ? second : second;
}

const clampInterval = (value, fallback = 1) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(365, Math.round(number));
};

/** The occurrence after `afterMs` (exclusive), or null when exhausted. */
export function nextOccurrence(anchor, afterMs) {
  const recurrence = anchor.recurrence || {};
  const until = Number(recurrence.until ?? 0);
  const hasUntil = Number.isFinite(until) && until > 0;
  const base = zonedParts(anchor.dueAt, anchor.timeZone);
  const first = Number(anchor.dueAt);

  if (recurrence.freq === "once" || !recurrence.freq) {
    return first > afterMs && (!hasUntil || first <= until) ? first : null;
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
    const anchorDayUtc = Date.UTC(base.year, base.month - 1, base.day);
    const after = zonedParts(Math.max(afterMs, first), anchor.timeZone);
    const afterDayUtc = Date.UTC(after.year, after.month - 1, after.day);
    let days = Math.max(0, Math.round((afterDayUtc - anchorDayUtc) / DAY_MS));
    days = Math.ceil(days / interval) * interval;
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const dayShift = Math.floor(days / interval) * interval;
      const cursor = new Date(anchorDayUtc + dayShift * DAY_MS);
      const candidate = zonedEpochMs(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate(), base.hour, base.minute, anchor.timeZone);
      if (candidate > afterMs && (!hasUntil || candidate <= until)) return candidate;
      if (hasUntil && candidate > until) return null;
      days += interval;
    }
    return null;
  }

  if (recurrence.freq === "weekly") {
    const weekdays = (recurrence.weekdays || []).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    const days = weekdays.length ? [...new Set(weekdays)].sort((a, b) => a - b) : [base.weekday];
    const anchorDayUtc = Date.UTC(base.year, base.month - 1, base.day);
    const after = zonedParts(Math.max(afterMs, first), anchor.timeZone);
    const afterDayUtc = Date.UTC(after.year, after.month - 1, after.day);
    const startOffset = Math.max(0, Math.round((afterDayUtc - anchorDayUtc) / DAY_MS));
    for (let offset = startOffset; offset <= startOffset + 366 * interval + 8; offset += 1) {
      const cursor = new Date(anchorDayUtc + offset * DAY_MS);
      if (!days.includes(cursor.getUTCDay())) continue;
      const weeksSinceAnchor = Math.floor(offset / 7);
      if (interval > 1 && weeksSinceAnchor % interval !== 0) continue;
      const candidate = zonedEpochMs(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate(), base.hour, base.minute, anchor.timeZone);
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

/** Every occurrence inside `[fromMs, toMs]`, capped. */
export function occurrencesBetween(anchor, fromMs, toMs, limit = 500) {
  const out = [];
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

/** `YYYYMMDDTHHMMZ` — minute precision, UTC, zone-independent. */
export function occurrenceKey(epochMs) {
  const date = new Date(Math.round(epochMs));
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}Z`;
}

/** `schedule:<id>:occurrence:<key>` — the ONE logical notification event. */
export const notificationKeyFor = (scheduleId, epochMs) => `schedule:${scheduleId}:occurrence:${occurrenceKey(epochMs)}`;

/**
 * Firestore rejects `/` inside a document id, and treats `.` / `..` as path
 * segments; reserved characters fold to `_` rather than disappearing, so two
 * different keys can never collapse into one id (mirrors
 * `sanitizeDocIdSegment` in src/joplin/joplinIds.ts).
 */
export function sanitizeDocIdSegment(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "." || text === "..") return "_";
  return text.replace(/[/\u0000-\u001f\u007f]/g, "_").slice(0, 128);
}

/**
 * The inbox document id for one delivered occurrence — identical to
 * `occurrenceNotificationDocId` in src/joplin/joplinIds.ts, so the cron, the
 * foreground check and the Android alarm all write and read ONE document.
 */
export const occurrenceNotificationDocId = (scheduleId, key) =>
  `sch_${sanitizeDocIdSegment(scheduleId)}_${sanitizeDocIdSegment(key)}`;

const canonicalDeepLink = (row) => {
  const explicit = String(row.deepLink || "").trim();
  if (explicit.startsWith("#/my-day")) return explicit;
  if (row.targetType === "notebook" && row.targetId) return `#/my-day?notebook=${encodeURIComponent(row.targetId)}`;
  if (row.targetType === "tag" && row.targetId) return `#/my-day?tag=${encodeURIComponent(row.targetId)}`;
  if (row.targetType === "resource" && row.targetId) return `#/my-day?resource=${encodeURIComponent(row.targetId)}`;
  if ((row.targetType === "note" || row.targetType === "todo" || row.targetType === "web-clip") && row.targetId) {
    return `#/my-day?note=${encodeURIComponent(row.targetId)}`;
  }
  return `#/my-day?schedule=${encodeURIComponent(String(row.id || ""))}`;
};

/**
 * Due occurrences for ONE learner's rows.
 *
 * `fired` is the learner's own log (`schedule:<id>:occurrence:<key>` → epoch ms).
 * A row that is disabled, deleted, or whose occurrence is already in the log is
 * skipped, so overlapping cron pings cannot double-deliver.
 */
export function dueScheduleOccurrences(rows, now, lookbackMs, fired = {}) {
  const out = [];
  const from = now - Math.max(60_000, Number(lookbackMs) || 0);
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || row.deleted === true || row.enabled === false) continue;
    const scheduleId = String(row.id || "");
    if (!scheduleId) continue;
    const anchor = { dueAt: Number(row.dueAt) || 0, timeZone: row.timeZone, recurrence: row.recurrence || { freq: "once" } };
    if (!anchor.dueAt) continue;
    for (const at of occurrencesBetween(anchor, from, now, 8)) {
      const key = notificationKeyFor(scheduleId, at);
      if (Object.prototype.hasOwnProperty.call(fired, key)) continue;
      out.push({
        scheduleId,
        occurrenceKey: occurrenceKey(at),
        key,
        notificationId: occurrenceNotificationDocId(scheduleId, occurrenceKey(at)),
        title: String(row.title || "Reminder"),
        body: String(row.body || ""),
        dueAt: at,
        timeZone: String(row.timeZone || "UTC"),
        targetType: String(row.targetType || "custom"),
        targetId: String(row.targetId || ""),
        notebookId: String(row.notebookId || ""),
        deepLink: canonicalDeepLink(row),
      });
    }
  }
  return out.sort((a, b) => a.dueAt - b.dueAt);
}

export const WEEKDAY_LABELS = WEEKDAY_NAMES;
