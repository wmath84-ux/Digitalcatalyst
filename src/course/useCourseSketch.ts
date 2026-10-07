// src/course/useCourseSketch.ts
//
// Per-student SKETCH persistence for the Course Player — the state half of
// the Sketch tab (the editor itself is `src/course/SketchPanel.tsx`, which
// hosts the official Excalidraw component).
//
// Storage: `users/{uid}/sketches/{uid}__{productId}__{moduleId}` for the
// FIRST board of a module and `…__{sketchKey}` for every further board — one
// document per learner + course + module + board, owner-only per
// firestore.rules (which already re-derive both id shapes). The id is the
// same composite shape `mindMapDocId()` uses, so one learner can never write
// into another's namespace.
//
// ── Scope: the MODULE, exactly like the mind map ──────────────────────────
// The player tracks the selected FILE; boards are scoped to the MODULE that
// file belongs to. Switching lessons inside one module keeps the same board
// (draw while watching lecture 1, keep drawing on lecture 2); switching
// modules opens that module's own boards, and coming back restores the board
// the learner had open there. The resource that was open when the board was
// last saved rides along as `resourceId` / `resourceName` — association, not
// scope.
//
// ── Many boards per module (the Sketch tab's "+") ─────────────────────────
// Like the mind map hook, this hook owns two things:
//
//   1. the INDEX of the module's boards (key, title, size, last saved) —
//      read from Firestore with the same productId/moduleId query the mind
//      map list uses, mirrored on the device so it opens offline; and
//   2. the ACTIVE board's session, edited and saved exactly as before.
//
// The first board keeps the legacy three-part id (key `main`), so every
// board drawn before multi-canvas support opens untouched. "+" generates a
// fresh unique key (never `main`, never an existing key), so a new board can
// never overwrite a saved one; the empty board is registered in the cloud
// immediately, and which board was open is remembered per module.
//
// ── Two layers, deliberately (the Notes / Mind Map pattern) ───────────────
//   1. Firestore is the source of truth, so the same learner sees the same
//      boards on every device.
//   2. localStorage mirrors every save. A refused or failed write (rules not
//      deployed, offline, a transient outage) must NEVER strand a drawing;
//      the mirror is read back on the next open and pushed up when the cloud
//      answers again.
//
// ── Load / save ordering (the races this hook closes) ─────────────────────
//   · The scene key moves exactly when the scene the editor must mount with
//     is FINAL (load finished, or a late cloud copy replaced it). The panel
//     memoises `initialData` on that key, so an editor can never mount on the
//     blank/device scene captured while the cloud read was still running.
//   · An editor's `onChange` is tagged with the key it was mounted for; a
//     change from an editor mounted on an older scene is ignored, so it can
//     never write that older scene over the newer one.
//   · No cloud write happens for a board until its cloud copy has been READ
//     (or the board was just created here). Work drawn before that — late
//     sign-in, offline open — is kept on the device and MERGED with the cloud
//     copy when it arrives, never written over it.
//   · A write that is still in flight when the board is closed keeps going,
//     and a newer revision queued behind it is still delivered.
//
// ── Why the canvas never waits for any of this ────────────────────────────
// `updateScene()` is called by Excalidraw on EVERY pointer move. It therefore
// does the cheapest possible thing: write the live scene into a ref and arm
// two timers. There is no React re-render per stroke (the hook only re-renders
// when the SAVE STATE changes), no JSON serialisation per stroke (the device
// mirror is written on a 350 ms tail) and no Firestore write per stroke (the
// cloud write is debounced, with a max-wait so a long continuous drawing
// still checkpoints).

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { auth, db } from "../../firebase";
import {
  MAX_SKETCH_BOARDS,
  SKETCH_COLLECTION,
  SKETCH_DEFAULT_KEY,
  createSketchKey,
  createSketchScene,
  mergeSketchScenes,
  nextSketchTitle,
  parseSketchScene,
  sanitizeSketchKey,
  sanitizeSketchTitle,
  serializeSketchScene,
  sketchDocId,
  sketchSceneSignature,
  toFirestoreSketch,
  type SketchScene,
} from "../../utils/sketchScene";

/**
 * `pending` = edited, not written yet (the debounce has not fired, or the
 * board's cloud copy is still being read); `saving` = a write is in flight;
 * `saved` = the cloud acknowledged the latest revision; `error` = the last
 * attempt failed (the device copy still holds the work — see `deviceSaved`).
 */
export type SketchSaveStatus = "idle" | "loading" | "ready" | "pending" | "saving" | "saved" | "error";

/** One row of the module's board list — enough for the switcher. */
export interface SketchBoardSummary {
  sketchKey: string;
  title: string;
  elementCount: number;
  updatedAt: number;
  createdAt: number;
}

export interface UseCourseSketchInput {
  uid?: string | null;
  productId?: string | number | null;
  /** The module the learner is viewing; boards are scoped to it. */
  moduleId?: string | number | null;
  /** Optional association: the resource open beside the board. */
  resourceId?: string | null;
  resourceName?: string | null;
  /** Milliseconds of quiet before a pending edit reaches Firestore. */
  debounceMs?: number;
}

export interface UseCourseSketchResult {
  /** The scene the editor must mount with. Stable until the scope changes. */
  scene: SketchScene;
  /**
   * The LIVE scene, read at call time. Drawing deliberately does not
   * re-render the player (that would cost a React pass per stroke), so the
   * `scene` snapshot above can lag the canvas by one quiet period. Anything
   * that mounts an editor — i.e. `initialData` — must read through this
   * instead, so a learner who draws and immediately switches tabs still
   * comes back to the stroke they just made.
   */
  getScene: () => SketchScene;
  /**
   * Identity of the scene currently loaded — course + module + board (+ a
   * generation counter that moves when the load finishes, and for the rare
   * "the cloud answered late with a newer board"). This is the ONLY thing
   * the editor may be keyed by: never the split ratio, never the pane size,
   * never the active tab.
   */
  sceneKey: string;
  /** False while there is no learner / module to scope a board to. */
  scoped: boolean;
  /** True until the board for this scope is known (cloud or device copy). */
  loading: boolean;
  status: SketchSaveStatus;
  errorMessage: string | null;
  /** True while local edits have not reached the cloud yet. */
  pendingSync: boolean;
  /** False when even the DEVICE copy could not be written (storage full). */
  deviceSaved: boolean;
  lastSavedAt: number | null;
  elementCount: number;
  /**
   * Excalidraw's `onChange` — elements + appState + files. The optional
   * fourth argument is the `sceneKey` the calling editor was mounted for; a
   * change from an editor mounted on an older scene is ignored.
   */
  updateScene: (elements: unknown, appState: unknown, files: unknown, forSceneKey?: string) => void;
  /**
   * The learner's canvas colour choice, remembered two ways:
   *
   *   · ON the board — `appState.viewBackgroundColor` + `theme` (both
   *     whitelisted keys), so the board reopens exactly as saved;
   *   · ON the device — a small per-learner preference, so a board that has
   *     no saved colour of its own still opens with the colour the learner
   *     used last time ("dobra open karen to wahi dikhe").
   *
   * `null` means "no custom colour — the theme default": the board opens
   * dark, the canvas the player always had. A hex means that colour ON A
   * LIGHT-BOARD — in the dark theme the editor inverts the canvas colour
   * (white paints as #121212), so any chosen colour also flips the board's
   * theme to light: what the learner picks is what they see.
   */
  setCanvasColor: (color: string | null) => void;
  /**
   * The mode this board opens with: `null` (theme default — dark board) or
   * a hex (light board with that canvas colour). The board's own saved
   * theme wins; a board with no saved theme of its own falls back to the
   * learner's device preference.
   */
  canvasColor: string | null;
  /** Write everything pending right now (tab switch, unmount, page hide). */
  flush: () => void;
  /** Retry a failed read/write immediately (the save line's Retry). */
  retry: () => void;

  // ── The module's boards ───────────────────────────────────────────────
  /** Every board this learner has in the active module, first board first. */
  boards: SketchBoardSummary[];
  /** The board the editor is showing. */
  activeBoardKey: string;
  activeBoardTitle: string;
  /** True while the module's board list is still being read from the cloud. */
  boardsLoading: boolean;
  /** Open another board of this module (the current one is flushed first). */
  selectBoard: (sketchKey: string) => void;
  /**
   * Create a brand-new blank board in this module, register it, and open it.
   * Returns the new key, or null when refused (no scope, at the limit, or a
   * repeated tap inside the double-tap guard).
   */
  createBoard: () => string | null;
  /** False when there is no scope or the module is at `MAX_SKETCH_BOARDS`. */
  canCreateBoard: boolean;
  /**
   * Delete ONE board (never the guaranteed first, never the last). Returns
   * true when a board was removed; the active Canvas is reopened on the first
   * board when it was the one deleted. Part 1 §30.
   */
  deleteBoard: (sketchKey: string) => boolean;
}

/** Quiet window before the cloud write. Long enough to coalesce a stroke. */
const DEFAULT_DEBOUNCE_MS = 1100;
/** …but a continuous drawing still checkpoints this often. */
const MAX_WAIT_MS = 6000;
/** The device mirror is cheap and local, so it lands much sooner. */
const LOCAL_MIRROR_MS = 350;
/** How long the editor waits for the cloud before opening the device copy. */
const OPEN_GRACE_MS = 2500;
/** Retry ceiling for a refused/failed write. */
const MAX_ATTEMPTS = 8;
/** A second "+" inside this window is a double tap, not a second board. */
const CREATE_GUARD_MS = 800;

/** Device copy of one board. The first board keeps its legacy key. */
const localKey = (uid: string, productId: string, moduleId: string, sketchKey: string = SKETCH_DEFAULT_KEY) =>
  sketchKey === SKETCH_DEFAULT_KEY
    ? `dc.sketch.v1.${uid}.${productId}.${moduleId}`
    : `dc.sketch.v1.${uid}.${productId}.${moduleId}.${sketchKey}`;

/**
 * The DEVICE-only draft of a sketch drawn before a lesson was open.
 *
 * A board's identity is `{uid, productId, moduleId, sketchKey}`, so a Sketch
 * tab with no module has no document the rules could accept and no key in the
 * module's index. Dropping the scene in that state meant it lived only in the
 * editor's memory, and the editor unmounts whenever the tab switches or the
 * scope moves on — the "I draw, I let go, it vanishes" report. So the scene
 * goes to this device-level key instead, in exactly the same format as a
 * board's device copy, and the first board that opens EMPTY adopts it (see
 * `reconcile`). Never the cloud, never the module's index, never shared
 * between learners.
 */
const draftKey = (uid: string, productId: string) =>
  `dc.sketchDraft.v1.${uid || "guest"}.${productId || "-"}`;

/** Durable "this device has work the cloud has not acknowledged" marker. */
const outboxKey = (uid: string, productId: string, moduleId: string, sketchKey: string = SKETCH_DEFAULT_KEY) =>
  sketchKey === SKETCH_DEFAULT_KEY
    ? `dc.sketchOutbox.v1.${uid}.${productId}.${moduleId}`
    : `dc.sketchOutbox.v1.${uid}.${productId}.${moduleId}.${sketchKey}`;

/** The module's board list (device mirror of the cloud index). */
const indexKey = (uid: string, productId: string, moduleId: string) =>
  `dc.sketchIndex.v1.${uid}.${productId}.${moduleId}`;

/** Which board was open last in this module. */
const activeBoardStorageKey = (uid: string, productId: string, moduleId: string) =>
  `dc.sketchActive.v1.${uid}.${productId}.${moduleId}`;

/**
 * The learner's last canvas colour (device level). Per learner, because the
 * same device can study under two accounts and a colour is a preference, not
 * a board fact — boards carry their own saved colour in the scene.
 */
const canvasColorPrefKey = (uid: string) =>
  `dc.sketchCanvasColor.v1.${uid || "guest"}`;

const readCanvasColorPref = (uid: string): string | null => {
  try {
    const value = localStorage.getItem(canvasColorPrefKey(uid));
    return value && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
  } catch {
    return null;
  }
};

const writeCanvasColorPref = (uid: string, color: string | null) => {
  try {
    if (color) localStorage.setItem(canvasColorPrefKey(uid), color);
    else localStorage.removeItem(canvasColorPrefKey(uid));
  } catch {
    /* private mode — the scene copy still carries the colour */
  }
};

/** A Firestore failure's code (`permission-denied`, `unavailable`, …). */
const errorCode = (thrown: unknown): string =>
  typeof thrown === "object" && thrown !== null && "code" in thrown
    ? String((thrown as { code?: unknown }).code || "")
    : "";

const describeError = (thrown: unknown, deviceSaved = true): string => {
  if (!deviceSaved) return "Not saved yet — this device's storage is full. Keep this tab open; retrying the cloud.";
  const code = errorCode(thrown);
  if (code === "permission-denied") return "Sketch cloud access blocked — saved on this device.";
  if (code === "unauthenticated") return "Sign-in session not ready — saved on this device.";
  if (code === "unavailable" || code === "failed-precondition") return "Offline — saved on this device.";
  if (code === "resource-exhausted" || code === "invalid-argument") return "This board is too large to sync.";
  return "Could not sync the sketch — saved on this device.";
};

/**
 * The uid a cloud write may use. Firestore rules derive ownership from the
 * PATH, so a write is only ever attempted for the SIGNED-IN learner's own
 * namespace: a uid handed in through props that the session cannot verify
 * never reaches the network (the device mirror still keeps the work).
 */
export const cloudSketchUid = (uid: string | null | undefined): string | null => {
  const wanted = String(uid || "").trim();
  if (!wanted) return null;
  const signedIn = typeof auth?.currentUser?.uid === "string" ? auth.currentUser.uid : "";
  return signedIn && signedIn === wanted ? signedIn : null;
};

/**
 * Call `onReady` once the Firebase session for `uid` exists. A cold open of
 * the app restores the auth session asynchronously, AFTER the player may
 * already have mounted — without this the board's cloud copy was never read
 * on such an open, and the next stroke was written over it.
 */
const whenSignedInAs = (uid: string, onReady: () => void): (() => void) => {
  const subscribe = (auth as unknown as {
    onAuthStateChanged?: (next: (user: { uid?: string } | null) => void) => () => void;
  })?.onAuthStateChanged;
  if (typeof subscribe !== "function") return () => undefined;
  let done = false;
  let unsubscribe: (() => void) | null = null;
  try {
    unsubscribe = subscribe.call(auth, (user) => {
      if (done || !user || user.uid !== uid) return;
      done = true;
      // Defer: the callback can fire synchronously inside `subscribe`.
      setTimeout(() => {
        unsubscribe?.();
        onReady();
      }, 0);
    });
  } catch {
    return () => undefined;
  }
  return () => {
    done = true;
    unsubscribe?.();
  };
};

interface LocalSketch {
  scene: SketchScene;
  updatedAt: number;
  createdAt: number;
}

const readLocal = (key: string): LocalSketch | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { scene?: unknown; updatedAt?: unknown; createdAt?: unknown };
    const scene = parseSketchScene(parsed?.scene ?? parsed);
    return {
      scene,
      updatedAt: typeof parsed?.updatedAt === "number" ? parsed.updatedAt : 0,
      createdAt: typeof parsed?.createdAt === "number" ? parsed.createdAt : 0,
    };
  } catch {
    // A corrupt device copy opens as "no device copy" — the cloud (or a
    // blank board) takes over instead of the editor crashing.
    return null;
  }
};

/** Returns false when the device copy could NOT be written (quota, private mode). */
const writeLocal = (key: string, scene: SketchScene, updatedAt: number, createdAt: number): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify({ scene: serializeSketchScene(scene), updatedAt, createdAt }));
    return true;
  } catch {
    return false;
  }
};

/** Drop a device copy that has been handed over (used for the draft). */
const removeLocal = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* private mode — an unreadable device has nothing to clear */
  }
};

const markOutbox = (key: string, pending: boolean) => {
  try {
    if (pending) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* private mode — the in-memory flag still drives this session */
  }
};

const readOutbox = (key: string): boolean => {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

// ── The board index ─────────────────────────────────────────────────────────

const clampCount = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;

const sortBoards = (rows: SketchBoardSummary[]) =>
  [...rows].sort((a, b) => {
    if (a.sketchKey === SKETCH_DEFAULT_KEY) return -1;
    if (b.sketchKey === SKETCH_DEFAULT_KEY) return 1;
    return (a.createdAt || 0) - (b.createdAt || 0) || a.sketchKey.localeCompare(b.sketchKey);
  });

/** Never empty: the first board always exists, even before it is drawn on. */
const withDefaultBoard = (rows: SketchBoardSummary[]): SketchBoardSummary[] => {
  const out = rows.filter((row, index, all) => all.findIndex((other) => other.sketchKey === row.sketchKey) === index);
  if (!out.some((row) => row.sketchKey === SKETCH_DEFAULT_KEY)) {
    out.unshift({ sketchKey: SKETCH_DEFAULT_KEY, title: "Canvas 1", elementCount: 0, updatedAt: 0, createdAt: 0 });
  }
  // Boards that never got a name read "Canvas N" in list order.
  const sorted = sortBoards(out);
  return sorted.map((row, index) => (row.title ? row : { ...row, title: `Canvas ${index + 1}` }));
};

const parseSummary = (raw: unknown): SketchBoardSummary | null => {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const sketchKey = sanitizeSketchKey(row.sketchKey);
  return {
    sketchKey,
    title: sanitizeSketchTitle(row.title),
    elementCount: clampCount(row.elementCount),
    updatedAt: clampCount(row.updatedAt),
    createdAt: clampCount(row.createdAt),
  };
};

const readIndex = (key: string): SketchBoardSummary[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseSummary).filter((row): row is SketchBoardSummary => Boolean(row));
  } catch {
    return [];
  }
};

interface BoardIndex {
  uid: string;
  productId: string;
  moduleId: string;
  scoped: boolean;
  indexKey: string;
  activeKey: string;
  boards: SketchBoardSummary[];
  /** Boards created on THIS visit that have no cloud document yet. */
  fresh: Set<string>;
  listLoading: boolean;
  lastCreateAt: number;
  /** Bumped on every index mutation — the result memo watches it. */
  version: number;
}

const createBoardIndex = (uid: string, productId: string, moduleId: string): BoardIndex => {
  const scoped = Boolean(uid && productId && moduleId);
  const iKey = scoped ? indexKey(uid, productId, moduleId) : "";
  const boards = withDefaultBoard(scoped ? readIndex(iKey) : []);
  let activeKey: string = SKETCH_DEFAULT_KEY;
  if (scoped) {
    try {
      const stored = localStorage.getItem(activeBoardStorageKey(uid, productId, moduleId));
      if (stored) {
        const key = sanitizeSketchKey(stored);
        if (boards.some((row) => row.sketchKey === key)) activeKey = key;
      }
    } catch {
      /* private mode — open the first board */
    }
  }
  return {
    uid,
    productId,
    moduleId,
    scoped,
    indexKey: iKey,
    activeKey,
    boards,
    fresh: new Set(),
    listLoading: scoped,
    lastCreateAt: 0,
    version: 0,
  };
};

const writeIndex = (index: BoardIndex) => {
  if (!index.scoped) return;
  try {
    localStorage.setItem(index.indexKey, JSON.stringify(index.boards));
  } catch {
    /* private mode — the cloud list still restores it */
  }
};

const writeActiveBoard = (index: BoardIndex) => {
  if (!index.scoped) return;
  try {
    localStorage.setItem(activeBoardStorageKey(index.uid, index.productId, index.moduleId), index.activeKey);
  } catch {
    /* private mode — the first board opens next time */
  }
};

/** Patch one board's summary in place; returns true when anything changed. */
const patchBoard = (index: BoardIndex, sketchKey: string, patch: Partial<SketchBoardSummary>): boolean => {
  const at = index.boards.findIndex((row) => row.sketchKey === sketchKey);
  if (at < 0) return false;
  const current = index.boards[at];
  const next = { ...current, ...patch };
  if (
    next.title === current.title
    && next.elementCount === current.elementCount
    && next.updatedAt === current.updatedAt
    && next.createdAt === current.createdAt
  ) return false;
  const boards = [...index.boards];
  boards[at] = next;
  index.boards = boards;
  index.version += 1;
  return true;
};

// ── One board's session ─────────────────────────────────────────────────────

interface SketchSession {
  uid: string;
  productId: string;
  moduleId: string;
  sketchKey: string;
  title: string;
  scoped: boolean;
  /** Signed in but with no module open: the scene lives on this device only. */
  draft: boolean;
  draftKey: string;
  docId: string;
  localKey: string;
  outboxKey: string;
  /** The live scene — written on every stroke, never through React state. */
  scene: SketchScene;
  /** Bumped when the scene the editor must mount with changes identity. */
  generation: number;
  /** Change signatures: what the queue has seen vs what the cloud holds. */
  signature: number;
  savedSignature: number;
  /** Monotonic edit counter — protects against stale async writes. */
  revision: number;
  savedRevision: number;
  dirty: boolean;
  loaded: boolean;
  hasLocal: boolean;
  /** The device copy as it was when the board OPENED (before any edit). */
  hadLocalAtOpen: boolean;
  localUpdatedAtOpen: number;
  loadError: boolean;
  /** True once the cloud copy has been read (or the board was created here). */
  remoteChecked: boolean;
  /** Created by "+" on this visit: no cloud copy to wait for. */
  fresh: boolean;
  /** Read generation — a stale read result (older effect run) is ignored. */
  readToken: number;
  reading: boolean;
  /** False when the last device-mirror write failed. */
  localOk: boolean;
  createdAt: number;
  updatedAt: number;
  status: SketchSaveStatus;
  errorMessage: string | null;
  pendingSync: boolean;
  lastSavedAt: number | null;
  localTimer: ReturnType<typeof setTimeout> | null;
  cloudTimer: ReturnType<typeof setTimeout> | null;
  openTimer: ReturnType<typeof setTimeout> | null;
  retry: ReturnType<typeof setTimeout> | null;
  stopAuthWait: (() => void) | null;
  maxWaitAt: number | null;
  attempts: number;
  inFlight: boolean;
  disposed: boolean;
  resourceId: string;
  resourceName: string;
}

const createSession = (
  uid: string,
  productId: string,
  moduleId: string,
  sketchKey: string = SKETCH_DEFAULT_KEY,
  options: { fresh?: boolean; title?: string } = {},
): SketchSession => {
  const scoped = Boolean(uid && productId && moduleId);
  const key = sanitizeSketchKey(sketchKey);
  const lKey = scoped ? localKey(uid, productId, moduleId, key) : "";
  const oKey = scoped ? outboxKey(uid, productId, moduleId, key) : "";
  // A learner with no lesson open still gets a canvas — it is kept as this
  // device's DRAFT rather than dropped (see `draftKey`).
  const draft = !scoped && Boolean(uid);
  const dKey = draft ? draftKey(uid, productId) : "";
  // The device copy is read SYNCHRONOUSLY so a cold open (or an offline one)
  // already has the learner's board in hand before the first paint.
  const local = scoped ? readLocal(lKey) : draft ? readLocal(dKey) : null;
  const scene = local?.scene ?? createSketchScene();
  const fresh = Boolean(scoped && options.fresh);
  return {
    uid,
    productId,
    moduleId,
    sketchKey: key,
    title: sanitizeSketchTitle(options.title),
    scoped,
    draft,
    draftKey: dKey,
    docId: scoped ? sketchDocId(uid, productId, moduleId, key) : "",
    localKey: lKey,
    outboxKey: oKey,
    scene,
    generation: 0,
    signature: sketchSceneSignature(scene.elements),
    savedSignature: sketchSceneSignature(scene.elements),
    revision: 0,
    savedRevision: 0,
    dirty: false,
    loaded: !scoped,
    hasLocal: Boolean(local),
    hadLocalAtOpen: Boolean(local),
    localUpdatedAtOpen: local?.updatedAt || 0,
    loadError: false,
    remoteChecked: !scoped || fresh,
    fresh,
    readToken: 0,
    reading: false,
    localOk: true,
    createdAt: local?.createdAt || 0,
    updatedAt: local?.updatedAt || 0,
    status: scoped ? "loading" : draft ? "ready" : "idle",
    errorMessage: null,
    pendingSync: scoped ? readOutbox(oKey) : false,
    lastSavedAt: null,
    localTimer: null,
    cloudTimer: null,
    openTimer: null,
    retry: null,
    stopAuthWait: null,
    maxWaitAt: null,
    attempts: 0,
    inFlight: false,
    disposed: false,
    resourceId: "",
    resourceName: "",
  };
};

const clearTimers = (session: SketchSession) => {
  if (session.localTimer) { clearTimeout(session.localTimer); session.localTimer = null; }
  if (session.cloudTimer) { clearTimeout(session.cloudTimer); session.cloudTimer = null; }
  if (session.openTimer) { clearTimeout(session.openTimer); session.openTimer = null; }
  if (session.retry) { clearTimeout(session.retry); session.retry = null; }
  if (session.stopAuthWait) { session.stopAuthWait(); session.stopAuthWait = null; }
  session.maxWaitAt = null;
};

/** The key an editor mounted on this session's current scene carries. */
const sessionSceneKey = (session: SketchSession) =>
  session.scoped ? `${session.docId}#${session.generation}` : "sketch-unscoped";

/**
 * The scene the editor must mount with is now final: open it. Bumping the
 * generation moves the scene key, which is what makes the panel recompute
 * `initialData` from the loaded scene instead of the one it saw while the
 * load was still running.
 */
const markLoaded = (session: SketchSession) => {
  if (session.openTimer) { clearTimeout(session.openTimer); session.openTimer = null; }
  if (session.loaded) return;
  session.loaded = true;
  session.generation += 1;
};

export default function useCourseSketch({
  uid,
  productId,
  moduleId,
  resourceId,
  resourceName,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseCourseSketchInput): UseCourseSketchResult {
  const uidText = String(uid || "").trim();
  const productText = String(productId ?? "").trim();
  const moduleText = String(moduleId ?? "").trim();

  // The hook re-renders on SAVE-STATE / board-list changes only — never per stroke.
  const [, bump] = useReducer((count: number) => count + 1, 0);

  // One board INDEX per module scope…
  const index = useMemo(
    () => createBoardIndex(uidText, productText, moduleText),
    [uidText, productText, moduleText],
  );
  const indexRef = useRef<BoardIndex>(index);
  indexRef.current = index;
  const activeKey = index.activeKey;

  // …and one session per BOARD. A new module or board builds a new session,
  // and the previous one is flushed by the lifecycle effect's cleanup.
  const session = useMemo(
    () => {
      const summary = index.boards.find((row) => row.sketchKey === activeKey);
      return createSession(uidText, productText, moduleText, activeKey, {
        fresh: index.fresh.has(activeKey),
        title: summary?.title,
      });
    },
    // `index` changes with the scope; `activeKey` with the board.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uidText, productText, moduleText, index, activeKey],
  );
  const scopeRef = useRef<SketchSession>(session);
  scopeRef.current = session;

  const notify = useCallback((scope: SketchSession) => {
    if (scope.disposed || scopeRef.current !== scope) return;
    bump();
  }, []);

  // The lecture open beside the board. Kept on the session (not in a
  // dependency) so changing lessons inside the module never reloads it.
  session.resourceId = String(resourceId || "").trim();
  session.resourceName = String(resourceName || "").trim();

  const setStatus = useCallback(
    (scope: SketchSession, status: SketchSaveStatus, errorMessage: string | null = null) => {
      if (scope.status === status && scope.errorMessage === errorMessage) return;
      scope.status = status;
      scope.errorMessage = errorMessage;
      notify(scope);
    },
    [notify],
  );

  /** Keep the board list's row for this session in step with what was saved. */
  const syncSummary = useCallback((scope: SketchSession) => {
    const idx = indexRef.current;
    if (!idx.scoped || idx.uid !== scope.uid || idx.productId !== scope.productId || idx.moduleId !== scope.moduleId) return;
    const changed = patchBoard(idx, scope.sketchKey, {
      elementCount: scope.scene.elements.filter((element) => (element as { isDeleted?: unknown }).isDeleted !== true).length,
      updatedAt: scope.updatedAt || 0,
      createdAt: scope.createdAt || 0,
      ...(scope.title ? { title: scope.title } : {}),
    });
    if (changed) writeIndex(idx);
  }, []);

  const persistLocal = useCallback((scope: SketchSession) => {
    // No module open: the device draft IS the whole save. Same format as a
    // board's device copy, different key — and never the board index, which
    // is per module (`syncSummary` is deliberately skipped).
    if (scope.draft) {
      if (scope.localTimer) { clearTimeout(scope.localTimer); scope.localTimer = null; }
      if (!scope.createdAt) scope.createdAt = Date.now();
      scope.updatedAt = Date.now();
      scope.localOk = writeLocal(scope.draftKey, scope.scene, scope.updatedAt, scope.createdAt);
      if (scope.localOk) scope.hasLocal = true;
      return;
    }
    if (!scope.scoped) return;
    if (scope.localTimer) { clearTimeout(scope.localTimer); scope.localTimer = null; }
    if (!scope.createdAt) scope.createdAt = Date.now();
    scope.updatedAt = Date.now();
    scope.localOk = writeLocal(scope.localKey, scope.scene, scope.updatedAt, scope.createdAt);
    if (scope.localOk) scope.hasLocal = true;
    syncSummary(scope);
  }, [syncSummary]);

  /** The cloud write itself — debounced by its callers, never by Firestore. */
  const persistCloud = useCallback(
    (scope: SketchSession) => {
      if (!scope.scoped || scope.inFlight) return;
      if (scope.cloudTimer) { clearTimeout(scope.cloudTimer); scope.cloudTimer = null; }
      scope.maxWaitAt = null;
      if (!scope.dirty && scope.savedRevision === scope.revision && !scope.pendingSync) return;
      // The device copy is always written first: the cloud attempt may fail,
      // and the learner's work must already be safe when it does.
      persistLocal(scope);
      const owner = cloudSketchUid(scope.uid);
      if (!owner) {
        scope.pendingSync = true;
        markOutbox(scope.outboxKey, true);
        setStatus(scope, "error", describeError({ code: "unauthenticated" }, scope.localOk));
        return;
      }
      if (!scope.remoteChecked) {
        // The cloud copy of this board has not been read yet. Writing now
        // could replace a board saved on another device (or before a slow
        // sign-in finished) with whatever is on screen — so the work waits on
        // the device, and the read's reconcile step merges + uploads it.
        scope.pendingSync = true;
        markOutbox(scope.outboxKey, true);
        if (scope.loadError) setStatus(scope, "error", scope.errorMessage ?? describeError({}, scope.localOk));
        else setStatus(scope, "pending");
        return;
      }
      const revision = scope.revision;
      const signature = scope.signature;
      scope.inFlight = true;
      setStatus(scope, "saving");
      const payload = toFirestoreSketch(scope.scene, {
        uid: owner,
        productId: scope.productId,
        moduleId: scope.moduleId,
        sketchKey: scope.sketchKey,
        title: scope.title,
        updatedAt: scope.updatedAt || Date.now(),
        createdAt: scope.createdAt || Date.now(),
        resourceId: scope.resourceId,
        resourceName: scope.resourceName,
      });
      void setDoc(doc(db, "users", owner, SKETCH_COLLECTION, scope.docId), payload)
        .then(() => {
          scope.inFlight = false;
          scope.attempts = 0;
          scope.fresh = false;
          // A stroke drawn WHILE the write was in flight keeps the board
          // dirty: the acknowledgement only covers the revision it carried.
          // This runs even for a board that was closed meanwhile — the newer
          // revision queued behind the in-flight write must still land.
          if (scope.revision === revision) {
            scope.dirty = false;
            scope.pendingSync = false;
            scope.savedRevision = revision;
            scope.savedSignature = signature;
            markOutbox(scope.outboxKey, false);
            scope.lastSavedAt = Date.now();
            setStatus(scope, "saved");
          } else {
            scope.savedRevision = revision;
            scope.savedSignature = signature;
            scope.lastSavedAt = Date.now();
            persistCloud(scope);
          }
        })
        .catch((thrown: unknown) => {
          scope.inFlight = false;
          scope.pendingSync = true;
          markOutbox(scope.outboxKey, true);
          setStatus(scope, "error", describeError(thrown, scope.localOk));
          // A closed board stops retrying here; its outbox flag makes the
          // next open push the device copy up.
          if (scope.disposed) return;
          if (scope.attempts < MAX_ATTEMPTS) {
            scope.attempts += 1;
            if (scope.retry) clearTimeout(scope.retry);
            scope.retry = setTimeout(() => {
              scope.retry = null;
              if (!scope.disposed) persistCloud(scope);
            }, Math.min(20000, 1500 * scope.attempts));
          }
        });
    },
    [persistLocal, setStatus],
  );

  // `persistCloud` is referenced from timers created before a later render,
  // so the timers reach the CURRENT implementation through a ref.
  const persistRef = useRef(persistCloud);
  persistRef.current = persistCloud;

  const scheduleSave = useCallback(
    (scope: SketchSession) => {
      if (!scope.scoped && !scope.draft) return;
      // Device mirror: a short tail, so a crash/refresh a moment after the
      // last stroke still finds the drawing on this device. It is also the
      // moment the save line says "unsaved changes" — once per burst, never
      // once per stroke.
      if (!scope.localTimer) {
        scope.localTimer = setTimeout(() => {
          scope.localTimer = null;
          if (scope.disposed) return;
          persistLocal(scope);
          if (scope.dirty && scope.status !== "saving" && scope.status !== "error") setStatus(scope, "pending");
        }, LOCAL_MIRROR_MS);
      }
      // A draft has no cloud board to write to: the device copy above is the
      // whole save, so there is nothing to debounce and nothing to retry.
      if (scope.draft) {
        scope.maxWaitAt = null;
        if (scope.cloudTimer) { clearTimeout(scope.cloudTimer); scope.cloudTimer = null; }
        return;
      }
      // Cloud: debounce the tail, but never postpone forever — a long,
      // continuous drawing checkpoints every MAX_WAIT_MS.
      const now = Date.now();
      if (scope.maxWaitAt == null) scope.maxWaitAt = now + MAX_WAIT_MS;
      const wait = Math.max(0, Math.min(debounceMs, scope.maxWaitAt - now));
      if (scope.cloudTimer) clearTimeout(scope.cloudTimer);
      scope.cloudTimer = setTimeout(() => {
        scope.cloudTimer = null;
        if (!scope.disposed) persistRef.current(scope);
      }, wait);
    },
    [debounceMs, persistLocal, setStatus],
  );

  /**
   * Fold the cloud copy (or its absence) into the session. Never loses work:
   *   · nothing drawn since the open + cloud newer (or no device copy)
   *       → the cloud board is shown;
   *   · drawn before the cloud copy was known, and the cloud copy is newer
   *     than this device's → both are MERGED (union by element id);
   *   · the device copy is newer → it is pushed up.
   */
  const reconcile = useCallback(
    (scope: SketchSession, scene: SketchScene | null, meta?: { updatedAt: number; createdAt: number; title: string }) => {
      if (scope.openTimer) { clearTimeout(scope.openTimer); scope.openTimer = null; }
      scope.remoteChecked = true;
      scope.loadError = false;
      if (meta?.title && !scope.title) scope.title = meta.title;
      if (scene) {
        // Compared with the device copy as it was when the board OPENED: a
        // stroke drawn while the read was pending writes a fresh device copy,
        // and that must not make an older device state "win" over the cloud.
        const cloudNewer = !scope.hadLocalAtOpen || (meta?.updatedAt || 0) >= (scope.localUpdatedAtOpen || 0);
        // Unsynced device work = drawn on this visit, or left in the outbox
        // by an earlier one. Only a board with NONE of it may simply be
        // replaced by the cloud copy.
        const unsynced = scope.revision > 0 || (scope.hadLocalAtOpen && scope.pendingSync);
        if (!unsynced && cloudNewer) {
          scope.scene = scene;
          scope.signature = sketchSceneSignature(scene.elements);
          scope.savedSignature = scope.signature;
          scope.updatedAt = meta?.updatedAt || scope.updatedAt;
          scope.createdAt = meta?.createdAt || scope.createdAt;
          scope.dirty = false;
          // The editor was already open on the device copy → remount it on
          // the newer scene. (Scene identity changed; layout never does this.)
          if (scope.loaded) scope.generation += 1;
        } else if (unsynced && cloudNewer) {
          scope.scene = mergeSketchScenes(scene, scope.scene);
          scope.signature = sketchSceneSignature(scope.scene.elements);
          scope.revision += 1;
          scope.dirty = true;
          if (scope.loaded) scope.generation += 1;
          scheduleSave(scope);
        } else if (scope.hasLocal || scope.revision > 0) {
          // The device copy is the newer one: push it up.
          scope.dirty = true;
          scheduleSave(scope);
        }
      } else if (scope.hasLocal || scope.revision > 0 || scope.pendingSync) {
        // Nothing in the cloud yet but work on this device → upload it.
        scope.dirty = true;
        scheduleSave(scope);
      } else {
        // An EMPTY board (nothing in the cloud, nothing on this device) adopts
        // the draft the learner drew before a lesson was open. A board with
        // work of its own is never overwritten — see `draftKey`.
        const draft = readLocal(draftKey(scope.uid, scope.productId));
        if (draft && draft.scene.elements.length > 0) {
          scope.scene = draft.scene;
          scope.signature = sketchSceneSignature(draft.scene.elements);
          scope.createdAt = draft.createdAt || scope.createdAt;
          scope.revision += 1;
          if (scope.loaded) scope.generation += 1;
          // The board's own device copy is written FIRST, so the draft can be
          // dropped without putting the strokes at risk; the upload follows.
          persistLocal(scope);
          removeLocal(draftKey(scope.uid, scope.productId));
          scope.dirty = true;
          scheduleSave(scope);
        }
      }
      markLoaded(scope);
      syncSummary(scope);
      setStatus(scope, scope.pendingSync || scope.dirty ? "pending" : "ready");
      notify(scope);
    },
    [notify, persistLocal, scheduleSave, setStatus, syncSummary],
  );

  /** Read the board's cloud copy (once the session is verifiable). */
  const readRemote = useCallback(
    (scope: SketchSession) => {
      if (!scope.scoped || scope.remoteChecked || scope.reading) return;
      const owner = cloudSketchUid(scope.uid);
      if (!owner) {
        // No verifiable session yet (cold app open restoring auth, signed
        // out, offline boot): open the device copy now and read the cloud
        // the moment the session for this learner exists.
        scope.loadError = true;
        if (!scope.stopAuthWait) {
          scope.stopAuthWait = whenSignedInAs(scope.uid, () => {
            scope.stopAuthWait = null;
            if (scope.disposed) return;
            readRemote(scope);
          });
        }
        if (!scope.loaded) {
          markLoaded(scope);
          setStatus(scope, scope.pendingSync ? "pending" : "ready");
          notify(scope);
        }
        return;
      }
      const token = ++scope.readToken;
      scope.reading = true;
      void getDoc(doc(db, "users", owner, SKETCH_COLLECTION, scope.docId))
        .then((snapshot) => {
          if (token !== scope.readToken) return;
          scope.reading = false;
          const data = snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : null;
          if (!data) {
            reconcile(scope, null);
            return;
          }
          reconcile(scope, parseSketchScene(data.scene ?? data), {
            updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
            createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
            title: sanitizeSketchTitle(data.title),
          });
        })
        .catch((thrown: unknown) => {
          if (token !== scope.readToken) return;
          scope.reading = false;
          // A failed READ must never blank the board: the device copy stays on
          // screen and the failure is named instead. Writes keep waiting for
          // a successful read (online / visibility / Retry re-read).
          scope.loadError = true;
          markLoaded(scope);
          setStatus(scope, "error", describeError(thrown, scope.localOk));
          notify(scope);
        });
    },
    [notify, reconcile, setStatus],
  );
  const readRef = useRef(readRemote);
  readRef.current = readRemote;

  // ── Lifecycle: the session owns its own flushes ────────────────────────
  // Declared BEFORE the load effect on purpose: effects run in order, so the
  // session is live (`disposed = false`) by the time the load starts.
  // A scope switch (another module / board), an unmount (tab switch /
  // leaving the player), a page hide and a return to the tab are all flush
  // opportunities; coming back online retries whatever the cloud refused.
  useEffect(() => {
    session.disposed = false;
    const flushSession = () => {
      if (session.disposed) return;
      if (session.draft) {
        // Nothing waits on the cloud here: get the last strokes onto the
        // device before the tab is hidden or goes away.
        if (session.revision > 0) persistLocal(session);
        return;
      }
      if (!session.remoteChecked) readRef.current(session);
      if (session.dirty || session.pendingSync) persistRef.current(session);
    };
    const onVisibility = () => {
      flushSession();
    };
    const onOnline = () => {
      session.attempts = 0;
      flushSession();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", flushSession);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", flushSession);
      document.removeEventListener("visibilitychange", onVisibility);
      // Final flush for the OUTGOING scope, then stop every timer it owns.
      if (session.draft) {
        if (session.revision > 0) persistLocal(session);
      } else if (session.dirty || session.pendingSync) {
        persistLocal(session);
        persistRef.current(session);
      }
      session.disposed = true;
      clearTimers(session);
    };
  }, [session, persistLocal]);

  // ── Load the board for this scope ──────────────────────────────────────
  useEffect(() => {
    if (!session.scoped) return undefined;

    if (session.fresh) {
      // A board the "+" just created: there is no cloud copy to wait for.
      // It opens at once and is REGISTERED (written) immediately, so the
      // board exists in the learner's account even if they never draw on it.
      session.remoteChecked = true;
      markLoaded(session);
      session.dirty = true;
      setStatus(session, "pending");
      notify(session);
      persistRef.current(session);
      indexRef.current.fresh.delete(session.sketchKey);
      return undefined;
    }

    // Already read and open (an effect re-run, not a new board): keep it.
    if (session.remoteChecked && session.loaded) return undefined;

    session.loaded = false;
    setStatus(session, "loading");

    // The editor must not wait on the network forever: once the grace window
    // passes, open the DEVICE copy (or a blank board) and let the cloud
    // answer later. Writes still wait for that answer (see persistCloud).
    session.openTimer = setTimeout(() => {
      session.openTimer = null;
      if (session.disposed || session.loaded) return;
      markLoaded(session);
      setStatus(session, session.pendingSync ? "pending" : "ready");
      notify(session);
    }, OPEN_GRACE_MS);

    readRemote(session);

    return () => {
      // Invalidate this run's read: a StrictMode re-run (or a scope switch)
      // must never apply a result that belongs to an earlier run.
      session.readToken += 1;
      session.reading = false;
      if (session.openTimer) { clearTimeout(session.openTimer); session.openTimer = null; }
      if (session.stopAuthWait) { session.stopAuthWait(); session.stopAuthWait = null; }
    };
  }, [session, notify, readRemote, setStatus]);

  // ── The module's board list ────────────────────────────────────────────
  useEffect(() => {
    if (!index.scoped) return undefined;
    let cancelled = false;
    let stopAuthWait: (() => void) | null = null;
    const finishList = () => {
      index.listLoading = false;
      index.version += 1;
      bump();
    };
    const run = () => {
      const owner = cloudSketchUid(index.uid);
      if (!owner) return false;
      const list = query(
        collection(db, "users", owner, SKETCH_COLLECTION),
        where("productId", "==", index.productId),
        where("moduleId", "==", index.moduleId),
      );
      void getDocs(list)
        .then((snapshot) => {
          if (cancelled) return;
          const cloudRows: SketchBoardSummary[] = [];
          snapshot.forEach((row) => {
            const data = row.data() as Record<string, unknown>;
            if (String(data.productId ?? "") !== index.productId || String(data.moduleId ?? "") !== index.moduleId) return;
            const parsed = parseSummary(data);
            if (parsed && row.id === sketchDocId(index.uid, index.productId, index.moduleId, parsed.sketchKey)) {
              cloudRows.push(parsed);
            }
          });
          // Union with the device list: a board created offline (no cloud
          // doc yet) stays listed; for a board on both, the newer row wins
          // and a title from either side is kept.
          const merged = new Map(index.boards.map((row) => [row.sketchKey, row]));
          for (const row of cloudRows) {
            const local = merged.get(row.sketchKey);
            if (!local) {
              merged.set(row.sketchKey, row);
              continue;
            }
            const newer = (row.updatedAt || 0) >= (local.updatedAt || 0) ? row : local;
            merged.set(row.sketchKey, { ...newer, title: row.title || local.title });
          }
          index.boards = withDefaultBoard([...merged.values()]);
          writeIndex(index);
          finishList();
        })
        .catch(() => {
          if (cancelled) return;
          // The device list stays; the switcher still works offline.
          finishList();
        });
      return true;
    };
    if (!run()) {
      // Signed-out / restoring: show the device list now, refresh when the
      // learner's session exists.
      index.listLoading = false;
      stopAuthWait = whenSignedInAs(index.uid, () => {
        stopAuthWait = null;
        if (!cancelled) {
          index.listLoading = true;
          run();
        }
      });
    }
    return () => {
      cancelled = true;
      stopAuthWait?.();
    };
  }, [index]);

  // ── Excalidraw's onChange ──────────────────────────────────────────────
  const updateScene = useCallback(
    (elements: unknown, appState: unknown, files: unknown, forSceneKey?: string) => {
      const scope = scopeRef.current;
      if ((!scope.scoped && !scope.draft) || !scope.loaded || scope.disposed) return;
      // An editor mounted on an OLDER scene of this board (the cloud answered
      // late, a merge happened) must never write that older scene back.
      if (typeof forSceneKey === "string" && forSceneKey !== sessionSceneKey(scope)) return;
      const rows = Array.isArray(elements) ? (elements as SketchScene["elements"]) : [];
      const signature = sketchSceneSignature(rows);
      const previous = scope.scene;
      // The live scene is always current (a flush must never write a stale
      // board), but only a REAL change arms the queue: Excalidraw fires
      // `onChange` for hovers, selections and menu opens too.
      scope.scene = {
        version: previous.version,
        elements: rows,
        appState: (appState && typeof appState === "object" ? (appState as Record<string, unknown>) : {}),
        files: (files && typeof files === "object" ? (files as SketchScene["files"]) : {}),
      };
      if (signature === scope.signature) return;
      scope.signature = signature;
      scope.revision += 1;
      if (scope.draft) {
        // No lesson open: there is no cloud board for this scene, so the
        // device mirror is the save. `dirty` stays false — nothing is waiting
        // on Firestore, and the panel says "kept on this device" out loud.
        scheduleSave(scope);
        setStatus(scope, "ready");
        return;
      }
      scope.dirty = true;
      scheduleSave(scope);
    },
    [scheduleSave, setStatus],
  );

  // ── Canvas colour ──────────────────────────────────────────────────────
  // A colour pick is an appState-only change: the element signature does
  // NOT move, so `updateScene` above would file it and schedule nothing.
  // The pick therefore marks the session dirty and queues the save itself —
  // otherwise "remember the canvas colour" would silently depend on the
  // learner drawing another stroke first.
  const setCanvasColor = useCallback(
    (color: string | null) => {
      const scope = scopeRef.current;
      writeCanvasColorPref(scope.uid, color);
      if (!scope.scoped || !scope.loaded || scope.disposed) return;
      // A chosen colour always lands on a LIGHT board (the dark theme would
      // invert it); the default lands on a dark board with the editor's own
      // default canvas. Both `theme` and `viewBackgroundColor` are
      // whitelisted appState keys, so the choice reopens with the board.
      scope.scene = {
        ...scope.scene,
        appState: {
          ...(scope.scene.appState ?? {}),
          ...(color
            ? { theme: "light", viewBackgroundColor: color }
            : { theme: "dark", viewBackgroundColor: "#ffffff" }),
        },
      };
      scope.revision += 1;
      scope.dirty = true;
      persistLocal(scope);
      scheduleSave(scope);
    },
    [persistLocal, scheduleSave],
  );

  /** The live scene, read at call time — see `getScene` on the result type. */
  const getScene = useCallback(() => scopeRef.current.scene, []);

  const flush = useCallback(() => {
    const scope = scopeRef.current;
    if (!scope.scoped) return;
    if (scope.localTimer) { clearTimeout(scope.localTimer); scope.localTimer = null; }
    if (scope.cloudTimer) { clearTimeout(scope.cloudTimer); scope.cloudTimer = null; }
    if (!scope.dirty && !scope.pendingSync) return;
    persistRef.current(scope);
  }, []);

  const retry = useCallback(() => {
    const scope = scopeRef.current;
    if (!scope.scoped || scope.disposed) return;
    scope.attempts = 0;
    if (scope.retry) { clearTimeout(scope.retry); scope.retry = null; }
    if (!scope.remoteChecked) readRef.current(scope);
    if (scope.dirty || scope.pendingSync) persistRef.current(scope);
  }, []);

  // ── Boards ─────────────────────────────────────────────────────────────
  const selectBoard = useCallback((sketchKey: string) => {
    const idx = indexRef.current;
    const key = sanitizeSketchKey(sketchKey);
    if (!idx.scoped || key === idx.activeKey || !idx.boards.some((row) => row.sketchKey === key)) return;
    // Write the outgoing board now; the lifecycle cleanup flushes it again
    // (a no-op when nothing is pending) and keeps any in-flight write alive.
    const outgoing = scopeRef.current;
    if (outgoing.scoped && (outgoing.dirty || outgoing.pendingSync)) {
      persistLocal(outgoing);
      persistRef.current(outgoing);
    }
    idx.activeKey = key;
    idx.version += 1;
    writeActiveBoard(idx);
    bump();
  }, [persistLocal]);

  const createBoard = useCallback((): string | null => {
    const idx = indexRef.current;
    if (!idx.scoped || idx.boards.length >= MAX_SKETCH_BOARDS) return null;
    const now = Date.now();
    // A double-click / repeated tap is ONE board, not two.
    if (now - idx.lastCreateAt < CREATE_GUARD_MS) return null;
    idx.lastCreateAt = now;
    const outgoing = scopeRef.current;
    if (outgoing.scoped && (outgoing.dirty || outgoing.pendingSync)) {
      persistLocal(outgoing);
      persistRef.current(outgoing);
    }
    const key = createSketchKey(idx.boards.map((row) => row.sketchKey));
    const title = nextSketchTitle(idx.boards.map((row) => row.title));
    idx.boards = withDefaultBoard([
      ...idx.boards,
      { sketchKey: key, title, elementCount: 0, updatedAt: now, createdAt: now },
    ]);
    idx.fresh.add(key);
    idx.activeKey = key;
    idx.version += 1;
    writeIndex(idx);
    writeActiveBoard(idx);
    bump();
    return key;
  }, [persistLocal]);

  /**
   * Delete ONE board (Part 1 §30) — the active Canvas — without ever touching
   * the rest of the library. The guaranteed first board (`SKETCH_DEFAULT_KEY`)
   * is never deletable, and a module that would be left with no boards refuses,
   * so the library can never be emptied by this action. The board's device
   * mirror + outbox are removed and its cloud document deleted; if the deleted
   * board was the one on screen the first board is reopened (the lifecycle
   * effect flushes the outgoing scope, so nothing in flight is lost).
   * Returns true when a board was actually removed.
   */
  const deleteBoard = useCallback((sketchKey: string): boolean => {
    const idx = indexRef.current;
    const key = sanitizeSketchKey(sketchKey);
    if (!idx.scoped) return false;
    if (key === SKETCH_DEFAULT_KEY) return false;
    if (idx.boards.length <= 1) return false;
    if (!idx.boards.some((row) => row.sketchKey === key)) return false;
    // Flush whatever the current board has pending before we mutate the index.
    const outgoing = scopeRef.current;
    if (outgoing.scoped && (outgoing.dirty || outgoing.pendingSync)) {
      persistLocal(outgoing);
      persistRef.current(outgoing);
    }
    idx.boards = withDefaultBoard(idx.boards.filter((row) => row.sketchKey !== key));
    idx.fresh.delete(key);
    idx.version += 1;
    writeIndex(idx);
    // Drop the device mirror + outbox for the deleted board only.
    try { localStorage.removeItem(localKey(idx.uid, idx.productId, idx.moduleId, key)); } catch { /* private mode */ }
    try { localStorage.removeItem(outboxKey(idx.uid, idx.productId, idx.moduleId, key)); } catch { /* private mode */ }
    // Remove the cloud copy; ownership is enforced by the Firestore rules.
    void deleteDoc(doc(db, "users", idx.uid, SKETCH_COLLECTION, sketchDocId(idx.uid, idx.productId, idx.moduleId, key))).catch(() => { /* offline: index + local are already gone */ });
    // If the deleted board was on screen, reopen the first board.
    if (key === idx.activeKey) {
      idx.activeKey = SKETCH_DEFAULT_KEY;
      writeActiveBoard(idx);
    }
    bump();
    return true;
  }, [persistLocal]);

  const generation = session.generation;
  const indexVersion = index.version;
  return useMemo<UseCourseSketchResult>(
    () => {
      const activeSummary = index.boards.find((row) => row.sketchKey === session.sketchKey);
      return {
        scene: session.scene,
        getScene,
        sceneKey: session.scoped ? `${session.docId}#${generation}` : "sketch-unscoped",
        scoped: session.scoped,
        loading: session.scoped && !session.loaded,
        status: session.status,
        errorMessage: session.errorMessage,
        pendingSync: session.pendingSync,
        deviceSaved: session.localOk,
        lastSavedAt: session.lastSavedAt,
        elementCount: session.scene.elements.length,
        updateScene,
        setCanvasColor,
        // The board's own saved THEME is authoritative: a light board reopens
        // with its saved colour, a dark board reopens dark. A board with no
        // saved theme of its own (fresh) opens with the learner's last-used
        // device colour, else dark.
        canvasColor: (() => {
          const saved = (session.scene.appState ?? {}) as Record<string, unknown>;
          const savedTheme = saved.theme;
          if (savedTheme === "light") {
            const savedColor = saved.viewBackgroundColor;
            return typeof savedColor === "string" && savedColor ? savedColor : "#ffffff";
          }
          if (savedTheme === "dark") return null;
          return readCanvasColorPref(session.uid);
        })(),
        flush,
        retry,
        boards: index.boards,
        activeBoardKey: session.sketchKey,
        activeBoardTitle: activeSummary?.title || session.title || "Canvas 1",
        boardsLoading: index.scoped && index.listLoading,
        selectBoard,
        createBoard,
        deleteBoard,
        canCreateBoard: index.scoped && index.boards.length < MAX_SKETCH_BOARDS,
      };
    },
    // `bump()` drives this recompute: every field above is read off the
    // session / index objects, which mutate in place by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, index, generation, indexVersion, session.status, session.loaded, session.pendingSync, session.errorMessage, session.localOk, updateScene, setCanvasColor, flush, retry, getScene, selectBoard, createBoard, deleteBoard],
  );
}
