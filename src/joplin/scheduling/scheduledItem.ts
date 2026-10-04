// src/joplin/scheduling/scheduledItem.ts
//
// The universal schedule row: the ONE thing that can notify the learner.
//
// Product requirement (§19): "ANY THING CAN BE SCHEDULED". Scheduling is not a
// property of a to-do note, so a to-do is not the unit that fires — this row is.
// A Joplin note, a to-do, a notebook, a tag, a web clip, an attachment or a
// custom item like "Take mock test at 5 PM" all become a `ScheduledItem` whose
// `targetType`/`targetId` name a canonical object and whose `deepLink` says how
// to open it.
//
// What this module deliberately does NOT do:
//
//   · it does not expand recurrences into rows (§119) — `recurrence.ts`
//     computes occurrences from one row;
//   · it does not deliver anything — delivery stays with the existing
//     Digitalcatalyst notification layer (Android local alarms, Web Push, the
//     in-app inbox). The row is the DATA; the delivery authority is unchanged
//     (§100).
//
// Every field is validated before write, and every target type has a resolvable
// open behaviour (§19, §142) — `deepLinkForTarget` is the single place that
// defines what "open" means for a target.

import { scheduleIdForSeries, sanitizeDocIdSegment } from "../joplinIds.ts";

/** The canonical object kinds a schedule can point at. */
export type ScheduleTargetType =
  | "note"
  | "todo"
  | "notebook"
  | "tag"
  | "web-clip"
  | "resource"
  | "custom";

/** How a completion of the target affects the schedule. */
export type CompletionHandling =
  /** Keep firing on the recurrence even after the to-do is ticked. */
  | "continue"
  /** Stop once the target is completed (Joplin's alarm behaviour). */
  | "stop-on-complete"
  /** Fire once more, then disable itself. */
  | "disable-after-fire";

export interface ScheduleTarget {
  type: ScheduleTargetType;
  /** Canonical Joplin id of the target (or the schedule id for `custom`). */
  id: string;
  /** Notebook the target lives in, when known — makes the deep link exact. */
  notebookId?: string;
  /** Title captured at creation time so a deleted target still renders. */
  title?: string;
}

export interface ScheduledItem {
  id: string;
  ownerId: string;
  targetType: ScheduleTargetType;
  targetId: string;
  notebookId?: string;
  title: string;
  body: string;
  /**
   * The FIRST occurrence (epoch ms). For recurring rows this is the anchor: the
   * local wall-clock time of `dueAt` is what repeats (`recurrence.ts`).
   */
  dueAt: number;
  /** IANA zone. Always stored, never inferred at delivery time (§21). */
  timeZone: string;
  /** End of a block, when the reminder is a time slot rather than an instant. */
  endAt?: number;
  /** Alternative to `endAt` for "1 hour of Physics" style items. */
  durationMinutes?: number;
  recurrence: import("./recurrence").Recurrence;
  enabled: boolean;
  completionHandling: CompletionHandling;
  /** Where a notification tap lands (§142). */
  deepLink: string;
  /** `schedule:<id>:occurrence:<key>` of the LAST delivered occurrence. */
  lastFiredKey?: string;
  lastFiredAt?: number;
  /** Legacy provenance, so a re-run of the migration can never duplicate. */
  legacy?: { type: string; id: string };
  createdAt: number;
  updatedAt: number;
  /** Soft delete keeps the row for the recovery window (§143). */
  deleted?: boolean;
}

export interface ScheduledItemInput {
  ownerId: string;
  target: ScheduleTarget;
  title?: string;
  body?: string;
  dueAt: number;
  timeZone: string;
  endAt?: number;
  durationMinutes?: number;
  recurrence?: import("./recurrence").Recurrence;
  enabled?: boolean;
  completionHandling?: CompletionHandling;
  id?: string;
  legacy?: { type: string; id: string };
  now?: number;
}

/** A stable, content-free id so re-running a migration cannot duplicate a row. */
export function scheduleIdFor(input: Pick<ScheduledItemInput, "ownerId" | "target" | "dueAt" | "legacy">): string {
  if (input.legacy?.type && input.legacy?.id) {
    return scheduleIdForSeries(`legacy:${input.legacy.type}:${input.legacy.id}`);
  }
  return scheduleIdForSeries(`${input.target.type}:${input.target.id}:${Math.round(input.dueAt)}`);
}

/** Canonical deep link for a target. One definition, used by every surface. */
export function deepLinkForTarget(target: ScheduleTarget): string {
  const params = new URLSearchParams();
  switch (target.type) {
    case "note":
    case "todo":
    case "web-clip":
      params.set("note", target.id);
      if (target.notebookId) params.set("notebook", target.notebookId);
      return `#/my-day?${params.toString()}`;
    case "notebook":
      params.set("notebook", target.id);
      return `#/my-day?${params.toString()}`;
    case "tag":
      params.set("tag", target.id);
      return `#/my-day?${params.toString()}`;
    case "resource":
      params.set("resource", target.id);
      if (target.notebookId) params.set("notebook", target.notebookId);
      return `#/my-day?${params.toString()}`;
    case "custom":
    default:
      // A custom item has no canonical object to open, so it opens the
      // workspace itself with the schedule highlighted in the agenda — the only
      // honest "open" behaviour that exists for it.
      params.set("schedule", target.id);
      params.set("view", "agenda");
      return `#/my-day?${params.toString()}`;
  }
}

/** Build a validated schedule row. Throws only on programmer error. */
export function buildScheduledItem(input: ScheduledItemInput): ScheduledItem {
  const now = Math.round(input.now ?? Date.now());
  const id = input.id ?? scheduleIdFor(input);
  const recurrence = normalizeRecurrence(input.recurrence);
  const dueAt = Math.round(Number(input.dueAt));
  const endAt = Number.isFinite(Number(input.endAt)) ? Math.round(Number(input.endAt)) : undefined;
  const durationMinutes = Number.isFinite(Number(input.durationMinutes))
    ? Math.max(1, Math.round(Number(input.durationMinutes)))
    : undefined;
  return {
    id,
    ownerId: String(input.ownerId),
    targetType: input.target.type,
    targetId: String(input.target.id),
    ...(input.target.notebookId ? { notebookId: String(input.target.notebookId) } : {}),
    title: String(input.title ?? input.target.title ?? "Reminder").slice(0, 200),
    body: String(input.body ?? "").slice(0, 900),
    dueAt,
    timeZone: String(input.timeZone || "UTC"),
    ...(endAt ? { endAt } : {}),
    ...(durationMinutes ? { durationMinutes } : {}),
    recurrence,
    enabled: input.enabled !== false,
    completionHandling: input.completionHandling ?? (input.target.type === "todo" ? "stop-on-complete" : "continue"),
    deepLink: deepLinkForTarget(input.target),
    ...(input.legacy ? { legacy: { type: String(input.legacy.type), id: String(input.legacy.id) } } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeRecurrence(recurrence?: import("./recurrence").Recurrence): import("./recurrence").Recurrence {
  if (!recurrence || !recurrence.freq) return { freq: "once" };
  const freq = recurrence.freq;
  const out: import("./recurrence").Recurrence = { freq };
  if (Number.isFinite(Number(recurrence.interval))) out.interval = Math.max(1, Math.min(365, Math.round(Number(recurrence.interval))));
  if (Array.isArray(recurrence.weekdays) && recurrence.weekdays.length) {
    out.weekdays = Array.from(new Set(recurrence.weekdays.map((day) => Math.round(Number(day)))))
      .filter((day) => day >= 0 && day <= 6)
      .sort((a, b) => a - b);
  }
  if (Number.isFinite(Number(recurrence.dayOfMonth))) {
    out.dayOfMonth = Math.max(1, Math.min(31, Math.round(Number(recurrence.dayOfMonth))));
  }
  if (Number.isFinite(Number(recurrence.intervalMinutes))) {
    out.intervalMinutes = Math.max(5, Math.round(Number(recurrence.intervalMinutes)));
  }
  if (Number.isFinite(Number(recurrence.until)) && Number(recurrence.until) > 0) {
    out.until = Math.round(Number(recurrence.until));
  }
  return out;
}

/**
 * Validation errors for a row about to be written.
 *
 * The server enforces the same rules against its own copy (see
 * `api/_lib/joplinSchedule.ts`): the client check is for instant feedback, the
 * server check is the security boundary (§55).
 */
export function validateScheduledItem(item: ScheduledItem): string[] {
  const errors: string[] = [];
  if (!item.id || item.id !== sanitizeDocIdSegment(item.id)) errors.push("invalid_id");
  if (!item.ownerId) errors.push("missing_owner");
  if (!item.targetId) errors.push("missing_target");
  if (!Number.isFinite(item.dueAt) || item.dueAt <= 0) errors.push("invalid_due_at");
  if (!item.timeZone) errors.push("missing_time_zone");
  if (item.endAt && item.endAt < item.dueAt) errors.push("end_before_start");
  if (item.durationMinutes !== undefined && (item.durationMinutes <= 0 || item.durationMinutes > 24 * 60)) {
    errors.push("invalid_duration");
  }
  if (item.recurrence.freq === "weekly" && item.recurrence.weekdays && item.recurrence.weekdays.length > 7) {
    errors.push("invalid_weekdays");
  }
  if (!item.title.trim()) errors.push("missing_title");
  if (!item.deepLink.startsWith("#/my-day")) errors.push("invalid_deep_link");
  return errors;
}

/** Apply an edit without losing the fields the editor did not touch. */
export function applyScheduleEdit(
  item: ScheduledItem,
  patch: Partial<Pick<ScheduledItem, "title" | "body" | "dueAt" | "timeZone" | "endAt" | "durationMinutes" | "recurrence" | "enabled" | "completionHandling">>,
  now: number,
): ScheduledItem {
  const next: ScheduledItem = {
    ...item,
    ...patch,
    recurrence: patch.recurrence ? normalizeRecurrence(patch.recurrence) : item.recurrence,
    updatedAt: Math.round(now),
  };
  if (!patch.dueAt && !patch.timeZone && !patch.recurrence) return next;
  // The first occurrence moved, so the "already delivered" marker of the old
  // series no longer applies: clearing it lets the recurring clock evaluate the
  // new anchor immediately (and stops it from re-firing a stale key).
  return { ...next, lastFiredKey: undefined, lastFiredAt: undefined };
}

/** Enable/pause without touching the recurrence (§52). */
export const setScheduleEnabled = (item: ScheduledItem, enabled: boolean, now: number): ScheduledItem => ({
  ...item,
  enabled,
  updatedAt: Math.round(now),
});

/** Soft-delete a schedule row (kept for the recovery window, §106/§143). */
export const deleteSchedule = (item: ScheduledItem, now: number): ScheduledItem => ({
  ...item,
  enabled: false,
  deleted: true,
  updatedAt: Math.round(now),
});

/** Fire-time bookkeeping: the row remembers which occurrence it delivered. */
export const markScheduleFired = (item: ScheduledItem, notificationKey: string, firedAt: number): ScheduledItem => ({
  ...item,
  lastFiredKey: notificationKey,
  lastFiredAt: Math.round(firedAt),
  ...(item.completionHandling === "disable-after-fire" ? { enabled: false } : {}),
  updatedAt: Math.round(firedAt),
});

/**
 * Which schedules must be disabled because their target is gone (§143).
 *
 * Called with the ids that still exist after a permanent delete. Notebook
 * deletion resolves its children first (`notebookDescendants`), so a schedule
 * pointing at a nested notebook is cleaned up too (§144).
 */
export function orphanedSchedules(
  items: ScheduledItem[],
  existing: { noteIds: Set<string>; notebookIds: Set<string>; tagIds: Set<string>; resourceIds: Set<string> },
  now: number,
): ScheduledItem[] {
  const doomed: ScheduledItem[] = [];
  for (const item of items) {
    if (item.deleted || !item.enabled) continue;
    if (item.targetType === "custom") continue;
    const alive =
      (item.targetType === "notebook" && existing.notebookIds.has(item.targetId)) ||
      (item.targetType === "tag" && existing.tagIds.has(item.targetId)) ||
      (item.targetType === "resource" && existing.resourceIds.has(item.targetId)) ||
      ((item.targetType === "note" || item.targetType === "todo" || item.targetType === "web-clip") &&
        existing.noteIds.has(item.targetId));
    if (!alive) doomed.push({ ...item, enabled: false, updatedAt: Math.round(now) });
  }
  return doomed;
}
