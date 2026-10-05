/**
 * Revision local database (IndexedDB via Dexie).
 * ==============================================
 *
 * Migration brief §13 asks for a local-first store for the Revision feature:
 * browsing decks, reviewing cards, FSRS scheduling, stats, imports and
 * already-generated AI content must all keep working offline, while
 * Digitalcatalyst's Firebase layer remains the cross-device cloud source.
 *
 * Design notes
 *   • ONE database for the whole feature. The ported Recall code, the
 *     Digitalcatalyst engine and the media store all read the same instance,
 *     so there is no "three databases for three apps" situation (§40).
 *   • Writes are whole-document `put`s inside Dexie transactions: IndexedDB
 *     gives us atomicity (a crash mid-write cannot half-apply a snapshot) and
 *     structured clone keeps plain JSON values plain.
 *   • `legacy` mirrors the Digitalcatalyst `RevisionDb` document so the
 *     existing cloud sync contract (`revisionItems`, `revisionAttempts`,
 *     `revisionSessions`) keeps receiving exactly the rows it already knows.
 */

import Dexie, { type Table } from "dexie";

import type { UnifiedSnapshot } from "../domain/types";

export interface KvRow {
  key: string;
  value: unknown;
  updatedAt: string;
}

export interface MediaRow {
  id: string;
  name: string;
  mimeType: string;
  /** Structured-cloned Blob — IndexedDB stores it natively. */
  blob: Blob;
  bytes: number;
  createdAt: string;
}

export interface SyncQueueRow {
  id?: number;
  uid: string;
  /** ISO timestamp the change was queued. */
  queuedAt: string;
  /** Number of delivery attempts so far (drives backoff). */
  attempts: number;
  /** Dedupe key so a retry cannot enqueue the same change twice. */
  dedupeKey: string;
}

export const KV_UNIFIED = "unified-snapshot";
export const KV_RECALL = "recall-snapshot";
export const KV_LEGACY = "legacy-db-mirror";
export const KV_MIGRATION = "migration-state";
export const KV_META = "meta";

class RevisionDexie extends Dexie {
  kv!: Table<KvRow, string>;
  media!: Table<MediaRow, string>;
  syncQueue!: Table<SyncQueueRow, number>;

  constructor() {
    super("digitalcatalyst-revision");
    this.version(1).stores({
      kv: "key, updatedAt",
      media: "id, name, createdAt",
      syncQueue: "++id, uid, dedupeKey, queuedAt",
    });
  }
}

let instance: RevisionDexie | null = null;

/**
 * The shared database handle. Created lazily so importing a Revision module in
 * a non-browser context (tests, SSR-ish worker code) never opens IndexedDB.
 */
export function revisionDb(): RevisionDexie {
  if (!instance) instance = new RevisionDexie();
  return instance;
}

/** Guard for environments without IndexedDB (older WebViews, node tests). */
export function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

export async function readKv<T>(key: string): Promise<T | null> {
  if (!hasIndexedDb()) return null;
  try {
    const row = await revisionDb().kv.get(key);
    return row ? (row.value as T) : null;
  } catch (error) {
    console.warn(`[revision] failed reading ${key} from IndexedDB`, error);
    return null;
  }
}

export async function writeKv(key: string, value: unknown): Promise<void> {
  if (!hasIndexedDb()) return;
  await revisionDb().kv.put({ key, value, updatedAt: new Date().toISOString() });
}

export async function removeKv(key: string): Promise<void> {
  if (!hasIndexedDb()) return;
  await revisionDb().kv.delete(key);
}

/* ------------------------------------------------------------------ */
/* Legacy mirror                                                       */
/* ------------------------------------------------------------------ */

/**
 * Read the mirrored legacy `RevisionDb`. The mirror exists so the ported UI can
 * boot from the same numbers the Digitalcatalyst services compute, without the
 * services having to be asynchronous.
 */
export async function readLegacyMirror<T>(): Promise<T | null> {
  return readKv<T>(KV_LEGACY);
}

export async function writeLegacyMirror(db: unknown): Promise<void> {
  await writeKv(KV_LEGACY, db);
}

/* ------------------------------------------------------------------ */
/* Sync queue                                                          */
/* ------------------------------------------------------------------ */

/**
 * Enqueue a cloud-persistence job. `dedupeKey` collapses repeated requests for
 * the same logical change (React StrictMode double effects, the
 * `revision-db-changed` listener firing twice, a reconnect replay), which is
 * how §14's "no duplicate review events" guarantee is enforced on the retry
 * path rather than inside the UI.
 */
export async function enqueueSync(uid: string, dedupeKey: string): Promise<void> {
  if (!hasIndexedDb()) return;
  const table = revisionDb().syncQueue;
  const existing = await table.where("dedupeKey").equals(dedupeKey).first();
  if (existing) {
    await table.update(existing.id!, { queuedAt: new Date().toISOString() });
    return;
  }
  await table.add({ uid, queuedAt: new Date().toISOString(), attempts: 0, dedupeKey });
}

export async function listSyncQueue(uid: string): Promise<SyncQueueRow[]> {
  if (!hasIndexedDb()) return [];
  return revisionDb().syncQueue.where("uid").equals(uid).sortBy("queuedAt");
}

export async function dropSyncQueueEntry(id: number): Promise<void> {
  if (!hasIndexedDb()) return;
  await revisionDb().syncQueue.delete(id);
}

export async function bumpSyncAttempt(id: number, attempts: number): Promise<void> {
  if (!hasIndexedDb()) return;
  await revisionDb().syncQueue.update(id, { attempts });
}

/* ------------------------------------------------------------------ */
/* Snapshot helpers                                                    */
/* ------------------------------------------------------------------ */

export async function readUnifiedSnapshot(): Promise<UnifiedSnapshot | null> {
  return readKv<UnifiedSnapshot>(KV_UNIFIED);
}

export async function writeUnifiedSnapshot(snapshot: UnifiedSnapshot): Promise<void> {
  await writeKv(KV_UNIFIED, snapshot);
}

export type { RevisionDexie };
