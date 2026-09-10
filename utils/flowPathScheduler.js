// Pure helpers for FlowPath reminder notifications (client-side TWA safety net).
//
// Mirrors the My Day due/upcoming-item pattern from utils/pushScheduler.js,
// but adapted to the FlowPath shape: a Firestore COLLECTION of documents
// (users/{uid}/flowpathActivities, read via the flowpath.list API — see
// src/flowpath/hooks/useFlowPathFirestore.ts), NOT one doc with array fields.
//
// Time resolution per item (first match wins):
//   1. `scheduledFor` (epoch ms, UTC) — the primary scheduled instant.
//   2. `reminderTime` ("HH:mm") for kind === "reminder" — wall-clock time today.
//   3. `scheduleStartTime` ("HH:mm") for kind === "schedule" — wall-clock time today.
// Items with none of these, or with a terminal status
// (completed/cancelled), never notify.
//
// Dedup is "once per item per local day", exactly like walkMyDayItems: the
// key is `flowpath:<sanitized-id>:<local-date-of-dueAt>`. The caller passes
// whatever notification log it keeps (localStorage on the client; the server
// may keep its own map) — the collector itself stays pure and dependency-free
// (except the shared clock helpers) so plain node:test can cover it.
//
// Kept in its own module so My Day scheduling can never break because of a
// FlowPath change, and vice versa.

import {
  MYDAY_LOOKBACK_MS,
  MYDAY_MAX_CATCHUP_MS,
  dueEpochMs,
  localDateKey,
  parseClockTime,
} from "./pushScheduler.js";

export const FLOWPATH_LOOKBACK_MS = MYDAY_LOOKBACK_MS;
export const FLOWPATH_MAX_CATCHUP_MS = MYDAY_MAX_CATCHUP_MS;
export const FLOWPATH_UPCOMING_HORIZON_MS = 6 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const TERMINAL_STATUSES = new Set(["completed", "cancelled"]);

const sanitizeKeySegment = (value) =>
  String(value || "").replace(/[.\\/[\]*~`]/g, "_").slice(0, 80);

const itemLog = (notificationLog) =>
  notificationLog && typeof notificationLog === "object" ? notificationLog : {};

const KIND_META = {
  task: { emoji: "📝", label: "Task time" },
  reminder: { emoji: "⏰", label: "Reminder" },
  schedule: { emoji: "📅", label: "Scheduled event" },
  revision: { emoji: "📚", label: "Revision time" },
  mcq: { emoji: "✅", label: "Practice time" },
  lecture: { emoji: "🎓", label: "Lecture time" },
  note: { emoji: "📝", label: "Note" },
  other: { emoji: "🔔", label: "FlowPath" },
};

const kindMeta = (kind) => KIND_META[kind] || KIND_META.other;

// Resolve the wall-clock due instant for one FlowPath item, or null when the
// item carries no notifiable time. `dateKey` is the local calendar day the
// "HH:mm" fallbacks are resolved against (today for due checks; today or
// tomorrow for upcoming checks — see collectUpcomingFlowPathItems).
const resolveDueAt = (item, dateKey, tzOffsetMinutes) => {
  if (!item || typeof item !== "object") return null;
  if (TERMINAL_STATUSES.has(item.status)) return null;
  const scheduledFor = Number(item.scheduledFor);
  if (Number.isFinite(scheduledFor) && scheduledFor > 0) return scheduledFor;
  const clockSource =
    item.kind === "reminder"
      ? item.reminderTime
      : item.kind === "schedule"
        ? item.scheduleStartTime
        : null;
  const clock = clockSource ? parseClockTime(clockSource) : null;
  if (!clock) return null;
  return dueEpochMs(dateKey, clock, tzOffsetMinutes);
};

const buildTitleBody = (item) => {
  const meta = kindMeta(item.kind);
  const titleText = String(item.title || "FlowPath reminder");
  if (item.kind === "reminder") {
    return { title: `${meta.emoji} ${meta.label}`, body: titleText };
  }
  if (item.kind === "schedule") {
    const when = item.scheduleStartTime ? `Starts at ${item.scheduleStartTime}` : titleText;
    return {
      title: `${meta.emoji} ${titleText}`,
      body: item.description ? `${when} — ${item.description}` : when,
    };
  }
  if (item.kind === "task") {
    const subject = item.taskSubject ? ` · ${item.taskSubject}` : "";
    return { title: `${meta.emoji} ${meta.label}`, body: `${titleText}${subject}` };
  }
  return {
    title: `${meta.emoji} ${titleText}`,
    body: String(item.description || `${meta.label} is due.`),
  };
};

// Walk every FlowPath item that could produce a notification. `visit`
// receives the resolved due instant plus the ready-made title/body and the
// local date key the dedupe key is scoped to.
const walkFlowPathItems = (items, nowMs, tzOffsetMinutes, visit, { upcoming = false } = {}) => {
  if (!Array.isArray(items)) return;
  const today = localDateKey(nowMs, tzOffsetMinutes);
  const tomorrow = localDateKey(nowMs + DAY_MS, tzOffsetMinutes);
  for (const item of items) {
    if (!item || typeof item !== "object" || !item.id) continue;
    if (TERMINAL_STATUSES.has(item.status)) continue;
    const scheduledFor = Number(item.scheduledFor);
    const hasAbsoluteTime = Number.isFinite(scheduledFor) && scheduledFor > 0;
    let dueAt;
    let dateKey;
    if (hasAbsoluteTime) {
      dueAt = scheduledFor;
      dateKey = localDateKey(dueAt, tzOffsetMinutes);
    } else if (upcoming) {
      // Wall-clock fallback ("HH:mm", no absolute instant): the next
      // occurrence is today's if that time is still ahead, otherwise
      // tomorrow's — the same cross-midnight rule My Day uses.
      const todayAt = resolveDueAt(item, today, tzOffsetMinutes);
      if (todayAt === null) continue;
      dateKey = todayAt > nowMs ? today : tomorrow;
      dueAt = resolveDueAt(item, dateKey, tzOffsetMinutes);
      if (dueAt === null) continue;
    } else {
      dueAt = resolveDueAt(item, today, tzOffsetMinutes);
      if (dueAt === null) continue;
      dateKey = today;
    }
    const { title, body } = buildTitleBody(item);
    visit(item, dueAt, dateKey, title, body);
  }
};

// Collect every FlowPath item whose reminder time is due: once per item per
// local day. `notificationLog` is the caller's per-day dedupe map.
export const collectDueFlowPathItems = (
  items,
  nowMs,
  tzOffsetMinutes,
  notificationLog = undefined,
  lookbackMs = FLOWPATH_LOOKBACK_MS,
) => {
  const due = [];
  if (!Array.isArray(items) || !Number.isFinite(tzOffsetMinutes)) return due;
  const log = itemLog(notificationLog);
  const already = (key) => Object.prototype.hasOwnProperty.call(log, key);

  walkFlowPathItems(items, nowMs, tzOffsetMinutes, (item, dueAt, dateKey, title, body) => {
    if (dueAt > nowMs || nowMs - dueAt > lookbackMs) return;
    const key = `flowpath:${sanitizeKeySegment(item.id)}:${dateKey}`;
    if (already(key)) return;
    due.push({ key, kind: String(item.kind || "other"), itemId: String(item.id), title, body, dueAt });
  });

  return due.sort((a, b) => a.dueAt - b.dueAt);
};

// Collect every FlowPath item whose next occurrence is still ahead of `nowMs`
// and within `horizonMs` (default 6h). Used by the TWA to pre-schedule
// Android local alarms so an exact-time reminder fires on the dot even when
// the app is closed. `collectDueFlowPathItems` only sees items that are
// ALREADY due, so it cannot arm future alarms.
export const collectUpcomingFlowPathItems = (
  items,
  nowMs,
  tzOffsetMinutes,
  notificationLog = undefined,
  horizonMs = FLOWPATH_UPCOMING_HORIZON_MS,
) => {
  const upcoming = [];
  if (!Array.isArray(items) || !Number.isFinite(tzOffsetMinutes)) return upcoming;
  const log = itemLog(notificationLog);
  const already = (key) => Object.prototype.hasOwnProperty.call(log, key);

  walkFlowPathItems(
    items,
    nowMs,
    tzOffsetMinutes,
    (item, dueAt, dateKey, title, body) => {
      if (dueAt <= nowMs || dueAt - nowMs > horizonMs) return;
      const key = `flowpath:${sanitizeKeySegment(item.id)}:${dateKey}`;
      if (already(key)) return;
      upcoming.push({ key, kind: String(item.kind || "other"), itemId: String(item.id), title, body, dueAt });
    },
    { upcoming: true },
  );

  return upcoming.sort((a, b) => a.dueAt - b.dueAt);
};
