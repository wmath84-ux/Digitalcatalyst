// src/course/usePerfectFreehandSketch.ts
//
// Per-student PERFECT-FREEHAND SKETCH persistence for the Course Player —
// the state half of the Quick Sketch mode (the editor itself is
// `src/components/PerfectFreehandSketch.tsx`).
//
// Storage: `users/{uid}/quickSketches/{uid}__{productId}__{moduleId}` for the
// FIRST canvas of a module and `…__{sketchKey}` for every further canvas — one
// document per learner + course + module + canvas, owner-only per
// firestore.rules. The id is the same composite shape `useCourseSketch` uses.
//
// ── Scope: the MODULE, exactly like the Excalidraw sketch ─────────────────
// Boards are scoped to the MODULE. Switching lessons inside one module keeps
// the same canvas; switching modules opens that module's own canvases.
//
// ── Many canvases per module ──────────────────────────────────────────────
// This hook owns:
//   1. the INDEX of the module's canvases (key, title, stroke count, timestamps)
//   2. the ACTIVE canvas's strokes
//
// The first canvas keeps key `main`. "+" generates a fresh unique key.
//
// ── Two layers (Firestore + localStorage) ─────────────────────────────────
// Firestore is source of truth; localStorage mirrors every save for offline.
//
// ── Data structure ────────────────────────────────────────────────────────
// Each stroke: { id, points[], color, size, isEraser }
// Stored as JSON in Firestore and localStorage.

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { auth, db } from "../../firebase";

// ── Types ─────────────────────────────────────────────────────────────────

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
}

export interface Stroke {
  id: string;
  points: StrokePoint[];
  color: string;
  size: number;
  isEraser: boolean;
}

export type QuickSketchSaveStatus = "idle" | "loading" | "ready" | "pending" | "saving" | "saved" | "error";

export interface QuickSketchBoardSummary {
  sketchKey: string;
  title: string;
  strokeCount: number;
  updatedAt: number;
  createdAt: number;
}

export interface UsePerfectFreehandSketchInput {
  uid?: string | null;
  productId?: string | number | null;
  moduleId?: string | number | null;
  resourceId?: string | null;
  resourceName?: string | null;
  debounceMs?: number;
}

export interface UsePerfectFreehandSketchResult {
  strokes: Stroke[];
  getStrokes: () => Stroke[];
  sceneKey: string;
  scoped: boolean;
  loading: boolean;
  status: QuickSketchSaveStatus;
  errorMessage: string | null;
  pendingSync: boolean;
  deviceSaved: boolean;
  lastSavedAt: number | null;
  strokeCount: number;
  updateStrokes: (strokes: Stroke[], forSceneKey?: string) => void;
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

// ── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_DEBOUNCE_MS = 1100;
const MAX_WAIT_MS = 6000;
const LOCAL_MIRROR_MS = 350;
const OPEN_GRACE_MS = 2500;
const MAX_ATTEMPTS = 8;
const CREATE_GUARD_MS = 800;
const MAX_BOARDS = 12;
const QUICK_SKETCH_COLLECTION = "quickSketches";
const DEFAULT_KEY = "main";

// ── Helpers ───────────────────────────────────────────────────────────────

const createSketchKey = () => `sk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const sanitizeSketchKey = (key: string) => key.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || createSketchKey();

const nextSketchTitle = (boards: QuickSketchBoardSummary[]) => {
  const used = new Set(boards.map((b) => b.title));
  for (let i = 1; i < 100; i++) {
    const title = `Sketch ${i}`;
    if (!used.has(title)) return title;
  }
  return `Sketch ${Date.now()}`;
};

const sketchDocId = (uid: string, productId: string, moduleId: string, sketchKey: string = DEFAULT_KEY) =>
  `${uid}__${productId}__${moduleId}${sketchKey === DEFAULT_KEY ? "" : `__${sketchKey}`}`;

const localKey = (uid: string, productId: string, moduleId: string, sketchKey: string = DEFAULT_KEY) =>
  sketchKey === DEFAULT_KEY
    ? `dc.quickSketch.v1.${uid}.${productId}.${moduleId}`
    : `dc.quickSketch.v1.${uid}.${productId}.${moduleId}.${sketchKey}`;

const outboxKey = (uid: string, productId: string, moduleId: string, sketchKey: string = DEFAULT_KEY) =>
  sketchKey === DEFAULT_KEY
    ? `dc.quickSketchOutbox.v1.${uid}.${productId}.${moduleId}`
    : `dc.quickSketchOutbox.v1.${uid}.${productId}.${moduleId}.${sketchKey}`;

const indexKey = (uid: string, productId: string, moduleId: string) =>
  `dc.quickSketchIndex.v1.${uid}.${productId}.${moduleId}`;

const activeBoardStorageKey = (uid: string, productId: string, moduleId: string) =>
  `dc.quickSketchActive.v1.${uid}.${productId}.${moduleId}`;

interface BoardDoc {
  sketchKey: string;
  title: string;
  strokes: Stroke[];
  resourceId?: string | null;
  resourceName?: string | null;
  createdAt: number;
  updatedAt: number;
}

// ── State machine ─────────────────────────────────────────────────────────

interface State {
  strokes: Stroke[];
  status: QuickSketchSaveStatus;
  errorMessage: string | null;
  pendingSync: boolean;
  deviceSaved: boolean;
  lastSavedAt: number | null;
  sceneKey: string;
  loading: boolean;
  boards: QuickSketchBoardSummary[];
  activeBoardKey: string;
  activeBoardTitle: string;
  boardsLoading: boolean;
}

type Action =
  | { type: "SET_STROKES"; strokes: Stroke[]; sceneKey: string }
  | { type: "SET_STATUS"; status: QuickSketchSaveStatus; errorMessage?: string | null }
  | { type: "SET_PENDING_SYNC"; pending: boolean }
  | { type: "SET_DEVICE_SAVED"; saved: boolean }
  | { type: "SET_LAST_SAVED"; at: number }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_BOARDS"; boards: QuickSketchBoardSummary[] }
  | { type: "SET_ACTIVE_BOARD"; key: string; title: string }
  | { type: "SET_BOARDS_LOADING"; loading: boolean };

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "SET_STROKES":
      return { ...state, strokes: action.strokes, sceneKey: action.sceneKey };
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
    default:
      return state;
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
    sceneKey: "",
    loading: true,
    boards: [],
    activeBoardKey: DEFAULT_KEY,
    activeBoardTitle: "Sketch 1",
    boardsLoading: true,
  });

  const strokesRef = useRef<Stroke[]>([]);
  const debounceTimerRef = useRef<number | null>(null);
  const maxWaitTimerRef = useRef<number | null>(null);
  const localMirrorTimerRef = useRef<number | null>(null);
  const attemptsRef = useRef(0);
  const createGuardRef = useRef(0);

  const scoped = Boolean(uid && productId && moduleId);
  const scopeKey = useMemo(() => `${uid}__${productId}__${moduleId}`, [uid, productId, moduleId]);

  // ── Load board on scope change ────────────────────────────────────────

  useEffect(() => {
    if (!scoped) {
      dispatch({ type: "SET_LOADING", loading: false });
      dispatch({ type: "SET_BOARDS_LOADING", loading: false });
      return;
    }

    const loadBoard = async () => {
      dispatch({ type: "SET_LOADING", loading: true });
      dispatch({ type: "SET_STATUS", status: "loading" });

      const activeKey = localStorage.getItem(activeBoardStorageKey(uid!, String(productId), String(moduleId))) || DEFAULT_KEY;
      const docId = sketchDocId(uid!, String(productId), String(moduleId), activeKey);

      try {
        const snap = await getDoc(doc(db, QUICK_SKETCH_COLLECTION, docId));
        if (snap.exists()) {
          const data = snap.data() as BoardDoc;
          strokesRef.current = data.strokes || [];
          dispatch({ type: "SET_STROKES", strokes: data.strokes || [], sceneKey: `${scopeKey}__${activeKey}__${Date.now()}` });
          dispatch({ type: "SET_ACTIVE_BOARD", key: activeKey, title: data.title || "Sketch 1" });
          dispatch({ type: "SET_STATUS", status: "ready" });
        } else {
          // Try localStorage fallback
          const localData = localStorage.getItem(localKey(uid!, String(productId), String(moduleId), activeKey));
          if (localData) {
            const parsed = JSON.parse(localData) as BoardDoc;
            strokesRef.current = parsed.strokes || [];
            dispatch({ type: "SET_STROKES", strokes: parsed.strokes || [], sceneKey: `${scopeKey}__${activeKey}__${Date.now()}` });
            dispatch({ type: "SET_ACTIVE_BOARD", key: activeKey, title: parsed.title || "Sketch 1" });
            dispatch({ type: "SET_STATUS", status: "ready" });
            dispatch({ type: "SET_PENDING_SYNC", pending: true });
          } else {
            strokesRef.current = [];
            dispatch({ type: "SET_STROKES", strokes: [], sceneKey: `${scopeKey}__${activeKey}__${Date.now()}` });
            dispatch({ type: "SET_ACTIVE_BOARD", key: activeKey, title: "Sketch 1" });
            dispatch({ type: "SET_STATUS", status: "ready" });
          }
        }
      } catch (err) {
        console.error("Failed to load quick sketch:", err);
        dispatch({ type: "SET_STATUS", status: "error", errorMessage: "Failed to load sketch" });
      } finally {
        dispatch({ type: "SET_LOADING", loading: false });
      }
    };

    loadBoard();
  }, [scopeKey, scoped, uid, productId, moduleId]);

  // ── Load board index ──────────────────────────────────────────────────

  useEffect(() => {
    if (!scoped) return;

    const loadIndex = async () => {
      dispatch({ type: "SET_BOARDS_LOADING", loading: true });

      try {
        const q = query(
          collection(db, QUICK_SKETCH_COLLECTION),
          where("uid", "==", uid),
          where("productId", "==", String(productId)),
          where("moduleId", "==", String(moduleId))
        );
        const snap = await getDocs(q);
        const boards: QuickSketchBoardSummary[] = [];
        snap.forEach((doc) => {
          const data = doc.data() as BoardDoc & { uid: string; productId: string; moduleId: string };
          boards.push({
            sketchKey: data.sketchKey,
            title: data.title,
            strokeCount: data.strokes?.length || 0,
            updatedAt: data.updatedAt,
            createdAt: data.createdAt,
          });
        });
        boards.sort((a, b) => a.createdAt - b.createdAt);
        dispatch({ type: "SET_BOARDS", boards });

        // Mirror to localStorage
        localStorage.setItem(indexKey(uid!, String(productId), String(moduleId)), JSON.stringify(boards));
      } catch (err) {
        console.error("Failed to load board index:", err);
        // Try localStorage fallback
        const localIndex = localStorage.getItem(indexKey(uid!, String(productId), String(moduleId)));
        if (localIndex) {
          dispatch({ type: "SET_BOARDS", boards: JSON.parse(localIndex) });
        }
      } finally {
        dispatch({ type: "SET_BOARDS_LOADING", loading: false });
      }
    };

    loadIndex();
  }, [scopeKey, scoped, uid, productId, moduleId]);

  // ── Save logic ────────────────────────────────────────────────────────

  const saveToFirestore = useCallback(async () => {
    if (!scoped) return;

    const docId = sketchDocId(uid!, String(productId), String(moduleId), state.activeBoardKey);
    const board: BoardDoc & { uid: string; productId: string; moduleId: string } = {
      uid: uid!,
      productId: String(productId),
      moduleId: String(moduleId),
      sketchKey: state.activeBoardKey,
      title: state.activeBoardTitle,
      strokes: strokesRef.current,
      resourceId: resourceId || null,
      resourceName: resourceName || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    dispatch({ type: "SET_STATUS", status: "saving" });

    try {
      await setDoc(doc(db, QUICK_SKETCH_COLLECTION, docId), board);
      dispatch({ type: "SET_STATUS", status: "saved" });
      dispatch({ type: "SET_PENDING_SYNC", pending: false });
      dispatch({ type: "SET_LAST_SAVED", at: Date.now() });
      attemptsRef.current = 0;

      // Clear outbox
      localStorage.removeItem(outboxKey(uid!, String(productId), String(moduleId), state.activeBoardKey));
    } catch (err) {
      console.error("Failed to save quick sketch:", err);
      attemptsRef.current++;
      if (attemptsRef.current >= MAX_ATTEMPTS) {
        dispatch({ type: "SET_STATUS", status: "error", errorMessage: "Failed to save sketch" });
      } else {
        dispatch({ type: "SET_STATUS", status: "pending" });
        dispatch({ type: "SET_PENDING_SYNC", pending: true });
      }
    }
  }, [scoped, uid, productId, moduleId, state.activeBoardKey, state.activeBoardTitle, resourceId, resourceName]);

  const saveToLocalStorage = useCallback(() => {
    if (!scoped) return;

    const board: BoardDoc = {
      sketchKey: state.activeBoardKey,
      title: state.activeBoardTitle,
      strokes: strokesRef.current,
      resourceId: resourceId || null,
      resourceName: resourceName || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      localStorage.setItem(
        localKey(uid!, String(productId), String(moduleId), state.activeBoardKey),
        JSON.stringify(board)
      );
      dispatch({ type: "SET_DEVICE_SAVED", saved: true });
    } catch (err) {
      console.error("Failed to save to localStorage:", err);
      dispatch({ type: "SET_DEVICE_SAVED", saved: false });
    }
  }, [scoped, uid, productId, moduleId, state.activeBoardKey, state.activeBoardTitle, resourceId, resourceName]);

  // ── Update strokes ────────────────────────────────────────────────────

  const updateStrokes = useCallback(
    (strokes: Stroke[], forSceneKey?: string) => {
      if (forSceneKey && forSceneKey !== state.sceneKey) return;

      strokesRef.current = strokes;
      dispatch({ type: "SET_STATUS", status: "pending" });
      dispatch({ type: "SET_PENDING_SYNC", pending: true });

      // Debounce Firestore write
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = window.setTimeout(() => {
        saveToFirestore();
      }, debounceMs);

      // Max wait for continuous drawing
      if (!maxWaitTimerRef.current) {
        maxWaitTimerRef.current = window.setTimeout(() => {
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          saveToFirestore();
          maxWaitTimerRef.current = null;
        }, MAX_WAIT_MS);
      }

      // Local mirror (faster)
      if (localMirrorTimerRef.current) clearTimeout(localMirrorTimerRef.current);
      localMirrorTimerRef.current = window.setTimeout(() => {
        saveToLocalStorage();
      }, LOCAL_MIRROR_MS);
    },
    [state.sceneKey, debounceMs, saveToFirestore, saveToLocalStorage]
  );

  // ── Board management ──────────────────────────────────────────────────

  const selectBoard = useCallback(
    async (sketchKey: string) => {
      if (!scoped || sketchKey === state.activeBoardKey) return;

      // Flush current board
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (maxWaitTimerRef.current) clearTimeout(maxWaitTimerRef.current);
      await saveToFirestore();
      saveToLocalStorage();

      // Load new board
      dispatch({ type: "SET_LOADING", loading: true });
      const docId = sketchDocId(uid!, String(productId), String(moduleId), sketchKey);

      try {
        const snap = await getDoc(doc(db, QUICK_SKETCH_COLLECTION, docId));
        if (snap.exists()) {
          const data = snap.data() as BoardDoc;
          strokesRef.current = data.strokes || [];
          dispatch({ type: "SET_STROKES", strokes: data.strokes || [], sceneKey: `${scopeKey}__${sketchKey}__${Date.now()}` });
          dispatch({ type: "SET_ACTIVE_BOARD", key: sketchKey, title: data.title });
          dispatch({ type: "SET_STATUS", status: "ready" });
        }
        localStorage.setItem(activeBoardStorageKey(uid!, String(productId), String(moduleId)), sketchKey);
      } catch (err) {
        console.error("Failed to load board:", err);
        dispatch({ type: "SET_STATUS", status: "error", errorMessage: "Failed to load sketch" });
      } finally {
        dispatch({ type: "SET_LOADING", loading: false });
      }
    },
    [scoped, state.activeBoardKey, uid, productId, moduleId, scopeKey, saveToFirestore, saveToLocalStorage]
  );

  const createBoard = useCallback(() => {
    if (!scoped || state.boards.length >= MAX_BOARDS) return null;
    if (Date.now() - createGuardRef.current < CREATE_GUARD_MS) return null;
    createGuardRef.current = Date.now();

    const newKey = sanitizeSketchKey(createSketchKey());
    const newTitle = nextSketchTitle(state.boards);

    const newBoard: QuickSketchBoardSummary = {
      sketchKey: newKey,
      title: newTitle,
      strokeCount: 0,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    };

    dispatch({ type: "SET_BOARDS", boards: [...state.boards, newBoard] });
    selectBoard(newKey);
    return newKey;
  }, [scoped, state.boards, selectBoard]);

  const deleteBoard = useCallback(
    async (sketchKey: string) => {
      if (!scoped || sketchKey === DEFAULT_KEY || state.boards.length <= 1) return false;

      try {
        const docId = sketchDocId(uid!, String(productId), String(moduleId), sketchKey);
        await deleteDoc(doc(db, QUICK_SKETCH_COLLECTION, docId));
        localStorage.removeItem(localKey(uid!, String(productId), String(moduleId), sketchKey));

        const newBoards = state.boards.filter((b) => b.sketchKey !== sketchKey);
        dispatch({ type: "SET_BOARDS", boards: newBoards });

        if (state.activeBoardKey === sketchKey) {
          selectBoard(newBoards[0].sketchKey);
        }

        return true;
      } catch (err) {
        console.error("Failed to delete board:", err);
        return false;
      }
    },
    [scoped, uid, productId, moduleId, state.boards, state.activeBoardKey, selectBoard]
  );

  // ── Flush & retry ─────────────────────────────────────────────────────

  const flush = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (maxWaitTimerRef.current) clearTimeout(maxWaitTimerRef.current);
    saveToFirestore();
    saveToLocalStorage();
  }, [saveToFirestore, saveToLocalStorage]);

  const retry = useCallback(() => {
    attemptsRef.current = 0;
    saveToFirestore();
  }, [saveToFirestore]);

  // ── Cleanup on unmount ────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      flush();
    };
  }, [flush]);

  // ── Return API ────────────────────────────────────────────────────────

  return {
    strokes: state.strokes,
    getStrokes: () => strokesRef.current,
    sceneKey: state.sceneKey,
    scoped,
    loading: state.loading,
    status: state.status,
    errorMessage: state.errorMessage,
    pendingSync: state.pendingSync,
    deviceSaved: state.deviceSaved,
    lastSavedAt: state.lastSavedAt,
    strokeCount: state.strokes.length,
    updateStrokes,
    flush,
    retry,
    boards: state.boards,
    activeBoardKey: state.activeBoardKey,
    activeBoardTitle: state.activeBoardTitle,
    boardsLoading: state.boardsLoading,
    selectBoard,
    createBoard,
    canCreateBoard: scoped && state.boards.length < MAX_BOARDS,
    deleteBoard,
  };
}
