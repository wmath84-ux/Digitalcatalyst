// src/course/cloudFreshness.ts
//
// "Panel kholte hi purana data" — the rule that decides when the Course
// Player repeats a cloud READ.
//
// The owner removed live/realtime sync in favour of saved, storage-backed
// updates, so the Notes tab and the Mind Map library each read Firestore ONCE
// at mount and then paint the device mirror. That is cheap and predictable, but
// it also meant work done on the learner's other device stayed invisible for the
// rest of the session — reported as "notes/mind-map occasionally not synced or
// not visible in course player".
//
// The fix is NOT a listener. It is the same one-shot read, repeated at the two
// moments a learner would call "reopening" it:
//
//   · the tab/app becomes visible again (`visibilitychange` / `online`), or
//   · the Notes / Mind Map dock tab is opened again inside the player.
//
// Both reads are gated by the rule below, and the gate is the important part:
//
//   NEVER while this device still has unacknowledged work. A read merges the
//   server copy into the device copy, and the outbox (`dirty` / `writing` /
//   `deleted`, or `uploads` / `deletes` for maps) is the only thing standing
//   between an unsaved edit and a stale server echo. Freshness must never race
//   a save, so the read simply waits for the queue to drain.
//
// Pure on purpose: no React, no Firestore, no clock of its own — every input
// comes in as an argument so `node --test` can drive it directly.

/** How old the Notes read may be before returning to the tab repeats it. */
export const CLOUD_READ_STALE_MS = 60_000;

/** How old the Mind Map library read may be before returning repeats it. */
export const LIST_READ_STALE_MS = 60_000;

export interface NotesFreshnessView {
  /** Notes edited locally that Firestore has not acknowledged yet. */
  dirty: number;
  /** Notes whose uploaded write is in flight right now. */
  writing: number;
  /** Local tombstones waiting for their delete to be acknowledged. */
  deleted: number;
  /** A write is running. */
  inFlight: boolean;
  /** Epoch ms of the last settled cloud read (0 = never). */
  lastCloudReadAt: number;
  /** Injectable clock — the caller passes Date.now(). */
  now?: number;
}

export const shouldRefreshNotesFromCloud = (view: NotesFreshnessView): boolean => {
  if (view.dirty > 0 || view.writing > 0 || view.deleted > 0 || view.inFlight) return false;
  const now = Number(view.now ?? Date.now());
  return !view.lastCloudReadAt || now - view.lastCloudReadAt >= CLOUD_READ_STALE_MS;
};

export interface MapFreshnessView {
  /** Maps drawn on this device that have not reached Firestore yet. */
  uploads: number;
  /** Maps deleted on this device whose delete is not acknowledged yet. */
  deletes: number;
  /** A library read is running right now — never stack two of them. */
  mapsLoading: boolean;
  /** Epoch ms of the last settled library read (0 = never). */
  lastListReadAt: number;
  now?: number;
}

export const shouldRefreshMapList = (view: MapFreshnessView): boolean => {
  // A read merges the server library into the device library; the outbox is
  // what keeps an unacknowledged map (or delete) from being replaced by a
  // stale server copy, so the read waits for it to drain first.
  if (view.uploads > 0 || view.deletes > 0) return false;
  if (view.mapsLoading) return false;
  const now = Number(view.now ?? Date.now());
  return !view.lastListReadAt || now - view.lastListReadAt >= LIST_READ_STALE_MS;
};
