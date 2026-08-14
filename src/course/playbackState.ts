// src/course/playbackState.ts
//
// Course Player — per-file "where did I leave off" state.
//
// Switching from one module to another must never lose the position the
// learner had reached inside the resource they were watching / reading.
// The rule applies to EVERY file type, not just YouTube:
//
//   - YouTube            → playback position (seconds), resumed with `start=`.
//   - Direct video       → playback position (seconds) on the <video> element.
//   - Direct audio       → playback position (seconds) on the <audio> element.
//   - Image              → zoom level + pan offset.
//   - PDF / Docs / Sheets / Slides / Forms / Mindmaps / generic embeds
//                        → the iframe itself is kept alive by the Course
//                          Player (see CoursePlayerApp's viewer stack) so the
//                          remote document keeps its own scroll / page / slide
//                          position. `scrollTop` / `page` are stored whenever
//                          the host lets us read them.
//
// The snapshot is written to localStorage (per user + product), so the
// position also survives a reload, an orientation change, or leaving the
// course and coming back later.

export interface CoursePlaybackEntry {
  /** Media position in seconds. */
  position?: number;
  /** Media duration in seconds (when known). */
  duration?: number;
  /** Document page (when the viewer can read it). */
  page?: number;
  /** Scroll offset for viewers we own. */
  scrollTop?: number;
  /** Image viewer zoom. */
  scale?: number;
  /** Image viewer pan. */
  offsetX?: number;
  offsetY?: number;
  /** Epoch ms of the last update. */
  updatedAt: number;
}

export type CoursePlaybackPatch = Partial<Omit<CoursePlaybackEntry, "updatedAt">>;

export type CoursePlaybackStore = Record<string, CoursePlaybackEntry>;

/** Keep the snapshot small — only the most recently touched files matter. */
const MAX_ENTRIES = 120;

/**
 * Media shorter than this is treated as "not started" so a stray tap never
 * makes a lesson resume two seconds in.
 */
export const MIN_RESUME_SECONDS = 3;

/**
 * Never resume within the last few seconds of a lesson — the learner
 * finished it, so restart from the beginning instead.
 */
export const RESUME_TAIL_GUARD_SECONDS = 8;

export const playbackStorageKey = (uid: string, productId: string) => `dc.coursePlayback.${uid}.${productId}`;

export const loadPlaybackStore = (uid: string, productId: string): CoursePlaybackStore => {
  try {
    const raw = localStorage.getItem(playbackStorageKey(uid, productId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as CoursePlaybackStore;
  } catch {
    return {};
  }
};

export const persistPlaybackStore = (uid: string, productId: string, store: CoursePlaybackStore) => {
  try {
    const entries = Object.entries(store)
      .sort(([, a], [, b]) => Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0))
      .slice(0, MAX_ENTRIES);
    localStorage.setItem(playbackStorageKey(uid, productId), JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* storage full / private mode — the in-memory snapshot still works */
  }
};

export const mergePlaybackEntry = (
  store: CoursePlaybackStore,
  fileId: string,
  patch: CoursePlaybackPatch,
): CoursePlaybackStore => {
  const current = store[fileId] || { updatedAt: 0 };
  store[fileId] = { ...current, ...patch, updatedAt: Date.now() };
  return store;
};

/**
 * Decide whether a stored position is worth resuming from. Anything below
 * `MIN_RESUME_SECONDS`, or within `RESUME_TAIL_GUARD_SECONDS` of the end,
 * starts over.
 */
export const resumePosition = (entry?: CoursePlaybackEntry): number => {
  const position = Number(entry?.position || 0);
  if (!Number.isFinite(position) || position < MIN_RESUME_SECONDS) return 0;
  const duration = Number(entry?.duration || 0);
  if (duration > 0 && position >= duration - RESUME_TAIL_GUARD_SECONDS) return 0;
  return position;
};
