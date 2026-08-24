// src/course/useCourseMindMap.ts
//
// Per-student mind map persistence for the Course Player.
//
// Mapping storage: `users/{uid}/mindMaps/{uid}__{productId}__{moduleId}` —
// one document per learner + course + module, so every student's map is
// private and each module keeps its own diagram. Owner-only per
// firestore.rules.
//
// Two layers, deliberately:
//
//   1. Firestore is the source of truth, so the same learner sees the same
//      map on every device and never loses work by clearing a browser.
//   2. localStorage mirrors every save. A refused or failed write (rules not
//      deployed yet, offline, a transient outage) must NEVER strand a map the
//      learner just drew, and the next mount pushes the device copy back up.
//
// This mirrors `src/hooks/usePersonalDriveCopy.ts`, which solves the same
// "don't lose the learner's work" problem for Drive copies.

import { useCallback, useEffect, useRef, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import {
  createMindMap,
  isMindMap,
  mindMapDocId,
  parseMindMap,
  toFirestoreMindMap,
  type MindMap,
} from "../../utils/mindMapTree";

export type MindMapSaveStatus = "idle" | "loading" | "ready" | "saving" | "saved" | "error";

export interface UseCourseMindMapInput {
  uid?: string | null;
  productId?: string | number | null;
  /** The module the learner is currently viewing; the map is scoped to it. */
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
}

/** Debounce window: short enough to feel instant, long enough to coalesce a
 * burst of `+` taps into one write instead of one write per keystroke. */
const DEFAULT_DEBOUNCE_MS = 700;

const localKey = (uid: string, productId: string, moduleId: string) =>
  `dc.mindMap.v1.${uid}.${productId}.${moduleId}`;

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

export default function useCourseMindMap(input: UseCourseMindMapInput): UseCourseMindMapResult {
  const { uid, productId, moduleId, rootTopic = "", debounceMs = DEFAULT_DEBOUNCE_MS } = input;

  const scoped = Boolean(uid) && productId != null && moduleId != null && String(moduleId).length > 0;
  const docKey = scoped ? mindMapDocId(String(uid), String(productId), String(moduleId)) : "";

  const [mind, setMindState] = useState<MindMap>(() => createMindMap(rootTopic || "Central idea"));
  const [status, setStatus] = useState<MindMapSaveStatus>(scoped ? "loading" : "idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(scoped);
  const [hasStoredMap, setHasStoredMap] = useState(false);

  // The latest map + scope, readable from a timeout without re-subscribing.
  const mindRef = useRef(mind);
  mindRef.current = mind;
  const scopeRef = useRef({ uid, productId, moduleId, docKey, scoped });
  scopeRef.current = { uid, productId, moduleId, docKey, scoped };
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Bumped on every local edit so a slower in-flight write cannot clobber it. */
  const revisionRef = useRef(0);

  // ── Load: Firestore first, then the device mirror ───────────────────────
  useEffect(() => {
    if (!scoped || !docKey) {
      setLoading(false);
      setStatus("idle");
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setStatus("loading");

    const local = readLocalMindMap(localKey(String(uid), String(productId), String(moduleId)));

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
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `rootTopic` is intentionally excluded: re-seeding on every title change
    // would wipe a map the learner is already editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey, scoped, uid, productId, moduleId]);

  // ── Save: debounced write, mirrored locally on the way out ──────────────
  const persist = useCallback(() => {
    const { uid: currentUid, productId: currentProduct, moduleId: currentModule, docKey: key, scoped: isScoped } = scopeRef.current;
    if (!isScoped || !key) return;
    const current = mindRef.current;

    // The local mirror is written synchronously and unconditionally: even if
    // the network write fails, this device keeps the work.
    writeLocalMindMap(localKey(String(currentUid), String(currentProduct), String(currentModule)), current);

    setStatus("saving");
    const revision = revisionRef.current;

    void setDoc(
      doc(db, "users", String(currentUid), "mindMaps", key),
      toFirestoreMindMap(current, {
        uid: currentUid,
        productId: currentProduct,
        moduleId: currentModule,
        updatedAt: Date.now(),
      }),
      { merge: true },
    )
      .then(() => {
        // A newer edit may already be queued; don't downgrade its status.
        if (revisionRef.current !== revision) return;
        setStatus("saved");
        setErrorMessage(null);
        setLastSavedAt(Date.now());
      })
      .catch(() => {
        if (revisionRef.current !== revision) return;
        setStatus("error");
        setErrorMessage("Cloud save fail hua — map is device par safe hai, aur thodi der me dobara try hoga.");
      });
  }, []);

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

  // Clear any pending timer on unmount. The map is already mirrored locally,
  // so a pending write that never fires costs at most one sync cycle.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { mind, setMind, status, errorMessage, lastSavedAt, flush, loading, hasStoredMap };
}
