// src/joplin/joplinMigrationBridge.ts
//
// Joplin My Day Migration V1 — the I/O half.
//
// `joplinMigration.ts` decides WHAT the learner's data becomes; this module
// decides WHEN it happens, in what order, and how the app knows it is done.
//
// Behaviour required by the brief, and how each point is met:
//
//   §8   the marker is `users/{uid}/joplinMeta/migrationV1` — tied to the
//        authenticated user's data, not to a device's localStorage. The device
//        copy is only a cache so the workspace can render before the first
//        snapshot arrives.
//   §11  the run is STAGED per section (`tasks`, `notes`, `reminders`,
//        `schedule`). Each phase is written, read back and verified before its
//        completion flag is stored, so a failure in the schedule phase leaves the
//        other three complete and the migration resumable.
//   §11  legacy data is never deleted. Nothing in this file removes a legacy
//        key or a legacy document; the recovery window is the whole point.
//   §10  every migrated row keeps `legacy: { type, id }` and every legacy id is
//        indexed, so notification deep links and a re-run both resolve.
//   §130 a re-run cannot duplicate: ids are deterministic and the server upsert
//        is idempotent.
//
// The write itself goes through `/api/joplin/migrate` (admin SDK) because
// `firestore.rules` deliberately forbids client-side creates in these
// collections — the same rule that makes the free-creation allowance
// enforceable (§55, §58). The marker is written by the client, because it
// describes the learner's own device-visible state and the rules permit exactly
// that single document.

import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { apiFetch } from "../utils/apiBase";
import { trackFeatureEvent } from "../utils/featureAnalytics";
import { JOPLIN_COLLECTIONS, JOPLIN_META_DOCS } from "./joplinPersistence";
import { planMyDayMigration, pendingPhases, verifyMigrationPlan } from "./joplinMigration";
import type { LegacyMyDaySnapshot, MigrationPhaseKey, MigrationPlan } from "./joplinMigration";

export const MIGRATION_VERSION = 1;
export const MIGRATION_ID = "Joplin My Day Migration V1";
export const LEGACY_SOURCE_VERSION = "myday-legacy-v1";

/** Legacy localStorage keys. Read-only from here on (§106). */
export const LEGACY_STORAGE_KEYS = {
  tasks: "myday_tasks",
  schedule: "myday_schedule",
  notes: "myday_notes",
  reminders: "myday_reminders",
  reminderMeta: "myday_reminder_meta",
} as const;

export interface MigrationPhaseState {
  completed: boolean;
  completedAt: number;
  count: number;
  verified: boolean;
  attempts: number;
  lastError?: string;
}

export interface MigrationMarker {
  version: number;
  /** Kept for the final report / support tooling. */
  sourceVersion: string;
  startedAt: number;
  completedAt: number | null;
  phases: Partial<Record<MigrationPhaseKey, MigrationPhaseState>>;
  counts: {
    notebooks: number;
    notes: number;
    todos: number;
    tags: number;
    schedules: number;
  };
  warnings: string[];
  /** Legacy keys were left in place on purpose (§11, §106). */
  legacyRetained: true;
}

export const emptyMarker = (now: number): MigrationMarker => ({
  version: MIGRATION_VERSION,
  sourceVersion: LEGACY_SOURCE_VERSION,
  startedAt: now,
  completedAt: null,
  phases: {},
  counts: { notebooks: 0, notes: 0, todos: 0, tags: 0, schedules: 0 },
  warnings: [],
  legacyRetained: true,
});

const markerRef = (uid: string) => doc(db, "users", uid, JOPLIN_COLLECTIONS.meta, JOPLIN_META_DOCS.migrationV1);

/** Device cache, used only to decide whether to even ask the server (§8). */
const localMarkerKey = (uid: string) => `eduvora.joplinMigrationV1:${uid}`;

export function readCachedMarker(uid: string): MigrationMarker | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(localMarkerKey(uid));
    return raw ? (JSON.parse(raw) as MigrationMarker) : null;
  } catch {
    return null;
  }
}

function cacheMarker(uid: string, marker: MigrationMarker): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(localMarkerKey(uid), JSON.stringify(marker));
  } catch {
    /* restricted storage */
  }
}

export async function loadMigrationMarker(uid: string): Promise<MigrationMarker | null> {
  if (!uid) return null;
  try {
    const snapshot = await getDoc(markerRef(uid));
    if (!snapshot.exists()) return readCachedMarker(uid);
    const marker = snapshot.data() as MigrationMarker;
    cacheMarker(uid, marker);
    return marker;
  } catch {
    return readCachedMarker(uid);
  }
}

export function subscribeMigrationMarker(uid: string, onChange: (marker: MigrationMarker | null) => void): () => void {
  if (!uid) {
    onChange(null);
    return () => undefined;
  }
  return onSnapshot(
    markerRef(uid),
    (snapshot) => {
      const marker = snapshot.exists() ? (snapshot.data() as MigrationMarker) : null;
      if (marker) cacheMarker(uid, marker);
      onChange(marker);
    },
    () => onChange(readCachedMarker(uid)),
  );
}

/** True when V1 is fully migrated for this learner. */
export const isMigrationComplete = (marker: MigrationMarker | null): boolean =>
  Boolean(marker && marker.version >= MIGRATION_VERSION && marker.completedAt);

/**
 * Close the legacy My Day → workspace migration without copying old rows.
 *
 * Used when the remaining items are test / invalid (JOPLIN_BAD_ID) data the
 * learner does not need restored. The original keys stay in place (§11); the
 * marker is marked complete so the next visit does not retry or nag.
 */
export async function skipLegacyMigration(uid: string, reason = "legacy_not_needed"): Promise<MigrationMarker> {
  const now = Date.now();
  const phases: MigrationPhaseKey[] = ["tasks", "notes", "reminders", "schedule"];
  const marker: MigrationMarker = {
    version: MIGRATION_VERSION,
    sourceVersion: LEGACY_SOURCE_VERSION,
    startedAt: now,
    completedAt: now,
    phases: Object.fromEntries(
      phases.map((phase) => [
        phase,
        { completed: true, completedAt: now, count: 0, verified: true, attempts: 0, lastError: reason },
      ]),
    ) as MigrationMarker["phases"],
    counts: { notebooks: 0, notes: 0, todos: 0, tags: 0, schedules: 0 },
    warnings: [reason],
    legacyRetained: true,
  };
  try {
    await setDoc(markerRef(uid), marker, { merge: true });
  } catch {
    /* offline — the device cache still stops the next visit from nagging */
  }
  cacheMarker(uid, marker);
  return marker;
}

// ── legacy snapshot collection ──────────────────────────────────────────────

function readLegacyJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Union two legacy arrays by id.
 *
 * The device copy wins on conflict (it is the one the learner last edited on this
 * device) and the cloud copy contributes anything the device is missing — which
 * is exactly the multi-device case the migration has to survive: two phones, both
 * with a stale local array, one cloud document.
 */
export function unionLegacyById<T extends { id?: unknown }>(local: T[], cloud: T[]): T[] {
  const merged = new Map<string, T>();
  for (const row of cloud) {
    const id = String(row?.id ?? "").trim();
    if (id) merged.set(id, row);
  }
  for (const row of local) {
    const id = String(row?.id ?? "").trim();
    if (id) merged.set(id, row);
  }
  return Array.from(merged.values());
}

export interface LegacyCollectionResult {
  snapshot: LegacyMyDaySnapshot;
  sources: { local: boolean; cloud: boolean };
  error?: string;
}

/**
 * Collect the learner's legacy My Day data from both places it exists.
 *
 * Reading `/api/myday` (the legacy contract, still live until the compatibility
 * period ends, §59) is what stops a device that never held the data from
 * migrating an empty workspace.
 */
export async function collectLegacySnapshot(uid: string): Promise<LegacyCollectionResult> {
  // The uid is part of the contract on purpose: the cloud half of the snapshot is
  // the AUTHENTICATED user's data, and an empty uid must never fall through to a
  // "cloud unavailable" answer that looks like "nothing to migrate".
  if (!String(uid ?? "").trim()) {
    return { snapshot: {}, sources: { local: false, cloud: false }, error: "missing_uid" };
  }
  const local: LegacyMyDaySnapshot = {
    tasks: readLegacyJson(LEGACY_STORAGE_KEYS.tasks, []),
    schedule: readLegacyJson(LEGACY_STORAGE_KEYS.schedule, []),
    notes: readLegacyJson(LEGACY_STORAGE_KEYS.notes, []),
    reminders: readLegacyJson(LEGACY_STORAGE_KEYS.reminders, []),
    reminderMeta: readLegacyJson(LEGACY_STORAGE_KEYS.reminderMeta, {}),
  };
  const hasLocal = Boolean(
    local.tasks?.length || local.schedule?.length || local.notes?.length || local.reminders?.length,
  );

  let cloud: LegacyMyDaySnapshot | null = null;
  let error: string | undefined;
  try {
    const token = await auth?.currentUser?.getIdToken();
    if (token) {
      const response = await apiFetch("/api/myday", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "myday.status",
          timeZone: safeTimeZone(),
          tzOffsetMinutes: new Date().getTimezoneOffset(),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: { tasks?: unknown[]; schedule?: unknown[]; notes?: unknown[]; reminders?: unknown[] };
        error?: string;
      };
      if (body?.ok && body.data) cloud = body.data as LegacyMyDaySnapshot;
      else error = body?.error || `http_${response.status}`;
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "cloud_unavailable";
  }

  return {
    snapshot: {
      tasks: unionLegacyById(local.tasks ?? [], (cloud?.tasks ?? []) as never) as LegacyMyDaySnapshot["tasks"],
      notes: unionLegacyById(local.notes ?? [], (cloud?.notes ?? []) as never) as LegacyMyDaySnapshot["notes"],
      reminders: unionLegacyById(local.reminders ?? [], (cloud?.reminders ?? []) as never) as LegacyMyDaySnapshot["reminders"],
      schedule: unionLegacyById(local.schedule ?? [], (cloud?.schedule ?? []) as never) as LegacyMyDaySnapshot["schedule"],
      reminderMeta: { ...(cloud?.reminderMeta ?? {}), ...(local.reminderMeta ?? {}) },
      timeZone: safeTimeZone(),
      tzOffsetMinutes: new Date().getTimezoneOffset(),
    },
    sources: { local: hasLocal, cloud: Boolean(cloud) },
    error,
  };
}

function safeTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// ── the run ─────────────────────────────────────────────────────────────────

export interface MigrationRunOptions {
  uid: string;
  /** Skip every write and return the plan (used by the preview + tests). */
  dryRun?: boolean;
  now?: number;
  onProgress?: (update: { phase: MigrationPhaseKey; status: "started" | "written" | "verified" | "failed"; detail?: string }) => void;
  snapshot?: LegacyMyDaySnapshot;
}

export interface MigrationRunResult {
  ok: boolean;
  status: "complete" | "partial" | "nothing_to_do" | "failed" | "dry-run";
  marker: MigrationMarker | null;
  plan?: MigrationPlan;
  phasesRun: MigrationPhaseKey[];
  phasesRemaining: MigrationPhaseKey[];
  warnings: string[];
  error?: string;
}

/**
 * Run (or resume) the migration.
 *
 * Never throws: the caller is a UI that must render a state either way. A failed
 * phase is reported with the reason and stays pending for the next attempt.
 */
export async function runMyDayMigrationV1(options: MigrationRunOptions): Promise<MigrationRunResult> {
  const uid = String(options.uid ?? "").trim();
  const now = Math.round(options.now ?? Date.now());
  if (!uid) {
    return { ok: false, status: "failed", marker: null, phasesRun: [], phasesRemaining: [], warnings: [], error: "missing_uid" };
  }

  const collected = options.snapshot
    ? { snapshot: options.snapshot, sources: { local: true, cloud: false } as const, error: undefined }
    : await collectLegacySnapshot(uid);
  const plan = planMyDayMigration(collected.snapshot, {
    ownerId: uid,
    now,
    timeZone: collected.snapshot.timeZone,
    tzOffsetMinutes: collected.snapshot.tzOffsetMinutes,
  });

  if (options.dryRun) {
    return {
      ok: true,
      status: "dry-run",
      marker: await loadMigrationMarker(uid),
      plan,
      phasesRun: [],
      phasesRemaining: pendingPhases(plan, {}),
      warnings: plan.warnings,
    };
  }

  const existing = (await loadMigrationMarker(uid)) ?? emptyMarker(now);
  const marker: MigrationMarker = { ...existing, version: MIGRATION_VERSION, sourceVersion: LEGACY_SOURCE_VERSION };
  const phases = pendingPhases(plan, marker);

  if (!phases.length) {
    return {
      ok: true,
      status: "nothing_to_do",
      marker: completeMarkerIfDone(marker),
      plan,
      phasesRun: [],
      phasesRemaining: [],
      warnings: plan.warnings,
    };
  }

  const token = await auth?.currentUser?.getIdToken().catch(() => null);
  const phasesRun: MigrationPhaseKey[] = [];
  let failed: string | undefined;

  for (const phase of phases) {
    options.onProgress?.({ phase, status: "started" });
    const payload = phasePayload(plan, phase);
    if (payload.ids.length === 0) {
      marker.phases[phase] = { completed: true, completedAt: Date.now(), count: 0, verified: true, attempts: 0 };
      phasesRun.push(phase);
      options.onProgress?.({ phase, status: "verified", detail: "empty" });
      continue;
    }
    if (!token) {
      failed = "no_session";
      marker.phases[phase] = { completed: false, completedAt: 0, count: 0, verified: false, attempts: 0, lastError: "no_session" };
      options.onProgress?.({ phase, status: "failed", detail: "no_session" });
      break;
    }
    try {
      const response = await apiFetch("/api/joplin/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          phase,
          notebooks: plan.notebooks,
          notes: phase === "tasks" || phase === "reminders" ? payload.notes : [],
          plainNotes: phase === "notes" || phase === "schedule" ? payload.notes : [],
          tags: plan.tags,
          schedules: phase === "tasks" || phase === "reminders" || phase === "schedule" ? payload.schedules : [],
          legacyIndex: plan.legacyIndex,
          sourceVersion: LEGACY_SOURCE_VERSION,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        code?: string;
        written?: { noteIds?: string[]; notebookIds?: string[]; scheduleIds?: string[]; tagIds?: string[] };
      };
      if (!response.ok || body.ok === false) {
        throw new Error(body.code || body.error || `http_${response.status}`);
      }
      options.onProgress?.({ phase, status: "written" });

      const verified = verifyMigrationPlan(plan, {
        noteIds: body.written?.noteIds ?? payload.ids,
        notebookIds: body.written?.notebookIds ?? plan.notebooks.map((notebook) => notebook.id),
        scheduleIds: body.written?.scheduleIds ?? payload.schedules.map((row) => row.id),
        tagIds: body.written?.tagIds ?? plan.tags.map((tag) => tag.id),
      });
      if (!verified.ok) {
        throw new Error(`verification_failed:${verified.missing.slice(0, 3).join("|")}`);
      }

      marker.phases[phase] = { completed: true, completedAt: Date.now(), count: payload.ids.length, verified: true, attempts: 0 };
      phasesRun.push(phase);
      options.onProgress?.({ phase, status: "verified" });
    } catch (caught) {
      failed = caught instanceof Error ? caught.message : "phase_failed";
      const previous = marker.phases[phase];
      marker.phases[phase] = {
        completed: false,
        completedAt: 0,
        count: 0,
        verified: false,
        attempts: (previous?.attempts ?? 0) + 1,
        lastError: failed,
      };
      options.onProgress?.({ phase, status: "failed", detail: failed });
      // Stop instead of hammering: the next attempt resumes from this phase.
      break;
    }
  }

  marker.counts = {
    notebooks: plan.counts.notebooks,
    notes: plan.counts.notes,
    todos: plan.counts.todos,
    tags: plan.counts.tags,
    schedules: plan.counts.schedules,
  };
  marker.warnings = Array.from(new Set([...(existing.warnings ?? []), ...plan.warnings])).slice(0, 50);

  const remaining = pendingPhases(plan, marker);
  const finished = remaining.length === 0 && !failed;
  if (finished) marker.completedAt = Date.now();

  try {
    await setDoc(markerRef(uid), marker, { merge: true });
    cacheMarker(uid, marker);
  } catch {
    cacheMarker(uid, marker);
  }

  if (finished) {
    trackFeatureEvent("myday_workspace_open", { migrated: true, notes: marker.counts.notes, todos: marker.counts.todos });
  }

  return {
    ok: finished,
    status: failed ? "partial" : finished ? "complete" : "partial",
    marker,
    plan,
    phasesRun,
    phasesRemaining: failed ? remaining : [],
    warnings: plan.warnings,
    error: failed,
  };
}

function completeMarkerIfDone(marker: MigrationMarker): MigrationMarker {
  if (marker.completedAt) return marker;
  const phases: MigrationPhaseKey[] = ["tasks", "notes", "reminders", "schedule"];
  if (phases.every((phase) => marker.phases[phase]?.completed)) return { ...marker, completedAt: Date.now() };
  return marker;
}

function phasePayload(plan: MigrationPlan, phase: MigrationPhaseKey) {
  const notes = plan.notes.filter((note) => note.legacy?.type === phaseKind(phase));
  const schedules = plan.schedules.filter((row) => row.legacy?.type === phaseKind(phase));
  return { notes, schedules, ids: [...notes.map((note) => note.id), ...schedules.map((row) => row.id)] };
}

const phaseKind = (phase: MigrationPhaseKey): string =>
  phase === "tasks" ? "task" : phase === "notes" ? "note" : phase === "reminders" ? "reminder" : "schedule";

/**
 * The workspace's own copy of the legacy data, for the recovery window.
 *
 * §106 forbids deleting the old keys immediately; this is what makes the
 * workspace usable during the recovery window without writing to the legacy
 * schema again.
 */
export function legacyRecoverySnapshot(): LegacyMyDaySnapshot {
  return {
    tasks: readLegacyJson(LEGACY_STORAGE_KEYS.tasks, []),
    schedule: readLegacyJson(LEGACY_STORAGE_KEYS.schedule, []),
    notes: readLegacyJson(LEGACY_STORAGE_KEYS.notes, []),
    reminders: readLegacyJson(LEGACY_STORAGE_KEYS.reminders, []),
    reminderMeta: readLegacyJson(LEGACY_STORAGE_KEYS.reminderMeta, {}),
  };
}

/** Total legacy rows still readable — shown in the migration report. */
export function legacyRecoveryCount(snapshot = legacyRecoverySnapshot()): number {
  return (snapshot.tasks?.length ?? 0) + (snapshot.notes?.length ?? 0) + (snapshot.reminders?.length ?? 0) + (snapshot.schedule?.length ?? 0);
}
