// src/course/useCourseSketch.ts
//
// Per-student SKETCH persistence for the Course Player — the state half of
// the Sketch tab (the editor itself is `src/course/SketchPanel.tsx`, which
// hosts the official Excalidraw component).
//
// Storage: `users/{uid}/sketches/{uid}__{productId}__{moduleId}` — ONE
// document per learner + course + module, owner-only per firestore.rules.
// The id is the same composite shape `mindMapDocId()` uses, so the rules can
// re-derive it and one learner can never write into another's namespace.
//
// ── Scope: the MODULE, exactly like the mind map ──────────────────────────
// The player tracks the selected FILE; a board is scoped to the MODULE that
// file belongs to. Switching lessons inside one module keeps the same board
// (draw while watching lecture 1, keep drawing on lecture 2); switching
// modules opens that module's own board, and coming back restores the first
// one. The resource that was open when the board was last saved rides along
// as `resourceId` / `resourceName`, which is association, not scope.
//
// ── Two layers, deliberately (the Notes / Mind Map pattern) ───────────────
//   1. Firestore is the source of truth, so the same learner sees the same
//      board on every device.
//   2. localStorage mirrors every save. A refused or failed write (rules not
//      deployed, offline, a transient outage) must NEVER strand a drawing;
//      the mirror is read back on the next open and pushed up when the cloud
//      answers again.
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
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import {
  SKETCH_COLLECTION,
  SKETCH_DEFAULT_KEY,
  createSketchScene,
  parseSketchScene,
  serializeSketchScene,
  sketchDocId,
  sketchSceneSignature,
  toFirestoreSketch,
  type SketchScene,
} from "../../utils/sketchScene";

export type SketchSaveStatus = "idle" | "loading" | "ready" | "saving" | "saved" | "error";

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
   * Identity of the scene currently loaded — course + module (+ a generation
   * counter for the rare "the cloud answered late with a newer board"). This
   * is the ONLY thing the editor may be keyed by: never the split ratio,
   * never the pane size, never the active tab.
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
  lastSavedAt: number | null;
  elementCount: number;
  /** Excalidraw's `onChange` — elements + appState + files. */
  updateScene: (elements: unknown, appState: unknown, files: unknown) => void;
  /** Write everything pending right now (tab switch, unmount, page hide). */
  flush: () => void;
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

const localKey = (uid: string, productId: string, moduleId: string) =>
  `dc.sketch.v1.${uid}.${productId}.${moduleId}`;

/** Durable "this device has work the cloud has not acknowledged" marker. */
const outboxKey = (uid: string, productId: string, moduleId: string) =>
  `dc.sketchOutbox.v1.${uid}.${productId}.${moduleId}`;

/** A Firestore failure's code (`permission-denied`, `unavailable`, …). */
const errorCode = (thrown: unknown): string =>
  typeof thrown === "object" && thrown !== null && "code" in thrown
    ? String((thrown as { code?: unknown }).code || "")
    : "";

const describeError = (thrown: unknown): string => {
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
    return null;
  }
};

const writeLocal = (key: string, scene: SketchScene, updatedAt: number, createdAt: number) => {
  try {
    localStorage.setItem(key, JSON.stringify({ scene: serializeSketchScene(scene), updatedAt, createdAt }));
  } catch {
    /* private mode / quota — the cloud queue is still live */
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

interface SketchSession {
  uid: string;
  productId: string;
  moduleId: string;
  scoped: boolean;
  docId: string;
  localKey: string;
  outboxKey: string;
  /** The live scene — written on every stroke, never through React state. */
  scene: SketchScene;
  /** Bumped when the cloud replaces the scene AFTER the editor mounted. */
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
  loadError: boolean;
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
): SketchSession => {
  const scoped = Boolean(uid && productId && moduleId);
  const lKey = scoped ? localKey(uid, productId, moduleId) : "";
  const oKey = scoped ? outboxKey(uid, productId, moduleId) : "";
  // The device copy is read SYNCHRONOUSLY so a cold open (or an offline one)
  // already has the learner's board in hand before the first paint.
  const local = scoped ? readLocal(lKey) : null;
  const scene = local?.scene ?? createSketchScene();
  return {
    uid,
    productId,
    moduleId,
    scoped,
    docId: scoped ? sketchDocId(uid, productId, moduleId, SKETCH_DEFAULT_KEY) : "",
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
    loadError: false,
    createdAt: local?.createdAt || 0,
    updatedAt: local?.updatedAt || 0,
    status: scoped ? "loading" : "idle",
    errorMessage: null,
    pendingSync: scoped ? readOutbox(oKey) : false,
    lastSavedAt: null,
    localTimer: null,
    cloudTimer: null,
    openTimer: null,
    retry: null,
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
  session.maxWaitAt = null;
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

  // One session object per SCOPE. A new course/module builds a new session,
  // and the previous one is flushed by the lifecycle effect's cleanup.
  const session = useMemo(
    () => createSession(uidText, productText, moduleText),
    [uidText, productText, moduleText],
  );
  const scopeRef = useRef<SketchSession>(session);
  scopeRef.current = session;

  // The hook re-renders on SAVE-STATE changes only — never per stroke.
  const [, bump] = useReducer((count: number) => count + 1, 0);
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

  const persistLocal = useCallback((scope: SketchSession) => {
    if (!scope.scoped) return;
    if (scope.localTimer) { clearTimeout(scope.localTimer); scope.localTimer = null; }
    if (!scope.createdAt) scope.createdAt = Date.now();
    scope.updatedAt = Date.now();
    writeLocal(scope.localKey, scope.scene, scope.updatedAt, scope.createdAt);
  }, []);

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
        setStatus(scope, "error", describeError({ code: "unauthenticated" }));
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
        sketchKey: SKETCH_DEFAULT_KEY,
        updatedAt: scope.updatedAt || Date.now(),
        createdAt: scope.createdAt || Date.now(),
        resourceId: scope.resourceId,
        resourceName: scope.resourceName,
      });
      void setDoc(doc(db, "users", owner, SKETCH_COLLECTION, scope.docId), payload)
        .then(() => {
          scope.inFlight = false;
          if (scope.disposed) return;
          scope.attempts = 0;
          // A stroke drawn WHILE the write was in flight keeps the board
          // dirty: the acknowledgement only covers the revision it carried.
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
          if (scope.disposed) return;
          scope.pendingSync = true;
          markOutbox(scope.outboxKey, true);
          setStatus(scope, "error", describeError(thrown));
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
      if (!scope.scoped) return;
      // Device mirror: a short tail, so a crash/refresh a moment after the
      // last stroke still finds the drawing on this device.
      if (!scope.localTimer) {
        scope.localTimer = setTimeout(() => {
          scope.localTimer = null;
          if (!scope.disposed) persistLocal(scope);
        }, LOCAL_MIRROR_MS);
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
    [debounceMs, persistLocal],
  );

  // ── Load the board for this scope ──────────────────────────────────────
  useEffect(() => {
    if (!session.scoped) return undefined;
    let cancelled = false;
    session.loaded = false;
    setStatus(session, "loading");

    // The editor must not wait on the network forever: once the grace window
    // passes, open the DEVICE copy (or a blank board) and let the cloud
    // answer later.
    session.openTimer = setTimeout(() => {
      session.openTimer = null;
      if (cancelled || session.disposed || session.loaded) return;
      session.loaded = true;
      setStatus(session, "ready");
      notify(session);
    }, OPEN_GRACE_MS);

    const owner = cloudSketchUid(session.uid);
    const finish = (scene: SketchScene | null, meta?: { updatedAt: number; createdAt: number }) => {
      if (cancelled || session.disposed) return;
      if (session.openTimer) { clearTimeout(session.openTimer); session.openTimer = null; }
      if (scene) {
        const cloudNewer = (meta?.updatedAt || 0) >= (session.updatedAt || 0);
        // A cloud copy only replaces what is on screen when the learner has
        // not drawn since the open AND it is not older than the device copy.
        if (session.revision === 0 && (cloudNewer || !session.hasLocal)) {
          session.scene = scene;
          session.signature = sketchSceneSignature(scene.elements);
          session.savedSignature = session.signature;
          session.updatedAt = meta?.updatedAt || session.updatedAt;
          session.createdAt = meta?.createdAt || session.createdAt;
          session.dirty = false;
          // The editor was already open on the device copy → remount it on
          // the newer scene. (Scene identity changed; layout never does this.)
          if (session.loaded) session.generation += 1;
        } else if (session.hasLocal) {
          // The device copy is the newer one: push it up.
          session.dirty = true;
          scheduleSave(session);
        }
      } else if (session.hasLocal) {
        // Nothing in the cloud yet but work on this device → upload it.
        session.dirty = true;
        scheduleSave(session);
      }
      session.loaded = true;
      setStatus(session, session.pendingSync ? "error" : "ready", session.pendingSync ? session.errorMessage : null);
      notify(session);
    };

    if (!owner) {
      // No verifiable session yet (restored app user, signed out, offline
      // boot): open the device copy and retry the cloud on the next
      // visibility / online event.
      session.loadError = true;
      finish(null);
      return () => {
        cancelled = true;
        if (session.openTimer) { clearTimeout(session.openTimer); session.openTimer = null; }
      };
    }

    void getDoc(doc(db, "users", owner, SKETCH_COLLECTION, session.docId))
      .then((snapshot) => {
        if (cancelled || session.disposed) return;
        session.loadError = false;
        const data = snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : null;
        if (!data) {
          finish(null);
          return;
        }
        finish(parseSketchScene(data.scene ?? data), {
          updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
          createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
        });
      })
      .catch((thrown: unknown) => {
        if (cancelled || session.disposed) return;
        // A failed READ must never blank the board: the device copy stays on
        // screen and the failure is named instead.
        session.loadError = true;
        if (session.openTimer) { clearTimeout(session.openTimer); session.openTimer = null; }
        session.loaded = true;
        setStatus(session, "error", describeError(thrown));
        notify(session);
      });

    return () => {
      cancelled = true;
      if (session.openTimer) { clearTimeout(session.openTimer); session.openTimer = null; }
    };
  }, [session, notify, scheduleSave, setStatus]);

  // ── Excalidraw's onChange ──────────────────────────────────────────────
  const updateScene = useCallback(
    (elements: unknown, appState: unknown, files: unknown) => {
      const scope = scopeRef.current;
      if (!scope.scoped || !scope.loaded || scope.disposed) return;
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
      scope.dirty = true;
      scheduleSave(scope);
    },
    [scheduleSave],
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

  // ── Lifecycle: the session owns its own flushes ────────────────────────
  // A scope switch (another module), an unmount (tab switch / leaving the
  // player), a page hide and a return to the tab are all flush opportunities;
  // coming back online retries whatever the cloud refused.
  useEffect(() => {
    session.disposed = false;
    const flushSession = () => {
      if (session.disposed) return;
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
      if (session.dirty || session.pendingSync) {
        persistLocal(session);
        persistRef.current(session);
      }
      session.disposed = true;
      clearTimers(session);
    };
  }, [session, persistLocal]);

  const generation = session.generation;
  return useMemo<UseCourseSketchResult>(
    () => ({
      scene: session.scene,
      getScene,
      sceneKey: session.scoped ? `${session.docId}#${generation}` : "sketch-unscoped",
      scoped: session.scoped,
      loading: session.scoped && !session.loaded,
      status: session.status,
      errorMessage: session.errorMessage,
      pendingSync: session.pendingSync,
      lastSavedAt: session.lastSavedAt,
      elementCount: session.scene.elements.length,
      updateScene,
      flush,
    }),
    // `bump()` drives this recompute: every field above is read off the
    // session object, which mutates in place by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, generation, session.status, session.loaded, session.pendingSync, session.errorMessage, updateScene, flush, getScene],
  );
}
