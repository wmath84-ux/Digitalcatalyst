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

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

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

function seedActivities(): Activity[] {
  const now = Date.now();
  let order = 0;
  const next = () => order++;

  const items: Activity[] = [
    {
      id: makeId(),
      type: "revision",
      title: "Organic Chemistry — Chapter 2",
      description: "Reaction mechanisms recap",
      datetime: new Date(now - 3 * DAY).toISOString(),
      timeLabel: timeLabelFor(new Date(now - 3 * DAY)),
      createdAt: now - 3 * DAY,
      completedAt: now - 3 * DAY + 40 * 60 * 1000,
      order: next(),
      progress: 100,
    },
    {
      id: makeId(),
      type: "task",
      title: "Submit assignment draft",
      description: "Literature review section",
      datetime: new Date(now - 2 * DAY).toISOString(),
      timeLabel: timeLabelFor(new Date(now - 2 * DAY)),
      createdAt: now - 2 * DAY,
      completedAt: now - 2 * DAY + 3 * HOUR,
      order: next(),
      priority: "medium",
    },
    {
      id: makeId(),
      type: "mcq",
      title: "Biology Practice Set",
      datetime: new Date(now - 1 * DAY - 2 * HOUR).toISOString(),
      timeLabel: timeLabelFor(new Date(now - 1 * DAY - 2 * HOUR)),
      createdAt: now - 1 * DAY - 2 * HOUR,
      completedAt: now - 1 * DAY - HOUR,
      order: next(),
      totalQuestions: 25,
      completedQuestions: 25,
    },
    {
      id: makeId(),
      type: "note",
      title: "Video Ideas",
      preview: "Cinematic morning routine, desk setup tour, productivity myths...",
      datetime: new Date(now - 1 * DAY).toISOString(),
      timeLabel: timeLabelFor(new Date(now - 1 * DAY)),
      createdAt: now - 1 * DAY,
      order: next(),
    },
    {
      id: makeId(),
      type: "reminder",
      title: "Call Mom",
      datetime: new Date(now - 3 * HOUR).toISOString(),
      timeLabel: timeLabelFor(new Date(now - 3 * HOUR)),
      createdAt: now - 5 * HOUR,
      order: next(),
    },
    {
      id: makeId(),
      type: "task",
      title: "Study Mathematics",
      description: "Integration by parts, practice set 4",
      datetime: new Date(now + 25 * 60 * 1000).toISOString(),
      timeLabel: timeLabelFor(new Date(now + 25 * 60 * 1000)),
      createdAt: now - HOUR,
      order: next(),
      priority: "high",
    },
    {
      id: makeId(),
      type: "schedule",
      title: "Creator Session",
      datetime: new Date(now + 5 * HOUR).toISOString(),
      timeLabel: timeLabelFor(new Date(now + 5 * HOUR)),
      startLabel: "4:00 PM",
      endLabel: "5:30 PM",
      createdAt: now - HOUR / 2,
      order: next(),
    },
    {
      id: makeId(),
      type: "revision",
      title: "Physics — Chapter 4",
      description: "Rotational dynamics",
      datetime: new Date(now + 1 * DAY).toISOString(),
      timeLabel: timeLabelFor(new Date(now + 1 * DAY)),
      createdAt: now - HOUR / 3,
      order: next(),
      progress: 65,
    },
    {
      id: makeId(),
      type: "mcq",
      title: "Biology Practice",
      datetime: new Date(now + 1 * DAY + 3 * HOUR).toISOString(),
      timeLabel: timeLabelFor(new Date(now + 1 * DAY + 3 * HOUR)),
      createdAt: now - HOUR / 4,
      order: next(),
      totalQuestions: 25,
      completedQuestions: 12,
    },
    {
      id: makeId(),
      type: "other",
      title: "Plan weekend trip",
      description: "Shortlist destinations & budget",
      datetime: new Date(now + 2 * DAY).toISOString(),
      timeLabel: timeLabelFor(new Date(now + 2 * DAY)),
      createdAt: now - HOUR / 5,
      order: next(),
    },
    {
      id: makeId(),
      type: "note",
      title: "App Feature Backlog",
      preview: "Dark mode polish, offline sync, streak celebrations...",
      datetime: new Date(now + 3 * DAY).toISOString(),
      timeLabel: timeLabelFor(new Date(now + 3 * DAY)),
      createdAt: now - HOUR / 6,
      order: next(),
    },
  ];

  return items;
}

export function loadActivities(): Activity[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Activity[];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    // ignore corrupt storage
  }
  const seeded = seedActivities();
  persistActivities(seeded);
  return seeded;
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
