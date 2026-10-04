/**
 * Types for `utils/scheduleOccurrences.js`, the server's mirror of the
 * canonical recurrence maths in `src/joplin/scheduling/recurrence.ts`.
 *
 * The mirror is only allowed to exist while `tests/joplinScheduleParity.test.mjs`
 * proves it agrees with the client, so the shapes below intentionally mirror the
 * client's `ScheduledItem` / occurrence types field for field.
 */

export interface OccurrenceAnchor {
  /** First occurrence, epoch ms. For recurring rows this is the anchor. */
  dueAt: number;
  /** IANA zone — always explicit, never inferred at delivery time. */
  timeZone?: string;
  recurrence?: {
    freq?: string;
    interval?: number;
    intervalMinutes?: number;
    weekdays?: number[];
    dayOfMonth?: number;
    until?: number;
    count?: number;
  };
}

export const WEEKDAY_LABELS: string[];

export function zonedEpochMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone?: string,
): number;
export function timeZoneOffsetMinutes(epochMs: number, timeZone?: string): number;
export function nextOccurrence(anchor: OccurrenceAnchor, afterMs: number): number | null;
export function occurrencesBetween(anchor: OccurrenceAnchor, fromMs: number, toMs: number, limit?: number): number[];
export function occurrenceKey(epochMs: number): string;
export function notificationKeyFor(scheduleId: string, epochMs: number): string;
export function sanitizeDocIdSegment(value: unknown): string;
export function occurrenceNotificationDocId(scheduleId: string, occurrenceKey: string): string;

/** One due occurrence of one schedule row, in the order it must be delivered. */
export interface DueScheduleOccurrence {
  scheduleId: string;
  occurrenceKey: string;
  /** `schedule:<id>:occurrence:<key>` — the ONE logical notification event. */
  key: string;
  /** Firestore inbox document id — shared with the client and the cron. */
  notificationId: string;
  title: string;
  body: string;
  dueAt: number;
  timeZone: string;
  targetType: string;
  targetId: string;
  notebookId: string;
  deepLink: string;
}

/**
 * Due occurrences for ONE learner's rows.
 *
 * `rows` are `users/{uid}/scheduledItems/*` documents with their id merged in.
 * `fired` is the learner's own dedupe record (`lastFiredKey` → `lastFiredAt`),
 * so overlapping cron pings cannot double-deliver an occurrence.
 */
export function dueScheduleOccurrences(
  rows: Array<Record<string, unknown>>,
  nowMs: number,
  lookbackMs: number,
  fired?: Record<string, number>,
): DueScheduleOccurrence[];
