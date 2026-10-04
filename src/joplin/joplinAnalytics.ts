// src/joplin/joplinAnalytics.ts
//
// My Day analytics, on top of the existing helper.
//
// `trackFeatureEvent` already owns the analytics plumbing (lazy SDK init,
// `isSupported()`, never-throwing, never-blocking). This module only fixes the
// My Day vocabulary and — more importantly — enforces that note CONTENT is never
// logged: every property is filtered to a primitive, and well-known text-shaped
// keys are dropped outright (§87).

import { trackFeatureEvent } from "../utils/featureAnalytics";

export type MyDayAnalyticsEvent =
  | "myday_workspace_open"
  | "myday_workspace_error"
  | "myday_migration_started"
  | "myday_migration_phase"
  | "myday_migration_complete"
  | "joplin_note_create"
  | "joplin_note_update"
  | "joplin_todo_complete"
  | "joplin_schedule_create"
  | "joplin_schedule_fire"
  | "joplin_clip_create"
  | "joplin_sync_flush";

/** Keys that must never be transmitted, whatever a caller passes. */
const FORBIDDEN_KEYS = new Set(["body", "text", "title", "content", "html", "note", "search", "query", "url"]);

const MAX_PROPERTIES = 12;
const MAX_STRING = 64;

function sanitize(props?: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!props) return out;
  let count = 0;
  for (const [key, value] of Object.entries(props)) {
    if (count >= MAX_PROPERTIES) break;
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "number" && !Number.isFinite(value)) continue;
    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
      count += 1;
      continue;
    }
    if (typeof value === "string") {
      out[key] = value.slice(0, MAX_STRING);
      count += 1;
    }
  }
  return out;
}

export function trackMyDayEvent(event: MyDayAnalyticsEvent | string, props?: Record<string, unknown>): void {
  trackFeatureEvent(event, sanitize(props));
}
