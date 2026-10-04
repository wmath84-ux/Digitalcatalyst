// src/course/useSketchLibrary.ts
//
// The Sketch tab's PERSONAL LIBRARY — the Excalidraw library items, saved per
// learner and synced to their account.
//
// ── Why this file has to exist at all ─────────────────────────────────────
// Excalidraw renders the "personal library" panel, but it does NOT persist it:
// the editor emits every change through `onLibraryChange` and expects the HOST
// to store it (that is what its own `useHandleLibrary({ excalidrawAPI, adapter })`
// hook is for). Without an adapter the items live in the editor instance only —
// leave the Sketch tab, come back, and the library is empty. That is exactly
// the "saved but blank on reopen" behaviour this hook fixes.
//
// ── Two layers, same as notes / mind map / sketch ─────────────────────────
//   · Firestore is the source of truth: `users/{uid}/sketchLibraries/main`,
//     one document per learner holding the items as a JSON string (rules cap
//     it and re-derive ownership from the path).
//   · localStorage mirrors every save, so a refused/failed/offline write never
//     loses the library; the device copy is read back on the next open and
//     pushed up when the cloud answers again.
//
// ── What it also does ─────────────────────────────────────────────────────
// Consumes the parked "Add to Excalidraw" return link (see
// utils/excalidrawLibraryLink.js): fetches the published library, installs it
// into the open editor with `updateLibrary({merge: true})`, and lets the
// normal library-change path persist it. One tap on the libraries site, one
// item in the learner's own library — no download-and-import detour.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import {
  clearStoredExcalidrawLibraryLink,
  isAllowedExcalidrawLibraryUrl,
  readStoredExcalidrawLibraryLink,
  type ExcalidrawLibraryLink,
} from "../../utils/excalidrawLibraryLink.js";

/** The subset of the editor's adapter contract this hook implements. */
export interface SketchLibraryAdapter {
  load: (meta: { source: "load" | "save" }) => Promise<{ libraryItems: unknown[] } | null>;
  save: (data: { libraryItems: unknown }) => Promise<void>;
}

export type SketchLibraryState = "idle" | "loading" | "ready" | "error";
export type SketchLibraryImportState = "idle" | "importing" | "imported" | "error";

/** The editor API surface the import needs (kept structural on purpose). */
export interface SketchLibraryEditorApi {
  /** The editor's own import path — the same one its file-drop uses. */
  updateLibrary(payload: {
    libraryItems: unknown;
    merge?: boolean;
    prompt?: boolean;
    openLibraryMenu?: boolean;
    defaultStatus?: "published" | "unpublished";
  }): Promise<unknown>;
  /** Optional: only used for the post-install toast. */
  updateScene?(payload: unknown): void;
}

export interface SketchLibraryController {
  uid: string | null;
  adapter: SketchLibraryAdapter;
  state: SketchLibraryState;
  error: string | null;
  /** Items the last load/save held — what the status chip shows. */
  itemCount: number;
  lastSavedAt: number | null;
  importState: SketchLibraryImportState;
  importError: string | null;
  /** A parked "Add to Excalidraw" link, if the boot interception caught one. */
  pendingImport: ExcalidrawLibraryLink | null;
  /** Fetch + install a parked link into the live editor (idempotent per link). */
  importPending: (api: SketchLibraryEditorApi) => Promise<boolean>;
  /** Drop a link we could not install, so it stops being retried. */
  dismissPendingImport: () => void;
}

/** One document per learner, under their own uid namespace. */
export const SKETCH_LIBRARY_COLLECTION = "sketchLibraries";
export const SKETCH_LIBRARY_DOC_ID = "main";
export const SKETCH_LIBRARY_VERSION = 1;
/** Mirrors the rules' own ceiling (Firestore documents max out at 1 MB). */
export const SKETCH_LIBRARY_MAX_CHARS = 900000;
/** A runaway library cannot wedge the document. */
export const SKETCH_LIBRARY_MAX_ITEMS = 500;

const SAVE_DEBOUNCE_MS = 700;
const SAVE_MAX_WAIT_MS = 5000;
const MAX_ATTEMPTS = 6;

const localKey = (uid: string) => `dc.sketchLibrary.v1.${uid}`;

const errorCode = (thrown: unknown): string =>
  typeof thrown === "object" && thrown !== null && "code" in thrown
    ? String((thrown as { code?: unknown }).code || "")
    : "";

const describeError = (thrown: unknown): string => {
  const code = errorCode(thrown);
  if (code === "permission-denied") return "Library cloud access blocked — saved on this device.";
  if (code === "unauthenticated") return "Sign-in session not ready — saved on this device.";
  if (code === "unavailable" || code === "failed-precondition") return "Offline — saved on this device.";
  if (code === "resource-exhausted" || code === "invalid-argument") return "Library too large to sync — kept on this device.";
  return "Could not sync the library — saved on this device.";
};

/** The signed-in learner's uid, or "" — cloud writes only ever use this. */
const cloudUid = (uid: string | null | undefined): string => {
  const wanted = String(uid || "").trim();
  const signedIn = typeof auth?.currentUser?.uid === "string" ? auth.currentUser.uid : "";
  return signedIn && signedIn === wanted ? signedIn : "";
};

interface LocalLibrary {
  items: unknown[];
  updatedAt: number;
  createdAt: number;
}

const readLocal = (uid: string): LocalLibrary | null => {
  try {
    const raw = localStorage.getItem(localKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { items?: unknown; updatedAt?: unknown; createdAt?: unknown };
    const items = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : null;
    if (!items) return null;
    return {
      items,
      updatedAt: Number(parsed?.updatedAt) || 0,
      createdAt: Number(parsed?.createdAt) || 0,
    };
  } catch {
    return null;
  }
};

const writeLocal = (uid: string, items: unknown[], createdAt: number, updatedAt: number) => {
  try {
    localStorage.setItem(localKey(uid), JSON.stringify({ items, createdAt, updatedAt }));
  } catch {
    /* private mode / quota — the cloud copy is still attempted */
  }
};

const parseItems = (value: unknown): unknown[] | null => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * Trim a serialized library to the document budget, newest items first, and
 * report whether anything had to stay on the device.
 */
const fitLibraryPayload = (items: unknown[]) => {
  const rows = Array.isArray(items) ? items.slice(0, SKETCH_LIBRARY_MAX_ITEMS) : [];
  let kept = rows;
  let json = JSON.stringify(kept);
  while (json.length > SKETCH_LIBRARY_MAX_CHARS && kept.length > 1) {
    kept = kept.slice(0, Math.floor(kept.length * 0.75));
    json = JSON.stringify(kept);
  }
  if (json.length > SKETCH_LIBRARY_MAX_CHARS) return { items: [], json: "[]", truncated: true };
  return { items: kept, json, truncated: kept.length !== (Array.isArray(items) ? items.length : 0) };
};

export function useSketchLibrary({ uid: uidHint }: { uid?: string | null } = {}): SketchLibraryController {
  const uid = String(uidHint || "").trim() || null;
  const [state, setState] = useState<SketchLibraryState>(uid ? "loading" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [itemCount, setItemCount] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [importState, setImportState] = useState<SketchLibraryImportState>("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<ExcalidrawLibraryLink | null>(null);

  const sessionRef = useRef({
    uid: uid || "",
    items: [] as unknown[],
    createdAt: 0,
    updatedAt: 0,
    loaded: false,
    dirty: false,
    saving: false,
    attempts: 0,
    timer: null as ReturnType<typeof setTimeout> | null,
    maxWaitAt: 0,
    disposed: false,
    importedUrl: "",
  });

  // ── Load once per learner ──────────────────────────────────────────────
  useEffect(() => {
    const session = sessionRef.current;
    if (!uid) {
      setState("idle");
      setItemCount(0);
      return undefined;
    }
    session.uid = uid;
    session.disposed = false;
    setState("loading");
    const local = readLocal(uid);
    if (local) {
      session.items = local.items;
      session.createdAt = local.createdAt;
      session.updatedAt = local.updatedAt;
      setItemCount(local.items.length);
    }
    const owner = cloudUid(uid);
    if (!owner) {
      session.loaded = true;
      setState("ready");
      setError(null);
      return undefined;
    }
    let cancelled = false;
    void getDoc(doc(db, "users", owner, SKETCH_LIBRARY_COLLECTION, SKETCH_LIBRARY_DOC_ID))
      .then((snapshot) => {
        if (cancelled || session.disposed) return;
        const data = snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : null;
        const cloudItems = parseItems(data?.items);
        const cloudUpdatedAt = Number(data?.updatedAt) || 0;
        if (cloudItems && (cloudUpdatedAt >= session.updatedAt || session.items.length === 0)) {
          session.items = cloudItems;
          session.createdAt = Number(data?.createdAt) || session.createdAt;
          session.updatedAt = cloudUpdatedAt;
          writeLocal(uid, cloudItems, session.createdAt, session.updatedAt);
          setItemCount(cloudItems.length);
        } else if (session.items.length > 0) {
          // The device copy is newer (or the cloud is empty): push it up.
          session.dirty = true;
        }
        session.loaded = true;
        setState("ready");
        setError(null);
        if (session.dirty) queueCloudSave(session);
      })
      .catch((thrown: unknown) => {
        if (cancelled || session.disposed) return;
        // A failed READ must never blank the library: the device copy stays.
        session.loaded = true;
        setState("ready");
        setError(describeError(thrown));
      });
    return () => {
      cancelled = true;
    };
    // `queueCloudSave` is defined below; the indirection through a ref keeps
    // this effect's dependency list honest without re-running on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const saveRef = useRef<(session: typeof sessionRef.current) => void>(() => undefined);

  function queueCloudSave(session: typeof sessionRef.current) {
    if (session.disposed || !session.uid) return;
    session.dirty = true;
    if (session.timer) clearTimeout(session.timer);
    const now = Date.now();
    if (!session.maxWaitAt) session.maxWaitAt = now + SAVE_MAX_WAIT_MS;
    const wait = Math.max(0, Math.min(SAVE_DEBOUNCE_MS, session.maxWaitAt - now));
    session.timer = setTimeout(() => {
      session.timer = null;
      saveRef.current(session);
    }, wait);
  }

  saveRef.current = (session) => {
    if (session.disposed || session.saving) return;
    if (!session.dirty) return;
    session.maxWaitAt = 0;
    const owner = cloudUid(session.uid);
    if (!owner) {
      setError(describeError({ code: "unauthenticated" }));
      return;
    }
    const { items, json, truncated } = fitLibraryPayload(session.items);
    const now = Date.now();
    session.saving = true;
    session.dirty = false;
    const payload = {
      uid: owner,
      version: SKETCH_LIBRARY_VERSION,
      items: json,
      itemCount: items.length,
      truncated,
      createdAt: session.createdAt || now,
      updatedAt: now,
    };
    void setDoc(doc(db, "users", owner, SKETCH_LIBRARY_COLLECTION, SKETCH_LIBRARY_DOC_ID), payload)
      .then(() => {
        session.saving = false;
        if (session.disposed) return;
        session.attempts = 0;
        session.updatedAt = now;
        session.createdAt = payload.createdAt;
        writeLocal(session.uid, session.items, session.createdAt, now);
        setLastSavedAt(Date.now());
        setState("ready");
        setError(truncated ? "Some large library items stay on this device." : null);
        if (session.dirty) queueCloudSave(session);
      })
      .catch((thrown: unknown) => {
        session.saving = false;
        if (session.disposed) return;
        session.dirty = true;
        setState("error");
        setError(describeError(thrown));
        if (session.attempts < MAX_ATTEMPTS) {
          session.attempts += 1;
          const delay = Math.min(20000, 1500 * session.attempts);
          session.timer = setTimeout(() => {
            session.timer = null;
            saveRef.current(session);
          }, delay);
        }
      });
  };

  // ── The adapter the editor's own useHandleLibrary talks to ─────────────
  const adapter = useMemo<SketchLibraryAdapter>(
    () => ({
      load: async ({ source }) => {
        const session = sessionRef.current;
        const owner = cloudUid(session.uid);
        // `source === "save"` is the editor reconciling before a write: answer
        // from what we already hold instead of paying a second round-trip.
        if (source === "save" || !owner) {
          if (!session.items.length) return null;
          return { libraryItems: session.items };
        }
        try {
          const snapshot = await getDoc(doc(db, "users", owner, SKETCH_LIBRARY_COLLECTION, SKETCH_LIBRARY_DOC_ID));
          const items = snapshot.exists() ? parseItems((snapshot.data() as Record<string, unknown>)?.items) : null;
          if (items && items.length > 0) {
            session.items = items;
            session.updatedAt = Number((snapshot.data() as Record<string, unknown>)?.updatedAt) || session.updatedAt;
            writeLocal(session.uid, items, session.createdAt, session.updatedAt);
            setItemCount(items.length);
            return { libraryItems: items };
          }
          return session.items.length ? { libraryItems: session.items } : null;
        } catch (thrown) {
          if (session.items.length) return { libraryItems: session.items };
          setError(describeError(thrown));
          setState("error");
          return null;
        }
      },
      save: async ({ libraryItems }) => {
        const session = sessionRef.current;
        const rows = Array.isArray(libraryItems) ? libraryItems : [];
        session.items = rows;
        session.loaded = true;
        session.updatedAt = Date.now();
        if (!session.createdAt) session.createdAt = session.updatedAt;
        writeLocal(session.uid, rows, session.createdAt, session.updatedAt);
        setItemCount(rows.length);
        queueCloudSave(session);
      },
    }),
    [],
  );

  // ── Flush points: page hide, tab switch, unmount ───────────────────────
  useEffect(() => {
    const session = sessionRef.current;
    const flush = () => {
      if (!session.dirty) return;
      if (session.timer) {
        clearTimeout(session.timer);
        session.timer = null;
      }
      saveRef.current(session);
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      flush();
      session.disposed = true;
      if (session.timer) clearTimeout(session.timer);
      session.timer = null;
    };
  }, [uid]);

  // ── "Add to Excalidraw" return link ────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    setPendingImport(readStoredExcalidrawLibraryLink(window.sessionStorage));
  }, []);

  const dismissPendingImport = useCallback(() => {
    try {
      clearStoredExcalidrawLibraryLink(window.sessionStorage);
    } catch {
      /* nothing to clear */
    }
    setPendingImport(null);
    setImportState("idle");
    setImportError(null);
  }, []);

  const importPending = useCallback<SketchLibraryController["importPending"]>(
    async (api) => {
      const session = sessionRef.current;
      let link = pendingImport;
      if (!link && typeof window !== "undefined") link = readStoredExcalidrawLibraryLink(window.sessionStorage);
      if (!link || !api) return false;
      if (session.importedUrl === link.libraryUrl) return true;
      if (!isAllowedExcalidrawLibraryUrl(link.libraryUrl)) {
        setImportState("error");
        setImportError("That library link is not from Excalidraw — nothing was installed.");
        dismissPendingImport();
        return false;
      }
      setImportState("importing");
      setImportError(null);
      try {
        const response = await fetch(link.libraryUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        await api.updateLibrary({
          libraryItems: blob,
          merge: true,
          prompt: false,
          defaultStatus: "published",
          openLibraryMenu: false,
        });
        session.importedUrl = link.libraryUrl;
        try {
          clearStoredExcalidrawLibraryLink(window.sessionStorage);
        } catch {
          /* ignore */
        }
        setPendingImport(null);
        setImportState("imported");
        api.updateScene?.({
          appState: { toast: { message: "Library added to your personal library", duration: 4000 } },
        });
        return true;
      } catch {
        setImportState("error");
        setImportError("That library could not be downloaded — it stays saved for the next try.");
        return false;
      }
    },
    [dismissPendingImport, pendingImport],
  );

  // The "imported" note is a moment, not a state.
  useEffect(() => {
    if (importState !== "imported") return undefined;
    const timer = setTimeout(() => setImportState((current) => (current === "imported" ? "idle" : current)), 6000);
    return () => clearTimeout(timer);
  }, [importState]);

  return useMemo(
    () => ({
      uid,
      adapter,
      state,
      error,
      itemCount,
      lastSavedAt,
      importState,
      importError,
      pendingImport,
      importPending,
      dismissPendingImport,
    }),
    [
      uid,
      adapter,
      state,
      error,
      itemCount,
      lastSavedAt,
      importState,
      importError,
      pendingImport,
      importPending,
      dismissPendingImport,
    ],
  );
}

export default useSketchLibrary;
