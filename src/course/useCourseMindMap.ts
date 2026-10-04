// src/course/useCourseMindMap.ts
//
// Per-student mind map persistence for the Course Player.
//
// Mapping storage: `users/{uid}/mindMaps/{uid}__{productId}__{moduleId}` for
// the FIRST map of a module, and `…__{mapKey}` for every additional one —
// one document per learner + course + module + map, so every student's maps
// are private, each module keeps its own set, and (exactly like Notes) a
// learner can keep as MANY separate diagrams per module as they want.
// Owner-only per firestore.rules.
//
// ── Why a list, not a single map ─────────────────────────────────────────
// Notes are a list: the learner writes "Formula sheet", "Doubts", "Revision"
// as separate cards. A single mind map per module forced every idea into one
// canvas. The hook therefore owns two things now:
//
//   1. the INDEX of the module's maps (id, name, size, last saved), and
//   2. the ACTIVE map's document, edited and saved exactly as before.
//
// The first map keeps the legacy three-part document id (key `main`), so
// every diagram drawn before this feature shipped opens untouched.
//
// Two layers, deliberately:
//
//   1. Firestore is the source of truth, so the same learner sees the same
//      maps on every device and never loses work by clearing a browser.
//   2. localStorage mirrors every save (map documents AND the index). A
//      refused or failed write (rules not deployed yet, offline, a transient
//      outage) must NEVER strand a map the learner just drew, and the next
//      mount pushes the device copy back up.
//
// Like Notes, this also mirrors the latest local state so a temporary
// Firestore failure never strands the learner's work.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { auth, db } from "../../firebase";
import {
  MAX_MAPS_PER_MODULE,
  MIND_MAP_DEFAULT_KEY,
  createMapKey,
  createMindMap,
  isMindMap,
  mindMapDisplayTitle,
  mindMapDocId,
  parseMindMap,
  sanitizeMapKey,
  setMindMapTitle,
  toFirestoreMindMap,
  type MindMap,
} from "../../utils/mindMapTree";

export type MindMapSaveStatus = "idle" | "loading" | "ready" | "saving" | "saved" | "error";

/** One row of the module's map list — enough to render a card, nothing more. */
export interface MindMapSummary {
  mapKey: string;
  /** Display name: the map's own title, else its central topic. */
  title: string;
  rootTopic: string;
  nodeCount: number;
  updatedAt: number;
  createdAt: number;
}

export interface UseCourseMindMapInput {
  uid?: string | null;
  productId?: string | number | null;
  /** The module the learner is currently viewing; maps are scoped to it. */
  moduleId?: string | number | null;
  /** Seed topic for a brand-new map, usually the module's title. */
  rootTopic?: string;
  /** Milliseconds of quiet before a pending edit is written. */
  debounceMs?: number;
}

export interface UseCourseMindMapResult {
  mind: MindMap;
  /** Replace the whole map (every editor mutation returns a new mind map). */
  /** Bound to the returned map, including commits from an outgoing editor. */
  setMind: (updater: MindMap | ((current: MindMap) => MindMap)) => void;
  status: MindMapSaveStatus;
  errorMessage: string | null;
  lastSavedAt: number | null;
  /** Flush any pending edit immediately (used on unmount / tab close). */
  flush: () => void;
  /** Retry failed map/index reads from the library's error state. */
  reload: () => void;
  /** True until the first Firestore read settles, so the UI can show a skeleton. */
  loading: boolean;
  /** True when the doc was loaded from Firestore rather than started empty. */
  hasStoredMap: boolean;

  // ── The module's list of maps ──────────────────────────────────────────
  /** Every map this learner has in the active module, oldest first. */
  maps: MindMapSummary[];
  /** Which map the editor is currently showing. */
  activeMapKey: string;
  /** Open another map (the pending edit on the current one is flushed first). */
  selectMap: (mapKey: string) => void;
  /** Start a brand-new, empty map in this module and open it. */
  createMap: (title?: string) => string | null;
  /** Rename any map — the open one or one sitting in the list. */
  renameMap: (mapKey: string, title: string) => void;
  /** Delete a map (document + device mirror). The list never goes empty. */
  deleteMap: (mapKey: string) => void;
  /** True while the module's map list is still being read. */
  mapsLoading: boolean;
  /** True once the module is at `MAX_MAPS_PER_MODULE`. */
  atMapLimit: boolean;
}

/** Debounce window: short enough to feel instant, long enough to coalesce a
 * burst of `+` taps into one write instead of one write per keystroke. */
const DEFAULT_DEBOUNCE_MS = 700;

const localKey = (uid: string, productId: string, moduleId: string, mapKey: string) =>
  `dc.mindMap.v1.${uid}.${productId}.${moduleId}.${sanitizeMapKey(mapKey)}`;

/** A Firestore failure's code (`permission-denied`, `unavailable`, …) — or `""` when it carries none. */
const errorCode = (thrown: unknown): string =>
  typeof thrown === "object" && thrown !== null && "code" in thrown
    ? String((thrown as { code?: unknown }).code || "")
    : "";

/** Where the module's map list is mirrored, so the list survives offline. */
const indexKey = (uid: string, productId: string, moduleId: string) =>
  `dc.mindMapIndex.v1.${uid}.${productId}.${moduleId}`;

/** Which map the learner had open last, per module. */
const activeKeyStorageKey = (uid: string, productId: string, moduleId: string) =>
  `dc.mindMapActive.v1.${uid}.${productId}.${moduleId}`;

interface LocalMap { mind: MindMap; updatedAt: number }

const readLocalMindMap = (key: string): LocalMap | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!isMindMap(data)) return null;
    const updatedAt = (data as MindMap & { updatedAt?: unknown }).updatedAt;
    return { mind: parseMindMap(data), updatedAt: typeof updatedAt === "number" && Number.isFinite(updatedAt) ? updatedAt : 0 };
  } catch { return null; }
};

const writeLocalMindMap = (key: string, mind: MindMap, updatedAt: number) => {
  try { localStorage.setItem(key, JSON.stringify({ ...mind, updatedAt })); }
  catch { /* private mode / quota — the live queue still writes Firestore */ }
};

const readLocalIndex = (key: string): MindMapSummary[] => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row) => row && typeof row === "object")
      .map((row) => normalizeSummary(row as Partial<MindMapSummary>))
      .slice(0, MAX_MAPS_PER_MODULE);
  } catch {
    return [];
  }
};

const writeLocalIndex = (key: string, summaries: MindMapSummary[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(summaries));
  } catch {
    /* private mode / quota — Firestore still has the list */
  }
};

const normalizeSummary = (row: Partial<MindMapSummary>): MindMapSummary => {
  const mapKey = sanitizeMapKey(row.mapKey);
  const updatedAt = typeof row.updatedAt === "number" && Number.isFinite(row.updatedAt) ? row.updatedAt : 0;
  return {
    mapKey,
    title: typeof row.title === "string" && row.title.trim() ? row.title.trim().slice(0, 120) : "",
    rootTopic: typeof row.rootTopic === "string" ? row.rootTopic.slice(0, 400) : "",
    nodeCount: typeof row.nodeCount === "number" && Number.isFinite(row.nodeCount) ? row.nodeCount : 1,
    updatedAt,
    createdAt:
      typeof row.createdAt === "number" && Number.isFinite(row.createdAt) ? row.createdAt : updatedAt,
  };
};

/** The `main` map always exists conceptually, even before its first save. */
const seedSummary = (rootTopic: string): MindMapSummary => ({
  mapKey: MIND_MAP_DEFAULT_KEY,
  title: "",
  rootTopic,
  nodeCount: 1,
  updatedAt: 0,
  createdAt: 0,
});

/** Oldest first, with the legacy `main` map always leading the list. */
const sortSummaries = (rows: MindMapSummary[]): MindMapSummary[] =>
  [...rows].sort((a, b) => {
    if (a.mapKey === MIND_MAP_DEFAULT_KEY) return -1;
    if (b.mapKey === MIND_MAP_DEFAULT_KEY) return 1;
    return (a.createdAt || a.updatedAt) - (b.createdAt || b.updatedAt);
  });

/** Durable upload/delete markers distinguish unsynced work from a stale cache. */
const outboxKey = (uid: string, productId: string, moduleId: string) =>
  `dc.mindMapOutbox.v1.${uid}.${productId}.${moduleId}`;

interface MapOutbox { uploads: Set<string>; deletes: Set<string> }
const readOutbox = (key: string): MapOutbox => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "{}");
    return {
      uploads: new Set(Array.isArray(raw.uploads) ? raw.uploads.map(sanitizeMapKey) : []),
      deletes: new Set(Array.isArray(raw.deletes) ? raw.deletes.map(sanitizeMapKey) : []),
    };
  } catch { return { uploads: new Set(), deletes: new Set() }; }
};

interface MapDraft {
  mapKey: string;
  mind: MindMap;
  updatedAt: number;
  revision: number;
  savedRevision: number;
  loaded: boolean;
  hasLocal: boolean;
  hasStoredMap: boolean;
  deleted: boolean;
  loadError: boolean;
  loadPromise: Promise<void> | null;
  status: MindMapSaveStatus;
  errorMessage: string | null;
  lastSavedAt: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  retry: ReturnType<typeof setTimeout> | null;
  attempts: number;
  inFlight: boolean;
  flushWanted: boolean;
}

interface MapDeletion {
  predecessor: MapDraft | null;
  inFlight: boolean;
  retry: ReturnType<typeof setTimeout> | null;
  attempts: number;
}

interface MapSession extends MapOutbox {
  uid: string;
  productId: string;
  moduleId: string;
  scoped: boolean;
  rootTopic: string;
  activeMapKey: string;
  summaries: MindMapSummary[];
  drafts: Map<string, MapDraft>;
  deletions: Map<string, MapDeletion>;
  retiredKeys: Set<string>;
  mapsLoading: boolean;
  listError: string | null;
  listReadFailed: boolean;
  listAttempts: number;
  listRetry: ReturnType<typeof setTimeout> | null;
  disposed: boolean;
}

const scopeLocalKey = (scope: MapSession, key: string) => localKey(scope.uid, scope.productId, scope.moduleId, key);
const scopeIndexKey = (scope: MapSession) => indexKey(scope.uid, scope.productId, scope.moduleId);
const scopeOutboxKey = (scope: MapSession) => outboxKey(scope.uid, scope.productId, scope.moduleId);
const persistOutbox = (scope: MapSession) => {
  try { localStorage.setItem(scopeOutboxKey(scope), JSON.stringify({ uploads: [...scope.uploads], deletes: [...scope.deletes] })); }
  catch { /* offline state also remains in the live session */ }
};
const persistIndex = (scope: MapSession) => writeLocalIndex(scopeIndexKey(scope), scope.summaries);
const storedActiveKey = (uid: string, productId: string, moduleId: string): string => {
  try { return sanitizeMapKey(localStorage.getItem(activeKeyStorageKey(uid, productId, moduleId))); }
  catch { return MIND_MAP_DEFAULT_KEY; }
};

const getDraft = (scope: MapSession, mapKey: string): MapDraft => {
  const key = sanitizeMapKey(mapKey);
  const existing = scope.drafts.get(key);
  if (existing) return existing;
  const local = scope.scoped ? readLocalMindMap(scopeLocalKey(scope, key)) : null;
  const dirty = scope.uploads.has(key);
  const draft: MapDraft = {
    mapKey: key, mind: local?.mind || createMindMap(scope.rootTopic || "Central idea"),
    updatedAt: local?.updatedAt || 0, revision: dirty ? 1 : 0, savedRevision: 0,
    loaded: !scope.scoped, hasLocal: Boolean(local), hasStoredMap: false, deleted: false,
    loadError: false, loadPromise: null, status: scope.scoped ? "loading" : "idle",
    errorMessage: null, lastSavedAt: null, timer: null, retry: null, attempts: 0,
    inFlight: false, flushWanted: false,
  };
  scope.drafts.set(key, draft);
  return draft;
};

const touchSummary = (scope: MapSession, draft: MapDraft) => {
  if (draft.deleted) return;
  const previous = scope.summaries.find((row) => row.mapKey === draft.mapKey);
  scope.summaries = sortSummaries([
    ...scope.summaries.filter((row) => row.mapKey !== draft.mapKey),
    normalizeSummary({
      mapKey: draft.mapKey, title: draft.mind.title, rootTopic: draft.mind.rootTopic,
      nodeCount: draft.mind.nodes.length + 1, updatedAt: draft.updatedAt,
      createdAt: previous?.createdAt || draft.updatedAt,
    }),
  ]);
  persistIndex(scope);
};

const describeMapError = (thrown: unknown): string => {
  const code = errorCode(thrown);
  if (code === "permission-denied") return "Cloud save blocked hai (account ya security rules, permission-denied) — map is device par safe hai. Rules deploy hone ke baad dobara Save karein.";
  if (code === "unauthenticated") return "Firebase sign-in session ready nahi hai — map is device par safe hai aur login ke baad sync hoga.";
  if (code === "unavailable") return "Firestore/network unavailable hai — map is device par safe hai, dobara try hoga.";
  return `Cloud sync fail hua${code ? ` (${code})` : ""} — map is device par safe hai, dobara try hoga.`;
};

export default function useCourseMindMap(input: UseCourseMindMapInput): UseCourseMindMapResult {
  const { uid, productId, moduleId, rootTopic = "", debounceMs = DEFAULT_DEBOUNCE_MS } = input;
  const scoped =
    Boolean(uid)
    && productId != null
    && String(productId).trim().length > 0
    && moduleId != null
    && String(moduleId).trim().length > 0;
  const uidText = String(uid || "");
  const productText = String(productId ?? "");
  const moduleText = String(moduleId ?? "");

  // Every module/account has its OWN drafts, revisions and queues. Changing
  // the visible scope cannot redirect an old timeout or promise to a new doc.
  const session = useMemo<MapSession>(() => {
    const outbox = scoped ? readOutbox(outboxKey(uidText, productText, moduleText)) : { uploads: new Set<string>(), deletes: new Set<string>() };
    const rows = scoped ? readLocalIndex(indexKey(uidText, productText, moduleText)).filter((row) => !outbox.deletes.has(row.mapKey) || outbox.uploads.has(row.mapKey)) : [];
    return {
      uid: uidText, productId: productText, moduleId: moduleText, scoped, rootTopic,
      ...outbox, activeMapKey: scoped ? storedActiveKey(uidText, productText, moduleText) : MIND_MAP_DEFAULT_KEY,
      summaries: rows.length ? sortSummaries(rows) : scoped ? [seedSummary(rootTopic || "Central idea")] : [],
      drafts: new Map(), deletions: new Map(), retiredKeys: new Set(outbox.deletes),
      mapsLoading: scoped, listError: null, listReadFailed: false,
      listAttempts: 0, listRetry: null, disposed: false,
    };
    // rootTopic only seeds a new scope; changing a title must not reload a diagram.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, uidText, productText, moduleText]);
  const scopeRef = useRef(session);
  scopeRef.current = session;
  const [version, setVersion] = useState(0);
  const [listReloadToken, setListReloadToken] = useState(0);
  const persistRef = useRef<(scope: MapSession, draft: MapDraft) => void>(() => undefined);
  const deleteRef = useRef<(scope: MapSession, key: string) => void>(() => undefined);
  const active = getDraft(session, session.activeMapKey);

  const notify = useCallback((scope: MapSession) => {
    if (scopeRef.current === scope && !scope.disposed) setVersion((v) => v + 1);
  }, []);

  const scheduleSave = useCallback((scope: MapSession, draft: MapDraft) => {
    if (!scope.scoped || draft.deleted) return;
    // Node editors commit their final text during child teardown. Depending
    // on React cleanup order, this session may already have been disposed.
    // Flush the captured draft now instead of redirecting it or losing it.
    if (scope.disposed) { persistRef.current(scope, draft); return; }
    if (draft.timer) clearTimeout(draft.timer);
    draft.timer = setTimeout(() => {
      draft.timer = null;
      persistRef.current(scope, draft);
    }, debounceMs);
  }, [debounceMs]);

  // This happens at the mutation, NOT at the delayed cloud write. Closing the
  // tab inside the debounce window still leaves the exact map + outbox locally.
  const markDirty = useCallback((scope: MapSession, draft: MapDraft, mind: MindMap) => {
    draft.mind = mind;
    draft.revision += 1;
    draft.updatedAt = Math.max(Date.now(), draft.updatedAt + 1);
    draft.hasLocal = true;
    draft.status = "saving";
    draft.errorMessage = null;
    draft.attempts = 0;
    if (draft.retry) { clearTimeout(draft.retry); draft.retry = null; }
    scope.uploads.add(draft.mapKey);
    writeLocalMindMap(scopeLocalKey(scope, draft.mapKey), mind, draft.updatedAt);
    persistOutbox(scope);
    touchSummary(scope, draft);
    notify(scope);
  }, [notify]);

  const persist = useCallback((scope: MapSession, draft: MapDraft) => {
    if (!scope.scoped || draft.deleted || draft.revision === draft.savedRevision) return;
    if (draft.timer) { clearTimeout(draft.timer); draft.timer = null; }
    if (scope.deletes.has(draft.mapKey)) {
      // A new main map may reuse a just-deleted id. Delete the old document
      // AFTER its in-flight write and BEFORE saving the replacement.
      draft.flushWanted = true;
      deleteRef.current(scope, draft.mapKey);
      return;
    }
    if (draft.inFlight || (!draft.loaded && !scope.disposed)) { draft.flushWanted = true; return; }
    const signedInUid = typeof auth?.currentUser?.uid === "string" ? auth.currentUser.uid : "";
    if (!signedInUid || signedInUid !== scope.uid) {
      draft.status = "error";
      draft.errorMessage = describeMapError({ code: "unauthenticated" });
      notify(scope);
      if (!scope.disposed && draft.attempts < 8) {
        draft.attempts += 1;
        if (draft.retry) clearTimeout(draft.retry);
        draft.retry = setTimeout(() => { draft.retry = null; persistRef.current(scope, draft); }, Math.min(8000, 400 * draft.attempts));
      }
      return;
    }
    const key = mindMapDocId(scope.uid, scope.productId, scope.moduleId, draft.mapKey);
    const revision = draft.revision;
    const updatedAt = draft.updatedAt;
    const currentMapKey = draft.mapKey;
    const payload = toFirestoreMindMap(draft.mind, {
      uid: signedInUid, productId: scope.productId, moduleId: scope.moduleId,
      mapKey: currentMapKey, updatedAt,
    });
    draft.inFlight = true;
    draft.flushWanted = false;
    draft.status = "saving";
    notify(scope);
    let succeeded = false;
    void setDoc(doc(db, "users", signedInUid, "mindMaps", key), payload).then(() => {
      succeeded = true;
      if (draft.deleted) return;
      draft.savedRevision = revision;
      draft.hasStoredMap = true;
      draft.attempts = 0;
      if (draft.revision !== revision) return;
      draft.status = "saved";
      draft.errorMessage = null;
      draft.lastSavedAt = updatedAt;
      // A new mount/tab may have edited the mirror while this old controller
      // was awaiting the server. Its newer outbox marker must not be cleared.
      const local = readLocalMindMap(scopeLocalKey(scope, currentMapKey));
      if (!local || local.updatedAt === updatedAt) {
        scope.uploads.delete(currentMapKey);
        const disk = readOutbox(scopeOutboxKey(scope));
        disk.uploads.delete(currentMapKey);
        try { localStorage.setItem(scopeOutboxKey(scope), JSON.stringify({ uploads: [...disk.uploads], deletes: [...disk.deletes] })); }
        catch { /* the acknowledged session remains authoritative in memory */ }
      }
      scope.retiredKeys.delete(currentMapKey);
    }).catch((thrown: unknown) => {
      if (draft.deleted) return;
      draft.status = "error";
      draft.errorMessage = describeMapError(thrown);
      if (scope.disposed || draft.attempts >= 8) return;
      draft.attempts += 1;
      if (draft.retry) clearTimeout(draft.retry);
      draft.retry = setTimeout(() => {
        draft.retry = null;
        if (!scope.disposed) persistRef.current(scope, draft);
      }, Math.min(20000, 700 * 2 ** Math.min(draft.attempts, 5)));
    }).finally(() => {
      draft.inFlight = false;
      notify(scope);
      if (draft.deleted) { deleteRef.current(scope, draft.mapKey); return; }
      if (succeeded && draft.revision !== draft.savedRevision) {
        if (scope.disposed || draft.flushWanted) persistRef.current(scope, draft);
        else scheduleSave(scope, draft);
      }
    });
  }, [notify, scheduleSave]);
  persistRef.current = persist;

  const flushDelete = useCallback((scope: MapSession, key: string) => {
    if (!scope.deletes.has(key)) return;
    let job = scope.deletions.get(key);
    if (!job) { job = { predecessor: null, inFlight: false, retry: null, attempts: 0 }; scope.deletions.set(key, job); }
    if (job.inFlight || job.predecessor?.inFlight) return;
    const signedInUid = typeof auth?.currentUser?.uid === "string" ? auth.currentUser.uid : "";
    if (!signedInUid || signedInUid !== scope.uid) {
      scope.listError = describeMapError({ code: "unauthenticated" });
      notify(scope);
      return;
    }
    job.inFlight = true;
    const deletion = job;
    void deleteDoc(doc(db, "users", signedInUid, "mindMaps", mindMapDocId(scope.uid, scope.productId, scope.moduleId, key))).then(() => {
      scope.deletes.delete(key);
      scope.deletions.delete(key);
      const disk = readOutbox(scopeOutboxKey(scope));
      disk.deletes.delete(key);
      try { localStorage.setItem(scopeOutboxKey(scope), JSON.stringify({ uploads: [...disk.uploads], deletes: [...disk.deletes] })); }
      catch { /* the next mount also reconciles the tombstone */ }
      scope.listError = null;
      const replacement = scope.drafts.get(key);
      if (replacement && !replacement.deleted) persistRef.current(scope, replacement);
    }).catch((thrown: unknown) => {
      scope.listError = describeMapError(thrown);
      if (!scope.disposed && deletion.attempts < 8) {
        deletion.attempts += 1;
        deletion.retry = setTimeout(() => {
          deletion.retry = null;
          if (!scope.disposed) deleteRef.current(scope, key);
        }, Math.min(20000, 700 * 2 ** Math.min(deletion.attempts, 5)));
      }
    }).finally(() => { deletion.inFlight = false; notify(scope); });
  }, [notify]);
  deleteRef.current = flushDelete;

  const loadDraft = useCallback((scope: MapSession, draft: MapDraft): Promise<void> => {
    if (!scope.scoped || draft.deleted || draft.loaded) return Promise.resolve();
    if (draft.loadPromise) return draft.loadPromise;
    const revisionAtRead = draft.revision;
    const docKey = mindMapDocId(scope.uid, scope.productId, scope.moduleId, draft.mapKey);
    draft.loadPromise = (async () => {
      try {
        const snapshot = await getDoc(doc(db, "users", scope.uid, "mindMaps", docKey));
        if (draft.deleted || scope.disposed) return;
        draft.hasStoredMap = snapshot.exists();
        draft.loadError = false;
        draft.errorMessage = null;
        // Neither a slow first read nor an older cloud doc can discard an
        // early edit or a persisted offline draft (including inactive maps).
        if (draft.revision !== revisionAtRead || scope.uploads.has(draft.mapKey)) {
          draft.status = "saving";
        } else if (snapshot.exists() && !scope.deletes.has(draft.mapKey)) {
          const data = snapshot.data();
          draft.mind = parseMindMap(data);
          draft.updatedAt = typeof data.updatedAt === "number" ? data.updatedAt : 0;
          draft.lastSavedAt = draft.updatedAt || null;
          draft.hasLocal = true;
          draft.status = "ready";
          draft.errorMessage = null;
          writeLocalMindMap(scopeLocalKey(scope, draft.mapKey), draft.mind, draft.updatedAt);
          touchSummary(scope, draft);
        } else if (draft.hasLocal && !scope.deletes.has(draft.mapKey)) {
          // Confirmed-missing document: migrate the old device-only copy.
          markDirty(scope, draft, draft.mind);
        } else {
          draft.status = "ready";
        }
      } catch (thrown: unknown) {
        if (draft.deleted || scope.disposed) return;
        // A cache without an outbox marker is not blindly uploaded after a
        // failed read: a richer cloud copy may exist. Explicit edits ARE queued.
        draft.loadError = true;
        draft.status = "error";
        draft.errorMessage = describeMapError(thrown);
      } finally {
        draft.loadPromise = null;
        if (!draft.deleted && !scope.disposed) {
          draft.loaded = true;
          touchSummary(scope, draft);
          notify(scope);
          if (draft.revision !== draft.savedRevision) persistRef.current(scope, draft);
        }
      }
    })();
    return draft.loadPromise;
  }, [notify, markDirty]);

  const retryReads = useCallback((scope: MapSession) => {
    if (scope.disposed || !scope.scoped) return;
    for (const draft of scope.drafts.values()) {
      if (draft.loadError && draft.revision === draft.savedRevision) {
        draft.loaded = false;
        void loadDraft(scope, draft);
      }
    }
    if (scope.listReadFailed && scopeRef.current === scope) {
      scope.listAttempts = 0;
      setListReloadToken((token) => token + 1);
    }
  }, [loadDraft]);

  // Module library. Metadata and the canvas use the same document ids as the
  // Course Player. A failed list read is visible, not just a console warning.
  useEffect(() => {
    if (!session.scoped) return undefined;
    let cancelled = false;
    session.mapsLoading = true;
    const list = query(collection(db, "users", uidText, "mindMaps"), where("productId", "==", productText), where("moduleId", "==", moduleText));
    void getDocs(list).then((snapshot) => {
      if (cancelled || session.disposed) return;
      const byKey = new Map(session.summaries.map((row) => [row.mapKey, row]));
      for (const entry of snapshot.docs) {
        const data = entry.data();
        const key = sanitizeMapKey(data.mapKey || entry.id.split("__")[3] || MIND_MAP_DEFAULT_KEY);
        if (session.retiredKeys.has(key) || session.deletes.has(key)) continue;
        const row = normalizeSummary({ mapKey: key, title: data.title, rootTopic: data.rootTopic, nodeCount: data.nodeCount, updatedAt: data.updatedAt, createdAt: data.createdAt });
        const previous = byKey.get(key);
        if (!previous || row.updatedAt > previous.updatedAt) byKey.set(key, { ...row, createdAt: previous?.createdAt || row.createdAt });
      }
      session.summaries = sortSummaries([...byKey.values()]).slice(0, MAX_MAPS_PER_MODULE);
      persistIndex(session);
      session.listReadFailed = false;
      session.listAttempts = 0;
      if (!session.deletes.size) session.listError = null;
      if (!session.summaries.some((row) => row.mapKey === session.activeMapKey)) {
        session.activeMapKey = session.summaries[0]?.mapKey || MIND_MAP_DEFAULT_KEY;
      }
    }).catch((thrown: unknown) => {
      if (cancelled || session.disposed) return;
      session.listReadFailed = true;
      session.listError = describeMapError(thrown);
      if (session.listAttempts < 8) {
        session.listAttempts += 1;
        session.listRetry = setTimeout(() => {
          session.listRetry = null;
          if (!session.disposed && scopeRef.current === session) setListReloadToken((token) => token + 1);
        }, Math.min(20000, 1200 * session.listAttempts));
      }
    }).finally(() => {
      if (cancelled || session.disposed) return;
      session.mapsLoading = false;
      // An auth/network read failure must not leave an empty canvas frozen
      // after the library has recovered. Reads cannot upload an empty seed.
      const visible = session.drafts.get(session.activeMapKey);
      if (!session.listReadFailed && visible?.loadError && visible.revision === visible.savedRevision) {
        visible.loaded = false;
        void loadDraft(session, visible);
      }
      // Recover ALL pending maps, not only the one last opened on this device.
      for (const key of session.uploads) {
        const draft = getDraft(session, key);
        void loadDraft(session, draft).then(() => {
          if (!session.disposed) persistRef.current(session, draft);
        });
      }
      for (const key of session.deletes) deleteRef.current(session, key);
      notify(session);
    });
    return () => {
      cancelled = true;
      if (session.listRetry) { clearTimeout(session.listRetry); session.listRetry = null; }
    };
  }, [session, uidText, productText, moduleText, listReloadToken, notify, loadDraft]);

  const activeMapKey = session.activeMapKey;
  useEffect(() => {
    if (!session.scoped) return;
    try { localStorage.setItem(activeKeyStorageKey(session.uid, session.productId, session.moduleId), activeMapKey); }
    catch { /* private mode */ }
    void loadDraft(session, getDraft(session, activeMapKey));
  }, [session, activeMapKey, loadDraft]);

  const setMind = useCallback((updater: MindMap | ((current: MindMap) => MindMap)) => {
    const scope = session;
    if (!scope.scoped) return;
    // Bind to the map delivered in this render. Old node-editor cleanups
    // must not follow a newly selected key or a fresh replacement main map.
    const draft = active;
    if (draft.deleted) return;
    const next = typeof updater === "function" ? updater(draft.mind) : updater;
    if (!isMindMap(next) || next === draft.mind) return;
    // Keep refs and the mirror in step synchronously. React 19 may defer or
    // replay state updaters, so persistence must NOT live inside an updater.
    markDirty(scope, draft, parseMindMap(next));
    scheduleSave(scope, draft);
  }, [session, active, markDirty, scheduleSave]);

  const flush = useCallback(() => {
    const scope = session;
    retryReads(scope);
    for (const draft of scope.drafts.values()) persistRef.current(scope, draft);
    for (const key of scope.deletes) deleteRef.current(scope, key);
  }, [session, retryReads]);

  const reload = useCallback(() => retryReads(session), [session, retryReads]);

  const selectMap = useCallback((mapKey: string) => {
    const scope = session;
    const key = sanitizeMapKey(mapKey);
    if (!scope.scoped || key === scope.activeMapKey || scope.deletes.has(key)) return;
    flush();
    scope.activeMapKey = key;
    notify(scope);
  }, [session, flush, notify]);

  const createMap = useCallback((title?: string): string | null => {
    const scope = session;
    if (!scope.scoped || scope.summaries.length >= MAX_MAPS_PER_MODULE) return null;
    flush();
    const rows = scope.summaries;
    const key = createMapKey([...rows.map((row) => row.mapKey), ...scope.deletes]);
    const name = String(title || "").trim().slice(0, 120) || `Mind map ${rows.length + 1}`;
    const draft = getDraft(scope, key);
    draft.loaded = true;
    scope.activeMapKey = key;
    markDirty(scope, draft, createMindMap(name, name));
    persistRef.current(scope, draft);
    // Deterministic even when React batches/replays renders; never assigned
    // from inside setSummaries(updater), which returned null on later creates.
    return key;
  }, [session, flush, markDirty]);

  const renameMap = useCallback((mapKey: string, title: string) => {
    const scope = session;
    if (!scope.scoped) return;
    const key = sanitizeMapKey(mapKey);
    const clean = String(title || "").trim().slice(0, 120);
    if (!clean || scope.deletes.has(key)) return;
    const draft = getDraft(scope, key);
    if (key === scope.activeMapKey) {
      markDirty(scope, draft, setMindMapTitle(draft.mind, clean));
      scheduleSave(scope, draft);
      return;
    }
    // Fetch the real inactive map before renaming, never replace its branches
    // with a new empty seed just because it wasn't on this device yet.
    void loadDraft(scope, draft).then(() => {
      if (draft.deleted || (!draft.loaded && !draft.hasLocal) || (draft.loadError && !draft.hasLocal)) return;
      markDirty(scope, draft, setMindMapTitle(draft.mind, clean));
      persistRef.current(scope, draft);
    });
  }, [session, loadDraft, markDirty, scheduleSave]);

  const deleteMap = useCallback((mapKey: string) => {
    const scope = session;
    if (!scope.scoped) return;
    const key = sanitizeMapKey(mapKey);
    const draft = getDraft(scope, key);
    if (draft.deleted || scope.deletes.has(key)) return;
    if (draft.timer) { clearTimeout(draft.timer); draft.timer = null; }
    if (draft.retry) { clearTimeout(draft.retry); draft.retry = null; }
    draft.deleted = true;
    draft.revision += 1;
    scope.uploads.delete(key);
    scope.deletes.add(key);
    scope.retiredKeys.add(key);
    scope.deletions.set(key, { predecessor: draft, inFlight: false, retry: null, attempts: 0 });
    try { localStorage.removeItem(scopeLocalKey(scope, key)); } catch { /* private mode */ }
    scope.summaries = scope.summaries.filter((row) => row.mapKey !== key);
    if (!scope.summaries.length) scope.summaries = [seedSummary(scope.rootTopic || "Central idea")];
    if (scope.activeMapKey === key) {
      scope.activeMapKey = scope.summaries[0].mapKey;
      if (scope.activeMapKey === key) {
        // Fresh main shell. It stays editable, but its write waits for the old
        // main's deletion, including any old upload still awaiting acknowledgement.
        scope.drafts.delete(key);
        const replacement = getDraft(scope, key);
        replacement.loaded = true;
        replacement.status = "ready";
      }
    }
    persistIndex(scope);
    persistOutbox(scope);
    notify(scope);
    deleteRef.current(scope, key);
  }, [session, notify]);

  // Lifecycle belongs to the session. Flush captured outgoing drafts on a
  // scope switch/unmount/pagehide; retries never attach themselves to a dead hook.
  useEffect(() => {
    session.disposed = false;
    const maybeFlush = () => {
      for (const draft of session.drafts.values()) persistRef.current(session, draft);
      for (const key of session.deletes) deleteRef.current(session, key);
    };
    // Both hiding the page and returning to it are flush opportunities.
    const onVisible = () => {
      if (document.visibilityState === "visible") retryReads(session);
      maybeFlush();
    };
    const onOnline = () => { retryReads(session); maybeFlush(); };
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", maybeFlush);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      session.disposed = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", maybeFlush);
      document.removeEventListener("visibilitychange", onVisible);
      for (const draft of session.drafts.values()) {
        if (draft.timer) { clearTimeout(draft.timer); draft.timer = null; }
        if (draft.retry) { clearTimeout(draft.retry); draft.retry = null; }
      }
      for (const job of session.deletions.values()) if (job.retry) clearTimeout(job.retry);
      maybeFlush();
    };
  }, [session, retryReads]);

  const maps = useMemo(() => session.summaries.map((row) => row.mapKey === session.activeMapKey ? {
    ...row, title: mindMapDisplayTitle(active.mind, row.title || "Untitled map"),
    rootTopic: active.mind.rootTopic, nodeCount: active.mind.nodes.length + 1,
  } : { ...row, title: row.title || row.rootTopic || "Untitled map" }), [session, active.mind, version]);
  const status = session.listError && (active.status === "ready" || active.status === "idle") ? "error" : active.status;
  return useMemo(() => ({
    mind: active.mind, setMind, status, errorMessage: active.errorMessage || session.listError,
    lastSavedAt: active.lastSavedAt, flush, loading: session.scoped && !active.loaded,
    hasStoredMap: active.hasStoredMap, maps, activeMapKey: session.activeMapKey,
    selectMap, createMap, renameMap, deleteMap, mapsLoading: session.mapsLoading,
    atMapLimit: maps.length >= MAX_MAPS_PER_MODULE,
    reload,
  }), [session, active, version, status, maps, setMind, flush, selectMap, createMap, renameMap, deleteMap, reload]);
}
