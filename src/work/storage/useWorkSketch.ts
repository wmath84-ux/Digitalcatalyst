import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_SKETCH_BOARDS,
  SKETCH_DEFAULT_KEY,
  createSketchKey,
  createSketchScene,
  nextSketchTitle,
  parseSketchScene,
  sanitizeSketchAppState,
  sanitizeSketchKey,
  sanitizeSketchTitle,
  sketchSceneSignature,
  type SketchScene,
} from "../../../utils/sketchScene.js";
import type { SketchBoardSummary, SketchSaveStatus } from "../../course/useCourseSketch";
import {
  readWorkSketchScene,
  removeWorkSketchScene,
  workSketchSceneKey,
  writeWorkSketchScene,
} from "./workSketchDb";
import { WORK_DEVICE_UID, WORK_MODULE_ID, WORK_PRODUCT_ID } from "../workIdentity";
const WORK_FILE_BUDGET = 100_000_000;
const SAVE_DEBOUNCE_MS = 500;
const CREATE_GUARD_MS = 500;

const scopeId = `${WORK_DEVICE_UID}:${WORK_PRODUCT_ID}:${WORK_MODULE_ID}`;
const indexStorageKey = `dc.work.sketchIndex.v1.${scopeId}`;
const activeStorageKey = `dc.work.sketchActive.v1.${scopeId}`;
const canvasColorStorageKey = `dc.work.sketchCanvasColor.v1.${WORK_DEVICE_UID}`;

interface WorkSketchSession {
  storageKey: string;
  sketchKey: string;
  title: string;
  scene: SketchScene;
  createdAt: number;
  updatedAt: number;
  generation: number;
  revision: number;
  savedRevision: number;
  signature: number;
  loaded: boolean;
  localOk: boolean;
  status: SketchSaveStatus;
  errorMessage: string | null;
  lastSavedAt: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  saving: boolean;
  flushWanted: boolean;
  deleted: boolean;
}

const emptySession = (sketchKey: string, title: string): WorkSketchSession => {
  const scene = createSketchScene();
  return {
    storageKey: workSketchSceneKey(scopeId, sketchKey),
    sketchKey,
    title,
    scene,
    createdAt: 0,
    updatedAt: 0,
    generation: 0,
    revision: 0,
    savedRevision: 0,
    signature: workSceneSignature(scene),
    loaded: false,
    localOk: true,
    status: "loading",
    errorMessage: null,
    lastSavedAt: null,
    timer: null,
    saving: false,
    flushWanted: false,
    deleted: false,
  };
};

function readIndex(): SketchBoardSummary[] {
  try {
    const raw = JSON.parse(localStorage.getItem(indexStorageKey) || "[]") as unknown;
    const parsed = Array.isArray(raw) ? raw.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const row = value as Record<string, unknown>;
      const sketchKey = sanitizeSketchKey(row.sketchKey);
      return [{
        sketchKey,
        title: sanitizeSketchTitle(row.title) || "Canvas",
        elementCount: Math.max(0, Math.trunc(Number(row.elementCount) || 0)),
        updatedAt: Math.max(0, Math.trunc(Number(row.updatedAt) || 0)),
        createdAt: Math.max(0, Math.trunc(Number(row.createdAt) || 0)),
      }];
    }) : [];
    const unique = parsed.filter((row, index) => parsed.findIndex((other) => other.sketchKey === row.sketchKey) === index);
    if (!unique.some((row) => row.sketchKey === SKETCH_DEFAULT_KEY)) {
      unique.unshift({ sketchKey: SKETCH_DEFAULT_KEY, title: "Canvas 1", elementCount: 0, updatedAt: 0, createdAt: 0 });
    }
    return unique.sort((a, b) => a.sketchKey === SKETCH_DEFAULT_KEY ? -1 : b.sketchKey === SKETCH_DEFAULT_KEY ? 1 : a.createdAt - b.createdAt);
  } catch {
    return [{ sketchKey: SKETCH_DEFAULT_KEY, title: "Canvas 1", elementCount: 0, updatedAt: 0, createdAt: 0 }];
  }
}

function persistIndex(rows: SketchBoardSummary[]) {
  try { localStorage.setItem(indexStorageKey, JSON.stringify(rows)); } catch { /* IndexedDB scenes remain available. */ }
}

function readActiveBoard(rows: SketchBoardSummary[]) {
  try {
    const active = sanitizeSketchKey(localStorage.getItem(activeStorageKey));
    return rows.some((row) => row.sketchKey === active) ? active : SKETCH_DEFAULT_KEY;
  } catch {
    return SKETCH_DEFAULT_KEY;
  }
}

function writeActiveBoard(key: string) {
  try { localStorage.setItem(activeStorageKey, key); } catch { /* open the first canvas next time */ }
}

function cleanWorkScene(scene: SketchScene): SketchScene {
  // Unlike cloud scene serialization, this Work-only device path intentionally
  // keeps large embedded files in IndexedDB (up to the generous IDB budget).
  return parseSketchScene(scene, { fileBudget: WORK_FILE_BUDGET });
}

/** Include app state and embedded files, not only strokes, in dirty detection. */
function workSceneSignature(scene: SketchScene): number {
  let payload = "";
  try {
    // Never stringify embedded data URLs (they can be tens of megabytes) on
    // Excalidraw's pointer-move path. Element signatures cover file references;
    // this compact manifest detects add/remove/replace operations.
    const files = Object.entries(scene.files || {}).map(([id, value]) => {
      const file = value && typeof value === "object" ? value as Record<string, unknown> : {};
      const data = typeof file.dataURL === "string" ? file.dataURL.length : 0;
      return [id, String(file.mimeType || ""), String(file.created || ""), data];
    });
    payload = JSON.stringify([sketchSceneSignature(scene.elements), sanitizeSketchAppState(scene.appState), files]);
  } catch {
    payload = `${sketchSceneSignature(scene.elements)}:${Date.now()}`;
  }
  let hash = 2166136261;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readCanvasColor(): string | null {
  try {
    const value = localStorage.getItem(canvasColorStorageKey);
    return value && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
  } catch {
    return null;
  }
}

function writeCanvasColor(value: string | null) {
  try {
    if (value) localStorage.setItem(canvasColorStorageKey, value);
    else localStorage.removeItem(canvasColorStorageKey);
  } catch { /* the board itself stores its color */ }
}

/** Work Sketch persistence: Dexie scene/files, device-only library and no cloud path. */
export default function useWorkSketch() {
  const [boards, setBoards] = useState<SketchBoardSummary[]>(readIndex);
  const boardsRef = useRef(boards);
  boardsRef.current = boards;
  const [activeBoardKey, setActiveBoardKey] = useState(() => readActiveBoard(boards));
  const activeKeyRef = useRef(activeBoardKey);
  activeKeyRef.current = activeBoardKey;
  const [revision, bump] = useState(0);
  const [canvasColor, setCanvasColorState] = useState<string | null>(readCanvasColor);
  const session = useMemo(() => {
    const row = boards.find((candidate) => candidate.sketchKey === activeBoardKey);
    return emptySession(activeBoardKey, row?.title || "Canvas 1");
  }, [activeBoardKey]);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const createAtRef = useRef(0);

  const publish = useCallback((scope: WorkSketchSession) => {
    if (sessionRef.current === scope && !scope.deleted) bump((value) => value + 1);
  }, []);

  const updateBoardSummary = useCallback((scope: WorkSketchSession, patch: Partial<SketchBoardSummary>) => {
    const next = boardsRef.current.map((row) => row.sketchKey === scope.sketchKey ? { ...row, ...patch } : row);
    boardsRef.current = next;
    setBoards(next);
    persistIndex(next);
  }, []);

  const persistRef = useRef<(scope: WorkSketchSession) => Promise<void>>(async () => undefined);
  const persist = useCallback(async (scope: WorkSketchSession) => {
    if (scope.deleted || !scope.loaded || scope.savedRevision === scope.revision) return;
    if (scope.timer) { clearTimeout(scope.timer); scope.timer = null; }
    if (scope.saving) { scope.flushWanted = true; return; }
    scope.saving = true;
    scope.flushWanted = false;
    const writeRevision = scope.revision;
    const now = Date.now();
    const createdAt = scope.createdAt || now;
    const scene = cleanWorkScene(scope.scene);
    let writeSucceeded = false;
    scope.status = "saving";
    scope.errorMessage = null;
    publish(scope);
    try {
      await writeWorkSketchScene({
        key: scope.storageKey,
        scene,
        title: scope.title,
        createdAt,
        updatedAt: now,
      });
      writeSucceeded = true;
      scope.localOk = true;
      scope.createdAt = createdAt;
      scope.updatedAt = now;
      scope.savedRevision = writeRevision;
      scope.lastSavedAt = now;
      if (scope.revision === writeRevision) {
        scope.status = "saved";
        scope.scene = scene;
      } else {
        scope.status = "pending";
      }
      scope.errorMessage = null;
      updateBoardSummary(scope, {
        title: scope.title,
        elementCount: scene.elements.length,
        createdAt,
        updatedAt: now,
      });
    } catch (error) {
      scope.localOk = false;
      scope.status = "error";
      scope.errorMessage = error instanceof Error
        ? error.message
        : "This sketch could not be saved to device storage. Keep the page open and try again.";
    } finally {
      scope.saving = false;
      publish(scope);
      if (writeSucceeded && (scope.flushWanted || scope.revision !== scope.savedRevision)) {
        scope.flushWanted = false;
        void persistRef.current(scope);
      } else if (!writeSucceeded) {
        scope.flushWanted = false;
      }
    }
  }, [publish, updateBoardSummary]);
  persistRef.current = persist;

  const schedulePersist = useCallback((scope: WorkSketchSession) => {
    if (scope.timer) clearTimeout(scope.timer);
    scope.status = "pending";
    scope.errorMessage = null;
    scope.timer = setTimeout(() => {
      scope.timer = null;
      void persistRef.current(scope);
    }, SAVE_DEBOUNCE_MS);
    publish(scope);
  }, [publish]);

  useEffect(() => {
    let cancelled = false;
    if (session.timer) { clearTimeout(session.timer); session.timer = null; }
    session.loaded = false;
    session.status = "loading";
    publish(session);
    void readWorkSketchScene(session.storageKey).then((row) => {
      if (cancelled || session.deleted) return;
      if (row) {
        session.scene = cleanWorkScene(row.scene);
        session.title = sanitizeSketchTitle(row.title) || session.title;
        session.createdAt = row.createdAt || 0;
        session.updatedAt = row.updatedAt || 0;
        session.lastSavedAt = row.updatedAt || null;
        const indexRow = boardsRef.current.find((item) => item.sketchKey === session.sketchKey);
        updateBoardSummary(session, {
          title: session.title,
          elementCount: session.scene.elements.length,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        });
        // Keep a row restored from IndexedDB present even if the small index was
        // missing or the browser cleared only localStorage.
        if (!indexRow) {
          const next = [...boardsRef.current, {
            sketchKey: session.sketchKey,
            title: session.title,
            elementCount: session.scene.elements.length,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
          }];
          boardsRef.current = next;
          setBoards(next);
          persistIndex(next);
        }
      } else {
        session.scene = createSketchScene();
      }
      session.signature = workSceneSignature(session.scene);
      session.generation += 1;
      session.loaded = true;
      session.localOk = true;
      session.status = row ? "saved" : "ready";
      session.errorMessage = null;
      publish(session);
    }).catch((error: unknown) => {
      if (cancelled || session.deleted) return;
      session.scene = createSketchScene();
      session.signature = workSceneSignature(session.scene);
      session.loaded = true;
      session.localOk = false;
      session.status = "error";
      session.errorMessage = error instanceof Error
        ? error.message
        : "IndexedDB is unavailable. Work sketches are not saved yet.";
      session.generation += 1;
      publish(session);
    });
    return () => {
      cancelled = true;
      if (session.timer) { clearTimeout(session.timer); session.timer = null; }
      if (!session.deleted && session.revision !== session.savedRevision) void persistRef.current(session);
    };
    // The session is the complete per-board identity. Every board gets its own
    // asynchronous Dexie read; stale results can never replace a newer canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const getScene = useCallback(() => sessionRef.current.scene, []);

  const updateScene = useCallback((elements: unknown, appState: unknown, files: unknown, forSceneKey?: string) => {
    const scope = sessionRef.current;
    const currentSceneKey = `${scope.storageKey}#${scope.generation}`;
    if (!scope.loaded || scope.deleted || (typeof forSceneKey === "string" && forSceneKey !== currentSceneKey)) return;
    const rows = Array.isArray(elements) ? elements as SketchScene["elements"] : [];
    const nextScene: SketchScene = {
      version: scope.scene.version,
      elements: rows,
      appState: appState && typeof appState === "object" ? appState as Record<string, unknown> : {},
      files: files && typeof files === "object" ? files as SketchScene["files"] : {},
    };
    const signature = workSceneSignature(nextScene);
    if (signature === scope.signature) return;
    scope.scene = nextScene;
    scope.signature = signature;
    scope.revision += 1;
    schedulePersist(scope);
  }, [schedulePersist]);

  const setCanvasColor = useCallback((color: string | null) => {
    const scope = sessionRef.current;
    writeCanvasColor(color);
    setCanvasColorState(color);
    if (!scope.loaded || scope.deleted) return;
    const appState = sanitizeSketchAppState(scope.scene.appState);
    scope.scene = {
      ...scope.scene,
      appState: {
        ...appState,
        ...(color ? { theme: "light", viewBackgroundColor: color } : { theme: "dark", viewBackgroundColor: "#ffffff" }),
      },
    };
    scope.signature = workSceneSignature(scope.scene);
    scope.revision += 1;
    schedulePersist(scope);
  }, [schedulePersist]);

  const flush = useCallback(() => {
    const scope = sessionRef.current;
    if (scope.timer) { clearTimeout(scope.timer); scope.timer = null; }
    void persistRef.current(scope);
  }, []);

  const retry = useCallback(() => {
    const scope = sessionRef.current;
    if (scope.deleted) return;
    if (!scope.loaded) return;
    scope.localOk = true;
    scope.revision += scope.revision === scope.savedRevision ? 1 : 0;
    scope.status = "pending";
    scope.errorMessage = null;
    publish(scope);
    void persistRef.current(scope);
  }, [publish]);

  const selectBoard = useCallback((key: string) => {
    const nextKey = sanitizeSketchKey(key);
    if (nextKey === activeKeyRef.current || !boardsRef.current.some((row) => row.sketchKey === nextKey)) return;
    const outgoing = sessionRef.current;
    if (outgoing.timer) { clearTimeout(outgoing.timer); outgoing.timer = null; }
    if (outgoing.revision !== outgoing.savedRevision) void persistRef.current(outgoing);
    activeKeyRef.current = nextKey;
    setActiveBoardKey(nextKey);
    writeActiveBoard(nextKey);
  }, []);

  const createBoard = useCallback((): string | null => {
    const now = Date.now();
    if (now - createAtRef.current < CREATE_GUARD_MS || boardsRef.current.length >= MAX_SKETCH_BOARDS) return null;
    createAtRef.current = now;
    const outgoing = sessionRef.current;
    if (outgoing.timer) { clearTimeout(outgoing.timer); outgoing.timer = null; }
    if (outgoing.revision !== outgoing.savedRevision) void persistRef.current(outgoing);
    const key = createSketchKey(boardsRef.current.map((row) => row.sketchKey));
    const title = nextSketchTitle(boardsRef.current.map((row) => row.title));
    const next = [...boardsRef.current, { sketchKey: key, title, elementCount: 0, createdAt: now, updatedAt: 0 }];
    boardsRef.current = next;
    setBoards(next);
    persistIndex(next);
    activeKeyRef.current = key;
    setActiveBoardKey(key);
    writeActiveBoard(key);
    return key;
  }, []);

  /**
   * Rename one canvas — the panel's long-press Rename, in place. Work's boards
   * live in a device-local index, so the new title is written there and the
   * open canvas's title (which is read off that row) follows at once.
   */
  const renameBoard = useCallback((key: string, nextTitle: string): boolean => {
    const sketchKey = sanitizeSketchKey(key);
    const title = sanitizeSketchTitle(nextTitle);
    const row = boardsRef.current.find((candidate) => candidate.sketchKey === sketchKey);
    if (!row || !title || row.title === title) return false;
    const next = boardsRef.current.map((candidate) =>
      candidate.sketchKey === sketchKey ? { ...candidate, title } : candidate,
    );
    boardsRef.current = next;
    setBoards(next);
    persistIndex(next);
    bump((value) => value + 1);
    return true;
  }, []);

  const deleteBoard = useCallback((key: string): boolean => {
    const target = sanitizeSketchKey(key);
    const currentRows = boardsRef.current;
    if (target === SKETCH_DEFAULT_KEY || currentRows.length <= 1 || !currentRows.some((row) => row.sketchKey === target)) return false;
    if (target === sessionRef.current.sketchKey) {
      const active = sessionRef.current;
      active.deleted = true;
      if (active.timer) { clearTimeout(active.timer); active.timer = null; }
    }
    const next = currentRows.filter((row) => row.sketchKey !== target);
    boardsRef.current = next;
    setBoards(next);
    persistIndex(next);
    void removeWorkSketchScene(workSketchSceneKey(scopeId, target)).catch(() => undefined);
    if (activeKeyRef.current === target) {
      activeKeyRef.current = SKETCH_DEFAULT_KEY;
      setActiveBoardKey(SKETCH_DEFAULT_KEY);
      writeActiveBoard(SKETCH_DEFAULT_KEY);
    }
    return true;
  }, []);

  const currentRow = boards.find((row) => row.sketchKey === activeBoardKey);
  const generation = session.generation;
  const sceneKey = `${session.storageKey}#${generation}`;
  return {
    getScene,
    sceneKey,
    loading: !session.loaded,
    status: session.status,
    errorMessage: session.errorMessage,
    pendingSync: false,
    scoped: true,
    deviceSaved: session.localOk,
    lastSavedAt: session.lastSavedAt,
    elementCount: session.scene.elements.length,
    onChange: updateScene,
    canvasColor: (() => {
      const saved = session.scene.appState;
      if (saved.theme === "light") return typeof saved.viewBackgroundColor === "string" ? saved.viewBackgroundColor : "#ffffff";
      if (saved.theme === "dark") return null;
      return canvasColor ?? readCanvasColor();
    })(),
    onCanvasColorChange: setCanvasColor,
    boards,
    activeBoardKey,
    activeBoardTitle: currentRow?.title || session.title,
    boardsLoading: false,
    onSelectBoard: selectBoard,
    onCreateBoard: createBoard,
    onRenameBoard: renameBoard,
    canCreateBoard: boards.length < MAX_SKETCH_BOARDS,
    onDeleteActive: () => deleteBoard(activeBoardKey),
    onDeleteBoard: deleteBoard,
    flush,
    retry,
    revision,
  };
}
