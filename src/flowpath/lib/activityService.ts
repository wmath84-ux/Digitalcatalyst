import type { Activity, ActivityStatus, ActivityType } from "../types/flowpath";

/**
 * FlowPath reuses the application's existing activity system.
 * This module represents that shared service layer: it owns persistence,
 * id generation, ordering and status derivation so that every surface of the
 * app (FlowPath included) works off a single source of truth.
 */

const STORAGE_KEY = "flowpath.activities.v1";
const OVERDUE_GRACE_MS = 2 * 60 * 60 * 1000; // 2h grace before something reads as "overdue"

let counter = 0;
export function makeId(prefix = "act") {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

const DAY = 24 * 60 * 60 * 1000;

function timeLabelFor(date: Date, refNow = new Date()): string {
  const sameDay = date.toDateString() === refNow.toDateString();
  const tomorrow = new Date(refNow.getTime() + DAY).toDateString() === date.toDateString();
  const yesterday = new Date(refNow.getTime() - DAY).toDateString() === date.toDateString();
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today · ${time}`;
  if (tomorrow) return `Tomorrow · ${time}`;
  if (yesterday) return `Yesterday · ${time}`;
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${time}`;
}

/**
 * Fresh start: FlowPath no longer seeds demo activities. A new learner sees
 * the honest empty state ("Start your flow" + glowing + nodes) instead of
 * fake tasks.
 *
 * One-time migration for existing devices: older builds seeded the exact
 * type+title pairs below. `stripLegacySeeds` removes those demo rows once
 * (flagged in localStorage) while keeping everything the user created.
 */
const SEED_CLEANUP_FLAG = "flowpath:seed-cleaned.v1";

const LEGACY_SEED_SIGNATURES: ReadonlySet<string> = new Set([
  "revision|Organic Chemistry — Chapter 2",
  "task|Submit assignment draft",
  "mcq|Biology Practice Set",
  "note|Video Ideas",
  "reminder|Call Mom",
  "task|Study Mathematics",
  "schedule|Creator Session",
  "revision|Physics — Chapter 4",
  "mcq|Biology Practice",
  "other|Plan weekend trip",
  "note|App Feature Backlog",
]);

function stripLegacySeeds(items: Activity[]): { cleaned: Activity[]; changed: boolean } {
  try {
    if (localStorage.getItem(SEED_CLEANUP_FLAG)) return { cleaned: items, changed: false };
  } catch {
    // Storage unavailable — still filter for this session, just don't flag.
  }
  const cleaned = items.filter((a) => a && !LEGACY_SEED_SIGNATURES.has(`${a.type}|${a.title}`));
  try {
    localStorage.setItem(SEED_CLEANUP_FLAG, "1");
  } catch {
    // Best-effort flag; worst case we re-filter again next load (idempotent).
  }
  return { cleaned, changed: cleaned.length !== items.length };
}

export function loadActivities(): Activity[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Activity[];
      if (Array.isArray(parsed)) {
        const { cleaned, changed } = stripLegacySeeds(parsed);
        if (changed) persistActivities(cleaned);
        return cleaned;
      }
    }
  } catch {
    // ignore corrupt storage
  }
  // No stored activities (or corrupt JSON) → fresh, empty flow. The old
  // build seeded demo activities here; that behaviour is intentionally gone.
  return [];
}

export function persistActivities(activities: Activity[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activities));
  } catch {
    // storage unavailable — degrade gracefully, in-memory only
  }
}

export function resetActivities() {
  localStorage.removeItem(STORAGE_KEY);
}

export function deriveStatus(activity: Activity, currentId: string | null): ActivityStatus {
  if (activity.completedAt) return "completed";
  if (activity.id === currentId) return "current";
  const due = new Date(activity.datetime).getTime();
  if (due < Date.now() - OVERDUE_GRACE_MS) return "overdue";
  return "upcoming";
}

/** Determine the single most relevant "current" activity id. */
export function determineCurrentId(activities: Activity[]): string | null {
  const pending = activities.filter((a) => !a.completedAt);
  if (!pending.length) return null;
  const now = Date.now();

  // Prefer the nearest activity that isn't badly overdue.
  const candidates = pending
    .map((a) => ({ a, diff: new Date(a.datetime).getTime() - now }))
    .sort((x, y) => x.diff - y.diff);

  const notTooLate = candidates.find((c) => c.diff >= -OVERDUE_GRACE_MS);
  if (notTooLate) return notTooLate.a.id;

  // everything is overdue — focus the most recently due one
  return candidates[candidates.length - 1].a.id;
}

export function buildTimeLabel(date: Date) {
  return timeLabelFor(date);
}

export function typeCreatesDefault(type: ActivityType): Partial<Activity> {
  switch (type) {
    case "task":
      return { priority: "medium" } as Partial<Activity>;
    case "revision":
      return { progress: 0 } as Partial<Activity>;
    case "mcq":
      return { totalQuestions: 10, completedQuestions: 0 } as Partial<Activity>;
    default:
      return {};
  }
}
