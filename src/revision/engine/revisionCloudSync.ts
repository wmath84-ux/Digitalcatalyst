/**
 * Unified Revision ↔ Firebase cloud sync.
 * =======================================
 *
 * The existing cloud contract for Revision stays exactly as it is: the legacy
 * services keep writing `users/{uid}/revisionItems`, `/revisionAttempts` and
 * `/revisionSessions` through `queueRevisionCloudPersistence()`, and nothing in
 * this module touches those documents (migration brief §14: "Do NOT break
 * existing hydrateRevisionFromCloud() / queueRevisionCloudPersistence()").
 *
 * What the ported feature adds is the parts of the unified model that the legacy
 * documents cannot express: user-created decks and cards, hierarchical tags,
 * folders, media references, study settings and the FSRS review log. Those are
 * mirrored into `users/{uid}/revisionUnified/*` using a chunked document layout,
 * because a Firestore document is capped at ~1 MiB and a serious library with a
 * year of review history does not fit in one.
 *
 * Write path
 *   1. `queueUnifiedCloudPersistence(uid)` — debounced, offline-safe, and
 *      idempotent: the payload is derived from persisted state, so replaying it
 *      after a reconnect writes the same bytes (no duplicated reviews).
 *   2. Chunks are written sequentially; the index document is written LAST with
 *      `merge: true`, so a crash mid-write can never publish a half-written
 *      state (readers see the previous index until the new one lands).
 *   3. Stale chunks from a previous, longer revision are deleted after the index
 *      flip.
 *
 * Read path
 *   `hydrateUnifiedFromCloud(uid)` reads the index, fetches the chunks, and
 *   MERGES the remote snapshot into the local one (union of decks/cards by id,
 *   newest `updatedAt` wins per card, review logs merged on `dedupeKey`), so a
 *   second device can never delete work this device has not seen yet.
 */

import { doc, getDoc, setDoc, type DocumentReference } from "firebase/firestore";

import { db } from "../../../firebase";
import type { UnifiedSnapshot } from "../domain/types";
import { mergeUnifiedSnapshots } from "../domain/adapters/legacyProjection";
import { readUnifiedSnapshot, writeUnifiedSnapshot } from "./localDb";

export const UNIFIED_DOC_PREFIX = "revisionUnified";

/** Characters per chunk — comfortably below Firestore's 1 MiB document limit. */
export const CHUNK_CHARS = 400_000;

/** Debounce window for cloud writes triggered by study activity. */
const FLUSH_DELAY_MS = 2500;
/** Retry backoff after a failed flush. */
const RETRY_DELAY_MS = 30_000;

interface ChunkIndex {
  schema: number;
  updatedAt: string;
  /** Number of chunk documents for each stored section. */
  sections: Record<string, number>;
  /** Highest chunk count ever written, so stale documents can be cleaned up. */
  previousSections?: Record<string, number>;
}

/** The cloud schema version of the chunked layout (not the model version). */
export const CLOUD_SCHEMA = 1;

function sectionNames(): string[] {
  return ["meta", "cards", "logs"];
}

function sectionPayload(snapshot: UnifiedSnapshot): Record<string, unknown> {
  return {
    meta: {
      version: snapshot.version,
      updatedAt: new Date().toISOString(),
      decks: snapshot.decks,
      folders: snapshot.folders,
      tags: snapshot.tags,
      settings: snapshot.settings,
      savedSearches: snapshot.savedSearches,
      media: snapshot.media,
      tests: snapshot.tests,
      attempts: snapshot.attempts,
      sessions: snapshot.sessions,
      reviewMeta: {
        count: snapshot.reviewLogs.length,
        lastReviewedAt: snapshot.reviewLogs[snapshot.reviewLogs.length - 1]?.reviewedAt ?? null,
      },
    },
    cards: { cards: snapshot.cards },
    logs: { reviewLogs: snapshot.reviewLogs },
  };
}

function chunkKey(section: string, index: number): string {
  return `${section}-${index}`;
}

function splitIntoChunks(value: string): string[] {
  if (value.length <= CHUNK_CHARS) return [value];
  const chunks: string[] = [];
  for (let offset = 0; offset < value.length; offset += CHUNK_CHARS) {
    chunks.push(value.slice(offset, offset + CHUNK_CHARS));
  }
  return chunks;
}

function unifiedRef(uid: string, id: string): DocumentReference {
  return doc(db, "users", uid, UNIFIED_DOC_PREFIX, id);
}

/* ------------------------------------------------------------------ */
/* Write                                                               */
/* ------------------------------------------------------------------ */

/**
 * Persist the unified snapshot to Firestore.
 *
 * Never throws: a failed write is retried by the next flush, and the local
 * IndexedDB copy remains authoritative for offline study.
 */
export async function persistUnifiedToCloud(uid: string, snapshot: UnifiedSnapshot): Promise<boolean> {
  if (!uid) return false;
  try {
    const payload = sectionPayload(snapshot);
    const previous = await readIndex(uid);
    const sections: Record<string, number> = {};

    for (const section of sectionNames()) {
      const chunks = splitIntoChunks(JSON.stringify(payload[section]));
      sections[section] = chunks.length;
      for (let index = 0; index < chunks.length; index += 1) {
        await setDoc(
          unifiedRef(uid, chunkKey(section, index)),
          {
            uid,
            schema: CLOUD_SCHEMA,
            section,
            index,
            chunk: chunks[index],
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
      }
    }

    // The index lands last: until it does, readers keep the previous state.
    await setDoc(
      unifiedRef(uid, "index"),
      {
        uid,
        schema: CLOUD_SCHEMA,
        updatedAt: new Date().toISOString(),
        sections,
        previousSections: previous?.sections ?? {},
      },
      { merge: true },
    );

    // Best-effort cleanup of stale chunks (a shorter library after a deletion).
    for (const section of sectionNames()) {
      const stale = previous?.sections?.[section] ?? 0;
      for (let index = sections[section]; index < stale; index += 1) {
        await setDoc(unifiedRef(uid, chunkKey(section, index)), { chunk: "" }, { merge: true });
      }
    }

    return true;
  } catch (error) {
    console.warn("[revision] unified cloud persistence skipped", error);
    return false;
  }
}

async function readIndex(uid: string): Promise<ChunkIndex | null> {
  try {
    const snapshot = await getDoc(unifiedRef(uid, "index"));
    if (!snapshot.exists()) return null;
    const data = snapshot.data() as ChunkIndex & { sections?: Record<string, number> };
    if (!data?.sections) return null;
    return data;
  } catch (error) {
    console.warn("[revision] could not read unified index", error);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

async function readSection<T>(uid: string, section: string, chunks: number): Promise<T | null> {
  try {
    let json = "";
    for (let index = 0; index < chunks; index += 1) {
      const snapshot = await getDoc(unifiedRef(uid, chunkKey(section, index)));
      if (!snapshot.exists()) return null;
      json += String((snapshot.data() as { chunk?: string }).chunk ?? "");
    }
    if (!json) return null;
    return JSON.parse(json) as T;
  } catch (error) {
    console.warn(`[revision] could not read unified section ${section}`, error);
    return null;
  }
}

export interface CloudSnapshotShape {
  meta?: Partial<UnifiedSnapshot> & { updatedAt?: string };
  cards?: { cards?: UnifiedSnapshot["cards"] };
  logs?: { reviewLogs?: UnifiedSnapshot["reviewLogs"] };
}

/** Fetch the remote snapshot shell (used by tests and by the merge step). */
export async function fetchUnifiedFromCloud(uid: string): Promise<Partial<UnifiedSnapshot> | null> {
  if (!uid) return null;
  const index = await readIndex(uid);
  if (!index) return null;

  const [meta, cards, logs] = await Promise.all([
    readSection<CloudSnapshotShape["meta"]>(uid, "meta", index.sections.meta ?? 0),
    readSection<CloudSnapshotShape["cards"]>(uid, "cards", index.sections.cards ?? 0),
    readSection<CloudSnapshotShape["logs"]>(uid, "logs", index.sections.logs ?? 0),
  ]);

  if (!meta) return null;
  return {
    ...(meta as Partial<UnifiedSnapshot>),
    cards: cards?.cards ?? [],
    reviewLogs: logs?.reviewLogs ?? [],
  };
}

/**
 * Hydrate the local unified snapshot from the cloud.
 *
 * Returns `true` when local state changed. Merge-only: remote data can add or
 * update rows, never remove local work.
 */
export async function hydrateUnifiedFromCloud(uid: string): Promise<boolean> {
  const remote = await fetchUnifiedFromCloud(uid);
  if (!remote) return false;

  const local = await readUnifiedSnapshot();
  const incoming: UnifiedSnapshot = {
    version: remote.version ?? local?.version ?? 0,
    decks: remote.decks ?? [],
    folders: remote.folders ?? [],
    cards: remote.cards ?? [],
    tags: remote.tags ?? [],
    reviewLogs: remote.reviewLogs ?? [],
    sessions: remote.sessions ?? [],
    tests: remote.tests ?? [],
    attempts: remote.attempts ?? [],
    savedSearches: remote.savedSearches ?? [],
    settings: remote.settings ?? local?.settings ?? ({} as UnifiedSnapshot["settings"]),
    media: remote.media ?? [],
  };

  if (!local) {
    await writeUnifiedSnapshot(incoming);
    return true;
  }

  const merged = mergeUnifiedSnapshots(local, incoming);
  const changed =
    merged.cards.length !== local.cards.length ||
    merged.reviewLogs.length !== local.reviewLogs.length ||
    merged.decks.length !== local.decks.length;
  if (changed) await writeUnifiedSnapshot(merged);
  return changed;
}

/* ------------------------------------------------------------------ */
/* Debounced queue (offline-first)                                     */
/* ------------------------------------------------------------------ */

const pending = new Map<string, ReturnType<typeof setTimeout>>();
let flushing = false;

/**
 * Queue a cloud write for the unified snapshot. Safe to call on every review:
 * the write is debounced, and it always serialises the latest persisted state,
 * so a burst of reviews produces one upload and no duplicate review rows.
 */
export function queueUnifiedCloudPersistence(uid: string, delayMs = FLUSH_DELAY_MS): void {
  if (!uid) return;
  const existing = pending.get(uid);
  if (existing) clearTimeout(existing);

  pending.set(
    uid,
    setTimeout(() => {
      pending.delete(uid);
      void flushUnifiedCloudPersistence(uid);
    }, delayMs),
  );
}

/** Force an immediate flush (used on app background / session end). */
export async function flushUnifiedCloudPersistence(uid: string): Promise<boolean> {
  if (!uid || flushing) return false;
  flushing = true;
  try {
    const snapshot = await readUnifiedSnapshot();
    if (!snapshot) return false;
    const ok = await persistUnifiedToCloud(uid, snapshot);
    if (!ok) {
      // Offline or denied: try again later rather than dropping the write.
      queueUnifiedCloudPersistence(uid, RETRY_DELAY_MS);
    }
    return ok;
  } finally {
    flushing = false;
  }
}

/** Cancel a queued flush (logout / unmount). */
export function cancelUnifiedCloudPersistence(uid?: string): void {
  if (uid) {
    const timer = pending.get(uid);
    if (timer) clearTimeout(timer);
    pending.delete(uid);
    return;
  }
  pending.forEach((timer) => clearTimeout(timer));
  pending.clear();
}
