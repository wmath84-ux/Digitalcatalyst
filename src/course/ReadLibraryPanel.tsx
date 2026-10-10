// src/course/ReadLibraryPanel.tsx
//
// The Course Player's READ tab — every PDF the course offers, plus the
// learner's OWN files.
//
// ── Two lists, one library ────────────────────────────────────────────────
//   · COURSE READ (unchanged): the accessible Read resources of the unlocked
//     modules, as collected by `utils/readResources.js`.
//   · YOUR ANNOTATIONS (new): the PDFs the learner uploaded from this very
//     page, stored under their own account by `src/course/useReadUploads.ts`.
//     They open in the SAME in-player PDF.js (Mozilla) viewer, with the same
//     annotation tools — the difference is that a learner's own PDF can be
//     SAVED: annotations go back into the stored file and the reading position
//     is written to the account, so the next device opens the same marks.
//
// ── The "+" ───────────────────────────────────────────────────────────────
// Top-right of the library header, exactly where a library grows: one tap
// opens the file picker (PDF only, same 100 MB ceiling the instructor-side
// Read uploads use), the file goes to Storage while the row shows real
// progress, and the viewer opens on it immediately so the learner can start
// annotating without a second tap.
//
// ── Why a learner PDF is different from a course PDF ──────────────────────
// A course PDF is shared content, so its annotations can only ever be local
// (PDF.js keeps them in the viewer). A learner's own PDF is theirs: the save
// button writes the annotated bytes back to their object in Storage — a real
// annotated PDF, which is what "save" means to a student — and the document
// keeps the download URL, the annotation count and the last page read.
//
// ── From the library into a module ────────────────────────────────────────
// "Your annotations" is also the SOURCE of a learner-authored course: every
// own-PDF row offers "Save to my module", which hands the file (as a `read`
// resource carrying its owned Storage path) to the player's existing
// "Add to My Module" dialog — the same one the Player settings use — so it
// lands in a My Study Library module and reopens there in this very viewer.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookMarked,
  BookOpenText,
  Check,
  CloudUpload,
  ExternalLink,
  FileText,
  FolderPlus,
  LoaderCircle,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
  Moon,
  Sun,
} from "lucide-react";
import type { AccessibleReadResource } from "../../utils/readResources.js";
import {
  groupReadUploads,
  readUploadMetaLabel,
  readUploadModuleNames,
  readUploadPageLabel,
  readUploadSyncLabel,
  type ReadUpload,
} from "../../utils/readUploads.js";
import { useAuth } from "../context/AuthContext";
import PdfJsGenericViewer, { type PdfAnnotationApi } from "./PdfJsGenericViewer";
import CourseConfirmDialog from "./ConfirmDeleteDialog";
import useReadUploads, { type ReadUploadProgress } from "./useReadUploads";
import { fetchPdfFromUrl, parseUrlList } from "./readUrlImport";
import { useCourseTheme } from "./playerPreferences";

const pageStorageKey = (productId: string, resourceId: string) =>
  `digitalcatalyst:read-page:${encodeURIComponent(productId)}:${encodeURIComponent(resourceId)}`;

const pageFromStorage = (productId: string, resourceId: string) => {
  try {
    const page = Number(window.localStorage.getItem(pageStorageKey(productId, resourceId)));
    return Number.isInteger(page) && page > 0 ? page : 1;
  } catch {
    return 1;
  }
};

const writePageToStorage = (productId: string, resourceId: string, page: number) => {
  try {
    window.localStorage.setItem(pageStorageKey(productId, resourceId), String(page));
  } catch {
    // Browsers in private storage mode can refuse localStorage; the live
    // Generic Viewer still retains its current page while it remains open.
  }
};

/** `course:<id>` / `mine:<id>` — one reader, two sources, no id collisions. */
type ActiveKind = "course" | "learner";

const withKind = (kind: ActiveKind, id: string) => `${kind}:${id}`;
const kindOf = (activeId: string | null): ActiveKind | null =>
  activeId?.startsWith("mine:") ? "learner" : activeId?.startsWith("course:") ? "course" : null;
const bareId = (activeId: string | null) => (activeId ? activeId.slice(activeId.indexOf(":") + 1) : "");

type AnnotationState = "idle" | "dirty" | "saving" | "saved" | "error";

/**
 * Handing a learner's own PDF to the player's "Add to My Module" dialog. The
 * dialog (and the My Study Library write behind it) is owned by the Course
 * Player — this panel only says WHICH file the learner picked.
 */
export type ReadUploadModuleRequest = (row: ReadUpload) => void;

const formatMegabytes = (bytes: number) => `${(Math.max(0, bytes) / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;

/**
 * The upload's honest status: what step it is on, real byte progress while
 * bytes move (indeterminate while a step has no measurable progress), Cancel
 * while it can still be stopped, and — after a failure — the reason with
 * Retry / Dismiss. Rendered in the library AND inside the compose sheet (which
 * covers the library while it is open).
 */
function UploadStatus({
  uploading,
  error,
  canRetry,
  onCancel,
  onRetry,
  onDismiss,
  className = "",
}: {
  uploading: ReadUploadProgress | null;
  error: string | null;
  canRetry: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
  className?: string;
}) {
  if (uploading) {
    const batch = uploading.fileCount > 1 ? ` (${uploading.fileIndex} of ${uploading.fileCount})` : "";
    const percent = uploading.progress === null ? null : Math.round(uploading.progress * 100);
    const label =
      uploading.stage === "preparing"
        ? `Preparing ${uploading.name}${batch}…`
        : uploading.stage === "finalizing"
          ? `Adding ${uploading.name}${batch} to your library…`
          : uploading.waitingForNetwork
            ? `Waiting for a connection — ${uploading.name}${batch} resumes automatically`
            : `Uploading ${uploading.name}${batch}`;
    return (
      <div className={className} role="status" aria-live="polite" data-course-read-upload-progress data-stage={uploading.stage}>
        <div className="flex items-center gap-2 text-[11px] font-semibold text-violet-100">
          <CloudUpload size={14} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate" data-course-read-upload-stage>{label}</span>
          {uploading.stage === "uploading" && percent !== null ? (
            <span className="shrink-0 tabular-nums text-violet-200/80">
              <span className="hidden sm:inline">{formatMegabytes(uploading.bytesTransferred)} / {formatMegabytes(uploading.totalBytes)} · </span>
              {percent}%
            </span>
          ) : null}
          {uploading.stage !== "finalizing" ? (
            <button
              type="button"
              onClick={onCancel}
              className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold text-violet-100 hover:bg-white/10"
              data-course-read-upload-cancel
            >
              Cancel
            </button>
          ) : null}
        </div>
        <div
          className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          {...(percent !== null ? { "aria-valuenow": percent } : {})}
        >
          {percent !== null ? (
            <div className="h-full rounded-full bg-violet-400 transition-[width] duration-300" style={{ width: `${percent}%` }} />
          ) : (
            // No percentage exists for this step — say so instead of faking one.
            <div className="h-full w-full animate-pulse rounded-full bg-violet-400/60" data-course-read-upload-indeterminate />
          )}
        </div>
      </div>
    );
  }
  if (!error) return null;
  return (
    <div className={`flex items-start gap-2 ${className}`} role="alert" data-course-read-upload-error>
      <span className="min-w-0 flex-1">{error}</span>
      {canRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-300/20 px-2 py-0.5 font-bold text-amber-50 hover:bg-amber-300/30"
          data-course-read-upload-retry
        >
          <RotateCcw size={12} aria-hidden="true" />
          Retry
        </button>
      ) : null}
      <button
        type="button"
        onClick={onDismiss}
        className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-amber-100/80 hover:bg-white/10"
        aria-label="Dismiss"
        data-course-read-upload-dismiss
      >
        <X size={12} aria-hidden="true" />
      </button>
    </div>
  );
}

export default function ReadLibraryPanel({
  entries,
  productId,
  onAddToModule,
}: {
  entries: AccessibleReadResource[];
  productId: string;
  onAddToModule?: ReadUploadModuleRequest;
}) {
  const { user } = useAuth();
  const readUploads = useReadUploads(user?.id);
  // Read light/dark (§20/§21): the SAME shared, per-user theme layer the rest
  // of the player uses — persisted, never a second theme system.
  const readThemeCtl = useCourseTheme("read", user?.id ?? null);

  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pagePositions, setPagePositions] = useState<Record<string, number>>({});
  const [annotationState, setAnnotationState] = useState<AnnotationState>("idle");
  const [leaveBlocked, setLeaveBlocked] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ReadUpload | null>(null);
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [moduleDraft, setModuleDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [libraryMode, setLibraryMode] = useState<"course" | "mine">("course");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeModule, setComposeModule] = useState("");
  const [composeSubmodule, setComposeSubmodule] = useState("");
  const [composeFiles, setComposeFiles] = useState<File[]>([]);
  // ── Add PDFs from a link (Part 2 §5–§13) ─────────────────────────────────
  // Links are fetched and validated here; the bytes then join `composeFiles`,
  // so the upload itself is the SAME path a locally chosen PDF takes.
  const [urlDraft, setUrlDraft] = useState("");
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlRows, setUrlRows] = useState<{ raw: string; stage: "fetching" | "ready" | "error"; detail?: string }[]>([]);
  const urlAbortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composeInputRef = useRef<HTMLInputElement | null>(null);
  const annotationApiRef = useRef<PdfAnnotationApi | null>(null);
  const readUploadsRef = useRef(readUploads);
  readUploadsRef.current = readUploads;

  const activeKind = kindOf(activeId);
  const activeEntry = activeKind === "course" ? entries.find((entry) => entry.id === bareId(activeId)) || null : null;
  const activeUpload =
    activeKind === "learner" ? readUploads.uploads.find((row) => row.id === bareId(activeId)) || null : null;
  const activeUploadRef = useRef<ReadUpload | null>(null);
  activeUploadRef.current = activeUpload;

  const needle = query.trim().toLocaleLowerCase();

  const filteredEntries = useMemo(() => {
    if (!needle) return entries;
    return entries.filter((entry) =>
      [
        entry.resource.name,
        entry.modulePath.join(" "),
        entry.presentation.label,
        entry.resource.readFileName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle),
    );
  }, [entries, needle]);

  const filteredUploads = useMemo(() => {
    if (!needle) return readUploads.uploads;
    return readUploads.uploads.filter((row) => [row.name, row.module].filter(Boolean).join(" ").toLocaleLowerCase().includes(needle));
  }, [readUploads.uploads, needle]);

  const uploadGroups = useMemo(() => groupReadUploads(filteredUploads), [filteredUploads]);
  const moduleNames = useMemo(() => readUploadModuleNames(readUploads.uploads), [readUploads.uploads]);

  // ── Course-entry paging (unchanged behaviour) ───────────────────────────
  const savePage = useCallback(
    (resourceId: string, page: number) => {
      setPagePositions((current) => (current[resourceId] === page ? current : { ...current, [resourceId]: page }));
      writePageToStorage(productId, resourceId, page);
    },
    [productId],
  );

  const reportCoursePage = useCallback(
    (page: number) => {
      if (activeEntry) savePage(activeEntry.id, page);
    },
    [activeEntry, savePage],
  );

  /** A learner's page = same device memory + the account's synced position. */
  const reportLearnerPage = useCallback(
    (page: number) => {
      const upload = activeUploadRef.current;
      if (!upload) return;
      writePageToStorage(productId, `mine-${upload.id}`, page);
      readUploadsRef.current.recordActivity(upload.id, page, upload.pageCount);
    },
    [productId],
  );

  const activePage = activeEntry
    ? pagePositions[activeEntry.id] || pageFromStorage(productId, activeEntry.id)
    : 1;

  const learnerInitialPage = activeUpload
    ? pagePositions[`mine-${activeUpload.id}`] || activeUpload.lastPage || pageFromStorage(productId, `mine-${activeUpload.id}`)
    : 1;

  // ── Annotation save ────────────────────────────────────────────────────
  const saveAnnotationsNow = useCallback(async (): Promise<boolean> => {
    const api = annotationApiRef.current;
    const upload = activeUploadRef.current;
    if (!api || !upload) return true;
    if (!api.isDirty()) return true;
    setAnnotationState("saving");
    try {
      const bytes = await api.saveAnnotatedBytes();
      const ok = await readUploadsRef.current.saveAnnotations(upload.id, bytes, {
        pageCount: api.pageCount(),
        annotationCount: api.annotationCount(),
      });
      setAnnotationState(ok ? "saved" : "error");
      return ok;
    } catch {
      setAnnotationState("error");
      return false;
    }
  }, []);

  /** The "Saved" pill is a moment, not a state — it fades back to idle. */
  useEffect(() => {
    if (annotationState !== "saved") return undefined;
    const timer = setTimeout(() => setAnnotationState((current) => (current === "saved" ? "idle" : current)), 2600);
    return () => clearTimeout(timer);
  }, [annotationState]);

  // Watch the viewer's own dirty flag while a learner PDF is open: the bridge
  // is deliberately not React state (the viewer owns it), so the chrome polls
  // the cheap boolean rather than the viewer re-rendering the panel.
  useEffect(() => {
    if (activeKind !== "learner") return undefined;
    const timer = setInterval(() => {
      const api = annotationApiRef.current;
      if (!api) return;
      setAnnotationState((current) => (current === "saving" ? current : api.isDirty() ? "dirty" : current));
    }, 1200);
    return () => clearInterval(timer);
  }, [activeKind, activeId]);

  /**
   * The failure net: if the annotated bytes cannot reach Storage (offline, a
   * rules mistake, an expired session), the learner can take the annotated PDF
   * with them instead of losing the marks. Same bytes, no account involved.
   */
  const downloadAnnotatedCopy = useCallback(async () => {
    const api = annotationApiRef.current;
    const upload = activeUploadRef.current;
    if (!api || !upload) return;
    try {
      const bytes = await api.saveAnnotatedBytes();
      const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${upload.name.replace(/\.pdf$/i, "").trim() || "my-pdf"}-annotated.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      // Nothing else to try — the banner already says what happened.
    }
  }, []);

  const closeReader = useCallback(() => {
    setActiveId(null);
    setLeaveBlocked(false);
    setAnnotationState("idle");
    annotationApiRef.current = null;
  }, []);

  const leaveReader = useCallback(async () => {
    if (activeKind !== "learner") {
      closeReader();
      return;
    }
    const saved = await saveAnnotationsNow();
    if (saved) closeReader();
    else setLeaveBlocked(true);
  }, [activeKind, closeReader, saveAnnotationsNow]);

  // A tab switch / panel unmount must not eat unsaved marks: best-effort save
  // with the bridge that is still alive at cleanup time.
  useEffect(
    () => () => {
      const api = annotationApiRef.current;
      const upload = activeUploadRef.current;
      if (!api || !upload || !api.isDirty()) return;
      void api
        .saveAnnotatedBytes()
        .then((bytes) =>
          readUploadsRef.current.saveAnnotations(upload.id, bytes, {
            pageCount: api.pageCount(),
            annotationCount: api.annotationCount(),
          }),
        )
        .catch(() => undefined);
    },
    [activeId],
  );

  // ── Upload ─────────────────────────────────────────────────────────────
  const handlePickedFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      setNotice(null);
      const row = await readUploadsRef.current.uploadPdf(file, composeModule, composeSubmodule);
      if (!row) return;
      setNotice(`“${row.name}” is in Your annotations — annotate it and it saves to your account.`);
      setActiveId(withKind("learner", row.id));
    },
    [composeModule, composeSubmodule],
  );

  const retryUpload = useCallback(async () => {
    setNotice(null);
    const row = await readUploadsRef.current.retryUpload();
    if (!row) return;
    setComposeFiles([]);
    setComposeOpen(false);
    setNotice(`“${row.name}” is in Your annotations — annotate it and it saves to your account.`);
    setActiveId(withKind("learner", row.id));
  }, []);
  const cancelUpload = useCallback(() => readUploadsRef.current.cancelUpload(), []);
  const dismissUploadError = useCallback(() => readUploadsRef.current.clearUploadError(), []);

  // Never leave a link fetch running after the panel goes away.
  useEffect(
    () => () => {
      urlAbortRef.current?.abort();
      urlAbortRef.current = null;
    },
    [],
  );

  /**
   * Fetch every pasted link, one at a time, keeping each result separate: a
   * link that fails never hides behind the ones that worked, and a link that
   * worked is never lost because its neighbour failed.
   */
  const importFromUrls = useCallback(async () => {
    const targets = parseUrlList(urlDraft);
    if (!targets.length) {
      setUrlRows([]);
      return;
    }
    const controller = new AbortController();
    urlAbortRef.current = controller;
    setUrlBusy(true);
    setUrlRows(targets.map((target) => ({ raw: target.raw, stage: "fetching" as const })));

    const fetched: File[] = [];
    for (let i = 0; i < targets.length; i++) {
      if (controller.signal.aborted) break;
      const result = await fetchPdfFromUrl(targets[i], controller.signal);
      setUrlRows((prev) =>
        prev.map((row, idx) =>
          idx === i
            ? result.ok
              ? { raw: row.raw, stage: "ready" as const, detail: result.pdf.file.name }
              : { raw: row.raw, stage: "error" as const, detail: result.error.message }
            : row,
        ),
      );
      if (result.ok) fetched.push(result.pdf.file);
    }

    if (fetched.length) setComposeFiles((prev) => [...prev, ...fetched]);
    setUrlBusy(false);
    urlAbortRef.current = null;
  }, [urlDraft]);

  const openUploadPicker = useCallback(() => {
    readUploadsRef.current.clearUploadError();
    setLibraryMode("mine");
    setComposeOpen(true);
  }, []);

  const submitCompose = useCallback(async () => {
    const files = composeFiles;
    if (!files.length) {
      composeInputRef.current?.click();
      return;
    }
    setNotice(null);
    const stored = await readUploadsRef.current.uploadPdfs(files, composeModule, composeSubmodule);
    // Nothing stored (cancelled, or the only file failed): keep the sheet and
    // the picked files, so Upload / Retry is one tap away.
    if (!stored.length) return;
    setComposeFiles([]);
    setComposeOpen(false);
    setNotice(
      stored.length === 1
        ? `“${stored[0].name}” is in Your annotations — annotate it and it saves to your account.`
        : `${stored.length} PDFs are in Your annotations.`,
    );
    setActiveId(withKind("learner", stored[0].id));
  }, [composeFiles, composeModule, composeSubmodule]);

  const handleDelete = useCallback(async () => {
    const target = confirmDelete;
    setConfirmDelete(null);
    if (!target) return;
    const removed = await readUploadsRef.current.removeUpload(target.id);
    if (removed) {
      if (bareId(activeId) === target.id) closeReader();
      setNotice(`“${target.name}” was removed from Your annotations.`);
    }
  }, [activeId, closeReader, confirmDelete]);

  const saveModuleDraft = useCallback(async () => {
    const target = editingModuleId;
    setEditingModuleId(null);
    if (!target) return;
    await readUploadsRef.current.setUploadModule(target, moduleDraft);
  }, [editingModuleId, moduleDraft]);

  const uploadBusy = Boolean(readUploads.uploading);

  return (
    <section
      className="relative h-full min-h-0 overflow-hidden bg-slate-950 text-white"
      aria-label="Read library"
      data-course-read-panel
      data-course-read-theme={readThemeCtl.theme}
    >
      {/* Keep the searchable library mounted behind the reader. Its query and
          scroll position survive opening a PDF and returning with Back. */}
      <div className={`flex h-full min-h-0 flex-col ${activeId ? "hidden" : ""}`} aria-hidden={Boolean(activeId)} data-course-read-library>
        <div className="shrink-0 border-b border-white/10 px-3 pb-3 pt-3 sm:px-4">
          <div className="mb-2 flex items-center gap-2">
            <BookOpenText size={17} className="shrink-0 text-violet-300" aria-hidden="true" />
            <h2 className="text-sm font-bold text-white">Read library</h2>
            <div
              className="inline-flex shrink-0 items-center rounded-full border border-white/10 bg-white/[0.05] p-0.5"
              role="tablist"
              aria-label="Read library source"
              data-course-read-mode-switch
            >
              <button
                type="button"
                role="tab"
                aria-pressed={libraryMode === "course"}
                onClick={() => setLibraryMode("course")}
                className={`h-7 rounded-full px-2.5 text-[10px] font-bold ${libraryMode === "course" ? "bg-violet-500 text-white" : "text-slate-300 hover:text-white"}`}
                data-course-read-mode="course"
                title="Course PDFs from the product builder"
              >
                Course
              </button>
              <button
                type="button"
                role="tab"
                aria-pressed={libraryMode === "mine"}
                onClick={() => setLibraryMode("mine")}
                className={`h-7 rounded-full px-2.5 text-[10px] font-bold ${libraryMode === "mine" ? "bg-emerald-500 text-white" : "text-slate-300 hover:text-white"}`}
                data-course-read-mode="mine"
                title="Your own modules and PDFs"
              >
                My PDFs
              </button>
            </div>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-300" aria-label={`${libraryMode === "course" ? entries.length : readUploads.uploads.length} resources`}>
              {libraryMode === "course" ? entries.length : readUploads.uploads.length}
            </span>
            <button
              type="button"
              onClick={readThemeCtl.toggleTheme}
              aria-pressed={readThemeCtl.theme === "light"}
              aria-label={readThemeCtl.theme === "light" ? "Switch Read to dark theme" : "Switch Read to light theme"}
              title={readThemeCtl.theme === "light" ? "Dark theme" : "Light theme"}
              data-course-read-theme-toggle={readThemeCtl.theme}
              className="ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-slate-300 transition-colors hover:bg-white/[0.09] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              {readThemeCtl.theme === "light" ? <Moon size={15} aria-hidden="true" /> : <Sun size={15} aria-hidden="true" />}
            </button>
            {/* The library grows here: a learner's own PDF, in one tap. */}
            <button
              type="button"
              onClick={openUploadPicker}
              disabled={uploadBusy}
              aria-label="Upload your own PDF"
              title="Upload your own PDF"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-violet-300/30 bg-violet-400/15 px-2.5 text-[11px] font-bold text-violet-100 transition-colors hover:bg-violet-400/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
              data-course-read-upload
            >
              {uploadBusy ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
              <span className="hidden sm:inline">Upload PDF</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] || null;
                event.currentTarget.value = "";
                void handlePickedFile(file);
              }}
              data-course-read-upload-input
            />
            <input
              ref={composeInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="sr-only"
              onChange={(event) => {
                const picked = Array.from(event.currentTarget.files || []);
                event.currentTarget.value = "";
                if (picked.length) setComposeFiles((current) => [...current, ...picked]);
              }}
              data-course-read-compose-input
            />
          </div>
          <label className="sr-only" htmlFor="course-read-search">Search Read resources</label>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              id="course-read-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles or modules…"
              autoComplete="off"
              className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.06] pl-9 pr-10 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/70 focus:ring-2 focus:ring-violet-400/20"
              data-course-read-search
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        </div>

        {/* Upload progress + failures: one honest line, never a silent wait. */}
        <UploadStatus
          uploading={readUploads.uploading}
          error={readUploads.uploadError}
          canRetry={Boolean(readUploads.retryableName)}
          onCancel={cancelUpload}
          onRetry={() => void retryUpload()}
          onDismiss={dismissUploadError}
          className={
            readUploads.uploading
              ? "shrink-0 border-b border-white/10 px-3 py-2 sm:px-4"
              : "shrink-0 border-b border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[11px] font-semibold text-amber-100 sm:px-4"
          }
        />
        {notice ? (
          <div className="shrink-0 border-b border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[11px] font-semibold text-emerald-100 sm:px-4" role="status" data-course-read-notice>
            {notice}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4" data-course-read-list>
          {libraryMode === "mine" ? (
          <>
          {/* ── Your annotations ─────────────────────────────────────────── */}
          <section className="mb-4" aria-label="Your annotations" data-course-read-mine>
            <div className="mb-2 flex items-center gap-2">
              <CloudUpload size={14} className="shrink-0 text-emerald-300" aria-hidden="true" />
              <h3 className="text-[11px] font-black uppercase tracking-[0.12em] text-emerald-200/90">Your annotations</h3>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                {readUploads.uploads.length}
              </span>
            </div>
            <p className="mb-2 text-[10px] leading-4 text-slate-400">
              Your own PDFs open in the same viewer as course PDFs — annotate them and the marks save to your account.
            </p>

            {uploadGroups.every((group) => group.items.length === 0) ? (
              <div className="rounded-2xl border border-dashed border-white/15 px-4 py-10 text-center" data-course-read-mine-empty>
                <FileText size={42} className="mx-auto mb-3 text-emerald-300/80" aria-hidden="true" />
                <p className="text-xs font-semibold text-slate-300">
                  {readUploads.uploads.length === 0 ? "No PDFs of your own yet." : "No uploads match this search."}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">Create a module, add a submodule, and upload one or more PDFs.</p>
                <button
                  type="button"
                  onClick={openUploadPicker}
                  disabled={uploadBusy}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-violet-300/30 bg-violet-400/15 px-3 py-1.5 text-[11px] font-bold text-violet-100 hover:bg-violet-400/25 disabled:opacity-50"
                >
                  <Plus size={13} aria-hidden="true" /> Upload a PDF
                </button>
              </div>
            ) : (
              uploadGroups.map((group) => (
                <div key={group.module || "__default"} className="mb-2" data-course-read-mine-group={group.module || "default"}>
                  {group.module ? (
                    <p className="mb-1 mt-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                      <FolderPlus size={12} aria-hidden="true" /> {group.module}
                    </p>
                  ) : null}
                  {(group.submodules || [{ submodule: "", items: group.items }]).map((bucket) => (
                  <div key={`${group.module || "default"}:${bucket.submodule || "root"}`}>
                  {bucket.submodule ? (
                    <p className="mb-1 ml-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">{bucket.submodule}</p>
                  ) : null}
                  <ul className="space-y-2" aria-label={group.module ? `${group.module} PDFs` : "Your uploaded PDFs"}>
                    {bucket.items.map((row) => {
                      const meta = [readUploadMetaLabel(row), readUploadPageLabel(row)].filter(Boolean).join(" · ");
                      return (
                        <li key={row.id} className="rounded-2xl border border-white/10 bg-white/[0.045]" data-course-read-mine-row={row.id}>
                          <div className="flex items-center gap-2 p-2.5">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-200" aria-hidden="true">
                              <FileText size={18} />
                            </span>
                            <button
                              type="button"
                              onClick={() => setActiveId(withKind("learner", row.id))}
                              className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                              data-course-read-open={`mine:${row.id}`}
                            >
                              <span className="block truncate text-[13px] font-bold text-white">{row.name}</span>
                              <span className="mt-0.5 block truncate text-[10px] text-slate-400">{meta}</span>
                              {row.hasAnnotations ? (
                                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-200">
                                  <Check size={9} aria-hidden="true" /> Annotated
                                </span>
                              ) : null}
                            </button>
                            {onAddToModule ? (
                              <button
                                type="button"
                                onClick={() => onAddToModule(row)}
                                aria-label={`Save ${row.name} to one of my modules`}
                                title="Save to my module (My Study Library)"
                                className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-violet-200"
                                data-course-read-add-to-module={row.id}
                              >
                                <BookMarked size={15} aria-hidden="true" />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingModuleId((current) => (current === row.id ? null : row.id));
                                setModuleDraft(row.module || "");
                              }}
                              aria-label={`Move ${row.name} to a module`}
                              title="Move to a module"
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                            >
                              <FolderPlus size={15} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(row)}
                              aria-label={`Delete ${row.name}`}
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-rose-500/15 hover:text-rose-200"
                            >
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          </div>
                          {editingModuleId === row.id ? (
                            <div className="flex items-center gap-2 border-t border-white/10 px-2.5 py-2" data-course-read-module-editor>
                              <input
                                value={moduleDraft}
                                onChange={(event) => setModuleDraft(event.currentTarget.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") void saveModuleDraft();
                                  if (event.key === "Escape") setEditingModuleId(null);
                                }}
                                list="course-read-module-names"
                                placeholder="Module name (blank = unsorted)"
                                aria-label="Module name"
                                className="h-9 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-2.5 text-xs text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/70"
                              />
                              <datalist id="course-read-module-names">
                                {moduleNames.map((name) => (
                                  <option key={name} value={name} />
                                ))}
                              </datalist>
                              <button
                                type="button"
                                onClick={() => void saveModuleDraft()}
                                className="h-9 shrink-0 rounded-xl bg-emerald-500/80 px-3 text-[11px] font-bold text-white hover:bg-emerald-500"
                              >
                                Save
                              </button>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                  </div>
                  ))}
                </div>
              ))
            )}
          </section>
          </>
          ) : (
          <>
          {/* ── Course Read resources ───────────────────────────────────── */}
          {filteredEntries.length === 0 ? (
            <div className="grid min-h-32 place-items-center px-5 text-center" role="status" data-course-read-empty>
              <div>
                <FileText size={25} className="mx-auto mb-2 text-slate-500" aria-hidden="true" />
                <p className="text-xs font-semibold text-slate-300">
                  {entries.length === 0 ? "No Read resources are available in your unlocked modules." : "No resources match this search."}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">Read resources are available here when your course access allows them.</p>
              </div>
            </div>
          ) : (
            <ul className="space-y-2" aria-label="Available Read resources">
              {filteredEntries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(withKind("course", entry.id))}
                    className="group flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3 text-left transition hover:border-violet-300/40 hover:bg-violet-400/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                    data-course-read-open={entry.id}
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-violet-300/20 bg-violet-400/10 text-violet-200" aria-hidden="true">
                      {entry.presentation.kind === "pdfjs" ? <FileText size={19} /> : <ExternalLink size={18} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold text-white">{entry.resource.name || "Untitled reading"}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-slate-400">{entry.modulePath.join(" / ")}</span>
                      <span className="mt-1 block truncate text-[10px] font-medium text-violet-200/90">
                        {entry.resource.readFileName || entry.presentation.label}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] font-semibold text-slate-400 group-hover:text-violet-200">
                      {entry.presentation.kind === "pdfjs"
                        ? "Read PDF"
                        : entry.presentation.kind === "drive"
                          ? "Open in Drive"
                          : "Open"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          </>
          )}
        </div>
      </div>

      <div className={`absolute inset-0 flex min-h-0 flex-col bg-slate-950 ${activeId ? "" : "hidden"}`} aria-hidden={!activeId} data-course-read-reader>
        {activeEntry || activeUpload ? (
          <>
            <div className="z-10 flex shrink-0 items-center gap-2 border-b border-white/10 bg-slate-950/95 px-3 py-2 sm:px-4">
              <button
                type="button"
                onClick={() => void leaveReader()}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-xs font-semibold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                aria-label="Back to Read library"
                data-course-read-back
              >
                <ArrowLeft size={15} aria-hidden="true" />
                <span>Library</span>
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-white">
                  {activeEntry ? activeEntry.resource.name || "Reading" : activeUpload?.name || "Your PDF"}
                </p>
                <p className="truncate text-[10px] text-slate-400">
                  {activeEntry ? activeEntry.modulePath.join(" / ") : [activeUpload?.module, readUploadMetaLabel(activeUpload || undefined)].filter(Boolean).join(" · ")}
                </p>
              </div>
              {activeUpload ? (
                <>
                  <span
                    className={`hidden shrink-0 rounded-full px-2 py-1 text-[9px] font-bold sm:inline-flex ${
                      annotationState === "error"
                        ? "bg-amber-400/20 text-amber-100"
                        : annotationState === "saved"
                          ? "bg-emerald-400/20 text-emerald-100"
                          : annotationState === "saving"
                            ? "bg-white/10 text-slate-200"
                            : "bg-white/[0.06] text-slate-300"
                    }`}
                    data-course-read-annotation-state={annotationState}
                  >
                    {annotationState === "idle" ? "Annotations save to your account" : readUploadSyncLabel(annotationState)}
                  </span>
                  {annotationState === "dirty" || annotationState === "error" ? (
                    <button
                      type="button"
                      onClick={() => void saveAnnotationsNow()}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500/85 px-3 text-[11px] font-black text-white hover:bg-emerald-500"
                      data-course-read-save-annotations
                    >
                      <CloudUpload size={14} aria-hidden="true" /> Save
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <span className="hidden shrink-0 rounded-full bg-white/[0.06] px-2 py-1 text-[9px] font-semibold text-slate-300 sm:inline-flex">
                    {activeEntry?.presentation.label}
                  </span>
                  {/* Drive decides whether its viewer may be framed (a file
                      that is not shared with the link shows Google's own
                      "request access" page). This is the same escape hatch
                      every other Drive surface in the player offers. */}
                  {activeEntry?.presentation.kind === "drive" ? (
                    <a
                      href={activeEntry.presentation.originalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-[11px] font-semibold text-white hover:bg-white/10"
                      data-course-read-open-drive
                    >
                      <ExternalLink size={13} aria-hidden="true" />
                      <span className="hidden sm:inline">Open in Drive</span>
                    </a>
                  ) : null}
                </>
              )}
            </div>

            {/* A failed save never traps the learner — and never lies about it. */}
            {leaveBlocked && activeUpload ? (
              <div className="z-10 flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] font-semibold text-amber-100 sm:px-4" role="alert" data-course-read-save-blocked>
                <span className="min-w-0 flex-1">Annotations have not reached your account yet.</span>
                <button
                  type="button"
                  onClick={() => void saveAnnotationsNow().then((ok) => ok && closeReader())}
                  className="rounded-lg border border-amber-200/40 px-2.5 py-1 font-bold hover:bg-amber-200/15"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => void downloadAnnotatedCopy()}
                  className="rounded-lg border border-amber-200/40 px-2.5 py-1 font-bold hover:bg-amber-200/15"
                  data-course-read-download-annotated
                >
                  Download a copy
                </button>
                <button type="button" onClick={closeReader} className="rounded-lg px-2.5 py-1 font-bold text-amber-100/80 underline underline-offset-2 hover:text-white">
                  Leave anyway
                </button>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-hidden" data-course-read-document>
              {activeUpload ? (
                <PdfJsGenericViewer
                  key={activeUpload.id}
                  src={activeUpload.url}
                  title={activeUpload.name}
                  productId={productId}
                  resourceId={`mine-${activeUpload.id}`}
                  initialPage={learnerInitialPage}
                  onPageChange={reportLearnerPage}
                  onAnnotationApi={(api) => {
                    annotationApiRef.current = api;
                    setAnnotationState(api && api.isDirty() ? "dirty" : "idle");
                  }}
                />
              ) : activeEntry && activeEntry.presentation.kind === "pdfjs" ? (
                <PdfJsGenericViewer
                  key={activeEntry.id}
                  src={activeEntry.presentation.sourceUrl}
                  title={activeEntry.resource.name || "Read PDF"}
                  productId={productId}
                  resourceId={activeEntry.id}
                  initialPage={activePage}
                  onPageChange={reportCoursePage}
                />
              ) : activeEntry && activeEntry.presentation.kind === "drive" ? (
                /*
                  Google Drive PDF. Drive never lets a browser read the file's
                  bytes (its download URL redirects to googleusercontent.com
                  without a CORS header), so PDF.js used to open an empty
                  0-page document. Drive's own embeddable viewer is the frame
                  Google actually serves, and it is the same rendering the
                  Course Player already uses for Drive files — see
                  `getReadResourcePresentation` in utils/readResources.js.
                */
                <iframe
                  key={activeEntry.id}
                  title={`${activeEntry.resource.name || "Read resource"} — Google Drive viewer`}
                  src={activeEntry.presentation.sourceUrl}
                  className="h-full w-full border-0 bg-white"
                  // Drive's viewer needs its scripts, its cookies/storage
                  // (allow-same-origin) and the share/print/download flows;
                  // the identical list guards the player's Drive previews in
                  // src/course/ResourceViewer.tsx.
                  sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-same-origin allow-presentation"
                  allow="fullscreen; clipboard-write"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  loading="lazy"
                  data-course-read-drive
                />
              ) : activeEntry ? (
                <iframe
                  title={`${activeEntry.resource.name || "Read resource"} — embedded webpage`}
                  src={activeEntry.presentation.sourceUrl}
                  className="h-full w-full border-0 bg-white"
                  sandbox="allow-scripts allow-forms allow-popups allow-downloads"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  data-course-read-embed
                />
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {composeOpen ? (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/50 p-3 sm:items-center" data-course-read-compose>
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Create your module</h3>
              <button type="button" onClick={() => setComposeOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Module name
              <input
                value={composeModule}
                onChange={(event) => setComposeModule(event.currentTarget.value)}
                placeholder="e.g. Physics"
                className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/70"
              />
            </label>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Submodule
              <input
                value={composeSubmodule}
                onChange={(event) => setComposeSubmodule(event.currentTarget.value)}
                placeholder="e.g. Chapter 1 (optional)"
                className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/70"
              />
            </label>
            <button
              type="button"
              onClick={() => composeInputRef.current?.click()}
              className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/[0.04] px-3 py-6 text-xs font-bold text-slate-200 hover:bg-white/[0.07]"
            >
              <FileText size={22} className="text-emerald-300" aria-hidden="true" />
              {composeFiles.length ? `${composeFiles.length} PDF${composeFiles.length === 1 ? "" : "s"} selected — tap to add more` : "Choose PDFs"}
            </button>
            {composeFiles.length ? (
              <ul className="mb-3 max-h-28 overflow-y-auto text-[11px] text-slate-300">
                {composeFiles.map((file) => (
                  <li key={`${file.name}-${file.size}`} className="truncate px-1 py-0.5">
                    {file.name}
                  </li>
                ))}
              </ul>
            ) : null}
            {/* ── Or add them from a link (Part 2 §5–§13) ───────────────────
                Same overlay, same upload path: each link is fetched, its bytes
                are proven to be a real PDF, then it joins the list above and
                goes up through the very same `uploadPdfs` call. */}
            <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.03] p-3" data-course-read-url-import>
              <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                Or paste PDF links
                <textarea
                  value={urlDraft}
                  onChange={(event) => setUrlDraft(event.currentTarget.value)}
                  rows={2}
                  placeholder={"https://example.com/notes.pdf\nOne link per line"}
                  className="mt-1 w-full resize-y rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-[12px] text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/70"
                  data-course-read-url-input
                />
              </label>
              <button
                type="button"
                onClick={() => void importFromUrls()}
                disabled={urlBusy || !urlDraft.trim()}
                className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-[11px] font-bold text-emerald-100 hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                data-course-read-url-add
              >
                {urlBusy ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}
                {urlBusy ? "Checking links…" : "Fetch from links"}
              </button>
              {urlRows.length ? (
                <ul className="mt-2 space-y-1 text-[11px]" data-course-read-url-results>
                  {urlRows.map((row) => (
                    <li
                      key={row.raw}
                      className={
                        row.stage === "error"
                          ? "rounded-lg border border-rose-400/20 bg-rose-400/10 px-2 py-1 text-rose-100"
                          : row.stage === "ready"
                            ? "rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-emerald-100"
                            : "px-2 py-1 text-slate-300"
                      }
                    >
                      <span className="block truncate font-semibold">{row.raw}</span>
                      {row.stage === "fetching" ? <span className="block text-slate-400">Fetching…</span> : null}
                      {row.stage === "ready" ? <span className="block">Ready — {row.detail}</span> : null}
                      {row.stage === "error" ? <span className="block">{row.detail}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                The site hosting the file has to allow the app to read it. Private or sign-in links
                will not work — download that file and use Choose PDFs instead.
              </p>
            </div>
            {readUploads.uploading || readUploads.uploadError ? (
              <UploadStatus
                uploading={readUploads.uploading}
                error={readUploads.uploadError}
                canRetry={Boolean(readUploads.retryableName)}
                onCancel={cancelUpload}
                onRetry={() => void retryUpload()}
                onDismiss={dismissUploadError}
                className={
                  readUploads.uploading
                    ? "mb-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2"
                    : "mb-3 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[11px] font-semibold text-amber-100"
                }
              />
            ) : null}
            <button
              type="button"
              onClick={() => void submitCompose()}
              disabled={uploadBusy}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-xs font-black text-white hover:bg-emerald-400 disabled:opacity-50"
            >
              {uploadBusy ? <LoaderCircle size={15} className="animate-spin" /> : <CloudUpload size={15} />}
              Upload to my module
            </button>
          </div>
        </div>
      ) : null}

      <CourseConfirmDialog
        theme={readThemeCtl.theme}
        open={Boolean(confirmDelete)}
        title="Delete this PDF?"
        message={`“${confirmDelete?.name || "This PDF"}” will be removed from Your annotations, along with the annotations saved in it. This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(null)}
      />
    </section>
  );
}
