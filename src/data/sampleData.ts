import type { QuickNote, Reminder, ScheduleEvent, Task } from "../types";

/**
 * Fresh-start defaults for My Day.
 *
 * These used to ship with demo tasks / schedule blocks / notes / reminders
 * so the pages never looked empty. Per user request the demo content is
 * gone: every new learner now starts with clean, empty lists and the real
 * empty-state cards ("No tasks yet!" + CTA) guide the first creation.
 *
 * The exports stay (typed empty arrays) so existing imports keep working.
 * Previously-seeded demo rows stored on-device / in cloud are stripped by
 * the one-time legacy cleanup in MyDayApp (LEGACY_*_IDS) and in the
 * FlowPath activity service — see those files for the migration.
 */
export const initialTasks: Task[] = [];

export const initialSchedule: ScheduleEvent[] = [];

export const initialNotes: QuickNote[] = [];

export const initialReminders: Reminder[] = [];
