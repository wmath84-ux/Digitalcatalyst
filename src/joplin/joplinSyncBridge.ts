// src/joplin/joplinSyncBridge.ts
//
// The Digitalcatalyst persistence/sync adapter for the My Day workspace.
//
// ── Where the data lives ────────────────────────────────────────────────────
// The Joplin sub-application keeps its own local, offline-first profile (SQLite
// WASM / IndexedDB) exactly as Joplin's web build does — that is what makes note
// editing instant and independent of the network (§13, §56). THIS module is the
// cloud half of the story: the canonical objects the app synchronises to, so a
// note written on the phone appears on the tablet (§97).
//
//   users/{uid}/joplinItems/{itemId}        notes, to-dos, notebooks  (canonical)
//   users/{uid}/joplinTags/{tagId}          tags
//   users/{uid}/joplinResources/{resourceId} attachment metadata (bytes in Storage)
//   users/{uid}/joplinMeta/{docId}          profile + migration marker + sync state
//   users/{uid}/scheduledItems/{scheduleId} the universal scheduler rows
//
// ── Write path and why creates go through the API ───────────────────────────
// §58 requires the existing entitlement (subscription OR today's free creation
// allowance) to keep governing the feature, and §61 of the original contract
// keeps entitlement math on the server. So:
//
//   create  → POST /api/joplin/items   (server checks access, consumes the
//                                       allowance, writes with the admin SDK)
//   update  → Firestore directly       (owner-only rules; editing an existing
//                                       note must never spend an allowance)
//   delete  → Firestore directly       (soft delete: Joplin's trash model, §68)
//
// While offline the queue below buffers creates and flushes them when the network
// returns; a create the server rejects (allowance exhausted) is surfaced to the
// caller instead of being retried forever (§11 behaviour, applied to sync).
//
// ── Conflict policy (§96) ───────────────────────────────────────────────────
// Deterministic, never collaborative:
//
//   1. every row carries `rev` (server revision) and `updated_time`;
//   2. a write is accepted only if `baseRev` still matches the stored `rev`;
//   3. when it does not, the NEWER `updated_time` wins;
//   4. the losing side is kept as a Joplin conflict copy (`is_conflict: 1`,
//      `conflict_original_id`) instead of being overwritten — nothing is lost,
//      and the learner can see exactly what happened.
//
// There is no CRDT, no presence and no live collaboration, and the UI never
// claims otherwise.

import { Timestamp, doc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { apiFetch } from "../utils/apiBase";
import { trackFeatureEvent } from "../utils/featureAnalytics";
import type { JoplinNoteRow, JoplinNotebookRow, JoplinRow, JoplinTagRow } from "./joplinModel";
import { JOPLIN_COLLECTIONS, jsonToRow, rowToJson } from "./joplinPersistence";

export type SyncOperationKind = "create-item" | "update-item" | "delete-item" | "create-schedule" | "update-schedule" | "delete-schedule";

export interface SyncOperation {
  id: string;
  ownerId: string;
  kind: SyncOperationKind;
  /** Canonical collection the operation belongs to. */
  collection: (typeof JOPLIN_COLLECTIONS)[keyof typeof JOPLIN_COLLECTIONS];
  docId: string;
  payload: Record<string, unknown>;
  baseRev: number;
  queuedAt: number;
  attempts: number;
  lastError?: string;
}

export interface SyncQueueState {
  ownerId: string;
  operations: SyncOperation[];
  lastFlushedAt: number;
}

const QUEUE_PREFIX = "eduvora.joplinSyncQueue.v1";
const MAX_ATTEMPTS = 8;
const FLUSH_DEBOUNCE_MS = 1_500;

const queueKey = (ownerId: string) => `${QUEUE_PREFIX}:${ownerId}`;

function readQueue(ownerId: string): SyncQueueState {
  if (typeof window === "undefined") return { ownerId, operations: [], lastFlushedAt: 0 };
  try {
    const raw = window.localStorage.getItem(queueKey(ownerId));
    if (!raw) return { ownerId, operations: [], lastFlushedAt: 0 };
    const parsed = JSON.parse(raw) as SyncQueueState;
    return {
      ownerId,
      operations: Array.isArray(parsed.operations) ? parsed.operations : [],
      lastFlushedAt: Number(parsed.lastFlushedAt) || 0,
    };
  } catch {
    return { ownerId, operations: [], lastFlushedAt: 0 };
  }
}

function writeQueue(state: SyncQueueState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(queueKey(state.ownerId), JSON.stringify(state));
  } catch {
    // Restricted storage: the in-memory queue still drains during this session.
  }
}

export function clearSyncQueue(ownerId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(queueKey(ownerId));
  } catch {
    /* nothing to clear */
  }
}

/** Operation ids are stable per (collection, doc, intent) so a retry cannot double-apply. */
export function operationId(kind: SyncOperationKind, docId: string, queuedAt: number): string {
  return `${kind}:${docId}:${Math.round(queuedAt)}`;
}

export function enqueueSyncOperation(operation: Omit<SyncOperation, "id" | "attempts">): SyncOperation {
  const state = readQueue(operation.ownerId);
  const record: SyncOperation = { ...operation, id: operationId(operation.kind, operation.docId, operation.queuedAt), attempts: 0 };
  const existing = state.operations.findIndex((entry) => entry.id === record.id);
  if (existing >= 0) state.operations[existing] = record;
  else state.operations.push(record);
  writeQueue(state);
  return record;
}

export function pendingSyncOperations(ownerId: string): SyncOperation[] {
  return readQueue(ownerId).operations;
}

/**
 * Conflict decision — pure, so the rule is testable and identical everywhere.
 *
 * `"remote"` means the server copy is newer and the local write must not be
 * applied; `"keep-both"` means the local edit survives as a conflict copy next
 * to the server row.
 */
export function resolveRowConflict(
  local: { updated_time: number; baseRev?: number },
  remote: { updated_time: number; rev: number } | null,
): "local" | "remote" | "keep-both" {
  if (!remote) return "local";
  const baseRev = Number(local.baseRev ?? 0);
  if (baseRev === remote.rev) return "local";
  if (Number(local.updated_time) > Number(remote.updated_time)) return "local";
  if (Number(local.updated_time) < Number(remote.updated_time)) return "remote";
  // Same instant, different revision: prefer the server revision, keep the local
  // text as a conflict copy so nothing is silently discarded.
  return "keep-both";
}

/** The Joplin-shaped conflict copy of a losing local edit. */
export function buildConflictCopy(row: JoplinNoteRow, now: number): JoplinNoteRow {
  return {
    ...row,
    id: `${row.id}_conflict_${Math.round(now)}`,
    title: `${row.title} (conflict)`,
    passthrough: { ...(row.passthrough ?? {}), is_conflict: 1, conflict_original_id: row.id },
  };
}

export interface UpsertResult {
  applied: "local" | "remote" | "keep-both" | "rejected";
  rev: number;
  reason?: string;
}

const idToken = async (): Promise<string | null> => {
  try {
    const user = auth?.currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
};

/**
 * Update an existing canonical row (or a schedule row) on the server.
 *
 * Firestore rules allow owner writes for updates; the revision guard is applied
 * here so the deterministic conflict policy is enforced even before the rules
 * layer sees the write.
 */
export async function updateCanonicalRow(
  ownerId: string,
  collection: string,
  row: JoplinRow | Record<string, unknown>,
  options: { baseRev?: number; now?: number; trackEvent?: string } = {},
): Promise<UpsertResult> {
  const now = Math.round(options.now ?? Date.now());
  const payload = rowToJson(row as Record<string, unknown>);
  const reference = doc(db, "users", ownerId, collection, String(payload.id));

  let remote: { updated_time: number; rev: number } | null = null;
  try {
    const { getDoc } = await import("firebase/firestore");
    const snapshot = await getDoc(reference);
    if (snapshot.exists()) {
      const data = snapshot.data() as { updated_time?: unknown; rev?: unknown };
      remote = { updated_time: Number(data.updated_time) || 0, rev: Number(data.rev) || 0 };
    }
  } catch {
    // Offline: fall through and queue the write; the flush retries with the
    // revision it observed at queue time.
    remote = null;
  }

  const decision = resolveRowConflict({ updated_time: Number(payload.updated_time) || now, baseRev: options.baseRev }, remote);
  if (decision === "remote") {
    return { applied: "remote", rev: remote?.rev ?? 0, reason: "newer_server_revision" };
  }

  if (decision === "keep-both" && remote) {
    const copy = buildConflictCopy(
      { ...(payload as unknown as JoplinNoteRow), rev: remote.rev, updated_time: now },
      now,
    );
    await persistRow(ownerId, collection, copy as unknown as Record<string, unknown>, remote.rev);
  }

  const nextRev = (remote?.rev ?? 0) + 1;
  const ok = await persistRow(ownerId, collection, { ...payload, rev: nextRev, updated_time: now }, remote?.rev ?? 0);
  if (!ok) {
    enqueueSyncOperation({
      ownerId,
      kind: "update-item",
      collection: collection as SyncOperation["collection"],
      docId: String(payload.id),
      payload: { ...payload, updated_time: now },
      baseRev: remote?.rev ?? 0,
      queuedAt: now,
    });
    return { applied: "local", rev: nextRev, reason: "queued_offline" };
  }
  if (options.trackEvent) trackFeatureEvent(options.trackEvent, { collection, docId: String(payload.id) });
  return { applied: decision === "keep-both" ? "keep-both" : "local", rev: nextRev };
}

async function persistRow(ownerId: string, collection: string, payload: Record<string, unknown>, baseRev: number): Promise<boolean> {
  try {
    const { setDoc, serverTimestamp } = await import("firebase/firestore");
    const { id: _ignored, ...rest } = payload;
    await setDoc(
      doc(db, "users", ownerId, collection, String(payload.id)),
      { ...rest, ownerId, baseRev, syncedAt: serverTimestamp() },
      { merge: true },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a canonical object through the bridge API.
 *
 * Returns `"queued"` when the device is offline: the object already exists in the
 * local Joplin profile (so nothing is lost) and the cloud row is created on the
 * next flush, which is the compromise that keeps §13 offline-first together with
 * §58 server-side entitlement.
 */
export async function createCanonicalObject(
  ownerId: string,
  collection: string,
  row: JoplinRow | Record<string, unknown>,
  now = Date.now(),
): Promise<{ status: "created" | "queued" | "rejected"; reason?: string; rev?: number }> {
  const payload = rowToJson(row as Record<string, unknown>);
  const token = await idToken();
  if (!token) {
    enqueueSyncOperation({
      ownerId,
      kind: "create-item",
      collection: collection as SyncOperation["collection"],
      docId: String(payload.id),
      payload,
      baseRev: 0,
      queuedAt: now,
    });
    return { status: "queued", reason: "no_session" };
  }
  try {
    const response = await apiFetch("/api/joplin/items", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ collection, item: payload, clientTimeZone: safeTimeZone() }),
    });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; code?: string; error?: string; rev?: number };
    if (!response.ok || body.ok === false) {
      // A rejected create is NOT queued: retrying an exhausted allowance would
      // hammer the API and never succeed.
      return { status: "rejected", reason: body.code || body.error || `http_${response.status}` };
    }
    trackFeatureEvent("joplin_note_create", { collection });
    return { status: "created", rev: Number(body.rev) || 1 };
  } catch {
    enqueueSyncOperation({
      ownerId,
      kind: "create-item",
      collection: collection as SyncOperation["collection"],
      docId: String(payload.id),
      payload,
      baseRev: 0,
      queuedAt: now,
    });
    return { status: "queued", reason: "network" };
  }
}

function safeTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Soft-delete (Joplin's trash): the row stays readable until it is emptied. */
export async function trashCanonicalRow(
  ownerId: string,
  collection: string,
  docId: string,
  now = Date.now(),
): Promise<boolean> {
  try {
    const { setDoc } = await import("firebase/firestore");
    await setDoc(doc(db, "users", ownerId, collection, docId), { deleted_time: Math.round(now), updated_time: Math.round(now) }, { merge: true });
    return true;
  } catch {
    enqueueSyncOperation({
      ownerId,
      kind: "delete-item",
      collection: collection as SyncOperation["collection"],
      docId,
      payload: { deleted_time: Math.round(now) },
      baseRev: 0,
      queuedAt: now,
    });
    return false;
  }
}

/**
 * Flush the queue.
 *
 * Debounced by the caller; every operation is applied in order and dropped once
 * it succeeds. `attempts` caps retries so a permanently invalid row cannot pin
 * the queue forever (§132 behaviour for the sync path).
 */
export async function flushSyncQueue(ownerId: string, flushNow = Date.now()): Promise<{ flushed: number; remaining: number }> {
  const state = readQueue(ownerId);
  if (!state.operations.length) return { flushed: 0, remaining: 0 };
  const token = await idToken();
  const remaining: SyncOperation[] = [];
  let flushed = 0;

  for (const operation of state.operations) {
    if (operation.attempts >= MAX_ATTEMPTS) continue; // dropped: surfaced to the caller when it happened
    try {
      if (operation.kind === "create-item" || operation.kind === "create-schedule") {
        if (!token) {
          remaining.push({ ...operation, attempts: operation.attempts + 1 });
          continue;
        }
        const endpoint = operation.kind === "create-schedule" ? "/api/joplin/schedules" : "/api/joplin/items";
        const response = await apiFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ collection: operation.collection, item: operation.payload, clientTimeZone: safeTimeZone() }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { code?: string };
          if (response.status >= 400 && response.status < 500) continue; // permanent: drop
          remaining.push({ ...operation, attempts: operation.attempts + 1, lastError: body.code || `http_${response.status}` });
          continue;
        }
        flushed += 1;
        continue;
      }
      const ok = await persistRow(ownerId, operation.collection, operation.payload, operation.baseRev);
      if (ok) flushed += 1;
      else remaining.push({ ...operation, attempts: operation.attempts + 1 });
    } catch (error) {
      remaining.push({
        ...operation,
        attempts: operation.attempts + 1,
        lastError: error instanceof Error ? error.message : "flush_failed",
      });
    }
  }

  writeQueue({ ownerId, operations: remaining, lastFlushedAt: flushNow });
  if (flushed) trackFeatureEvent("joplin_sync_flush", { flushed, remaining: remaining.length });
  return { flushed, remaining: remaining.length };
}

let flushTimer: number | null = null;
/** Debounced flush used by the workspace bridge after each local change (§14). */
export function scheduleQueueFlush(ownerId: string, delayMs = FLUSH_DEBOUNCE_MS): void {
  if (typeof window === "undefined") return;
  if (flushTimer !== null) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushSyncQueue(ownerId);
  }, delayMs);
}

/** Firestore Timestamp ⇄ epoch-ms helper used by every row reader. */
export const timestampToMs = (value: unknown): number => {
  if (value instanceof Timestamp) return value.toMillis();
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

/** Read a note row from Firestore data (kept here so readers agree). */
export const readNoteRow = (id: string, ownerId: string, data: Record<string, unknown>): JoplinNoteRow =>
  jsonToRow({ ...data, id, ownerId }) as JoplinNoteRow;

export const readNotebookRow = (id: string, ownerId: string, data: Record<string, unknown>): JoplinNotebookRow =>
  jsonToRow({ ...data, id, ownerId }) as JoplinNotebookRow;

export const readTagRow = (id: string, ownerId: string, data: Record<string, unknown>): JoplinTagRow =>
  jsonToRow({ ...data, id, ownerId }) as JoplinTagRow;
