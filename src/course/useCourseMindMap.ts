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
// This mirrors `src/hooks/usePersonalDriveCopy.ts`, which solves the same
// "don't lose the learner's work" problem for Drive copies.

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
  setMind: (updater: MindMap | ((current: MindMap) => MindMap)) => void;
  status: MindMapSaveStatus;
  errorMessage: string | null;
  lastSavedAt: number | null;
  /** Flush any pending edit immediately (used on unmount / tab close). */
  flush: () => void;
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

/** Where the module's map list is mirrored, so the list survives offline. */
const indexKey = (uid: string, productId: string, moduleId: string) =>
  `dc.mindMapIndex.v1.${uid}.${productId}.${moduleId}`;

/** Which map the learner had open last, per module. */
const activeKeyStorageKey = (uid: string, productId: string, moduleId: string) =>
  `dc.mindMapActive.v1.${uid}.${productId}.${moduleId}`;

const readLocalMindMap = (key: string): MindMap | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = parseMindMap(JSON.parse(raw));
    // An empty shell is not worth resurrecting — it would silently overwrite
    // a richer copy living on another device.
    return parsed.nodes.length > 0 || parsed.rootTopic !== "Central idea" ? parsed : null;
  } catch {
    return null;
  }
};

const writeLocalMindMap = (key: string, mind: MindMap) => {
  try {
    localStorage.setItem(key, JSON.stringify(mind));
  } catch {
    /* private mode / quota — Firestore still has the copy */
  }
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

export default function useCourseMindMap(input: UseCourseMindMapInput): UseCourseMindMapResult {
  const { uid, productId, moduleId, rootTopic = "", debounceMs = DEFAULT_DEBOUNCE_MS } = input;

  const scoped = Boolean(uid) && productId != null && moduleId != null && String(moduleId).length > 0;

  const [activeMapKey, setActiveMapKey] = useState<string>(MIND_MAP_DEFAULT_KEY);
  const [summaries, setSummaries] = useState<MindMapSummary[]>([]);
  const [mapsLoading, setMapsLoading] = useState(scoped);

  const docKey = scoped ? mindMapDocId(String(uid), String(productId), String(moduleId), activeMapKey) : "";

  const [mind, setMindState] = useState<MindMap>(() => createMindMap(rootTopic || "Central idea"));
  const [status, setStatus] = useState<MindMapSaveStatus>(scoped ? "loading" : "idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(scoped);
  const [hasStoredMap, setHasStoredMap] = useState(false);

  // The latest map + scope, readable from a timeout without re-subscribing.
  const mindRef = useRef(mind);
  mindRef.current = mind;
  const scopeRef = useRef({ uid, productId, moduleId, docKey, scoped, mapKey: activeMapKey });
  scopeRef.current = { uid, productId, moduleId, docKey, scoped, mapKey: activeMapKey };
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);
  const readyRef = useRef(false);
  /** Bumped on every local edit so a slower in-flight write cannot clobber it. */
  const revisionRef = useRef(0);
  /**
   * A map the learner just created. The load effect adopts it instead of
   * fetching a document that cannot exist yet, so "New map" opens instantly
   * with the chosen name rather than flashing an empty default first.
   */
  const pendingNewRef = useRef<{ mapKey: string; mind: MindMap } | null>(null);

  // ── The module's map list ───────────────────────────────────────────────
  useEffect(() => {
    if (!scoped) {
      setSummaries([]);
      setMapsLoading(false);
      setActiveMapKey(MIND_MAP_DEFAULT_KEY);
      return undefined;
    }

    let cancelled = false;
    const uidText = String(uid);
    const productText = String(productId);
    const moduleText = String(moduleId);
    setMapsLoading(true);

    // 1. The device copy paints the list immediately (works offline too).
    const localRows = readLocalIndex(indexKey(uidText, productText, moduleText));
    if (localRows.length) setSummaries(sortSummaries(localRows));
    else setSummaries([seedSummary(rootTopic || "Central idea")]);

    let storedActive: string = MIND_MAP_DEFAULT_KEY;
    try {
      const raw = localStorage.getItem(activeKeyStorageKey(uidText, productText, moduleText));
      if (raw) storedActive = sanitizeMapKey(raw);
    } catch {
      /* ignore */
    }
    setActiveMapKey(storedActive);

    // 2. Firestore is authoritative: every map document for this learner in
    //    this module. Equality-only filters need no composite index.
    void (async () => {
      try {
        const snapshot = await getDocs(
          query(
            collection(db, "users", uidText, "mindMaps"),
            where("productId", "==", productText),
            where("moduleId", "==", moduleText),
          ),
        );
        if (cancelled) return;
        const rows: MindMapSummary[] = snapshot.docs.map((entry) => {
          const data = entry.data() as Record<string, unknown>;
          // Older documents predate `mapKey`; their three-part id IS `main`.
          const key = sanitizeMapKey(
            typeof data.mapKey === "string" && data.mapKey
              ? data.mapKey
              : entry.id.split("__")[3] || MIND_MAP_DEFAULT_KEY,
          );
          return normalizeSummary({
            mapKey: key,
            title: typeof data.title === "string" ? data.title : "",
            rootTopic: typeof data.rootTopic === "string" ? data.rootTopic : "",
            nodeCount: typeof data.nodeCount === "number" ? data.nodeCount : 1,
            updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
            createdAt: typeof data.createdAt === "number" ? (data.createdAt as number) : undefined,
          });
        });

        setSummaries((current) => {
          // Keep device-only maps that never reached the cloud; the cloud
          // copy wins wherever both sides know a key.
          const byKey = new Map(current.map((row) => [row.mapKey, row]));
          for (const row of rows) {
            const previous = byKey.get(row.mapKey);
            byKey.set(row.mapKey, previous ? { ...row, createdAt: previous.createdAt || row.createdAt } : row);
          }
          const merged = sortSummaries([...byKey.values()]);
          const next = merged.length ? merged : [seedSummary(rootTopic || "Central idea")];
          writeLocalIndex(indexKey(uidText, productText, moduleText), next);
          return next;
        });
      } catch {
        /* offline / rules — the device list already painted */
      } finally {
        if (!cancelled) setMapsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `rootTopic` only seeds an empty list, so it must not re-run the read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, uid, productId, moduleId]);

  // If the remembered map disappeared (deleted on another device), fall back
  // to the first one that exists rather than editing a ghost document.
  useEffect(() => {
    if (!scoped || mapsLoading || summaries.length === 0) return;
    if (summaries.some((row) => row.mapKey === activeMapKey)) return;
    if (pendingNewRef.current?.mapKey === activeMapKey) return;
    setActiveMapKey(summaries[0].mapKey);
  }, [scoped, mapsLoading, summaries, activeMapKey]);

  // Remember the open map per module so reopening the tab lands where the
  // learner left off.
  useEffect(() => {
    if (!scoped) return;
    try {
      localStorage.setItem(activeKeyStorageKey(String(uid), String(productId), String(moduleId)), activeMapKey);
    } catch {
      /* ignore */
    }
  }, [scoped, uid, productId, moduleId, activeMapKey]);

  // ── Load: Firestore first, then the device mirror ───────────────────────
  useEffect(() => {
    if (!scoped || !docKey) {
      readyRef.current = false;
      setLoading(false);
      setStatus("idle");
      return undefined;
    }

    let cancelled = false;
    readyRef.current = false;
    setLoading(true);
    setStatus("loading");

    // A map created a moment ago has no document yet — adopt the draft the
    // creator handed us instead of round-tripping to Firestore for a miss.
    const pending = pendingNewRef.current;
    if (pending && pending.mapKey === activeMapKey) {
      pendingNewRef.current = null;
      setMindState(pending.mind);
      setHasStoredMap(false);
      setStatus("ready");
      readyRef.current = true;
      setLoading(false);
      revisionRef.current += 1;
      // Write it straight away so the new map exists for every other device.
      const timer = setTimeout(() => persistRef.current(), 0);
      return () => clearTimeout(timer);
    }

    const local = readLocalMindMap(localKey(String(uid), String(productId), String(moduleId), activeMapKey));

    void (async () => {
      try {
        const snapshot = await getDoc(doc(db, "users", String(uid), "mindMaps", docKey));
        if (cancelled) return;
        if (snapshot.exists()) {
          const stored = parseMindMap(snapshot.data());
          setMindState(stored);
          setHasStoredMap(true);
          setStatus("ready");
          const savedAt = (snapshot.data() as { updatedAt?: number }).updatedAt;
          if (typeof savedAt === "number") setLastSavedAt(savedAt);
        } else if (local) {
          // The device has work this account never managed to upload — adopt
          // it instead of showing a blank canvas, then push it up.
          setMindState(local);
          setStatus("ready");
          revisionRef.current += 1;
        } else {
          setMindState(createMindMap(rootTopic || "Central idea"));
          setStatus("ready");
        }
      } catch {
        if (cancelled) return;
        if (local) {
          setMindState(local);
          setStatus("ready");
        } else {
          setStatus("error");
          setErrorMessage("Mind map load nahi ho paya. Aap draw karna shuru kar sakte hain — hum dobara save try karenge.");
        }
      } finally {
        if (!cancelled) {
          readyRef.current = true;
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // `rootTopic` is intentionally excluded: re-seeding on every title change
    // would wipe a map the learner is already editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey, scoped, uid, productId, moduleId, activeMapKey]);

  /** Keep the list row for one map in step with what was just saved. */
  const touchSummary = useCallback(
    (mapKey: string, current: MindMap, savedAt: number, scope: { uid: string; productId: string; moduleId: string }) => {
      setSummaries((rows) => {
        const key = sanitizeMapKey(mapKey);
        const existing = rows.find((row) => row.mapKey === key);
        const row = normalizeSummary({
          mapKey: key,
          title: current.title,
          rootTopic: current.rootTopic,
          nodeCount: current.nodes.length + 1,
          updatedAt: savedAt,
          createdAt: existing?.createdAt || savedAt,
        });
        const next = sortSummaries([...rows.filter((item) => item.mapKey !== key), row]);
        writeLocalIndex(indexKey(scope.uid, scope.productId, scope.moduleId), next);
        return next;
      });
    },
    [],
  );

  // ── Save: debounced write, mirrored locally on the way out ──────────────
  const persist = useCallback(() => {
    const {
      uid: currentUid,
      productId: currentProduct,
      moduleId: currentModule,
      docKey: key,
      scoped: isScoped,
      mapKey: currentMapKey,
    } = scopeRef.current;
    if (!isScoped || !key || !readyRef.current) return;
    const signedInUid = typeof auth?.currentUser?.uid === "string" ? auth.currentUser.uid : "";
    if (!signedInUid || signedInUid !== String(currentUid)) {
      setStatus("error");
      setErrorMessage("Cloud save fail hua — map is device par safe hai, aur thodi der me dobara try hoga.");
      const attempt = retryAttemptRef.current + 1;
      retryAttemptRef.current = attempt;
      if (attempt <= 8) {
        if (retryRef.current) clearTimeout(retryRef.current);
        retryRef.current = setTimeout(() => {
          retryRef.current = null;
          persist();
        }, Math.min(8000, 400 * attempt));
      }
      return;
    }
    const current = mindRef.current;

    // The local mirror is written synchronously and unconditionally: even if
    // the network write fails, this device keeps the work.
    writeLocalMindMap(
      localKey(String(currentUid), String(currentProduct), String(currentModule), currentMapKey),
      current,
    );
    touchSummary(currentMapKey, current, Date.now(), {
      uid: String(currentUid),
      productId: String(currentProduct),
      moduleId: String(currentModule),
    });

    setStatus("saving");
    const revision = revisionRef.current;
    const payload = JSON.parse(JSON.stringify(toFirestoreMindMap(current, {
      uid: signedInUid,
      productId: String(currentProduct),
      moduleId: String(currentModule),
      mapKey: currentMapKey,
      updatedAt: Date.now(),
    })));

    void setDoc(doc(db, "users", signedInUid, "mindMaps", key), payload)
      .then(() => {
        // A newer edit may already be queued; don't downgrade its status.
        if (revisionRef.current !== revision) return;
        retryAttemptRef.current = 0;
        setStatus("saved");
        setErrorMessage(null);
        setLastSavedAt(Date.now());
      })
      .catch(() => {
        if (revisionRef.current !== revision) return;
        setStatus("error");
        setErrorMessage("Cloud save fail hua — map is device par safe hai, aur thodi der me dobara try hoga.");
        const attempt = retryAttemptRef.current + 1;
        retryAttemptRef.current = attempt;
        if (attempt > 8) return;
        if (retryRef.current) clearTimeout(retryRef.current);
        const delay = Math.min(20000, 700 * 2 ** Math.min(attempt, 5));
        retryRef.current = setTimeout(() => {
          retryRef.current = null;
          persist();
        }, delay);
      });
  }, [touchSummary]);

  // The load effect adopts a freshly created map and saves it immediately;
  // it needs `persist` without listing it as a dependency (that would re-run
  // the whole load on every save-status change).
  const persistRef = useRef(persist);
  persistRef.current = persist;

  /** Queue a write after the learner pauses. */
  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      persist();
    }, debounceMs);
  }, [debounceMs, persist]);

  const setMind = useCallback(
    (updater: MindMap | ((current: MindMap) => MindMap)) => {
      setMindState((current) => {
        const next = typeof updater === "function" ? (updater as (value: MindMap) => MindMap)(current) : updater;
        if (!isMindMap(next) || next === current) return current;
        revisionRef.current += 1;
        scheduleSave();
        return next;
      });
    },
    [scheduleSave],
  );

  /** Write right now — used when the panel closes so nothing is left pending. */
  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    persist();
  }, [persist]);

  // ── Map list actions ────────────────────────────────────────────────────

  const selectMap = useCallback(
    (mapKey: string) => {
      const key = sanitizeMapKey(mapKey);
      if (key === scopeRef.current.mapKey) return;
      // Never swap documents with an edit still pending — that edit belongs
      // to the map being left behind.
      flush();
      setActiveMapKey(key);
    },
    [flush],
  );

  const createMap = useCallback(
    (title?: string) => {
      if (!scopeRef.current.scoped) return null;
      let created: string | null = null;
      setSummaries((rows) => {
        if (rows.length >= MAX_MAPS_PER_MODULE) return rows;
        const key = createMapKey(rows.map((row) => row.mapKey));
        created = key;
        const now = Date.now();
        const name = (title || "").trim() || `Mind map ${rows.length + 1}`;
        const fresh = createMindMap(name, name);
        pendingNewRef.current = { mapKey: key, mind: fresh };
        const next = sortSummaries([
          ...rows,
          normalizeSummary({
            mapKey: key,
            title: name,
            rootTopic: fresh.rootTopic,
            nodeCount: 1,
            updatedAt: now,
            createdAt: now,
          }),
        ]);
        const { uid: u, productId: p, moduleId: m } = scopeRef.current;
        writeLocalIndex(indexKey(String(u), String(p), String(m)), next);
        return next;
      });
      if (created) {
        flush();
        setActiveMapKey(created);
      }
      return created;
    },
    [flush],
  );

  const renameMap = useCallback(
    (mapKey: string, title: string) => {
      const key = sanitizeMapKey(mapKey);
      const clean = String(title || "").trim().slice(0, 120);
      if (!clean) return;
      const { uid: u, productId: p, moduleId: m, scoped: isScoped } = scopeRef.current;
      if (!isScoped) return;

      setSummaries((rows) => {
        const next = rows.map((row) => (row.mapKey === key ? { ...row, title: clean } : row));
        writeLocalIndex(indexKey(String(u), String(p), String(m)), next);
        return next;
      });

      // The open map renames through the normal edit path (debounced save).
      if (key === scopeRef.current.mapKey) {
        setMind((current) => setMindMapTitle(current, clean));
        return;
      }

      // A map sitting in the list is patched straight in its own document.
      void (async () => {
        const signedInUid = typeof auth?.currentUser?.uid === "string" ? auth.currentUser.uid : "";
        if (!signedInUid || signedInUid !== String(u)) return;
        const id = mindMapDocId(String(u), String(p), String(m), key);
        try {
          const snapshot = await getDoc(doc(db, "users", signedInUid, "mindMaps", id));
          const base = snapshot.exists() ? parseMindMap(snapshot.data()) : createMindMap(clean, clean);
          const renamed = setMindMapTitle(base, clean);
          writeLocalMindMap(localKey(String(u), String(p), String(m), key), renamed);
          await setDoc(
            doc(db, "users", signedInUid, "mindMaps", id),
            JSON.parse(JSON.stringify(toFirestoreMindMap(renamed, {
              uid: signedInUid,
              productId: String(p),
              moduleId: String(m),
              mapKey: key,
              updatedAt: Date.now(),
            }))),
          );
        } catch {
          /* offline — the device list already shows the new name */
        }
      })();
    },
    [setMind],
  );

  const deleteMap = useCallback(
    (mapKey: string) => {
      const key = sanitizeMapKey(mapKey);
      const { uid: u, productId: p, moduleId: m, scoped: isScoped } = scopeRef.current;
      if (!isScoped) return;

      // Deleting the open map must not let its pending write resurrect it.
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (retryRef.current) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }
      revisionRef.current += 1;

      try {
        localStorage.removeItem(localKey(String(u), String(p), String(m), key));
      } catch {
        /* ignore */
      }

      let fallback: string = MIND_MAP_DEFAULT_KEY;
      setSummaries((rows) => {
        const remaining = rows.filter((row) => row.mapKey !== key);
        // The list never goes empty: removing the last map leaves a fresh
        // `main` shell, exactly like a module nobody has drawn in yet.
        const next = remaining.length ? sortSummaries(remaining) : [seedSummary(rootTopic || "Central idea")];
        fallback = next[0].mapKey;
        writeLocalIndex(indexKey(String(u), String(p), String(m)), next);
        return next;
      });

      if (key === scopeRef.current.mapKey) {
        if (fallback === key) {
          // The last map was deleted: the module falls back to a fresh `main`
          // shell in place. No document is loaded, so the editor has to be
          // re-armed here or every later edit would silently refuse to save.
          setMindState(createMindMap(rootTopic || "Central idea"));
          setHasStoredMap(false);
          setLastSavedAt(null);
          setStatus("ready");
          readyRef.current = true;
          setActiveMapKey(MIND_MAP_DEFAULT_KEY);
        } else {
          // A different map takes over: its own load effect re-arms the editor.
          readyRef.current = false;
          setActiveMapKey(fallback);
        }
      }

      void (async () => {
        const signedInUid = typeof auth?.currentUser?.uid === "string" ? auth.currentUser.uid : "";
        if (!signedInUid || signedInUid !== String(u)) return;
        try {
          await deleteDoc(doc(db, "users", signedInUid, "mindMaps", mindMapDocId(String(u), String(p), String(m), key)));
        } catch {
          /* offline — the map is gone from this device; retry happens on the
             next delete or when the list is next reconciled */
        }
      })();
    },
    [rootTopic],
  );

  // Clear any pending timer on unmount. The map is already mirrored locally,
  // so a pending write that never fires costs at most one sync cycle.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  // The open map's live title / size beat whatever the index last stored, so
  // the list never lags a rename or a branch that was just added.
  const maps = useMemo(() => {
    const rows = summaries.length ? summaries : [seedSummary(rootTopic || "Central idea")];
    return rows.map((row) =>
      row.mapKey === activeMapKey
        ? {
            ...row,
            title: mindMapDisplayTitle(mind, row.title || "Untitled map"),
            rootTopic: mind.rootTopic,
            nodeCount: mind.nodes.length + 1,
          }
        : { ...row, title: row.title || row.rootTopic || "Untitled map" },
    );
  }, [summaries, activeMapKey, mind, rootTopic]);

  return {
    mind,
    setMind,
    status,
    errorMessage,
    lastSavedAt,
    flush,
    loading,
    hasStoredMap,
    maps,
    activeMapKey,
    selectMap,
    createMap,
    renameMap,
    deleteMap,
    mapsLoading,
    atMapLimit: maps.length >= MAX_MAPS_PER_MODULE,
  };
}
