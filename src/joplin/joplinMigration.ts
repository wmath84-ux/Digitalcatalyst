// src/joplin/joplinMigration.ts
//
// Joplin My Day Migration V1 — the pure planner.
//
// The legacy My Day planner kept four arrays (`myday_tasks`, `myday_schedule`,
// `myday_notes`, `myday_reminders`, mirrored to `users/{uid}/myDay/current`).
// The Joplin workspace has one canonical model. This module is the mapping
// between them, and it is a PURE FUNCTION of the legacy snapshot so that:
//
//   · it can be unit-tested exhaustively without Firebase (§152);
//   · it can be re-run at any time and produce byte-identical ids, which is what
//     makes the migration idempotent instead of duplicating a learner's notes;
//   · a partially failed run can resume: the writer records a phase per legacy
//     section (`tasks`, `notes`, `reminders`, `schedule`), and the planner
//     always produces the same plan for the same input (§11).
//
// Mapping decisions (each one is a deliberate preservation of legacy meaning,
// not a simplification — see docs/myday-to-joplin-migration.md):
//
//   TASK      → Joplin to-do note; `status: completed` → `todo_completed`
//               timestamp, `in-progress` → `status:in-progress` tag (Joplin has
//               no in-progress state and silently dropping it would lose
//               information, §72), `priority` → `priority:<x>` tag (§73),
//               `subject` → `subject:<x>` tag (§74), and `time` → a DAILY
//               schedule, because the legacy scheduler fired a task with a
//               clock time every day at that time.
//   NOTE      → Joplin note; HTML → Markdown via `joplinRichText.ts` (§69);
//               `color` → `color:<x>` tag.
//   REMINDER  → Joplin to-do note (+ daily schedule while it is not done);
//               `myday_reminder_meta` category/note preserved as a
//               `category:<x>` tag and as note body text (§70).
//   SCHEDULE  → a Joplin note (the canonical object) PLUS a schedule row that
//               carries start/end. The event's times are NOT flattened into the
//               note body — they stay structured on the schedule row (§9, §22).
//   Everything also receives a `legacy:<kind>` tag, so the recovery window and
//   the verification step can find migrated content without a side table.

import { buildNote, buildNotebook, buildTag, normalizeTagKey } from "./joplinModel.ts";
import type { JoplinNotebookRow, JoplinNoteRow, JoplinTagRow } from "./joplinModel.ts";
import { joplinIdForLegacy, joplinIdForNamed, legacySourceKey } from "./joplinIds.ts";
import type { LegacyKind } from "./joplinIds.ts";
import { legacyHtmlToMarkdown } from "./joplinRichText.ts";
import { buildScheduledItem, scheduleIdFor } from "./scheduling/scheduledItem.ts";
import type { ScheduledItem } from "./scheduling/scheduledItem.ts";
import type { Recurrence } from "./scheduling/recurrence.ts";
import { zonedEpochMs } from "./scheduling/recurrence.ts";
import {
  LEGACY_SECTION_NOTEBOOK,
  WEB_CLIPPINGS_NOTEBOOK,
  notebookIdForName,
  workspaceRootNotebookId,
} from "./joplinDeepLinks.ts";

// ─────────────────────────────── legacy shapes ───────────────────────────────

export interface LegacyTask {
  id: string;
  title: string;
  subject?: string;
  time?: string;
  priority?: string;
  status?: string;
  createdAt?: number;
  completedAt?: number;
}

export interface LegacyQuickNote {
  id: string;
  text: string;
  createdAt?: number;
  color?: string;
  html?: string;
}

export interface LegacyReminder {
  id: string;
  text: string;
  time?: string;
  done?: boolean;
  createdAt?: number;
  completedAt?: number;
}

export interface LegacyScheduleEvent {
  id: string;
  title: string;
  detail?: string;
  /** `HH:MM` (24h) or `09:00 AM`. */
  startTime: string;
  endTime?: string;
  type?: string;
  createdAt?: number;
}

export interface LegacyReminderMeta {
  category?: string;
  note?: string;
}

export interface LegacyMyDaySnapshot {
  tasks?: LegacyTask[];
  notes?: LegacyQuickNote[];
  reminders?: LegacyReminder[];
  schedule?: LegacyScheduleEvent[];
  /** `myday_reminder_meta` from localStorage, if this device has it. */
  reminderMeta?: Record<string, LegacyReminderMeta>;
  /** `new Date().getTimezoneOffset()` captured on the legacy client. */
  tzOffsetMinutes?: number;
  /** IANA zone when known; preferred over the raw offset. */
  timeZone?: string;
}

export type MigrationPhaseKey = "tasks" | "notes" | "reminders" | "schedule";

export interface LegacyIndexEntry {
  kind: LegacyKind;
  legacyId: string;
  title: string;
  notebookId: string;
  noteId: string;
  notebookId_: string;
  scheduleId: string | null;
  todo: boolean;
}

export interface MigrationPlan {
  ownerId: string;
  timeZone: string;
  notebooks: JoplinNotebookRow[];
  notes: JoplinNoteRow[];
  tags: JoplinTagRow[];
  schedules: ScheduledItem[];
  /** `legacy:<kind>:<id>` → the Joplin objects it became (§10). */
  legacyIndex: Record<string, LegacyIndexEntry>;
  counts: {
    notebooks: number;
    notes: number;
    todos: number;
    tags: number;
    schedules: number;
    byPhase: Record<MigrationPhaseKey, number>;
  };
  warnings: string[];
}

export interface MigrationOptions {
  ownerId: string;
  now?: number;
  /** IANA zone of the learner. Defaults to the device zone. */
  timeZone?: string;
  /** Legacy device offset in minutes (UTC − local). Used when no zone is known. */
  tzOffsetMinutes?: number;
}

const MAX_TITLE = 200;

const deviceTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/** `HH:MM` / `09:00 AM` → { hours, minutes }, or null when unparseable. */
export function parseLegacyClock(value: unknown): { hours: number; minutes: number } | null {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3] ? match[3].toLowerCase() : null;
  if (meridiem) {
    if (hours === 12) hours = 0;
    if (meridiem === "pm") hours += 12;
  }
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

const pad2 = (value: number) => String(value).padStart(2, "0");

/** Legacy local date key (`YYYY-MM-DD`) for an offset-based device zone. */
export function legacyLocalDateKey(nowMs: number, tzOffsetMinutes: number): string {
  return new Date(nowMs - tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

/**
 * The next instant at which a legacy daily clock time occurs.
 *
 * Mirrors `utils/pushScheduler.js` (`localDateKey` + `dueEpochMs`) so the
 * migrated schedule fires at exactly the moment the old planner did — a learner
 * whose reminder was "18:30" keeps getting it at 18:30, not at "now + 1 day".
 */
export function nextLegacyClockInstant(
  time: string,
  nowMs: number,
  timeZone: string,
  tzOffsetMinutes: number,
): number | null {
  const clock = parseLegacyClock(time);
  if (!clock) return null;
  const zone = String(timeZone ?? "").trim();
  if (zone && zone !== "UTC") {
    for (let dayOffset = 0; dayOffset <= 8; dayOffset += 1) {
      const cursor = new Date(nowMs + dayOffset * 86_400_000);
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(cursor);
      const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
      const candidate = zonedEpochMs(get("year"), get("month"), get("day"), clock.hours, clock.minutes, zone);
      if (candidate > nowMs) return candidate;
    }
    return null;
  }
  for (let dayOffset = 0; dayOffset <= 8; dayOffset += 1) {
    const dateKey = legacyLocalDateKey(nowMs + dayOffset * 86_400_000, tzOffsetMinutes);
    const candidate =
      Date.parse(`${dateKey}T${pad2(clock.hours)}:${pad2(clock.minutes)}:00.000Z`) + tzOffsetMinutes * 60_000;
    if (candidate > nowMs) return candidate;
  }
  return null;
}

/** End of a schedule block that may legitimately cross midnight. */
export function endInstantFor(startAt: number, endTime: string, timeZone: string): number | null {
  const clock = parseLegacyClock(endTime);
  if (!clock) return null;
  const dayMs = 86_400_000;
  const zone = String(timeZone ?? "").trim();
  const startParts = zone && zone !== "UTC"
    ? (() => {
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: zone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hourCycle: "h23",
          hour: "2-digit",
          minute: "2-digit",
        }).formatToParts(new Date(startAt));
        const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
        return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
      })()
    : (() => {
        const date = new Date(startAt);
        return {
          year: date.getUTCFullYear(),
          month: date.getUTCMonth() + 1,
          day: date.getUTCDate(),
          hour: date.getUTCHours(),
          minute: date.getUTCMinutes(),
        };
      })();
  const toInstant = (dayShift: number) =>
    zone && zone !== "UTC"
      ? zonedEpochMs(startParts.year, startParts.month, startParts.day + dayShift, clock.hours, clock.minutes, zone)
      : Date.parse(
          `${new Date(startAt + dayShift * dayMs).toISOString().slice(0, 10)}T${pad2(clock.hours)}:${pad2(clock.minutes)}:00.000Z`,
        ) + (zone === "UTC" ? 0 : 0);
  const sameDay = toInstant(0);
  if (sameDay > startAt) return sameDay;
  return toInstant(1);
}

/** First line of a legacy note becomes its Joplin title (§17, §69). */
export function deriveNoteTitle(text: string, fallback: string): string {
  const firstLine = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[#>\-*\s]+/, "").trim())
    .find((line) => line.length > 0);
  return (firstLine || fallback).slice(0, MAX_TITLE);
}

/** Legacy reminder text carried an optional "Title — note" shape. */
export function splitReminderText(text: string): { title: string; note: string } {
  const raw = String(text ?? "").trim();
  const parts = raw.split(/\s+(?:—|–|-{1,2}|:)\s+/);
  if (parts.length < 2) return { title: raw.slice(0, MAX_TITLE), note: "" };
  return { title: parts[0].slice(0, MAX_TITLE), note: parts.slice(1).join(" ").trim() };
}

const DEFAULT_NOTEBOOKS = ["My Day"] as const;

const ALLOWED_REMINDER_CATEGORIES = new Set(["study", "test", "personal", "class"]);
const ALLOWED_PRIORITIES = new Set(["low", "medium", "high"]);
const ALLOWED_STATUSES = new Set(["pending", "in-progress", "completed"]);
const ALLOWED_SCHEDULE_TYPES = new Set(["class", "study", "break", "personal", "exam"]);

/** Normalise a legacy tag value: lowercase, no separators, capped. */
const tagValue = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}+:_-]/gu, "")
    .slice(0, 60);

/**
 * Plan the migration.
 *
 * `ownerId` is required and is written into every row: ownership is derived from
 * the authenticated identity, never accepted from a payload (§55).
 */
export function planMyDayMigration(snapshot: LegacyMyDaySnapshot, options: MigrationOptions): MigrationPlan {
  const ownerId = String(options.ownerId ?? "").trim();
  if (!ownerId) throw new Error("planMyDayMigration requires an authenticated ownerId");
  const now = Math.round(options.now ?? Date.now());
  const timeZone = String(options.timeZone || snapshot.timeZone || deviceTimeZone());
  const tzOffsetMinutes = Number.isFinite(Number(snapshot.tzOffsetMinutes))
    ? Number(snapshot.tzOffsetMinutes)
    : new Date(now).getTimezoneOffset();

  const warnings: string[] = [];
  const notebooks: JoplinNotebookRow[] = [];
  const notes: JoplinNoteRow[] = [];
  const tags: JoplinTagRow[] = [];
  const schedules: ScheduledItem[] = [];
  const legacyIndex: Record<string, LegacyIndexEntry> = {};
  const tagIdsByKey = new Map<string, string>();

  const rootNotebookId = workspaceRootNotebookId();

  const ensureNotebook = (name: string, parentId: string): string => {
    const id = notebookIdForName(name, parentId);
    if (!notebooks.some((notebook) => notebook.id === id)) {
      notebooks.push(
        buildNotebook({
          id,
          ownerId,
          title: name,
          parentId,
          createdTime: now,
          now,
          legacy: { type: "notebook", id: `${parentId || "root"}:${name.toLowerCase()}` },
        }),
      );
    }
    return id;
  };

  const ensureTag = (title: string): string => {
    const key = normalizeTagKey(title);
    const existing = tagIdsByKey.get(key);
    if (existing) return existing;
    const id = joplinIdForNamed("tag", key);
    tagIdsByKey.set(key, id);
    tags.push(buildTag({ id, ownerId, title, createdTime: now, now }));
    return id;
  };

  const tagsFor = (values: string[]): { ids: string[]; titles: string[] } => {
    const ids: string[] = [];
    const titles: string[] = [];
    for (const value of values) {
      const title = value.trim();
      if (!title) continue;
      ids.push(ensureTag(title));
      titles.push(title);
    }
    return { ids, titles };
  };

  // ── notebooks ─────────────────────────────────────────────────────────────
  ensureNotebook(DEFAULT_NOTEBOOKS[0], "");
  const tasksNotebookId = ensureNotebook(LEGACY_SECTION_NOTEBOOK.tasks, rootNotebookId);
  const notesNotebookId = ensureNotebook(LEGACY_SECTION_NOTEBOOK.notes, rootNotebookId);
  const remindersNotebookId = ensureNotebook(LEGACY_SECTION_NOTEBOOK.reminders, rootNotebookId);
  const scheduleNotebookId = ensureNotebook(LEGACY_SECTION_NOTEBOOK.schedule, rootNotebookId);
  ensureNotebook(WEB_CLIPPINGS_NOTEBOOK, rootNotebookId);

  const countsByPhase: Record<MigrationPhaseKey, number> = { tasks: 0, notes: 0, reminders: 0, schedule: 0 };

  const todoNote = (
    input: {
      kind: LegacyKind;
      legacyId: string;
      title: string;
      body: string;
      notebookId: string;
      createdTime: number;
      completed: boolean;
      completedAt?: number;
      tags: string[];
      todoDue: number;
    },
  ): JoplinNoteRow => {
    const noteId = joplinIdForLegacy(input.kind, input.legacyId);
    const completedAt = input.completed ? Math.round(input.completedAt || input.createdTime || now) : 0;
    const tagRefs = tagsFor(input.tags);
    const note = buildNote({
      id: noteId,
      ownerId,
      parentId: input.notebookId,
      title: input.title || "(untitled)",
      body: input.body,
      isTodo: true,
      todoDue: input.todoDue,
      todoCompleted: completedAt,
      createdTime: input.createdTime,
      updatedTime: Math.max(input.createdTime, completedAt || 0),
      now,
      tagIds: tagRefs.ids,
      tagTitles: tagRefs.titles,
      legacy: { type: input.kind, id: input.legacyId },
    });
    return note;
  };

  const plainNote = (input: {
    kind: LegacyKind;
    legacyId: string;
    title: string;
    body: string;
    notebookId: string;
    createdTime: number;
    tags: string[];
    sourceUrl?: string;
  }): JoplinNoteRow => {
    const noteId = joplinIdForLegacy(input.kind, input.legacyId);
    const tagRefs = tagsFor(input.tags);
    return buildNote({
      id: noteId,
      ownerId,
      parentId: input.notebookId,
      title: input.title || "(untitled)",
      body: input.body,
      createdTime: input.createdTime,
      now,
      tagIds: tagRefs.ids,
      tagTitles: tagRefs.titles,
      sourceUrl: input.sourceUrl,
      legacy: { type: input.kind, id: input.legacyId },
    });
  };

  /**
   * Claim a legacy id.
   *
   * Duplicate ids are refused BEFORE any row is built: the note id is derived
   * from the legacy id, so a second row would collide with the first and make
   * the migration's own verification ("one legacy row → one Joplin object",
   * §130) fail. The first occurrence wins and the duplicate is reported.
   */
  const claimLegacyId = (kind: LegacyKind, legacyId: string): string | null => {
    const key = legacySourceKey(kind, legacyId);
    if (legacyIndex[key]) {
      warnings.push(`duplicate_legacy_id:${key}`);
      return null;
    }
    return key;
  };

  const recordIndex = (entry: Omit<LegacyIndexEntry, "notebookId_">) => {
    const key = legacySourceKey(entry.kind, entry.legacyId);
    legacyIndex[key] = { ...entry, notebookId_: entry.notebookId };
  };

  // ── tasks → to-do notes (+ daily schedule when the task had a time) ───────
  for (const task of snapshot.tasks ?? []) {
    const legacyId = String(task?.id ?? "").trim();
    if (!legacyId) {
      warnings.push("task_without_id");
      continue;
    }
    const claim = claimLegacyId("task", legacyId);
    if (!claim) continue;
    const createdTime = Math.round(Number(task.createdAt) || now);
    const status = String(task.status ?? "pending").toLowerCase();
    if (status && !ALLOWED_STATUSES.has(status)) warnings.push(`unknown_status:${status}`);
    const priority = String(task.priority ?? "").toLowerCase();
    if (priority && !ALLOWED_PRIORITIES.has(priority)) warnings.push(`unknown_priority:${priority}`);

    const dueAt = task.time ? nextLegacyClockInstant(String(task.time), now, timeZone, tzOffsetMinutes) : null;
    if (task.time && dueAt === null) warnings.push(`unparseable_task_time:${legacyId}`);

    const tags = [
      `legacy:task`,
      priority && ALLOWED_PRIORITIES.has(priority) ? `priority:${priority}` : "",
      status === "in-progress" ? "status:in-progress" : "",
      task.subject ? `subject:${tagValue(task.subject)}` : "",
    ].filter(Boolean);

    const scheduled = status !== "completed" && dueAt !== null;
    const note = todoNote({
      kind: "task",
      legacyId,
      title: String(task.title ?? "").trim(),
      body: "",
      notebookId: tasksNotebookId,
      createdTime,
      completed: status === "completed",
      completedAt: task.completedAt,
      tags,
      // A task without a clock has no due date; Joplin's 0 means "no due date".
      todoDue: dueAt ?? 0,
    });
    notes.push(note);
    countsByPhase.tasks += 1;

    let scheduleId: string | null = null;
    if (scheduled) {
      const recurrence: Recurrence = { freq: "daily" };
      const row = buildScheduledItem({
        ownerId,
        target: { type: "todo", id: note.id, notebookId: tasksNotebookId, title: note.title },
        title: note.title,
        body: task.subject ? `${note.title} · ${task.subject}` : note.title,
        dueAt: dueAt as number,
        timeZone,
        recurrence,
        completionHandling: "stop-on-complete",
        legacy: { type: "task", id: legacyId },
        now,
      });
      schedules.push(row);
      scheduleId = row.id;
    }

    recordIndex({
      kind: "task",
      legacyId,
      title: note.title,
      notebookId: tasksNotebookId,
      noteId: note.id,
      scheduleId,
      todo: true,
    });
  }

  // ── quick notes → notes ───────────────────────────────────────────────────
  for (const quick of snapshot.notes ?? []) {
    const legacyId = String(quick?.id ?? "").trim();
    if (!legacyId) {
      warnings.push("note_without_id");
      continue;
    }
    const claim = claimLegacyId("note", legacyId);
    if (!claim) continue;
    const createdTime = Math.round(Number(quick.createdAt) || now);
    const text = String(quick.text ?? "");
    const html = String(quick.html ?? "");
    const body = legacyHtmlToMarkdown(html, text);
    if (html.trim() && !body.trim()) warnings.push(`note_html_lost:${legacyId}`);
    const title = deriveNoteTitle(body || text, `Note ${new Date(createdTime).toISOString().slice(0, 10)}`);
    const color = tagValue(quick.color);
    const note = plainNote({
      kind: "note",
      legacyId,
      title,
      // The full body keeps every line; the title is only a preview of it.
      body,
      notebookId: notesNotebookId,
      createdTime,
      tags: ["legacy:note", color ? `color:${color}` : ""].filter(Boolean),
    });
    notes.push(note);
    countsByPhase.notes += 1;
    recordIndex({
      kind: "note",
      legacyId,
      title: note.title,
      notebookId: notesNotebookId,
      noteId: note.id,
      scheduleId: null,
      todo: false,
    });
  }

  // ── reminders → to-do notes (+ daily schedule while open) ─────────────────
  for (const reminder of snapshot.reminders ?? []) {
    const legacyId = String(reminder?.id ?? "").trim();
    if (!legacyId) {
      warnings.push("reminder_without_id");
      continue;
    }
    const claim = claimLegacyId("reminder", legacyId);
    if (!claim) continue;
    const createdTime = Math.round(Number(reminder.createdAt) || now);
    const done = Boolean(reminder.done);
    const meta = snapshot.reminderMeta?.[legacyId] ?? {};
    const rawCategory = String(meta.category ?? "").toLowerCase();
    if (rawCategory && !ALLOWED_REMINDER_CATEGORIES.has(rawCategory)) warnings.push(`unknown_reminder_category:${rawCategory}`);
    const split = splitReminderText(String(reminder.text ?? ""));
    const metaNote = String(meta.note ?? "").trim();
    const body = [split.note, metaNote].filter(Boolean).join("\n\n");
    const dueAt = !done && reminder.time ? nextLegacyClockInstant(String(reminder.time), now, timeZone, tzOffsetMinutes) : null;
    if (!done && reminder.time && dueAt === null) warnings.push(`unparseable_reminder_time:${legacyId}`);

    const note = todoNote({
      kind: "reminder",
      legacyId,
      title: split.title,
      body,
      notebookId: remindersNotebookId,
      createdTime,
      completed: done,
      completedAt: reminder.completedAt,
      tags: [
        "legacy:reminder",
        rawCategory && ALLOWED_REMINDER_CATEGORIES.has(rawCategory) ? `category:${rawCategory}` : "",
      ].filter(Boolean),
      todoDue: dueAt ?? 0,
    });
    notes.push(note);
    countsByPhase.reminders += 1;

    let scheduleId: string | null = null;
    if (dueAt !== null) {
      const row = buildScheduledItem({
        ownerId,
        target: { type: "todo", id: note.id, notebookId: remindersNotebookId, title: note.title },
        title: note.title,
        body: body || note.title,
        dueAt,
        timeZone,
        recurrence: { freq: "daily" },
        completionHandling: "stop-on-complete",
        legacy: { type: "reminder", id: legacyId },
        now,
      });
      schedules.push(row);
      scheduleId = row.id;
    }

    recordIndex({
      kind: "reminder",
      legacyId,
      title: note.title,
      notebookId: remindersNotebookId,
      noteId: note.id,
      scheduleId,
      todo: true,
    });
  }

  // ── schedule events → note + structured schedule row ──────────────────────
  for (const event of snapshot.schedule ?? []) {
    const legacyId = String(event?.id ?? "").trim();
    if (!legacyId) {
      warnings.push("schedule_without_id");
      continue;
    }
    const claim = claimLegacyId("schedule", legacyId);
    if (!claim) continue;
    const createdTime = Math.round(Number(event.createdAt) || now);
    const type = String(event.type ?? "").toLowerCase();
    if (type && !ALLOWED_SCHEDULE_TYPES.has(type)) warnings.push(`unknown_schedule_type:${type}`);
    const startAt = nextLegacyClockInstant(String(event.startTime ?? ""), now, timeZone, tzOffsetMinutes);
    if (startAt === null) warnings.push(`unparseable_schedule_time:${legacyId}`);
    const endAt = startAt !== null && event.endTime ? endInstantFor(startAt, String(event.endTime), timeZone) : null;

    const detail = String(event.detail ?? "").trim();
    const note = plainNote({
      kind: "schedule",
      legacyId,
      title: String(event.title ?? "").trim() || "Scheduled event",
      body: detail,
      notebookId: scheduleNotebookId,
      createdTime,
      tags: ["legacy:schedule", type && ALLOWED_SCHEDULE_TYPES.has(type) ? `scheduleType:${type}` : ""].filter(Boolean),
    });
    notes.push(note);
    countsByPhase.schedule += 1;

    let scheduleId: string | null = null;
    if (startAt !== null) {
      const row = buildScheduledItem({
        ownerId,
        // The canonical object is the note; the times live on this row, never
        // flattened into the note body (§9).
        target: { type: "note", id: note.id, notebookId: scheduleNotebookId, title: note.title },
        title: note.title,
        body: detail || note.title,
        dueAt: startAt,
        endAt: endAt ?? undefined,
        durationMinutes: endAt ? Math.max(1, Math.round((endAt - startAt) / 60_000)) : undefined,
        timeZone,
        recurrence: { freq: "daily" },
        completionHandling: "continue",
        legacy: { type: "schedule", id: legacyId },
        now,
      });
      schedules.push(row);
      scheduleId = row.id;
    }

    recordIndex({
      kind: "schedule",
      legacyId,
      title: note.title,
      notebookId: scheduleNotebookId,
      noteId: note.id,
      scheduleId,
      todo: false,
    });
  }

  return {
    ownerId,
    timeZone,
    notebooks,
    notes,
    tags,
    schedules,
    legacyIndex,
    counts: {
      notebooks: notebooks.length,
      notes: notes.filter((note) => note.is_todo === 0).length,
      todos: notes.filter((note) => note.is_todo === 1).length,
      tags: tags.length,
      schedules: schedules.length,
      byPhase: countsByPhase,
    },
    warnings,
  };
}

/**
 * Deterministic per-legacy-item fingerprint.
 *
 * The writer stores it with each migrated row: a re-run compares fingerprints
 * and skips the write when nothing changed, which keeps the migration
 * idempotent without re-stamping `updated_time` on every device (§130).
 */
export function legacyFingerprint(entry: { kind: string; legacyId: string; title: string }): string {
  return joplinIdForNamed("fingerprint", `${entry.kind}:${entry.legacyId}:${entry.title}`);
}

/**
 * Idempotency check for a resumed run.
 *
 * Returns the phases whose planned content differs from what is already stored,
 * so a partial migration only redoes the section that actually failed (§11).
 */
export function pendingPhases(plan: MigrationPlan, marker: {
  phases?: Partial<Record<MigrationPhaseKey, { completed?: boolean; fingerprint?: string }>>;
}): MigrationPhaseKey[] {
  const phases: MigrationPhaseKey[] = ["tasks", "notes", "reminders", "schedule"];
  return phases.filter((phase) => {
    const recorded = marker?.phases?.[phase];
    if (!recorded) return plan.counts.byPhase[phase] > 0;
    if (!recorded.completed) return true;
    return false;
  });
}

/** Every legacy id the plan claims to have migrated, for verification (§130). */
export function plannedLegacyKeys(plan: MigrationPlan): string[] {
  return Object.keys(plan.legacyIndex).sort();
}

/**
 * Post-write verification.
 *
 * The migration is not allowed to mark itself complete on a "wrote something"
 * basis: this compares the plan against what was actually read back, so a
 * dropped write fails the phase instead of silently completing it (§11, §130).
 */
export function verifyMigrationPlan(
  plan: MigrationPlan,
  written: { noteIds: string[]; notebookIds: string[]; scheduleIds: string[]; tagIds: string[] },
): { ok: boolean; missing: string[]; unexpected: string[] } {
  const missing: string[] = [];
  const unexpected: string[] = [];
  const noteIds = new Set(written.noteIds);
  const notebookIds = new Set(written.notebookIds);
  const scheduleIds = new Set(written.scheduleIds);
  const tagIds = new Set(written.tagIds);

  for (const note of plan.notes) if (!noteIds.has(note.id)) missing.push(`note:${note.id}`);
  for (const notebook of plan.notebooks) if (!notebookIds.has(notebook.id)) missing.push(`notebook:${notebook.id}`);
  for (const schedule of plan.schedules) if (!scheduleIds.has(schedule.id)) missing.push(`schedule:${schedule.id}`);
  for (const tag of plan.tags) if (!tagIds.has(tag.id)) missing.push(`tag:${tag.id}`);

  for (const id of noteIds) if (!plan.notes.some((note) => note.id === id)) unexpected.push(`note:${id}`);
  for (const id of scheduleIds) if (!plan.schedules.some((schedule) => schedule.id === id)) unexpected.push(`schedule:${id}`);

  return { ok: missing.length === 0 && unexpected.length === 0, missing, unexpected };
}

/** Convenience: the schedule row a legacy id would produce (tests + recovery). */
export function scheduleIdForLegacy(kind: LegacyKind, legacyId: string): string {
  return scheduleIdFor({
    ownerId: "_",
    target: { type: kind === "task" || kind === "reminder" ? "todo" : "note", id: legacyId },
    dueAt: 0,
    legacy: { type: kind, id: legacyId },
  });
}
