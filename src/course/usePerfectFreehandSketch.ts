// src/course/usePerfectFreehandSketch.ts
//
// Per-student QUICK SKETCH persistence for the Course Player — the state half
// of the Sketch tab's freehand canvas (the editor itself is
// `src/components/PerfectFreehandSketch.tsx`).
//
// Storage: `users/{uid}/quickSketches/{uid}__{productId}__{moduleId}` for the
// FIRST canvas of a module and `…__{sketchKey}` for every further canvas — one
// document per learner + course + module + canvas, owner-only per
// firestore.rules, whose `quickSketches` block mirrors this file's numbers. The
// id is the same composite shape `useCourseSketch` (the Excalidraw boards) uses,
// and both live under `users/{uid}` so one learner can never write into
// another's namespace.
//
// ── Scope: the MODULE, exactly like the Excalidraw sketch ─────────────────
// Canvases are scoped to the MODULE. Switching lessons inside one module keeps
// the same canvas; switching modules opens that module's own canvases.
//
// ── Many canvases per module ──────────────────────────────────────────────
// This hook owns:
//   1. the INDEX of the module's canvases (key, title, stroke count, stamps)
//   2. the ACTIVE canvas's strokes
//
// The first canvas keeps key `main`. "New canvas" generates a fresh unique key
// (never `main`, never an existing key), so a new canvas can never overwrite a
// saved one, and which canvas was open is remembered per module.
//
// ── Two layers, deliberately (the Excalidraw boards' pattern) ─────────────
//   1. Firestore is the source of truth, so the same learner sees the same
//      canvases on every device.
//   2. localStorage mirrors every save (and the canvas index). A refused or
//      failed write must never strand a drawing: the mirror is read back on the
//      next open and pushed up when the cloud answers again.
//
// ── Why a stroke can never vanish ─────────────────────────────────────────
// `updateStrokes()` puts the new list in React STATE (and the ref the debounce
// reads). It used to only touch the ref, so the canvas — which renders the
// hook's state — kept drawing the list from before the stroke was finished,
// and every stroke disappeared the moment the learner lifted their finger.
// With the list in state, a stroke is on screen the instant it is written.

import { useCallback, useEffect, useReducer, useRef } from "react";
import { collection, deleteDoc, doc, getDocs, getDoc, query, setDoc, where } from "firebase/firestore";
import { db } from "../../firebase";
import {
  MAX_QUICK_SKETCH_BOARDS,
  MAX_QUICK_SKETCH_STROKES,
  QUICK_SKETCH_COLLECTION,
  QUICK_SKETCH_DEFAULT_KEY,
  createQuickSketchKey,
  nextQuickSketchTitle,
  quickSketchActiveKey,
  quickSketchDocId,
  quickSketchIndexKey,
  quickSketchLocalKey,
  quickSketchStrokesFrom,
  sanitizeQuickSketchKey,
  toFirestoreQuickSketch,
  type QuickSketchBoardDoc,
  type QuickSketchBoardSummary,
  type QuickSketchStroke,
} from "../utils/quickSketch";

/** `pending` = edited, not written yet; `saving` = a write is in flight;
 *  `saved` = the cloud acknowledged the latest edit; `error` = the last attempt
 *  failed (the device copy still holds the work — see `deviceSaved`). */
export type QuickSketchSaveStatus = "idle" | "loading" | "ready" | "pending" | "saving" | "saved" | "error";

export interface UsePerfectFreehandSketchInput {
  uid?: string | null;
  productId?: string | number | null;
  /** The module the canvas belongs to; canvases are scoped to it. */
  moduleId?: string | number | null;
  resourceId?: string | null;
  resourceName?: string | null;
  /** Milliseconds of quiet before a pending edit reaches Firestore. */
  debounceMs?: number;
}

export interface UsePerfectFreehandSketchResult {
  strokes: QuickSketchStroke[];
  /** The live list, read at call time (never a stale render's copy). */
  getStrokes: () => QuickSketchStroke[];
  scoped: boolean;
  loading: boolean;
  status: QuickSketchSaveStatus;
  errorMessage: string | null;
  pendingSync: boolean;
  /** False when even the device copy could not be written (storage full). */
  deviceSaved: boolean;
  lastSavedAt: number | null;
  /** Pass a new list; it is drawn immediately and saved when the learner pauses. */
  updateStrokes: (strokes: QuickSketchStroke[]) => void;
  flush: () => void;
  retry: () => void;
  boards: QuickSketchBoardSummary[];
  activeBoardKey: string;
  activeBoardTitle: string;
  boardsLoading: boolean;
  selectBoard: (sketchKey: string) => void;
  createBoard: () => string | null;
  canCreateBoard: boolean;
  deleteBoard: (sketchKey: string) => boolean;
}

const DEFAULT_DEBOUNCE_MS = 1100;
const MAX_WAIT_MS = 6000;
const LOCAL_MIRROR_MS = 350;
const MAX_ATTEMPTS = 8;
const CREATE_GUARD_MS = 800;

// ── State machine ─────────────────────────────────────────────────────────

interface State {
  strokes: QuickSketchStroke[];
  status: QuickSketchSaveStatus;
  errorMessage: string | null;
  pendingSync: boolean;
  deviceSaved: boolean;
  lastSavedAt: number | null;
  loading: boolean;
  boards: QuickSketchBoardSummary[];
  activeBoardKey: string;
  activeBoardTitle: string;
  boardsLoading: boolean;
}

type Action =
  | { type: "SET_STROKES"; strokes: QuickSketchStroke[] }
  | { type: "SET_STATUS"; status: QuickSketchSaveStatus; errorMessage?: string | null }
  | { type: "SET_PENDING_SYNC"; pending: boolean }
  | { type: "SET_DEVICE_SAVED"; saved: boolean }
  | { type: "SET_LAST_SAVED"; at: number }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_BOARDS"; boards: QuickSketchBoardSummary[] }
  | { type: "SET_ACTIVE_BOARD"; key: string; title: string }
  | { type: "SET_BOARDS_LOADING"; loading: boolean }
  | { type: "SET_BOARD_STATS"; key: string; strokeCount: number; updatedAt: number };

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "SET_STROKES":
      return { ...state, strokes: action.strokes };
    case "SET_STATUS":
      return { ...state, status: action.status, errorMessage: action.errorMessage ?? null };
    case "SET_PENDING_SYNC":
      return { ...state, pendingSync: action.pending };
    case "SET_DEVICE_SAVED":
      return { ...state, deviceSaved: action.saved };
    case "SET_LAST_SAVED":
      return { ...state, lastSavedAt: action.at };
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "SET_BOARDS":
      return { ...state, boards: action.boards };
    case "SET_ACTIVE_BOARD":
      return { ...state, activeBoardKey: action.key, activeBoardTitle: action.title };
    case "SET_BOARDS_LOADING":
      return { ...state, boardsLoading: action.loading };
    case "SET_BOARD_STATS": {
      const boards = state.boards.map((board) =>
        board.sketchKey === action.key
          ? { ...board, strokeCount: action.strokeCount, updatedAt: action.updatedAt }
          : board,
      );
      return { ...state, boards };
    }
    default:
      return state;
  }
};

/** Which canvas of the module was open last time (the first one by default). */
const rememberedBoardKey = (uid: string, productId: string, moduleId: string): string => {
  try {
    return localStorage.getItem(quickSketchActiveKey(uid, productId, moduleId)) || QUICK_SKETCH_DEFAULT_KEY;
  } catch {
    return QUICK_SKETCH_DEFAULT_KEY;
  }
};

const readLocalBoard = (key: string): QuickSketchBoardDoc | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as QuickSketchBoardDoc) : null;
  } catch {
    return null;
  }
};

// ── Hook ──────────────────────────────────────────────────────────────────

export function usePerfectFreehandSketch(input: UsePerfectFreehandSketchInput): UsePerfectFreehandSketchResult {
  const { uid, productId, moduleId, resourceId, resourceName, debounceMs = DEFAULT_DEBOUNCE_MS } = input;

  const [state, dispatch] = useReducer(reducer, {
    strokes: [],
    status: "idle",
    errorMessage: null,
    pendingSync: false,
    deviceSaved: true,
    lastSavedAt: null,
    loading: true,
    boards: [],
    activeBoardKey: QUICK_SKETCH_DEFAULT_KEY,
    activeBoardTitle: "Sketch 1",
    boardsLoading: true,
  });

  /** The list the debounced save writes — the live canvas's own truth. */
  const strokesRef = useRef<QuickSketchStroke[]>([]);
  /** The active canvas's own identity + creation time (kept across saves). */
  const boardRef = useRef<{ key: string; title: string; createdAt: number }>({
    key: QUICK_SKETCH_DEFAULT_KEY,
    title: "Sketch 1",
    createdAt: 0,
  });
  const scopeRef = useRef<string>("");
  const debounceTimerRef = useRef<number | null>(null);
  const maxWaitTimerRef = useRef<number | null>(null);
  const localMirrorTimerRef = useRef<number | null>(null);
  const attemptsRef = useRef(0);
  const createGuardRef = useRef(0);

  const scoped = Boolean(uid && productId && moduleId);
  const scopeKey = `${uid || ""}__${String(productId ?? "")}__${String(moduleId ?? "")}`;

  const clearTimers = useCallback(() => {
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    if (maxWaitTimerRef.current) window.clearTimeout(maxWaitTimerRef.current);
    if (localMirrorTimerRef.current) window.clearTimeout(localMirrorTimerRef.current);
    debounceTimerRef.current = null;
    maxWaitTimerRef.current = null;
    localMirrorTimerRef.current = null;
  }, []);

  // ── The board document ────────────────────────────────────────────────

  const boardDocument = useCallback((): QuickSketchBoardDoc => {
    const now = Date.now();
    return toFirestoreQuickSketch({
      uid: uid || "",
      productId: String(productId ?? ""),
      moduleId: String(moduleId ?? ""),
      sketchKey: boardRef.current.key,
      title: boardRef.current.title,
      strokes: strokesRef.current,
      resourceId: resourceId || null,
      resourceName: resourceName || null,
      createdAt: boardRef.current.createdAt || now,
      updatedAt: now,
    });
  }, [moduleId, productId, resourceId, resourceName, uid]);

  // ── Save: Firestore (debounced) + the device mirror ───────────────────

  const saveToLocalStorage = useCallback(() => {
    if (!scoped) return;
    try {
      const board = boardDocument();
      localStorage.setItem(quickSketchLocalKey(uid!, board.productId, board.moduleId, board.sketchKey), JSON.stringify(board));
      dispatch({ type: "SET_DEVICE_SAVED", saved: true });
    } catch {
      dispatch({ type: "SET_DEVICE_SAVED", saved: false });
    }
  }, [boardDocument, moduleId, productId, scoped, uid]);

  const saveToFirestore = useCallback(async () => {
    if (!scoped) return;
    const board = boardDocument();
    dispatch({ type: "SET_STATUS", status: "saving" });
    try {
      // `users/{uid}/quickSketches/…`, exactly like the Excalidraw boards:
      // inside the learner's own namespace, and covered by the matching
      // `match /quickSketches/{sketchId}` block in firestore.rules.
      await setDoc(
        doc(db, "users", board.uid, QUICK_SKETCH_COLLECTION, quickSketchDocId(board.uid, board.productId, board.moduleId, board.sketchKey)),
        board,
      );
      dispatch({ type: "SET_STATUS", status: "saved" });
      dispatch({ type: "SET_PENDING_SYNC", pending: false });
      dispatch({ type: "SET_LAST_SAVED", at: Date.now() });
      dispatch({ type: "SET_BOARD_STATS", key: board.sketchKey, strokeCount: board.strokes.length, updatedAt: board.updatedAt });
      attemptsRef.current = 0;
    } catch {
      attemptsRef.current += 1;
      if (attemptsRef.current >= MAX_ATTEMPTS) {
        dispatch({ type: "SET_STATUS", status: "error", errorMessage: "Failed to save your drawing" });
      } else {
        dispatch({ type: "SET_STATUS", status: "pending" });
        dispatch({ type: "SET_PENDING_SYNC", pending: true });
      }
    }
  }, [boardDocument, moduleId, productId, scoped, uid]);

  // ── Opening a canvas ──────────────────────────────────────────────────

  const openBoard = useCallback(
    async (sketchKey: string, options: { flushCurrent?: boolean } = {}) => {
      if (!scoped) return;
      if (options.flushCurrent !== false && sketchKey !== boardRef.current.key) {
        clearTimers();
        await saveToFirestore();
        saveToLocalStorage();
      }
      dispatch({ type: "SET_LOADING", loading: true });
      const product = String(productId);
      const module = String(moduleId);
      const localKey = quickSketchLocalKey(uid!, product, module, sketchKey);
      try {
        const snap = await getDoc(
          doc(db, "users", uid!, QUICK_SKETCH_COLLECTION, quickSketchDocId(uid!, product, module, sketchKey)),
        );
        const cloud = snap.exists() ? (snap.data() as QuickSketchBoardDoc) : null;
        const local = readLocalBoard(localKey);
        // The NEWER of the two wins (the cloud on a tie): a save that never
        // reached Firestore is still on the device, and reopening the canvas
        // must show the work the learner actually did.
        const source =
          cloud && local
            ? (local.updatedAt || 0) > (cloud.updatedAt || 0)
              ? local
              : cloud
            : cloud || local;
        const strokes = quickSketchStrokesFrom(source?.strokes);
        strokesRef.current = strokes;
        boardRef.current = {
          key: sketchKey,
          title: source?.title || (sketchKey === QUICK_SKETCH_DEFAULT_KEY ? "Sketch 1" : sketchKey),
          createdAt: source?.createdAt || Date.now(),
        };
        dispatch({ type: "SET_STROKES", strokes });
        dispatch({ type: "SET_ACTIVE_BOARD", key: boardRef.current.key, title: boardRef.current.title });
        dispatch({ type: "SET_STATUS", status: "ready" });
        dispatch({ type: "SET_PENDING_SYNC", pending: Boolean(source === local && local) });
        dispatch({ type: "SET_BOARD_STATS", key: sketchKey, strokeCount: strokes.length, updatedAt: source?.updatedAt || Date.now() });
        try {
          localStorage.setItem(quickSketchActiveKey(uid!, product, module), sketchKey);
        } catch {
          // A device that cannot remember which canvas was open still opens
          // the first one — the drawing itself is never at risk.
        }
      } catch {
        // A refused READ must never blank the canvas: the device copy stands.
        const local = readLocalBoard(localKey);
        const strokes = quickSketchStrokesFrom(local?.strokes);
        strokesRef.current = strokes;
        boardRef.current = {
          key: sketchKey,
          title: local?.title || "Sketch 1",
          createdAt: local?.createdAt || Date.now(),
        };
        dispatch({ type: "SET_STROKES", strokes });
        dispatch({ type: "SET_ACTIVE_BOARD", key: boardRef.current.key, title: boardRef.current.title });
        dispatch({ type: "SET_STATUS", status: local ? "pending" : "error", errorMessage: local ? null : "Failed to load your drawing" });
      } finally {
        dispatch({ type: "SET_LOADING", loading: false });
      }
    },
    [clearTimers, moduleId, productId, saveToFirestore, saveToLocalStorage, scoped, uid],
  );

  // ── Opening the module: the remembered canvas, then its index ─────────
  // ONE effect owns both, in this order, so the canvas the learner sees is
  // already the remembered one when the switcher's list arrives, and a scope
  // change can never race itself.
  useEffect(() => {
    if (!scoped) {
      scopeRef.current = "";
      dispatch({ type: "SET_LOADING", loading: false });
      dispatch({ type: "SET_BOARDS_LOADING", loading: false });
      dispatch({ type: "SET_STATUS", status: "idle" });
      return undefined;
    }
    if (scopeRef.current === scopeKey) return undefined;
    scopeRef.current = scopeKey;
    clearTimers();
    let cancelled = false;
    const product = String(productId);
    const module = String(moduleId);

    const loadIndex = async () => {
      dispatch({ type: "SET_BOARDS_LOADING", loading: true });
      try {
        const snap = await getDocs(
          query(
            collection(db, "users", uid!, QUICK_SKETCH_COLLECTION),
            where("productId", "==", product),
            where("moduleId", "==", module),
          ),
        );
        if (cancelled) return;
        const boards: QuickSketchBoardSummary[] = [];
        snap.forEach((row) => {
          const data = row.data() as QuickSketchBoardDoc;
          boards.push({
            sketchKey: data.sketchKey,
            title: data.title,
            strokeCount: Array.isArray(data.strokes) ? data.strokes.length : 0,
            updatedAt: data.updatedAt || 0,
            createdAt: data.createdAt || 0,
          });
        });
        boards.sort((a, b) => a.createdAt - b.createdAt);
        if (!boards.some((board) => board.sketchKey === boardRef.current.key)) {
          boards.unshift({
            sketchKey: boardRef.current.key,
            title: boardRef.current.title,
            strokeCount: strokesRef.current.length,
            updatedAt: Date.now(),
            createdAt: boardRef.current.createdAt || Date.now(),
          });
        }
        dispatch({ type: "SET_BOARDS", boards });
        try {
          localStorage.setItem(quickSketchIndexKey(uid!, product, module), JSON.stringify(boards));
        } catch {
          // Mirror only.
        }
      } catch {
        if (cancelled) return;
        try {
          const raw = localStorage.getItem(quickSketchIndexKey(uid!, product, module));
          const boards = raw ? (JSON.parse(raw) as QuickSketchBoardSummary[]) : [];
          if (boards.length > 0) dispatch({ type: "SET_BOARDS", boards });
        } catch {
          // The canvas still draws; only the switcher's list is thin.
        }
      } finally {
        if (!cancelled) dispatch({ type: "SET_BOARDS_LOADING", loading: false });
      }
    };

    void openBoard(rememberedBoardKey(uid!, product, module)).then(() => {
      if (!cancelled) void loadIndex();
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, scoped]);

  // ── Drawing: the one write path ───────────────────────────────────────

  const updateStrokes = useCallback(
    (strokes: QuickSketchStroke[]) => {
      // Identity is preserved when the list is already within the ceiling: the
      // canvas compares the array it wrote with the array this hook renders (to
      // tell its own write from a board load), and a fresh array every time
      // would make every write look like a load.
      const next = strokes.length > MAX_QUICK_SKETCH_STROKES ? strokes.slice(0, MAX_QUICK_SKETCH_STROKES) : strokes;
      strokesRef.current = next;
      // THE fix: the canvas renders this state, so the list it draws always
      // contains what the learner just drew.
      dispatch({ type: "SET_STROKES", strokes: next });
      // Signed out / no module open: the drawing still happens on screen, it
      // just has nowhere to go yet (the panel says so out loud).
      if (!scoped) return;
      dispatch({ type: "SET_STATUS", status: "pending" });
      dispatch({ type: "SET_PENDING_SYNC", pending: true });

      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = window.setTimeout(() => {
        void saveToFirestore();
      }, debounceMs);

      // A long continuous drawing still checkpoints.
      if (!maxWaitTimerRef.current) {
        maxWaitTimerRef.current = window.setTimeout(() => {
          maxWaitTimerRef.current = null;
          if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
          void saveToFirestore();
        }, MAX_WAIT_MS);
      }

      // The device mirror is faster, and it is what survives a failed write.
      if (localMirrorTimerRef.current) window.clearTimeout(localMirrorTimerRef.current);
      localMirrorTimerRef.current = window.setTimeout(() => {
        saveToLocalStorage();
      }, LOCAL_MIRROR_MS);
    },
    [debounceMs, saveToFirestore, saveToLocalStorage, scoped],
  );

  // ── Canvases ──────────────────────────────────────────────────────────

  const selectBoard = useCallback(
    (sketchKey: string) => {
      if (!scoped || sketchKey === boardRef.current.key) return;
      void openBoard(sketchKey);
    },
    [openBoard, scoped],
  );

  const createBoard = useCallback(() => {
    if (!scoped || state.boards.length >= MAX_QUICK_SKETCH_BOARDS) return null;
    if (Date.now() - createGuardRef.current < CREATE_GUARD_MS) return null;
    createGuardRef.current = Date.now();
    const key = sanitizeQuickSketchKey(createQuickSketchKey());
    const title = nextQuickSketchTitle(state.boards);
    const stamp = Date.now();
    dispatch({
      type: "SET_BOARDS",
      boards: [...state.boards, { sketchKey: key, title, strokeCount: 0, updatedAt: stamp, createdAt: stamp }],
    });
    // A brand-new canvas is born empty: no read, no flush of the old one.
    strokesRef.current = [];
    boardRef.current = { key, title, createdAt: stamp };
    dispatch({ type: "SET_STROKES", strokes: [] });
    dispatch({ type: "SET_ACTIVE_BOARD", key, title });
    dispatch({ type: "SET_STATUS", status: "pending" });
    dispatch({ type: "SET_PENDING_SYNC", pending: true });
    try {
      localStorage.setItem(quickSketchActiveKey(uid!, String(productId), String(moduleId)), key);
    } catch {
      // Mirror only.
    }
    void saveToFirestore();
    return key;
  }, [moduleId, productId, saveToFirestore, scoped, state.boards, uid]);

  const deleteBoard = useCallback(
    (sketchKey: string) => {
      if (!scoped || sketchKey === QUICK_SKETCH_DEFAULT_KEY || state.boards.length <= 1) return false;
      const product = String(productId);
      const module = String(moduleId);
      try {
        localStorage.removeItem(quickSketchLocalKey(uid!, product, module, sketchKey));
      } catch {
        // The cloud delete below is the real one.
      }
      const remaining = state.boards.filter((board) => board.sketchKey !== sketchKey);
      dispatch({ type: "SET_BOARDS", boards: remaining });
      void deleteDoc(doc(db, "users", uid!, QUICK_SKETCH_COLLECTION, quickSketchDocId(uid!, product, module, sketchKey))).catch(() => {
        // A failed cloud delete is reported by the switcher the next time the
        // module's index loads; the local canvas is already gone.
      });
      if (boardRef.current.key === sketchKey) {
        void openBoard(remaining[0].sketchKey, { flushCurrent: false });
      }
      return true;
    },
    [moduleId, openBoard, productId, scoped, state.boards, uid],
  );

  // ── Flush / retry / teardown ──────────────────────────────────────────

  /** Everything pending, now — used by "Retry" and on the way out. */
  const flush = useCallback(() => {
    if (!scoped) return;
    clearTimers();
    saveToLocalStorage();
    void saveToFirestore();
  }, [clearTimers, saveToFirestore, saveToLocalStorage, scoped]);

  const retry = useCallback(() => {
    attemptsRef.current = 0;
    flush();
  }, [flush]);

  /**
   * Leaving the canvas (a tab switch, the player unmounting) is not a reason
   * to lose the last few seconds of drawing: whatever is still in the
   * debounce has already been mirrored on the device and is now pushed too.
   */
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  useEffect(
    () => () => {
      flushRef.current();
    },
    [],
  );

  return {
    strokes: state.strokes,
    getStrokes: () => strokesRef.current,
    scoped,
    loading: state.loading,
    status: state.status,
    errorMessage: state.errorMessage,
    pendingSync: state.pendingSync,
    deviceSaved: state.deviceSaved,
    lastSavedAt: state.lastSavedAt,
    updateStrokes,
    flush,
    retry,
    boards: state.boards,
    activeBoardKey: state.activeBoardKey,
    activeBoardTitle: state.activeBoardTitle,
    boardsLoading: state.boardsLoading,
    selectBoard,
    createBoard,
    canCreateBoard: scoped && state.boards.length < MAX_QUICK_SKETCH_BOARDS,
    deleteBoard,
  };
}

export default usePerfectFreehandSketch;
