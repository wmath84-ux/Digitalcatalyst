// src/joplin/scheduling/scheduleNotifications.ts
//
// The bridge between the universal schedule rows and the EXISTING
// Digitalcatalyst notification delivery layer.
//
// This module adds no delivery mechanism of its own. It answers exactly one
// question — "which schedules are due (or coming up), and what should the
// notification say?" — in the same shape the legacy My Day collectors used
// (`utils/pushScheduler.js`), so that:
//
//   · `src/main.tsx` keeps its foreground clock, its 15-second check, its
//     five-minute reschedule, its Android local alarms, its
//     `showLocalSystemNotification` web path and its `recordDeviceNotification`
//     inbox mirror — with the DATA SOURCE swapped for the canonical schedule
//     rows (§29);
//   · `api/cron/subscription-renewals.ts` keeps its Web Push fan-out with the
//     same swap on the server (§147);
//   · FlowPath's scheduler is untouched (§30).
//
// One logical event, one key (§64): `notificationKeyFor(scheduleId, occurrence)`
// is what the Firestore inbox document id, the Android alarm id and the Web Push
// `tag` are all derived from, so the server push, the local alarm and the
// in-app entry can never become three notifications.

import { alarmIdForNotificationKey } from "../joplinIds.ts";
import { nextOccurrence, notificationKeyFor, occurrenceKey } from "./recurrence.ts";
import type { ScheduledItem } from "./scheduledItem.ts";

export interface ScheduleOccurrence {
  scheduleId: string;
  ownerId: string;
  targetType: ScheduledItem["targetType"];
  targetId: string;
  title: string;
  body: string;
  dueAt: number;
  occurrenceAt: number;
  occurrenceKey: string;
  /** `schedule:<id>:occurrence:<key>` — the stable identity of this delivery. */
  notificationKey: string;
  /** Stable Android alarm id derived from the notification key. */
  alarmId: number;
  /** Where a tap lands (already canonical, §142). */
  deepLink: string;
  /** Bell/inbox category; `mayday` is the existing My Day chip (§17 of the spec). */
  category: "mayday";
}

const asActive = (item: ScheduledItem): boolean => Boolean(item) && !item.deleted && item.enabled !== false;

/**
 * Occurrences of one row inside `[fromMs, toMs]`.
 *
 * A non-recurring row yields at most its single `dueAt`; a recurring row yields
 * every occurrence in the window, which is what the cron catch-up path needs
 * after an outage (§120).
 */
export function scheduleOccurrencesBetween(
  item: ScheduledItem,
  fromMs: number,
  toMs: number,
  limit = 50,
): ScheduleOccurrence[] {
  if (!asActive(item)) return [];
  const anchor = { dueAt: item.dueAt, timeZone: item.timeZone, recurrence: item.recurrence };
  const out: ScheduleOccurrence[] = [];
  let cursor = fromMs - 1;
  let guard = 0;
  while (out.length < limit && guard < limit * 4 + 32) {
    guard += 1;
    const at = nextOccurrence(anchor, cursor);
    if (at === null) break;
    if (at > toMs) break;
    if (at >= fromMs) out.push(toOccurrence(item, at));
    cursor = at;
  }
  return out;
}

function toOccurrence(item: ScheduledItem, at: number): ScheduleOccurrence {
  const key = notificationKeyFor(item.id, at);
  return {
    scheduleId: item.id,
    ownerId: item.ownerId,
    targetType: item.targetType,
    targetId: item.targetId,
    title: item.title,
    body: item.body,
    dueAt: item.dueAt,
    occurrenceAt: at,
    occurrenceKey: occurrenceKey(at),
    notificationKey: key,
    alarmId: alarmIdForNotificationKey(key),
    deepLink: item.deepLink,
    category: "mayday",
  };
}

/**
 * Occurrences whose moment has arrived while the app was closed, delivered
 * late, or missed entirely — bounded by `lookbackMs`.
 *
 * `lastFiredKey` is honoured so a re-render, a re-subscription or a second
 * device cannot deliver the same occurrence twice; the cron additionally
 * persists the key in the existing `notificationLog` style map.
 */
export function collectDueScheduleOccurrences(
  items: ScheduledItem[],
  nowMs: number,
  lookbackMs: number,
  limit = 100,
): ScheduleOccurrence[] {
  const from = Math.max(0, nowMs - Math.max(0, lookbackMs));
  const due: ScheduleOccurrence[] = [];
  for (const item of items) {
    for (const occurrence of scheduleOccurrencesBetween(item, from, nowMs, 10)) {
      if (item.lastFiredKey === occurrence.notificationKey) continue;
      if (occurrence.dueAt === occurrence.occurrenceAt && item.lastFiredAt && item.lastFiredAt >= occurrence.occurrenceAt) continue;
      due.push(occurrence);
      if (due.length >= limit) return due;
    }
  }
  return due.sort((left, right) => left.occurrenceAt - right.occurrenceAt);
}

/** Occurrences still ahead, used to pre-arm Android local alarms (§148). */
export function collectUpcomingScheduleOccurrences(
  items: ScheduledItem[],
  nowMs: number,
  horizonMs: number,
  limit = 100,
): ScheduleOccurrence[] {
  const until = nowMs + Math.max(0, horizonMs);
  const upcoming: ScheduleOccurrence[] = [];
  for (const item of items) {
    for (const occurrence of scheduleOccurrencesBetween(item, nowMs + 1, until, 20)) {
      upcoming.push(occurrence);
      if (upcoming.length >= limit) return upcoming;
    }
  }
  return upcoming.sort((left, right) => left.occurrenceAt - right.occurrenceAt);
}

/**
 * The `mayday`-compatible view of an occurrence.
 *
 * The existing delivery code (and the Firestore rules that mirror its caps)
 * speaks the legacy `{ key, kind, section, itemId, title, body, dueAt }` shape.
 * Rather than rewrite the delivery layer, occurrences are projected into it —
 * with `section` now derived from the canonical target type so the legacy
 * deep-link translator can still resolve an old URL (§28) and the new
 * `deepLink` carried alongside for taps that come from the inbox.
 */
export interface LegacyShapedDueItem {
  key: string;
  kind: "reminder" | "task" | "schedule";
  section: "tasks" | "schedule" | "reminders";
  itemId: string;
  title: string;
  body: string;
  dueAt: number;
  target: { type: "joplin"; noteId?: string; notebookId?: string; tagId?: string; resourceId?: string; scheduleId: string };
  deepLink: string;
  notificationKey: string;
  /** The occurrence this delivery belongs to (`YYYYMMDDTHHmmZ`). */
  occurrenceKey: string;
  alarmId: number;
  category: "mayday";
}

export function toLegacyShapedDueItem(occurrence: ScheduleOccurrence): LegacyShapedDueItem {
  const kind: LegacyShapedDueItem["kind"] =
    occurrence.targetType === "todo" ? "task" : occurrence.targetType === "note" || occurrence.targetType === "web-clip" ? "reminder" : "schedule";
  const section: LegacyShapedDueItem["section"] =
    kind === "task" ? "tasks" : kind === "reminder" ? "reminders" : "schedule";
  return {
    key: `${occurrence.scheduleId}:${occurrence.occurrenceKey}`,
    kind,
    section,
    itemId: occurrence.targetId,
    title: occurrence.title,
    body: occurrence.body,
    dueAt: occurrence.occurrenceAt,
    target: {
      type: "joplin",
      scheduleId: occurrence.scheduleId,
      ...(occurrence.targetType === "note" || occurrence.targetType === "todo" || occurrence.targetType === "web-clip"
        ? { noteId: occurrence.targetId }
        : {}),
      ...(occurrence.targetType === "notebook" ? { notebookId: occurrence.targetId } : {}),
      ...(occurrence.targetType === "tag" ? { tagId: occurrence.targetId } : {}),
      ...(occurrence.targetType === "resource" ? { resourceId: occurrence.targetId } : {}),
    },
    deepLink: occurrence.deepLink,
    notificationKey: occurrence.notificationKey,
    occurrenceKey: occurrence.occurrenceKey,
    alarmId: occurrence.alarmId,
    category: "mayday",
  };
}

/**
 * A to-do whose Joplin alarm and universal schedule would deliver the same
 * moment. Returned so the caller can pick ONE authority (§53, §99) instead of
 * arming both: the schedule wins, and the Joplin `todo_due` stays as the
 * learner-visible due date.
 */
export function conflictingJoplinAlarms(item: ScheduledItem, otherItems: ScheduledItem[]): ScheduledItem[] {
  if (item.targetType !== "todo") return [];
  return otherItems.filter(
    (other) =>
      other !== item &&
      other.targetType === "todo" &&
      other.targetId === item.targetId &&
      asActive(other) &&
      Math.abs(other.dueAt - item.dueAt) < 60_000,
  );
}
