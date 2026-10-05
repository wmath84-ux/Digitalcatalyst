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
  READ_UPLOAD_HEADER_BYTES,
  createReadUploadId,
  isPdfHeader,
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

/**
 * Where an upload is. Each stage maps to a real step of the pipeline:
 *   preparing  → reading the file's header, refreshing the session token and
 *                loading the Storage SDK (no measurable progress)
 *   uploading  → bytes moving to Cloud Storage (real byte progress)
 *   finalizing → asking Storage for the download URL and writing the library
 *                document (no measurable progress — shown indeterminate)
 */
export type ReadUploadStage = "preparing" | "uploading" | "finalizing";

/** One file currently moving to Storage (the row the library shows). */
export interface ReadUploadProgress {
  uploadId: string;
  name: string;
  stage: ReadUploadStage;
  /**
   * 0–1, the SDK's own bytesTransferred / totalBytes while `uploading`.
   * `null` while the current step has no measurable progress (preparing,
   * finalizing) — the UI shows an indeterminate bar instead of a number.
   */
  progress: number | null;
  bytesTransferred: number;
  totalBytes: number;
  /** The network is gone; the task is paused and resumes by itself. */
  waitingForNetwork: boolean;
  /** 1-based position in a multi-file pick. */
  fileIndex: number;
  fileCount: number;
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
  /**
   * Stop the upload in flight (no-op once the bytes have landed and the
   * library document is being written). Leaves no error behind.
   */
  cancelUpload: () => void;
  /**
   * Re-run the last failed upload. When its bytes already reached Storage
   * only the finishing step runs again — nothing is uploaded twice.
   */
  retryUpload: () => Promise<ReadUpload | null>;
  /** Name of the file `retryUpload` would retry, or null. */
  retryableName: string | null;
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

/**
 * No byte has moved for this long while the device says it is online → the
 * upload is declared stalled, cancelled and reported (with Retry). Every
 * progress event re-arms it, so a slow-but-moving upload of a large PDF on a
 * weak connection is never cut off; only a dead one is.
 */
export const READ_UPLOAD_STALL_MS = 60_000;
const TOKEN_TIMEOUT_MS = 10_000;
const SDK_TIMEOUT_MS = 20_000;
const HEADER_TIMEOUT_MS = 15_000;
const DOWNLOAD_URL_TIMEOUT_MS = 30_000;
const DOC_WRITE_TIMEOUT_MS = 15_000;

/** A failure of one of this hook's own steps (codes are `dc/…`). */
class UploadStepError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.name = "UploadStepError";
    this.code = code;
  }
}

/** `promise`, or a `code` failure after `ms` — no await in the upload can hang forever. */
const withTimeout = <T>(promise: Promise<T>, ms: number, code: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new UploadStepError(code)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (failure) => {
        clearTimeout(timer);
        reject(failure);
      },
    );
  });

/** The first bytes of a picked file (Blob#arrayBuffer, or FileReader on older WebViews). */
const readFileHead = (file: Blob): Promise<ArrayBuffer> => {
  const head = file.slice(0, READ_UPLOAD_HEADER_BYTES);
  if (typeof head.arrayBuffer === "function") return head.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsArrayBuffer(head);
  });
};

const describeUploadError = (thrown: unknown, name: string): string => {
  const code = errorCode(thrown);
  const file = `“${name}”`;
  switch (code) {
    case "dc/not-pdf":
      return `${file} is not a real PDF (its contents do not start like one). Export or save it as PDF and try again.`;
    case "dc/unreadable":
      return `${file} could not be read from this device. Pick the file again — if it lives in a cloud drive, download it first.`;
    case "dc/stalled":
      return `The upload of ${file} stopped moving — no data reached the server for ${Math.round(READ_UPLOAD_STALL_MS / 1000)} seconds. Check your connection and press Retry.`;
    case "dc/sdk-load":
      return "The uploader could not load. Check your connection and press Retry.";
    case "dc/url-timeout":
    case "dc/doc-failed":
      return `${file} reached cloud storage but could not be added to your library yet. Press Retry to finish — it will not upload again.`;
    case "storage/unauthenticated":
      return "Your sign-in has expired. Sign in again, then press Retry.";
    case "storage/unauthorized":
    case "permission-denied":
      return "The upload was refused for this account (only PDFs up to 100 MB are accepted). Sign in again and retry.";
    case "storage/retry-limit-exceeded":
    case "storage/canceled":
    case "unavailable":
      return `The upload of ${file} did not finish — check your connection and press Retry.`;
    case "storage/server-file-wrong-size":
    case "storage/invalid-checksum":
      return `${file} was damaged on the way to the server. Press Retry.`;
    case "storage/quota-exceeded":
      return "Cloud storage is full right now — try again later.";
    case "resource-exhausted":
      return "That file is too large to store.";
    default:
      return `${file} could not be uploaded. Press Retry, or pick the file again.`;
  }
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

/** An object that is already in Storage (a retry only has to finish it). */
interface StoredObject {
  owner: string;
  uploadId: string;
  storagePath: string;
}

/** What Retry re-sends. */
interface FailedUpload {
  file: File;
  module?: string;
  submodule?: string;
  stored: StoredObject | null;
}

/** One upload attempt; its callbacks act only while it is the current one. */
interface UploadAttempt {
  id: number;
  cancelled: boolean;
  stage: ReadUploadStage;
  task: { cancel: () => boolean } | null;
  abort: ((reason: unknown) => void) | null;
}

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
  //
  // ONE upload path: a single resumable task whose progress events are the
  // only source of the percentage. (The previous version cancelled that task
  // after 3.5 s without a progress event — which is simply how long the
  // session handshake + first chunk take on a phone — then pinned the bar at a
  // hard-coded 45 % / 40 % and raced two progress-less `uploadBytes` calls
  // with no timeout. That was the "stuck at ~40 %" upload.)
  //
  // Every attempt carries its own identity. Callbacks of an attempt that was
  // cancelled or superseded check it and never write state, and every await is
  // bounded, so the UI always ends in success, a clear error, or idle.
  const attemptSeqRef = useRef(0);
  const attemptRef = useRef<UploadAttempt | null>(null);
  const batchRef = useRef<{ cancelled: boolean } | null>(null);
  const failedRef = useRef<FailedUpload | null>(null);
  const [retryableName, setRetryableName] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      // An upload already in flight finishes on its own (the file then simply
      // appears in the library); it just stops touching this unmounted state.
      mountedRef.current = false;
    };
  }, []);

  const runUpload = useCallback(
    async (
      file: File,
      module: string | undefined,
      submodule: string | undefined,
      batch: { index: number; count: number },
      resume: StoredObject | null,
    ): Promise<ReadUpload | null> => {
      const fail = (message: string, retry: FailedUpload | null) => {
        failedRef.current = retry;
        if (!mountedRef.current) return;
        setRetryableName(retry ? sanitizeReadUploadName(retry.file.name, "My PDF") : null);
        setUploadError(message);
      };
      if (attemptRef.current) {
        if (mountedRef.current) setUploadError("Another PDF is still uploading — wait for it to finish or cancel it first.");
        return null;
      }
      const issue = readUploadFileIssue(file);
      if (issue) {
        fail(issue, null);
        return null;
      }
      const owner = sessionUid(uid);
      if (!owner) {
        fail("Sign in to add your own PDFs to the library.", null);
        return null;
      }
      const stored = resume && resume.owner === owner ? resume : null;
      const uploadId = stored?.uploadId || createReadUploadId(file.name);
      const storagePath = stored?.storagePath || buildReadUploadStoragePath(owner, uploadId, file.name);
      if (!isReadUploadId(uploadId) || !storagePath) {
        fail("That file name cannot be stored. Rename the PDF and try again.", null);
        return null;
      }
      const name = sanitizeReadUploadName(file.name, "My PDF");

      const attempt: UploadAttempt = {
        id: (attemptSeqRef.current += 1),
        cancelled: false,
        stage: "preparing",
        task: null,
        abort: null,
      };
      attemptRef.current = attempt;
      const live = () => attemptRef.current === attempt && !attempt.cancelled;
      let view: ReadUploadProgress = {
        uploadId,
        name,
        stage: "preparing",
        progress: null,
        bytesTransferred: stored ? file.size : 0,
        totalBytes: file.size,
        waitingForNetwork: false,
        fileIndex: batch.index,
        fileCount: batch.count,
      };
      const show = (patch: Partial<ReadUploadProgress>) => {
        view = { ...view, ...patch };
        attempt.stage = view.stage;
        if (live() && mountedRef.current) setUploading(view);
      };
      // Each await goes through `step`, so Cancel interrupts whatever the
      // attempt is waiting for (the header read, the SDK import, the task…).
      const step = <T,>(promise: Promise<T>): Promise<T> =>
        new Promise<T>((resolve, reject) => {
          if (attempt.cancelled) {
            reject(new UploadStepError("dc/cancelled"));
            return;
          }
          attempt.abort = reject;
          promise.then(resolve, reject);
        });

      failedRef.current = null;
      if (mountedRef.current) {
        setRetryableName(null);
        setUploadError(null);
      }
      show({});

      // Set once the bytes are in Storage, so a later failure can be retried
      // without uploading again.
      let landed: StoredObject | null = stored;
      try {
        if (!stored) {
          // 1. Is it really a PDF? (Pickers often report no MIME type at all.)
          let head: ArrayBuffer;
          try {
            head = await step(withTimeout(readFileHead(file), HEADER_TIMEOUT_MS, "dc/unreadable"));
          } catch (thrown) {
            if (errorCode(thrown) === "dc/cancelled") throw thrown;
            throw new UploadStepError("dc/unreadable");
          }
          if (!isPdfHeader(head)) throw new UploadStepError("dc/not-pdf");

          // 2. A fresh ID token, bounded: if the refresh itself cannot reach
          // the server the SDK still refreshes on its own, so carry on.
          try {
            await step(withTimeout(auth.currentUser?.getIdToken(true) ?? Promise.resolve(""), TOKEN_TIMEOUT_MS, "dc/token-timeout"));
          } catch (thrown) {
            if (errorCode(thrown) === "dc/cancelled") throw thrown;
          }
        }

        // 3. The Storage SDK is code-split; a failed chunk load must not hang.
        const storage = await step(withTimeout(getFirebaseStorage(), SDK_TIMEOUT_MS, "dc/sdk-load"));
        const { getDownloadURL, ref, uploadBytesResumable } = await step(
          withTimeout(import("firebase/storage"), SDK_TIMEOUT_MS, "dc/sdk-load"),
        );
        const target = ref(storage, storagePath);

        // 4. The bytes — one resumable task, real progress, a watchdog that
        // only fires when nothing moves, paused while the device is offline.
        if (!stored) {
          // `progress: null`, never 0. Nothing has been confirmed on the wire
          // yet, so there is no measurable percentage to show — and a small PDF
          // can finish in a single request without the SDK ever emitting an
          // intermediate snapshot. Seeding a literal 0 here is what pinned the
          // bar at "0%" for fast uploads: the UI claimed a measured value it
          // did not have. The bar stays indeterminate until the first real
          // progress event lands, then shows the true percentage.
          show({ stage: "uploading", progress: null });
          await step(
            new Promise<void>((resolve, reject) => {
              const task = uploadBytesResumable(target, file, { contentType: "application/pdf" });
              attempt.task = task;
              let finished = false;
              let lastBytes = -1;
              let watchdog: ReturnType<typeof setTimeout> | undefined;
              let offline = false;
              const arm = () => {
                if (watchdog) clearTimeout(watchdog);
                if (offline || finished) return;
                watchdog = setTimeout(() => {
                  if (finished) return;
                  finish();
                  try {
                    task.cancel();
                  } catch {
                    /* the task is already over */
                  }
                  reject(new UploadStepError("dc/stalled"));
                }, READ_UPLOAD_STALL_MS);
              };
              const onOffline = () => {
                offline = true;
                if (watchdog) clearTimeout(watchdog);
                try {
                  task.pause();
                } catch {
                  /* not pausable in this state */
                }
                show({ waitingForNetwork: true });
              };
              const onOnline = () => {
                offline = false;
                try {
                  task.resume();
                } catch {
                  /* not paused */
                }
                show({ waitingForNetwork: false });
                arm();
              };
              const finish = () => {
                finished = true;
                if (watchdog) clearTimeout(watchdog);
                window.removeEventListener("offline", onOffline);
                window.removeEventListener("online", onOnline);
              };
              window.addEventListener("offline", onOffline);
              window.addEventListener("online", onOnline);
              task.on(
                "state_changed",
                (snapshot) => {
                  if (finished) return;
                  if (snapshot.bytesTransferred !== lastBytes) {
                    lastBytes = snapshot.bytesTransferred;
                    arm();
                  }
                  const total = snapshot.totalBytes || file.size || 0;
                  show({
                    stage: "uploading",
                    progress: total > 0 ? Math.min(1, snapshot.bytesTransferred / total) : 0,
                    bytesTransferred: snapshot.bytesTransferred,
                    totalBytes: total,
                    waitingForNetwork: offline || snapshot.state === "paused",
                  });
                },
                (failure) => {
                  if (finished) return;
                  finish();
                  reject(failure);
                },
                () => {
                  if (finished) return;
                  finish();
                  resolve();
                },
              );
              if (typeof navigator !== "undefined" && navigator.onLine === false) onOffline();
              else arm();
            }),
          );
          attempt.task = null;
          landed = { owner, uploadId, storagePath };
        }

        // 5. Finishing: download URL + library document. No percentage exists
        // for these, so the bar goes indeterminate rather than pretending.
        show({ stage: "finalizing", progress: null, bytesTransferred: file.size, waitingForNetwork: false });
        let url: string;
        try {
          url = await step(withTimeout(getDownloadURL(target), DOWNLOAD_URL_TIMEOUT_MS, "dc/url-timeout"));
        } catch (thrown) {
          // Retrying a "finish" whose object is gone must upload again.
          if (errorCode(thrown) === "storage/object-not-found") landed = null;
          throw thrown;
        }
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
        const write = setDoc(doc(db, "users", owner, READ_UPLOAD_COLLECTION, uploadId), payload);
        try {
          await step(withTimeout(write, DOC_WRITE_TIMEOUT_MS, "dc/doc-timeout"));
        } catch (thrown) {
          const code = errorCode(thrown);
          if (code !== "dc/doc-timeout") {
            throw code === "dc/cancelled" ? thrown : Object.assign(new UploadStepError("dc/doc-failed"), { cause: thrown });
          }
          // A slow (or offline) connection: Firestore has the write in its
          // local queue — the live shelf already shows the row from the local
          // cache — and sends it when it can. A late refusal is still
          // reported, with a finish-only Retry.
          const retry: FailedUpload = { file, module, submodule, stored: landed };
          void write.catch((late) => {
            if (attemptRef.current) return; // never stomp on a newer upload's status
            fail(
              errorCode(late) === "permission-denied"
                ? describeUploadError(late, name)
                : describeUploadError(new UploadStepError("dc/doc-failed"), name),
              retry,
            );
          });
        }
        return parseReadUploadDoc({ id: uploadId, ...payload }, owner);
      } catch (thrown) {
        const code = errorCode(thrown);
        // The learner's own Cancel is not an error, and a superseded attempt
        // has nothing left to say.
        if (attempt.cancelled || code === "dc/cancelled" || attemptRef.current !== attempt) return null;
        fail(describeUploadError(thrown, name), code === "dc/not-pdf" ? null : { file, module, submodule, stored: landed });
        return null;
      } finally {
        if (attemptRef.current === attempt) {
          attemptRef.current = null;
          if (mountedRef.current) setUploading(null);
        }
      }
    },
    [uid],
  );

  const uploadPdf = useCallback<UseReadUploadsResult["uploadPdf"]>(
    (file, module, submodule) => runUpload(file, module, submodule, { index: 1, count: 1 }, null),
    [runUpload],
  );

  const uploadPdfs = useCallback<UseReadUploadsResult["uploadPdfs"]>(
    async (files, module, submodule) => {
      const list = Array.isArray(files) ? files.filter(Boolean) : [];
      const stored: ReadUpload[] = [];
      const batch = { cancelled: false };
      batchRef.current = batch;
      try {
        for (let index = 0; index < list.length; index += 1) {
          // Cancel stops the whole pick, not just the file on screen.
          if (batch.cancelled) break;
          const row = await runUpload(list[index], module, submodule, { index: index + 1, count: list.length }, null);
          if (row) stored.push(row);
        }
      } finally {
        if (batchRef.current === batch) batchRef.current = null;
      }
      return stored;
    },
    [runUpload],
  );

  const cancelUpload = useCallback<UseReadUploadsResult["cancelUpload"]>(() => {
    const attempt = attemptRef.current;
    // Once the bytes are stored the document write cannot be taken back, so
    // the (short) finishing step is allowed to complete.
    if (!attempt || attempt.stage === "finalizing") return;
    attempt.cancelled = true;
    attemptRef.current = null;
    if (batchRef.current) batchRef.current.cancelled = true;
    try {
      attempt.task?.cancel();
    } catch {
      /* already over */
    }
    attempt.abort?.(new UploadStepError("dc/cancelled"));
    setUploading(null);
  }, []);

  const retryUpload = useCallback<UseReadUploadsResult["retryUpload"]>(async () => {
    const retry = failedRef.current;
    if (!retry || attemptRef.current) return null;
    return runUpload(retry.file, retry.module, retry.submodule, { index: 1, count: 1 }, retry.stored);
  }, [runUpload]);

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

  const clearUploadError = useCallback(() => {
    // Dismissing the error also forgets the file Retry would have re-sent.
    failedRef.current = null;
    setRetryableName(null);
    setUploadError(null);
  }, []);

  return useMemo(
    () => ({
      uid,
      state,
      error,
      uploads,
      uploading,
      uploadError,
      clearUploadError,
      cancelUpload,
      retryUpload,
      retryableName,
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
      cancelUpload,
      retryUpload,
      retryableName,
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
