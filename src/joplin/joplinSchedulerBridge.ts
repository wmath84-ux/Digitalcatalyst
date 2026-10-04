// src/joplin/joplinSchedulerBridge.ts
//
// Schedule actions inside the workspace, wired to the EXISTING notification
// delivery layer.
//
// This module owns the write path for schedule rows and nothing else. It does
// not show notifications, does not arm Android alarms and does not push: those
// live in the one delivery layer the app already has (`src/main.tsx` foreground
// clock + `api/cron/subscription-renewals.ts` + Web Push) and are driven from the
// canonical rows this module writes (§24, §100).
//
// The only thing it does beyond persistence is tell that layer "the schedule
// changed" — a single custom event, so an edit re-arms immediately instead of
// waiting for the next five-minute pass (§52, §154-18).

import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { apiFetch } from "../utils/apiBase";
import { trackFeatureEvent } from "../utils/featureAnalytics";
import { JOPLIN_COLLECTIONS } from "./joplinPersistence";
import { buildScheduledItem, deleteSchedule, setScheduleEnabled, validateScheduledItem } from "./scheduling/scheduledItem";
import type { ScheduledItem, ScheduledItemInput } from "./scheduling/scheduledItem";

/** Fired after any schedule mutation so the delivery layer re-evaluates at once. */
export const SCHEDULE_CHANGED_EVENT = "eduvora:myday-schedule-changed";

export interface ScheduleChangeDetail {
  ownerId: string;
  scheduleId: string;
  action: "create" | "update" | "delete" | "enable" | "disable";
}

export function announceScheduleChange(detail: ScheduleChangeDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SCHEDULE_CHANGED_EVENT, { detail }));
}

const requireUid = (uid: string | null | undefined): string => {
  const value = String(uid ?? "").trim();
  if (!value) throw new Error("A signed-in user is required to schedule My Day items.");
  return value;
};

const idToken = async (): Promise<string | null> => {
  try {
    const user = auth?.currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
};

/** Live subscription to the learner's schedule rows (Firestore is canonical). */
export function watchSchedules(
  uid: string | null | undefined,
  onRows: (rows: ScheduledItem[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const ownerId = String(uid ?? "").trim();
  if (!ownerId) {
    onRows([]);
    return () => undefined;
  }
  const reference = collectionOf(ownerId);
  return onSnapshot(
    reference,
    (snapshot) => {
      const rows: ScheduledItem[] = [];
      snapshot.forEach((entry) => rows.push({ ...(entry.data() as unknown as ScheduledItem), id: entry.id, ownerId }));
      onRows(rows);
    },
    (error) => onError?.(error as Error),
  );
}

const collectionOf = (ownerId: string) => collection(db, "users", ownerId, JOPLIN_COLLECTIONS.schedules);

export interface CreateScheduleOptions {
  uid: string;
  input: ScheduledItemInput;
}

export type CreateScheduleResult =
  | { status: "created"; schedule: ScheduledItem }
  | { status: "queued"; schedule: ScheduledItem; reason: string }
  | { status: "rejected"; reason: string };

/**
 * Create a schedule.
 *
 * The row is validated locally first (instant feedback, §55 mirrored), then
 * written through the bridge API so the entitlement check and the allowance
 * consumption happen exactly where every other My Day creation happens (§58).
 * Offline, the row is kept locally and queued (§56).
 */
export async function createSchedule(options: CreateScheduleOptions): Promise<CreateScheduleResult> {
  const ownerId = requireUid(options.uid);
  const schedule = buildScheduledItem({ ...options.input, ownerId });
  const errors = validateScheduledItem(schedule);
  if (errors.length) return { status: "rejected", reason: errors.join(",") };

  const token = await idToken();
  if (!token) {
    persistLocalSchedule(schedule);
    return { status: "queued", schedule, reason: "no_session" };
  }
  try {
    const response = await apiFetch("/api/joplin/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ schedule }),
    });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; code?: string; error?: string };
    if (!response.ok || body.ok === false) {
      return { status: "rejected", reason: body.code || body.error || `http_${response.status}` };
    }
    persistLocalSchedule(schedule);
    announceScheduleChange({ ownerId, scheduleId: schedule.id, action: "create" });
    trackFeatureEvent("joplin_schedule_create", {
      targetType: schedule.targetType,
      recurrence: schedule.recurrence.freq,
      hasEnd: Boolean(schedule.endAt || schedule.durationMinutes),
    });
    return { status: "created", schedule };
  } catch {
    persistLocalSchedule(schedule);
    return { status: "queued", schedule, reason: "network" };
  }
}

/** Edit an existing schedule (the row keeps its identity and its history). */
export async function updateScheduleRow(uid: string, schedule: ScheduledItem): Promise<{ ok: boolean; reason?: string }> {
  const ownerId = requireUid(uid);
  const errors = validateScheduledItem(schedule);
  if (errors.length) return { ok: false, reason: errors.join(",") };
  try {
    await setDoc(doc(db, "users", ownerId, JOPLIN_COLLECTIONS.schedules, schedule.id), { ...schedule, ownerId }, { merge: true });
    announceScheduleChange({ ownerId, scheduleId: schedule.id, action: "update" });
    return { ok: true };
  } catch {
    persistLocalSchedule(schedule);
    return { ok: false, reason: "queued" };
  }
}

export async function setScheduleEnabledForUser(uid: string, schedule: ScheduledItem, enabled: boolean): Promise<boolean> {
  const next = setScheduleEnabled(schedule, enabled, Date.now());
  const result = await updateScheduleRow(uid, next);
  announceScheduleChange({ ownerId: uid, scheduleId: next.id, action: enabled ? "enable" : "disable" });
  return result.ok;
}

export async function removeSchedule(uid: string, schedule: ScheduledItem): Promise<boolean> {
  const ownerId = requireUid(uid);
  const next = deleteSchedule(schedule, Date.now());
  try {
    await setDoc(doc(db, "users", ownerId, JOPLIN_COLLECTIONS.schedules, next.id), { ...next, ownerId }, { merge: true });
  } catch {
    // Soft delete: the local copy below keeps the workspace consistent offline.
  }
  persistLocalSchedule(next);
  announceScheduleChange({ ownerId, scheduleId: next.id, action: "delete" });
  return true;
}

// ── local mirror ────────────────────────────────────────────────────────────
// The mirror exists for exactly two reasons: the workspace's agenda can render
// while offline, and a schedule created offline is not lost. It is NOT a second
// source of truth — Firestore stays canonical, and every read is reconciled
// against it as soon as the snapshot arrives.

const LOCAL_PREFIX = "eduvora.joplinSchedules.v1";
const localKey = (ownerId: string) => `${LOCAL_PREFIX}:${ownerId}`;

function readLocalSchedules(ownerId: string): Record<string, ScheduledItem> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(localKey(ownerId));
    return raw ? (JSON.parse(raw) as Record<string, ScheduledItem>) : {};
  } catch {
    return {};
  }
}

export function persistLocalSchedule(schedule: ScheduledItem): void {
  if (typeof window === "undefined") return;
  const ownerId = schedule.ownerId;
  const rows = readLocalSchedules(ownerId);
  rows[schedule.id] = schedule;
  try {
    window.localStorage.setItem(localKey(ownerId), JSON.stringify(rows));
  } catch {
    /* restricted storage */
  }
}

export function localSchedules(ownerId: string): ScheduledItem[] {
  return Object.values(readLocalSchedules(ownerId));
}

export function clearLocalSchedules(ownerId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(localKey(ownerId));
  } catch {
    /* nothing to clear */
  }
}

/**
 * Merge the server snapshot with the local mirror.
 *
 * Server rows win on id collisions except when the local row is a queued create
 * (it has no `rev` yet), which is what makes an offline-created schedule survive
 * the first snapshot after reconnect.
 */
export function mergeScheduleSources(remote: ScheduledItem[], local: ScheduledItem[]): ScheduledItem[] {
  const merged = new Map<string, ScheduledItem>();
  for (const row of remote) merged.set(row.id, row);
  for (const row of local) {
    const existing = merged.get(row.id);
    if (!existing || Number(row.updatedAt) > Number(existing.updatedAt)) merged.set(row.id, row);
  }
  return Array.from(merged.values()).sort((left, right) => left.dueAt - right.dueAt);
}

/** Live view of the merged schedule for the workspace agenda and the clock. */
export function watchMergedSchedules(
  uid: string | null | undefined,
  onRows: (rows: ScheduledItem[]) => void,
): () => void {
  const ownerId = String(uid ?? "").trim();
  if (!ownerId) {
    onRows([]);
    return () => undefined;
  }
  let remote: ScheduledItem[] = [];
  const emit = () => onRows(mergeScheduleSources(remote, localSchedules(ownerId)));
  const unsubscribe = watchSchedules(
    ownerId,
    (rows) => {
      remote = rows;
      emit();
    },
    () => emit(),
  );
  emit();
  return unsubscribe;
}
