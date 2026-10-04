// src/course/useReadUploads.ts
//
// Course Player → READ LIBRARY — the learner's OWN PDFs, live.
//
// The Read tab lists the PDFs the course itself ships (utils/readResources.js,
// rendered by ReadLibraryPanel). This hook adds the second half: the files the
// LEARNER uploads, which open in the SAME in-player PDF.js (Mozilla) viewer —
// annotations and all — and whose annotations + activity are stored per
// account, so they follow the learner to another device.
//
// Storage layout (both halves derived, never trusted from a payload):
//
//   Firestore  users/{uid}/readUploads/{uploadId}   ← metadata, last page, count
//   Storage    userReadUploads/{uid}/{uploadId}-{slug}.pdf
//
// ── Why the file lives in Storage and the annotations go INTO it ───────────
// The viewer's annotations are ordinary PDF annotation objects. PDF.js can
// write them back into the document (`pdfDocument.saveDocument()`, the exact
// call its own Save button makes), so "save" means: the same object is
// overwritten with the annotated bytes and its download URL is refreshed in
// the document. Every device then opens the same annotated file — no bespoke
// annotation format to keep in sync, and the learner can still download a
// normal PDF with their marks in it.
//
// ── Honesty rules (the same ones the sketch hook follows) ──────────────────
//   · An upload that fails is reported with a sentence that says what to do;
//     nothing is half-written (the doc is created only after the bytes land).
//   · A metadata write that is refused (rules not deployed, offline) never
//     silently drops the file: the failure is surfaced, and Firestore's own
//     offline queue retries the small writes.
//   · Page/activity writes are debounced and coalesced, so scrolling a 300
//     page PDF cannot cost 300 writes.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { auth, db, getFirebaseStorage } from "../../firebase";
import {
  READ_UPLOAD_COLLECTION,
  buildReadUploadStoragePath,
  createReadUploadId,
  isReadUploadId,
  isOwnedReadUploadPath,
  parseReadUploadDoc,
  readUploadFileIssue,
  sanitizeReadUploadModule,
  sanitizeReadUploadName,
  sanitizeReadUploadSubmodule,
  sortReadUploads,
  toFirestoreReadUpload,
  type ReadUpload,
} from "../../utils/readUploads.js";

export type ReadUploadsState = "idle" | "loading" | "ready" | "error";

/** One file currently moving to Storage (the row the library shows). */
export interface ReadUploadProgress {
  uploadId: string;
  name: string;
  /** 0–1; 1 while the Firestore document is being written. */
  progress: number;
}

export interface UseReadUploadsResult {
  uid: string | null;
  state: ReadUploadsState;
  error: string | null;
  /** Newest first; the learner's whole shelf for this account. */
  uploads: ReadUpload[];
  uploading: ReadUploadProgress | null;
  uploadError: string | null;
  /** Recoverable upload failure (clear it when the learner dismisses it). */
  clearUploadError: () => void;
  /** Upload one PDF. Resolves with the stored row, or null when it failed. */
  uploadPdf: (file: File, module?: string, submodule?: string) => Promise<ReadUpload | null>;
  /** Upload many PDFs into the same module / submodule. */
  uploadPdfs: (files: File[], module?: string, submodule?: string) => Promise<ReadUpload[]>;
  removeUpload: (uploadId: string) => Promise<boolean>;
  renameUpload: (uploadId: string, name: string) => Promise<boolean>;
  setUploadModule: (uploadId: string, module: string) => Promise<boolean>;
  /**
   * Persist the viewer's annotated bytes over the stored object and refresh
   * the document (url, size, annotation count, annotatedAt).
   */
  saveAnnotations: (
    uploadId: string,
    bytes: Uint8Array,
    meta?: { pageCount?: number; annotationCount?: number },
  ) => Promise<boolean>;
  /** Debounced "continue where you left off" write; safe to call per page. */
  recordActivity: (uploadId: string, page: number, pageCount?: number) => void;
}

const ACTIVITY_DEBOUNCE_MS = 1800;
const ACTIVITY_MAX_WAIT_MS = 12000;

/** A Firestore failure's code, when there is one. */
const errorCode = (thrown: unknown): string =>
  typeof thrown === "object" && thrown !== null && "code" in thrown
    ? String((thrown as { code?: unknown }).code || "")
    : "";

const describeUploadError = (thrown: unknown): string => {
  const code = errorCode(thrown);
  if (code === "storage/unauthorized" || code === "permission-denied") {
    return "The upload was refused for this account. Sign in again and retry.";
  }
  if (code === "storage/canceled" || code === "storage/retry-limit-exceeded" || code === "unavailable") {
    return "The upload did not finish — check your connection and retry.";
  }
  if (code === "storage/quota-exceeded") return "Storage is full right now — try again later.";
  if (code === "resource-exhausted") return "That file is too large to store.";
  return "That PDF could not be uploaded. Please try again.";
};

const describeSaveError = (thrown: unknown): string => {
  const code = errorCode(thrown);
  if (code === "storage/unauthorized" || code === "permission-denied") {
    return "Cloud storage refused the annotation save — your marks stay on this device.";
  }
  if (code === "unavailable" || code === "storage/retry-limit-exceeded") {
    return "Offline — annotations saved on this device and will sync when you are back online.";
  }
  return "Annotations could not be synced just now.";
};

/** The signed-in learner's uid, or "" — cloud writes only ever use this. */
const sessionUid = (uid: string | null | undefined): string => {
  const wanted = String(uid || "").trim();
  const signedIn = typeof auth?.currentUser?.uid === "string" ? auth.currentUser.uid : "";
  return signedIn && signedIn === wanted ? signedIn : "";
};

export function useReadUploads(uidHint?: string | null): UseReadUploadsResult {
  // The hook is usable from a panel that already knows the learner (the
  // Course Player passes its own uid) and from one that does not — the
  // Firebase session is always the final authority for writes.
  const sessionUser = typeof auth?.currentUser?.uid === "string" ? auth.currentUser.uid : "";
  const uid = String(uidHint || sessionUser || "").trim() || null;

  const [state, setState] = useState<ReadUploadsState>(uid ? "loading" : "idle");
  const [uploads, setUploads] = useState<ReadUpload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<ReadUploadProgress | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const activityRef = useRef<{ timers: Map<string, ReturnType<typeof setTimeout>>; firstAt: Map<string, number>; pending: Map<string, number>; pageCounts: Map<string, number> }>(
    { timers: new Map(), firstAt: new Map(), pending: new Map(), pageCounts: new Map() },
  );

  // ── Live shelf ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) {
      setUploads([]);
      setState("idle");
      setError(null);
      return undefined;
    }
    setState((current) => (current === "ready" ? current : "loading"));
    const unsubscribe = onSnapshot(
      collection(db, "users", uid, READ_UPLOAD_COLLECTION),
      (snapshot) => {
        const rows: ReadUpload[] = [];
        snapshot.forEach((row) => {
          const parsed = parseReadUploadDoc({ id: row.id, ...(row.data() as Record<string, unknown>) }, uid);
          if (parsed) rows.push(parsed);
        });
        setUploads(sortReadUploads(rows));
        setError(null);
        setState("ready");
      },
      (thrown) => {
        setError(
          errorCode(thrown) === "permission-denied"
            ? "Your PDF library is blocked by the server rules — nothing was deleted."
            : "Your PDF library could not load. Check your connection and retry.",
        );
        setState("error");
      },
    );
    return () => unsubscribe();
  }, [uid]);

  // ── Upload ─────────────────────────────────────────────────────────────
  const uploadPdf = useCallback<UseReadUploadsResult["uploadPdf"]>(
    async (file, module, submodule) => {
      const issue = readUploadFileIssue(file);
      if (issue) {
        setUploadError(issue);
        return null;
      }
      const owner = sessionUid(uid);
      if (!owner) {
        setUploadError("Sign in to add your own PDFs to the library.");
        return null;
      }
      const uploadId = createReadUploadId(file.name);
      const storagePath = buildReadUploadStoragePath(owner, uploadId, file.name);
      if (!isReadUploadId(uploadId) || !storagePath) {
        setUploadError("That file name cannot be stored. Rename the PDF and try again.");
        return null;
      }
      const name = sanitizeReadUploadName(file.name, "My PDF");
      setUploadError(null);
      setUploading({ uploadId, name, progress: 0.04 });
      try {
        // A stale ID token is a common reason the resumable XHR sits at 0%.
        await auth.currentUser?.getIdToken(true).catch(() => null);
        const storage = await getFirebaseStorage();
        const { getDownloadURL, ref, uploadBytesResumable, uploadBytes } = await import("firebase/storage");
        const target = ref(storage, storagePath);
        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const succeed = () => {
            if (settled) return;
            settled = true;
            resolve();
          };
          const fail = (error: unknown) => {
            if (settled) return;
            settled = true;
            reject(error);
          };
          const task = uploadBytesResumable(target, file, { contentType: "application/pdf" });
          const stall = window.setTimeout(() => {
            if (settled) return;
            try {
              task.cancel();
            } catch {
              /* ignore */
            }
            setUploading({ uploadId, name, progress: 0.45 });
            void uploadBytes(target, file, { contentType: "application/pdf" })
              .then(() => {
                setUploading({ uploadId, name, progress: 0.92 });
                succeed();
              })
              .catch(fail);
          }, 3500);
          task.on(
            "state_changed",
            (snapshot) => {
              const total = snapshot.totalBytes || file.size || 1;
              const ratio = snapshot.bytesTransferred / total;
              if (ratio > 0) window.clearTimeout(stall);
              setUploading({ uploadId, name, progress: Math.min(0.98, Math.max(0.05, ratio || 0.05)) });
            },
            (failure) => {
              window.clearTimeout(stall);
              setUploading({ uploadId, name, progress: 0.4 });
              void uploadBytes(target, file, { contentType: "application/pdf" })
                .then(() => {
                  setUploading({ uploadId, name, progress: 0.92 });
                  succeed();
                })
                .catch(() => fail(failure));
            },
            () => {
              window.clearTimeout(stall);
              succeed();
            },
          );
        });
        const url = await getDownloadURL(target);
        const now = Date.now();
        const payload = toFirestoreReadUpload({
          uid: owner,
          uploadId,
          name,
          module: sanitizeReadUploadModule(module),
          submodule: sanitizeReadUploadSubmodule(submodule),
          storagePath,
          url,
          sizeBytes: file.size,
          pageCount: 0,
          lastPage: 1,
          hasAnnotations: false,
          annotationCount: 0,
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: now,
        });
        setUploading({ uploadId, name, progress: 1 });
        await setDoc(doc(db, "users", owner, READ_UPLOAD_COLLECTION, uploadId), payload);
        return parseReadUploadDoc({ id: uploadId, ...payload }, owner);
      } catch (thrown) {
        setUploadError(describeUploadError(thrown));
        return null;
      } finally {
        setUploading(null);
      }
    },
    [uid],
  );

  const uploadPdfs = useCallback<UseReadUploadsResult["uploadPdfs"]>(
    async (files, module, submodule) => {
      const list = Array.isArray(files) ? files.filter(Boolean) : [];
      const stored: ReadUpload[] = [];
      for (const file of list) {
        const row = await uploadPdf(file, module, submodule);
        if (row) stored.push(row);
      }
      return stored;
    },
    [uploadPdf],
  );

  // ── Row edits ──────────────────────────────────────────────────────────
  const renameUpload = useCallback<UseReadUploadsResult["renameUpload"]>(
    async (uploadId, name) => {
      const owner = sessionUid(uid);
      if (!owner || !isReadUploadId(uploadId)) return false;
      try {
        await updateDoc(doc(db, "users", owner, READ_UPLOAD_COLLECTION, uploadId), {
          name: sanitizeReadUploadName(name),
          updatedAt: Date.now(),
        });
        return true;
      } catch (thrown) {
        setUploadError(describeSaveError(thrown));
        return false;
      }
    },
    [uid],
  );

  const setUploadModule = useCallback<UseReadUploadsResult["setUploadModule"]>(
    async (uploadId, module) => {
      const owner = sessionUid(uid);
      if (!owner || !isReadUploadId(uploadId)) return false;
      try {
        await updateDoc(doc(db, "users", owner, READ_UPLOAD_COLLECTION, uploadId), {
          module: sanitizeReadUploadModule(module),
          updatedAt: Date.now(),
        });
        return true;
      } catch (thrown) {
        setUploadError(describeSaveError(thrown));
        return false;
      }
    },
    [uid],
  );

  const removeUpload = useCallback<UseReadUploadsResult["removeUpload"]>(
    async (uploadId) => {
      const owner = sessionUid(uid);
      if (!owner || !isReadUploadId(uploadId)) return false;
      const row = uploads.find((item) => item.id === uploadId) || null;
      try {
        // The document first: a file without its row is invisible, while a row
        // without its file would open as a broken viewer.
        await deleteDoc(doc(db, "users", owner, READ_UPLOAD_COLLECTION, uploadId));
      } catch (thrown) {
        setUploadError(describeSaveError(thrown));
        return false;
      }
      if (row && isOwnedReadUploadPath(row.storagePath, owner)) {
        try {
          const storage = await getFirebaseStorage();
          const { deleteObject, ref } = await import("firebase/storage");
          await deleteObject(ref(storage, row.storagePath));
        } catch {
          // An orphaned object is harmless (it is never listed again); the
          // learner's row is already gone, which is what they asked for.
        }
      }
      return true;
    },
    [uid, uploads],
  );

  // ── Annotation saves ───────────────────────────────────────────────────
  const saveAnnotations = useCallback<UseReadUploadsResult["saveAnnotations"]>(
    async (uploadId, bytes, meta) => {
      const owner = sessionUid(uid);
      if (!owner || !isReadUploadId(uploadId)) return false;
      const row = uploads.find((item) => item.id === uploadId);
      if (!row || !isOwnedReadUploadPath(row.storagePath, owner)) return false;
      if (!bytes || typeof bytes.byteLength !== "number" || bytes.byteLength <= 0) return false;
      try {
        const storage = await getFirebaseStorage();
        const { getDownloadURL, ref, uploadBytes } = await import("firebase/storage");
        const target = ref(storage, row.storagePath);
        await uploadBytes(target, bytes, { contentType: "application/pdf" });
        const url = await getDownloadURL(target);
        const now = Date.now();
        await updateDoc(doc(db, "users", owner, READ_UPLOAD_COLLECTION, uploadId), {
          url,
          sizeBytes: bytes.byteLength,
          hasAnnotations: true,
          annotatedAt: now,
          updatedAt: now,
          ...(meta?.pageCount && meta.pageCount > 0 ? { pageCount: Math.trunc(meta.pageCount) } : {}),
          ...(typeof meta?.annotationCount === "number"
            ? { annotationCount: Math.max(0, Math.trunc(meta.annotationCount)) }
            : {}),
        });
        return true;
      } catch (thrown) {
        setUploadError(describeSaveError(thrown));
        return false;
      }
    },
    [uid, uploads],
  );

  // ── Activity ("continue where you left off") ───────────────────────────
  const activity = activityRef.current;
  const flushActivity = useCallback(
    (uploadId: string) => {
      const owner = sessionUid(uid);
      const page = activity.pending.get(uploadId);
      if (!owner || !isReadUploadId(uploadId) || !page) return;
      activity.pending.delete(uploadId);
      activity.firstAt.delete(uploadId);
      const pageCount = activity.pageCounts.get(uploadId) || 0;
      const now = Date.now();
      const patch: Record<string, unknown> = { lastPage: Math.trunc(page), lastOpenedAt: now };
      if (pageCount > 0) patch.pageCount = Math.trunc(pageCount);
      void updateDoc(doc(db, "users", owner, READ_UPLOAD_COLLECTION, uploadId), patch).catch(() => {
        // Reading position is not precious enough to interrupt the reader; the
        // device copy (localStorage) still remembers it for this session.
      });
    },
    [uid, activity],
  );

  const recordActivity = useCallback<UseReadUploadsResult["recordActivity"]>(
    (uploadId, page, pageCount) => {
      if (!uid || !isReadUploadId(uploadId)) return;
      const value = Math.max(1, Math.trunc(Number(page) || 1));
      activity.pending.set(uploadId, value);
      if (pageCount && pageCount > 0) activity.pageCounts.set(uploadId, Math.trunc(pageCount));
      const first = activity.firstAt.get(uploadId) || Date.now();
      activity.firstAt.set(uploadId, first);
      const existing = activity.timers.get(uploadId);
      if (existing) clearTimeout(existing);
      const waited = Date.now() - first;
      const delay = waited >= ACTIVITY_MAX_WAIT_MS ? 0 : ACTIVITY_DEBOUNCE_MS;
      activity.timers.set(
        uploadId,
        setTimeout(() => {
          activity.timers.delete(uploadId);
          flushActivity(uploadId);
        }, delay),
      );
    },
    [uid, activity, flushActivity],
  );

  // A tab that is closed mid-read still keeps its place: flush on hide/unmount.
  useEffect(() => {
    const flushAll = () => {
      for (const id of [...activity.pending.keys()]) flushActivity(id);
    };
    window.addEventListener("pagehide", flushAll);
    document.addEventListener("visibilitychange", flushAll);
    return () => {
      window.removeEventListener("pagehide", flushAll);
      document.removeEventListener("visibilitychange", flushAll);
      flushAll();
      for (const timer of activity.timers.values()) clearTimeout(timer);
      activity.timers.clear();
    };
  }, [activity, flushActivity]);

  const clearUploadError = useCallback(() => setUploadError(null), []);

  return useMemo(
    () => ({
      uid,
      state,
      error,
      uploads,
      uploading,
      uploadError,
      clearUploadError,
      uploadPdf,
      uploadPdfs,
      removeUpload,
      renameUpload,
      setUploadModule,
      saveAnnotations,
      recordActivity,
    }),
    [
      uid,
      state,
      error,
      uploads,
      uploading,
      uploadError,
      clearUploadError,
      uploadPdf,
      uploadPdfs,
      removeUpload,
      renameUpload,
      setUploadModule,
      saveAnnotations,
      recordActivity,
    ],
  );
}

export default useReadUploads;
