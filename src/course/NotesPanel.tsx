// src/course/NotesPanel.tsx
//
// Course Player notes: a HEADLESS page, one library panel, one writing page.
//
// ── The three places ──────────────────────────────────────────────────────
//   · HOME (this panel's entry state) — a clean, headerless page with three
//     centred buttons: New note · My Library · Course Library. Nothing else:
//     there is no header on any notes page, and no button anywhere that opens
//     a side panel.
//   · THE LIBRARY PANEL — the ONE side panel (the owner's brief: "yah side
//     panel almost full page hi hoga, bus right side se thoda sa page kam
//     hoga"). It is anchored left and covers the page except a thin strip on
//     the right, so it reads as a panel; tapping that strip (or Escape) closes
//     it. Its top centre carries the shared MASTER / SELF control, its bottom
//     carries exactly ONE button — New note. Rows are single-line, with NO
//     pencil / trash buttons: rename and delete live in a small popup that
//     opens on a long press (or a secondary click / the keyboard menu key), and
//     Rename turns that row's own label into an input.
//   · THE WRITING PAGE — the note itself, in READ mode or EDIT mode:
//       read mode's bottom pill:  library(→panel) · prev · next | new · edit | home
//       edit mode's bottom tray: READ (black, pinned) + the sliding tool tray
//     No top corner buttons at all. A note opened from the library ALWAYS lands
//     in read mode first (double tap, Enter/F2 or the pencil switches to
//     editing); the tray's black Read capsule switches back.
//
// ── Saving is automatic (the owner's brief: "automatic save") ─────────────
// There is no Save / Cancel button anymore. The editor's batched draft is
// committed on a trailing pause, and immediately whenever the learner leaves
// the writing page (Read, home, opening the library), hides the page or
// unmounts it. A brand-new note is given an id by `onAdd` the moment it has
// any content, and every later keystroke updates that same note — no
// duplicates, nothing lost. Delete is still a two-step act (the popup's Delete
// opens the same confirmation dialog as always, and only the red button
// deletes).
//
// ── What is UNCHANGED ─────────────────────────────────────────────────────
//   · the persistence curve (useCourseNotes: Firestore + device mirror);
//   · the MASTER / SELF split, the branched library tree and its empty /
//     loading / sync-error states;
//   · the BlockNote document: read mode and edit mode are the SAME document,
//     read-only or editable (see ./NoteEditor) — formatting, slash commands,
//     paste, math and the toolbar are untouched;
//   · the panel session (src/course/coursePanelSession.ts): the open note and
//     its draft survive tab switches, and leaving the player resets to home.

import { useDoubleTapToEdit } from "./useDoubleTapToEdit";
import { Component, Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import "./study-light-surfaces.css";
import "./notesLibrary.css";
import { BookOpen, ChevronLeft, ChevronRight, FileText, House, Library, NotebookPen, Pencil, Plus } from "lucide-react";
import "katex/dist/katex.min.css";
import type { CourseModule, CoursePlayerNote, MasterCourseNote } from "../types/course";
import type { PersonalCourseModule } from "../types/personalCourse";
import RichTextEditor from "./RichTextEditor";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog";
import { combineHtml } from "./notesStore";
import { getCoursePanelSession, setNotesEditorOpen, setNotesSessionView } from "./coursePanelSession";
import { useCourseTheme, useMasterSelfPreference, type CoursePlayerTheme } from "./playerPreferences";
import { firstRichTextBlock, isEmptyRichText, plainToRichText, richTextToPlain, splitFirstHeading, sanitizeRichText } from "../utils/richText";
import { MAX_NOTE_HTML_LENGTH } from "../../utils/courseNotes";
import BranchedMenu, { BranchedMenuSkeleton, useBranchedOpen, type BranchedMenuItem } from "../components/branched-menu/BranchedMenu";
import { ancestorSectionValues, buildBranchTree, type BranchEntry, type BranchSegment } from "../components/branched-menu/branchedTree";
import { StudyLibraryEmptyState, StudyLibraryNotice } from "./StudyLibraryStates";
import MasterSelfControl from "./MasterSelfControl";
import { courseModuleSegments, personalModuleSegments } from "./studyResourceContext";
import type { NoteDraft, NoteEditorHandle } from "./noteEditor/editorTypes";

// The editor (BlockNote + its stylesheet) is a separate chunk: the player and
// the notes LIBRARY never pay for it. It is requested the moment the Notes
// panel mounts — before the learner taps "New note" — so the chunk is already
// in the service-worker cache for offline use. (Code only: no editor instance
// exists until a note is opened.)
const loadNoteEditor = () => import("./NoteEditor");
const NoteEditor = lazy(loadNoteEditor);

/** Quiet time before a draft is committed, and the longest a burst may defer it. */
const AUTOSAVE_IDLE_MS = 1200;
const AUTOSAVE_MAX_WAIT_MS = 5000;

interface NotesPanelProps {
  /** Private, learner-owned SELF notes (legacy collection and save paths). */
  notes: CoursePlayerNote[];
  /** Read-only admin-authored MASTER resources projected from the course tree. */
  masterNotes?: MasterCourseNote[];
  onAdd: (html: string) => CoursePlayerNote | null | void;
  onEdit: (id: string, html: string) => void;
  onDelete: (id: string) => void;
  courseTitle?: string;
  /** The existing course tree; the library resolves note ids back to real ancestors. */
  modules?: CourseModule[];
  /** Existing learner-owned curriculum tree, when it has already been loaded. */
  personalModules?: PersonalCourseModule[];
  onRetrySync?: () => void;
  /** Lets the overlay grow the sheet while the big editor is open. */
  onEditorOpenChange?: (open: boolean) => void;
  /**
   * Optional external trigger for the composer: each increment opens a
   * fresh composer. The home page and the library's own button are the primary
   * triggers.
   */
  composerOpenSignal?: number;
  /**
   * The persistence hook's live state (`useCourseNotes`), shown as the subtle
   * Saving… / Synced indicator on the writing page. Optional: without it the
   * indicator only distinguishes Unsaved from Saved.
   */
  syncState?: {
    status: "idle" | "loading" | "ready" | "pending" | "saving" | "saved" | "error";
    synced: boolean;
    errorMessage?: string | null;
  };
  /**
   * Signal from the resource library: when set (and the note exists in
   * masterNotes), the panel opens that master note in its read-only viewer.
   * The count field ensures re-tapping the same note re-opens it.
   */
  openMasterNoteSignal?: { id: string; count: number } | null;
  /** The signed-in learner — scopes the remembered MASTER/SELF preference. */
  uid?: string | null;
  /** Hide course collections and keep this feature entirely on the device. */
  storageOnly?: boolean;
  /** Use a parent surface's theme without changing Course Player preferences. */
  themeOverride?: CoursePlayerTheme;
}

// Older notes were stored as plain text. Render them through the same
// pipeline so nothing in the library ever disappears after the upgrade.
const noteHtml = (note: CoursePlayerNote) => note.html || plainToRichText(note.text || "");
const notePreview = (note: CoursePlayerNote) => richTextToPlain(noteHtml(note)) || note.text || "";

const NOTE_COLOR = "#f59e0b";
const MASTER_TAG_COLOR = "#93c5fd";
const SELF_TAG_COLOR = "#c4b5fd";
/** Notes captured without any module context. */
const UNFILED_SEGMENT: BranchSegment = { key: "unfiled", label: "Unfiled notes" };

const noteCardTitle = (note: CoursePlayerNote) => {
  const html = noteHtml(note);
  const { heading } = splitFirstHeading(html);
  const firstBlock = richTextToPlain(firstRichTextBlock(html));
  return (heading || firstBlock || notePreview(note) || `Untitled · ${String(note.id).slice(0, 8)}`).trim().slice(0, 120);
};

const aiKindLabel = (note: CoursePlayerNote) => {
  if (!note.aiGenerated) return "";
  const labels: Record<string, string> = {
    answer: "AI answer",
    summary: "AI summary",
    explanation: "AI explanation",
    question: "AI question",
    flashcard: "AI flashcard",
    plan: "AI study plan",
  };
  return labels[String(note.aiKind || "")] || "AI-assisted";
};

/**
 * The editor chunk failed to load (a first-ever visit made while offline, in a
 * browser that has not cached it). The pane must never go blank and a learner
 * must never be unable to write: fall back to the previous editor — which is
 * still in the player bundle — bound to the same draft.
 */
class EditorBoundary extends Component<
  { fallback: ReactNode; onFail: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFail();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** The slim status line: Unsaved · Saving… · Saved · Synced (never loud). */
function NoteStatus({
  editing,
  dirty,
  tooLong,
  sync,
  dark = false,
  storageOnly = false,
}: {
  editing: boolean;
  dirty: boolean;
  tooLong: boolean;
  sync: NotesPanelProps["syncState"];
  dark?: boolean;
  storageOnly?: boolean;
}) {
  let label = "New note";
  let tone = "muted";
  if (tooLong) {
    label = "Too long to save";
    tone = "danger";
  } else if (dirty) {
    label = "Unsaved";
    tone = "warn";
  } else if (editing) {
    tone = "ok";
    if (storageOnly) {
      if (sync?.status === "error") { label = "Device save needs attention"; tone = "warn"; }
      else if (sync?.status === "pending" || sync?.status === "saving") { label = "Saving on this device…"; tone = "muted"; }
      else label = "Saved on this device";
    } else if (sync?.status === "error") { label = "Save needs attention"; tone = "warn"; }
    else if (sync?.status === "pending") { label = "Saved on device · backup pending"; tone = "muted"; }
    else if (sync && (sync.status === "saving" || !sync.synced)) { label = "Saving…"; tone = "muted"; }
    else if (sync) label = "Synced";
    else label = "Saved";
  }
  const dot =
    tone === "danger" ? "bg-rose-500" : tone === "warn" ? "bg-amber-500" : tone === "ok" ? "bg-emerald-500" : dark ? "bg-slate-600" : "bg-slate-300";
  const text = dark
    ? tone === "danger"
      ? "text-rose-400"
      : tone === "warn"
        ? "text-amber-400"
        : "text-slate-300"
    : tone === "danger"
      ? "text-rose-600"
      : tone === "warn"
        ? "text-amber-600"
        : "text-slate-500";
  return (
    <span
      role="status"
      aria-live="polite"
      data-course-notes-status={tone}
      className={`flex min-w-0 items-center gap-1.5 truncate text-[12px] font-semibold ${text}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <span className="truncate">{label}</span>
    </span>
  );
}

/**
 * A MASTER note: the same BlockNote renderer, read-only, with the one back
 * control it has always had. No header bar, no side-panel buttons.
 */
function MasterNoteViewer({
  note,
  onClose,
  theme,
}: {
  note: MasterCourseNote;
  onClose: () => void;
  theme: CoursePlayerTheme;
}) {
  const dark = theme === "dark";
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-white" data-course-master-note-viewer data-course-notes-mode="master-readonly" data-notes-theme={theme}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-start gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))]"
        data-course-master-note-chrome
      >
        <button
          type="button"
          onClick={onClose}
          className={`pointer-events-auto grid h-9 w-9 place-items-center rounded-full shadow-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${
            dark ? "bg-slate-900/90 text-slate-200 hover:bg-slate-800" : "bg-white/95 text-slate-600 hover:bg-slate-100"
          }`}
          aria-label="Back to the note library"
          title="Back to the note library"
          data-course-master-note-back
        >
          <Library size={18} aria-hidden="true" />
        </button>
        <span className="pointer-events-none shrink-0 rounded-full bg-indigo-50/95 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-indigo-700" data-master-note-readonly>
          Read only · Master
        </span>
      </div>
      <div className="min-h-0 flex-1" data-course-master-note-renderer>
        <Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-500" aria-busy="true">Loading master note…</div>}>
          <NoteEditor
            key={`master:${note.id}`}
            initialTitle={note.title}
            initialBodyHtml={note.bodyHtml}
            readOnly
            autoFocus={false}
            ariaLabel={`Master course note: ${note.title}`}
            theme={theme}
            dataAttribute="data-course-master-note-input"
          />
        </Suspense>
      </div>
    </div>
  );
}

export default function NotesPanel({
  notes,
  masterNotes = [],
  onAdd,
  onEdit,
  onDelete,
  modules = [],
  personalModules = [],
  onRetrySync,
  onEditorOpenChange,
  composerOpenSignal,
  syncState,
  openMasterNoteSignal,
  uid = null,
  storageOnly = false,
  themeOverride,
}: NotesPanelProps) {
  // Restore the panel's place from the course-player panel SESSION on mount.
  // The session survives this panel unmounting on every tab switch, so a
  // learner who left the editor open (compose or edit) comes straight back
  // into that same editor with the same draft. An edit view whose note no
  // longer exists degrades to home instead of resurrecting a ghost.
  const sessionNotes = storageOnly ? { view: "list" as const } : getCoursePanelSession().notes;
  const restoreEdit =
    sessionNotes.view === "edit" && notes.some((note) => note.id === sessionNotes.noteId);
  // §16 — the MASTER/SELF choice is a remembered, per-user preference (shared
  // layer), not ephemeral state: it survives closing and reopening the player.
  const masterSelfPref = useMasterSelfPreference("notes", uid, "master");
  const [activeCollection, setActiveCollection] = useState<"master" | "self">(() =>
    storageOnly || sessionNotes.view === "compose" || restoreEdit ? "self" : masterSelfPref.mode,
  );
  const selectCollection = useCallback((mode: "master" | "self") => {
    const next = storageOnly ? "self" : mode;
    setActiveCollection(next);
    if (!storageOnly) masterSelfPref.setMode(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageOnly, masterSelfPref.setMode]);
  useEffect(() => { if (storageOnly) setActiveCollection("self"); }, [storageOnly]);
  // Notes use the shared player preference by default; Work may explicitly
  // supply its shell theme so the feature stays visually scoped to that app.
  const noteThemeCtl = useCourseTheme("notes", uid, "light");
  const noteTheme = themeOverride ?? noteThemeCtl.theme;
  const darkNote = noteTheme === "dark";
  const [viewingMasterNoteId, setViewingMasterNoteId] = useState<string | null>(null);
  const viewingMasterNote = viewingMasterNoteId
    ? masterNotes.find((note) => note.id === viewingMasterNoteId) || null
    : null;
  const [composing, setComposing] = useState(sessionNotes.view === "compose");
  const [draft, setDraft] = useState(sessionNotes.view === "compose" ? sessionNotes.draft : "");
  const [draftTitle, setDraftTitle] = useState(
    sessionNotes.view === "compose" ? sessionNotes.title : "",
  );
  const [editingId, setEditingId] = useState<string | null>(
    restoreEdit ? sessionNotes.noteId : null,
  );
  const [editDraft, setEditDraft] = useState(restoreEdit ? sessionNotes.draft : "");
  const [editTitle, setEditTitle] = useState(restoreEdit ? sessionNotes.title : "");
  // §14 — a saved note opens in READ (the same BlockNote document, read only);
  // the pencil (or a double tap on the page) flips the SAME document to
  // editable, and the tray's black Read capsule flips it back.
  const [selfReadOnly, setSelfReadOnly] = useState(true);
  // The ONE side panel: the note library. There is no second drawer and no
  // header button anywhere that opens this one — the home page's two library
  // buttons and the read pill's library button are its only ways in.
  const [libraryOpen, setLibraryOpen] = useState(false);
  // The docked editing toolbar's state, reported by the editor (see below).
  const [dockUp, setDockUp] = useState(false);

  // The editor is UNCONTROLLED: it is opened once from this seed (restored
  // from the session, or the stored note, or blank) and owns its content from
  // then on — typing never re-renders this panel. `key` is the note's identity,
  // so switching notes disposes the old editor and its undo history.
  const [seed, setSeed] = useState(() => ({
    key: restoreEdit ? `edit:${sessionNotes.noteId}` : "compose:0",
    title: composing ? draftTitle : editTitle,
    body: composing ? draft : editDraft,
  }));
  const composeCount = useRef(0);
  const editorRef = useRef<NoteEditorHandle | null>(null);
  const focusAfterEditRef = useRef(false);
  // ── The autosave machine ────────────────────────────────────────────────
  // `latestDraftRef` mirrors the last draft the editor reported (so an unmount
  // can still save it), `savedHtmlRef` is what is already in storage, and
  // `editingIdRef` is the id the next write must update (a composed note gets
  // one from `onAdd` the moment it has content).
  const latestDraftRef = useRef<NoteDraft>({ title: seed.title, bodyHtml: seed.body });
  const savedHtmlRef = useRef("");
  const editingIdRef = useRef<string | null>(restoreEdit ? sessionNotes.noteId : null);
  const addBlockedRef = useRef(false);
  const timersRef = useRef<{ idle: number; max: number }>({ idle: 0, max: 0 });
  // Set the moment the learner leaves the writing page, so the editor's final
  // flush on unmount can never write a closed draft back into the session.
  const discardingRef = useRef(false);
  const [editorEmpty, setEditorEmpty] = useState(() => isEmptyRichText(combineHtml(seed.title, seed.body)));
  const [dirty, setDirty] = useState(false);
  const [tooLong, setTooLong] = useState(false);
  const [legacyFallback, setLegacyFallback] = useState(false);

  // Deletion is a two-step act: the popup's Delete opens a confirmation overlay
  // and the note is removed ONLY after the learner taps the red confirm
  // button. Cancel / backdrop tap / Escape never delete.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDeleteNote = pendingDeleteId
    ? notes.find((note) => note.id === pendingDeleteId) || null
    : null;

  const clearAutosaveTimers = useCallback(() => {
    window.clearTimeout(timersRef.current.idle);
    window.clearTimeout(timersRef.current.max);
    timersRef.current = { idle: 0, max: 0 };
  }, []);

  /**
   * Write one draft. Returns true when something was stored. Empty drafts are
   * never stored, an over-long note is refused (and the status chip says so),
   * and an unchanged draft is skipped — so autosave can be called freely.
   */
  const writeDraft = useCallback(
    (next: NoteDraft): boolean => {
      if (discardingRef.current) return false;
      const html = combineHtml(next.title, next.bodyHtml);
      if (isEmptyRichText(html)) return false;
      if (html.length > MAX_NOTE_HTML_LENGTH) { setTooLong(true); return false; }
      if (html === savedHtmlRef.current) return false;
      const openId = editingIdRef.current;
      if (openId) {
        onEdit(openId, html);
      } else {
        if (addBlockedRef.current) return false;
        const saved = onAdd(html);
        if (!saved) { addBlockedRef.current = true; return false; }
        // A brand-new note now HAS an id: from here on this is an edit of that
        // note, so every later write updates it instead of adding another.
        editingIdRef.current = saved.id;
        setEditingId(saved.id);
        setComposing(false);
        setDraft(next.bodyHtml);
        setDraftTitle(next.title);
        setEditDraft(next.bodyHtml);
        setEditTitle(next.title);
      }
      savedHtmlRef.current = html;
      setTooLong(false);
      editorRef.current?.markSaved();
      return true;
    },
    [onAdd, onEdit],
  );

  /** Commit whatever the editor holds right now (never the debounced copy). */
  const saveNow = useCallback((): boolean => {
    clearAutosaveTimers();
    const next = editorRef.current?.read() ?? latestDraftRef.current;
    latestDraftRef.current = next;
    const wrote = writeDraft(next);
    clearAutosaveTimers();
    return wrote;
  }, [clearAutosaveTimers, writeDraft]);
  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;

  /**
   * A pause in typing commits the note; a long burst commits at the latest
   * after AUTOSAVE_MAX_WAIT_MS. Autosave is cheap: an unchanged draft is
   * skipped before any storage call, and the hook itself batches the write.
   */
  const scheduleAutosave = useCallback(() => {
    clearAutosaveTimers();
    timersRef.current.idle = window.setTimeout(() => { saveNowRef.current(); }, AUTOSAVE_IDLE_MS);
    timersRef.current.max = window.setTimeout(() => { saveNowRef.current(); }, AUTOSAVE_MAX_WAIT_MS);
  }, [clearAutosaveTimers]);

  /** Leave the writing page for the notes home — after committing the draft. */
  const goHome = useCallback(() => {
    saveNowRef.current();
    discardingRef.current = true;
    clearAutosaveTimers();
    setLibraryOpen(false);
    setComposing(false);
    setEditingId(null);
    editingIdRef.current = null;
    setDraft("");
    setDraftTitle("");
    setEditDraft("");
    setEditTitle("");
    setSelfReadOnly(true);
    addBlockedRef.current = false;
    savedHtmlRef.current = "";
  }, [clearAutosaveTimers]);

  /**
   * The rare legacy fallback (the editor chunk could not load) reports through
   * its own props; it feeds the same autosave pipeline.
   */
  const noteLegacyDraft = useCallback(
    (next: NoteDraft) => {
      latestDraftRef.current = next;
      scheduleAutosave();
    },
    [scheduleAutosave],
  );

  // Read ↔ edit on the SAME document: flip the panel state and the live
  // editor together. Entering EDIT always starts from the committed note.
  const enterEditMode = useCallback(() => {
    discardingRef.current = false;
    focusAfterEditRef.current = true;
    setSelfReadOnly(false);
    editorRef.current?.setReadOnly(false);
    editorRef.current?.focusBody();
  }, []);
  /**
   * The tray's black Read capsule. Leaving the editor is a SAVE POINT: the
   * draft is committed first, so the read view always shows what was written.
   * A brand-new note with nothing in it has nothing to read (and nothing to
   * store), so it simply returns to the notes home.
   */
  const enterReadMode = useCallback(() => {
    saveNowRef.current();
    if (!editingIdRef.current) { goHome(); return; }
    setSelfReadOnly(true);
    editorRef.current?.setReadOnly(true);
  }, [goHome]);
  const editGesture = useDoubleTapToEdit(Boolean(editingId && selfReadOnly), enterEditMode);
  useEffect(() => {
    if (selfReadOnly || !focusAfterEditRef.current) return;
    focusAfterEditRef.current = false;
    editorRef.current?.focusBody();
  }, [selfReadOnly]);

  const openLibrary = useCallback(
    (mode?: "master" | "self") => {
      if (mode) selectCollection(mode);
      setLibraryOpen(true);
    },
    [selectCollection],
  );
  const closeLibrary = useCallback(() => {
    setLibraryOpen(false);
  }, []);

  const openComposer = () => {
    selectCollection("self");
    setLibraryOpen(false);
    discardingRef.current = false;
    addBlockedRef.current = false;
    savedHtmlRef.current = "";
    clearAutosaveTimers();
    composeCount.current += 1;
    setEditingId(null);
    editingIdRef.current = null;
    setEditDraft("");
    setEditTitle("");
    setComposing(true);
    setSelfReadOnly(false);
    setDraft("");
    setDraftTitle("");
    setSeed({ key: `compose:${composeCount.current}`, title: "", body: "" });
    latestDraftRef.current = { title: "", bodyHtml: "" };
    setEditorEmpty(true);
    setDirty(false);
    setTooLong(false);
  };

  // The editor reports a BATCHED draft (≤ one per 250 ms of typing, and one
  // last one as it unmounts). It lands in the panel state AND, synchronously,
  // in the session — so a tab switch or the player closing a moment after the
  // last keystroke still finds the latest words there — and it arms autosave.
  const handleDraftChange = useCallback(
    (next: NoteDraft) => {
      if (discardingRef.current) return;
      latestDraftRef.current = next;
      const html = combineHtml(next.title, next.bodyHtml);
      setTooLong(html.length > MAX_NOTE_HTML_LENGTH);
      if (editingIdRef.current) {
        setEditDraft(next.bodyHtml);
        setEditTitle(next.title);
        if (!storageOnly) setNotesSessionView({ view: "edit", noteId: editingIdRef.current, draft: next.bodyHtml, title: next.title });
      } else {
        setDraft(next.bodyHtml);
        setDraftTitle(next.title);
        if (!storageOnly) setNotesSessionView({ view: "compose", draft: next.bodyHtml, title: next.title });
      }
      scheduleAutosave();
    },
    [scheduleAutosave, storageOnly],
  );
  useEffect(() => clearAutosaveTimers, [clearAutosaveTimers]);

  // Never hold a change back: leaving the page, hiding the app or unmounting
  // commits whatever is pending (the editor flushes its own debounce first —
  // `read()` does that — so the very last keystroke is included).
  useEffect(() => {
    const flush = () => { saveNowRef.current(); };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  useLayoutEffect(() => () => { saveNowRef.current(); }, []);

  const editorOpen = composing || Boolean(editingId) || Boolean(viewingMasterNote);

  // Keep the session in sync on every render so the current view + draft are
  // immediately available to the next mount (tab switch) and to the player's
  // exit flush — even if this component unmounts before an effect fires.
  useEffect(() => {
    if (storageOnly) return;
    // The writing page (the editor, or a MASTER note open for reading) is one
    // of the player's immersive pages: the footer navigation hides while it is
    // up and returns on the notes home / in the library panel.
    setNotesEditorOpen(editorOpen);
    if (composing) {
      setNotesSessionView({ view: "compose", draft, title: draftTitle });
    } else if (editingId) {
      setNotesSessionView({ view: "edit", noteId: editingId, draft: editDraft, title: editTitle });
    } else {
      setNotesSessionView({ view: "list" });
    }
  });

  // The overlay expands the notes sheet while the editor is open so the
  // writing surface gets the full notes area. Reported on EVERY render: the
  // sheet closes and reopens WITHOUT unmounting this panel, and a deps-gated
  // effect would not re-fire after a reopen. Reporting the same boolean again
  // is a cheap no-op for React (it bails out).
  useEffect(() => { onEditorOpenChange?.(editorOpen); });
  useEffect(() => () => { onEditorOpenChange?.(false); }, [onEditorOpenChange]);

  // Warm the editor chunk while the learner is still on the home page — in
  // idle time, so it never competes with the first paint.
  useEffect(() => {
    const warm = () => { void loadNoteEditor().catch(() => undefined); };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(warm, { timeout: 4000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(warm, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  // An external signal (when provided) asks for a fresh composer.
  // `> 0` keeps the first mount (signal 0) from auto-opening the editor.
  useEffect(() => {
    if (composerOpenSignal && composerOpenSignal > 0) openComposer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerOpenSignal]);

  // Signal from the resource library: open a specific master note in the
  // read-only viewer. The `count` field ensures re-tapping the same note
  // re-triggers the effect. The panel switches to the master collection
  // and opens the viewer immediately.
  useEffect(() => {
    if (!openMasterNoteSignal) return;
    const note = masterNotes.find((n) => n.id === openMasterNoteSignal.id);
    if (note) {
      setActiveCollection("master");
      setViewingMasterNoteId(note.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMasterNoteSignal?.count]);

  const openNote = (note: CoursePlayerNote) => {
    selectCollection("self");
    setLibraryOpen(false);
    discardingRef.current = false;
    addBlockedRef.current = false;
    clearAutosaveTimers();
    setComposing(false);
    setDraft("");
    setDraftTitle("");
    // The stored note's leading heading becomes the title field; the rest
    // (minus the divider that separated them) stays in the body.
    const { heading, body } = splitFirstHeading(noteHtml(note));
    setEditingId(note.id);
    editingIdRef.current = note.id;
    setEditTitle(heading);
    setEditDraft(body);
    savedHtmlRef.current = combineHtml(heading, body);
    latestDraftRef.current = { title: heading, bodyHtml: body };
    setSelfReadOnly(true); // §14 — a saved note opens as a read-only view
    setSeed({ key: `edit:${note.id}`, title: heading, body });
    setEditorEmpty(isEmptyRichText(combineHtml(heading, body)));
    setDirty(false);
    setTooLong(false);
  };

  /**
   * Rename a note (the library's long-press menu). Notes without a heading
   * keep their original body; the new explicit title is added above it. When
   * the renamed note is the one being written, the live editor is re-seeded
   * with the same body under the new title so the next autosave cannot write
   * the old title back.
   */
  const renameNote = (note: CoursePlayerNote, nextTitle: string) => {
    const html = noteHtml(note);
    const split = splitFirstHeading(html);
    const body = split.heading ? split.body : html;
    onEdit(note.id, combineHtml(nextTitle, body));
    if (note.id !== editingIdRef.current) return;
    setEditTitle(nextTitle);
    setEditDraft(body);
    savedHtmlRef.current = combineHtml(nextTitle, body);
    latestDraftRef.current = { title: nextTitle, bodyHtml: body };
    setSeed({ key: `edit:${note.id}`, title: nextTitle, body });
    editorRef.current?.load({ title: nextTitle, bodyHtml: body });
  };

  // ── Library tree: one Branched Menu per collection ────────────────────
  // MASTER notes group by their real course-module chain; SELF notes group by
  // the learner's own module (under "My Modules") or by the official chain they
  // were captured from. Notes with no module context stay in "Unfiled notes".
  const masterTree: BranchedMenuItem[] = buildBranchTree(
    masterNotes.map((note): BranchEntry => {
      const path = courseModuleSegments(modules, note.moduleId);
      const words = (note.bodyHtml || "").trim().split(/\s+/).filter(Boolean).length;
      return {
        path: path.length ? path : [UNFILED_SEGMENT],
        item: {
          value: `master:${note.id}`,
          label: note.title || "Untitled master note",
          icon: <FileText size={16} strokeWidth={2.1} aria-hidden="true" />,
          color: NOTE_COLOR,
          tag: { label: "MASTER", color: MASTER_TAG_COLOR },
          meta: words ? `${words} words` : undefined,
          description: `Master note. ${note.title || "Untitled master note"}. Read only.`,
          dataAttrs: { "data-course-master-note-open": "", "data-note-id": note.resourceId },
        },
      };
    }),
    { sectionMeta: ({ count }) => <span>{count}</span> },
  );

  const selfTree: BranchedMenuItem[] = buildBranchTree(
    notes.map((note): BranchEntry => {
      const isPersonal = Boolean(note.personalModuleId || note.personalResourceId);
      const path = isPersonal
        ? personalModuleSegments(personalModules, note.personalModuleId || note.moduleId)
        : courseModuleSegments(modules, note.moduleId);
      const title = noteCardTitle(note);
      const wordCount = notePreview(note).trim().split(/\s+/).filter(Boolean).length;
      const metadata = [
        wordCount ? `${wordCount} words` : "",
        note.links?.length ? `${note.links.length} linked` : "",
        aiKindLabel(note),
      ].filter(Boolean);
      return {
        path: path.length ? path : [UNFILED_SEGMENT],
        item: {
          value: `note:${note.id}`,
          label: title,
          icon: <NotebookPen size={16} strokeWidth={2.1} aria-hidden="true" />,
          color: NOTE_COLOR,
          tag: { label: "SELF", color: SELF_TAG_COLOR },
          meta: metadata.length ? metadata.join(" · ") : undefined,
          description: `Note. ${title}. Your own note.`,
          onRename: (nextTitle) => renameNote(note, nextTitle),
          onDelete: () => setPendingDeleteId(note.id),
          deleteLabel: `Delete note ${title}`,
          dataAttrs: { "data-course-note-open": "", "data-note-id": note.id },
        },
      };
    }),
  );

  const masterOpen = useBranchedOpen(masterTree);
  const selfOpen = useBranchedOpen(selfTree);
  // A different note (or the composer) always starts with the panel shut.
  useEffect(() => { setLibraryOpen(false); }, [seed.key]);

  // Two-step delete confirmation, shared by the library and the writing page.
  // Rendered through a portal so the player's clipped sheet can never cut it
  // off. Deleting the note that is open closes the writing page with it.
  const deleteDialog = (
    <ConfirmDeleteDialog
      theme={noteTheme}
      open={Boolean(pendingDeleteNote)}
      title="Delete this note?"
      message={
        pendingDeleteNote
          ? `"${notePreview(pendingDeleteNote) || "Untitled note"}" will be permanently removed from your notes.`
          : ""
      }
      detail={pendingDeleteNote ? "This action cannot be undone." : null}
      confirmLabel="Delete note"
      confirmTitle="Delete note"
      onConfirm={() => {
        if (pendingDeleteId) onDelete(pendingDeleteId);
        if (pendingDeleteId && pendingDeleteId === editingIdRef.current) {
          discardingRef.current = true;
          clearAutosaveTimers();
          setEditingId(null);
          editingIdRef.current = null;
          setEditDraft("");
          setEditTitle("");
          setSelfReadOnly(true);
          savedHtmlRef.current = "";
        }
        setPendingDeleteId(null);
      }}
      onCancel={() => setPendingDeleteId(null)}
    />
  );
  // Opening a note from elsewhere (the Modules library, a signal) reveals its branch.
  useEffect(() => {
    if (viewingMasterNoteId) masterOpen.reveal(ancestorSectionValues(masterTree, `master:${viewingMasterNoteId}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingMasterNoteId]);
  useEffect(() => {
    if (editingId) selfOpen.reveal(ancestorSectionValues(selfTree, `note:${editingId}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const noteCount = notes.length;
  const masterCount = masterNotes.length;

  // ── The library panel ─────────────────────────────────────────────────
  // Nearly the whole page (a thin strip of it stays visible on the right, so it
  // still reads as a panel). Headerless: the MASTER / SELF control sits
  // top-centre, the list fills the middle, and exactly ONE button — New note —
  // sits at the very bottom. Tapping the visible strip (or Escape) closes it.
  const libraryPanel = (
    <>
      <button
        type="button"
        aria-label="Close the note library"
        data-note-panel-scrim
        className="absolute inset-0 z-30 bg-slate-950/30"
        onClick={closeLibrary}
      />
      <aside
        className={`absolute inset-y-0 left-0 z-40 flex w-[calc(100%-2.5rem)] flex-col border-r shadow-2xl ${
          darkNote ? "border-slate-800 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-900"
        }`}
        aria-label="Note library"
        data-note-library-panel
        data-note-left-panel
      >
        <div className={`flex h-14 shrink-0 items-center justify-center px-3 ${darkNote ? "border-b border-slate-800" : "border-b border-slate-100"}`} data-note-library-head>
          {storageOnly ? (
            <span className="text-sm font-black tracking-wide">My notes</span>
          ) : (
            <MasterSelfControl
              mode={activeCollection}
              onChange={selectCollection}
              masterCount={masterCount}
              selfCount={noteCount}
              ariaLabel="Note collection"
              feature="notes"
            />
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2" data-course-notes-list>
          {activeCollection === "master" ? (
            masterCount > 0 ? (
              <BranchedMenu
                items={masterTree}
                openValues={masterOpen.openValues}
                onToggle={masterOpen.toggle}
                onSelect={(value) => {
                  const note = masterNotes.find((entry) => `master:${entry.id}` === value);
                  if (note) { setViewingMasterNoteId(note.id); setLibraryOpen(false); }
                }}
                ariaLabel="Master course notes"
                fullWidth
                rowHeight={44}
                leafActionMenu="long-press"
                className="notes-library-menu"
                dataAttrs={{ "data-course-master-notes-grid": "", "data-listing": "notes-master" }}
              />
            ) : (
              <StudyLibraryEmptyState
                kind="note"
                title="No master notes yet"
                description="Course notes published by the course admin will appear here. They are read-only and do not change your SELF notes."
              />
            )
          ) : (
            <>
              {noteCount > 0 && syncState?.status === "loading" ? (
                <StudyLibraryNotice
                  state="loading"
                  title={storageOnly ? "Loading device notes" : "Checking your library"}
                  message={storageOnly ? "Your notes are stored only in this browser on this device." : "Your saved notes are available while cloud sync finishes."}
                />
              ) : null}
              {noteCount > 0 && syncState?.status === "error" ? (
                <StudyLibraryNotice
                  state="error"
                  title={storageOnly ? "Device save needs attention" : "Cloud sync needs attention"}
                  message={syncState.errorMessage || (storageOnly
                    ? "Your notes could not be saved locally. Export them before leaving."
                    : "Your notes stay saved on this device. Try syncing again when your connection is ready.")}
                  onRetry={storageOnly ? undefined : onRetrySync}
                />
              ) : null}
              {noteCount > 0 ? (
                <BranchedMenu
                  items={selfTree}
                  openValues={selfOpen.openValues}
                  onToggle={selfOpen.toggle}
                  activeValue={editingId ? `note:${editingId}` : null}
                  onSelect={(value) => {
                    const note = notes.find((entry) => `note:${entry.id}` === value);
                    if (note) openNote(note);
                  }}
                  ariaLabel="Your notes"
                  fullWidth
                  rowHeight={44}
                  leafActionMenu="long-press"
                  className="notes-library-menu"
                  dataAttrs={{ "data-course-notes-grid": "true", "data-listing": "notes-self" }}
                />
              ) : syncState?.status === "loading" ? (
                <BranchedMenuSkeleton rows={4} label="Loading your notes" />
              ) : syncState?.status === "error" ? (
                <>
                  <StudyLibraryNotice
                    state="error"
                    title={storageOnly ? "Device save needs attention" : "Notes could not be synced"}
                    message={syncState.errorMessage || (storageOnly
                      ? "The device refused this save. Check available storage and export often."
                      : "No cloud copy could be confirmed. Try again, or continue with notes saved on this device.")}
                    onRetry={storageOnly ? undefined : onRetrySync}
                  />
                  <StudyLibraryEmptyState
                    kind="note"
                    title={storageOnly ? "Start a private study note" : "Your course notes remain yours"}
                    description={storageOnly
                      ? "Create a note. It is saved only on this device and will not sync to your account."
                      : "Reconnect and try again to load your latest library. Anything already on this device stays safe."}
                  />
                </>
              ) : (
                <StudyLibraryEmptyState
                  kind="note"
                  title={storageOnly ? "Start a private study note" : "Start a study note"}
                  description={storageOnly
                    ? "Capture a formula, a question, or a lesson recap. This note stays only on this device."
                    : "Capture a formula, a question, or a lesson recap — New note opens the editor and saves as you write."}
                />
              )}
            </>
          )}
        </div>
        {/* The panel's ONLY button: a new note. There is nowhere "back to the
            library" to go — this panel IS the library. */}
        <div className={`shrink-0 border-t p-3 ${darkNote ? "border-slate-800" : "border-slate-100"}`} data-note-library-foot>
          <button
            type="button"
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-slate-900 text-[13px] font-black text-white transition hover:bg-slate-800 active:bg-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            data-note-panel-new
            data-course-notes-add
            aria-label="Add note"
            title="Add note"
            onClick={openComposer}
          >
            <Plus size={16} aria-hidden="true" /> New note
          </button>
        </div>
      </aside>
    </>
  );

  // MASTER resources open in the same BlockNote renderer in read-only mode;
  // they never enter the SELF editor state or the learner-note persistence hook.
  if (viewingMasterNote) {
    return (
      <MasterNoteViewer
        note={viewingMasterNote}
        theme={noteTheme}
        onClose={() => { setViewingMasterNoteId(null); openLibrary("master"); }}
      />
    );
  }

  // ── The writing page ──────────────────────────────────────────────────
  // The composer and the note both take the whole panel so the writing surface
  // is as large as the notes area allows. There is NO top chrome: no header, no
  // corner buttons, nothing that opens another panel. What is left is the page,
  // a quiet status chip and the bottom chrome that follows the mode.
  if (editorOpen) {
    const editing = Boolean(editingId);
    const value = editing ? editDraft : draft;
    const titleValue = editing ? editTitle : draftTitle;
    const readView = editing && selfReadOnly;
    // Previous / next SELF note for the read-mode bottom navigation.
    const editingIndex = editingId ? notes.findIndex((note) => note.id === editingId) : -1;
    const prevNote = editingIndex > 0 ? notes[editingIndex - 1] : null;
    const nextNote = editingIndex >= 0 && editingIndex < notes.length - 1 ? notes[editingIndex + 1] : null;
    const pillButtonClass = `grid h-9 w-9 shrink-0 place-items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:pointer-events-none disabled:opacity-35 ${darkNote ? "hover:bg-slate-800 active:bg-slate-700" : "hover:bg-slate-100 active:bg-slate-200"}`;
    const pillSepClass = `mx-1 h-5 w-px shrink-0 ${darkNote ? "bg-slate-700" : "bg-slate-200"}`;
    return (
      <div
        className={`relative flex h-full flex-col overflow-hidden ${darkNote ? "bg-slate-950" : "bg-white"}`}
        data-course-notes-panel
        data-course-notes-mode={editing ? "edit" : "compose"}
        data-notes-theme={noteTheme}
        data-note-view-mode={readView ? "read" : "edit"}
        data-note-empty={editorEmpty ? "true" : undefined}
        data-note-editor-fallback={legacyFallback ? "true" : undefined}
        tabIndex={readView ? 0 : undefined}
        aria-label={readView ? "Saved note. Double tap or press Enter to edit." : undefined}
        {...editGesture}
        onKeyDown={(event) => {
          if (event.key === "Escape" && libraryOpen) { closeLibrary(); return; }
          if (event.key === "Escape" && readView) { goHome(); return; }
          editGesture.onKeyDown(event);
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col" data-course-notes-composer>
          {/* Saving is automatic, so the page has NO Top chrome: no header, no
              corner buttons — only this quiet status chip, centred, and it
              never holds a button (owner brief: nothing sits at the top right
              of a notes page). */}
          <div
            className="pointer-events-none absolute inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-20 flex justify-center px-3"
            data-note-status-chip
            data-note-autosave
          >
            <span
              className={`inline-flex max-w-[60vw] items-center rounded-full border px-2.5 py-1 backdrop-blur ${
                darkNote ? "border-slate-800 bg-slate-900/80" : "border-slate-200 bg-white/85"
              }`}
            >
              <NoteStatus editing={editing || composing} dirty={dirty} tooLong={tooLong} sync={syncState} dark={darkNote} storageOnly={storageOnly} />
            </span>
          </div>
          {syncState?.status === "error" ? (
            <StudyLibraryNotice
              state="error"
              title={storageOnly ? "Device save needs attention" : "Note sync needs attention"}
              message={syncState.errorMessage || (storageOnly ? "Your note could not be saved on this device." : "Your local note is safe. Retry to sync.")}
              onRetry={storageOnly ? undefined : onRetrySync}
            />
          ) : null}
          <div className="relative min-h-0 flex-1">
            <EditorBoundary
              onFail={() => setLegacyFallback(true)}
              fallback={
                <div className="flex h-full min-h-0 flex-col bg-slate-950 p-3" data-course-notes-legacy-fallback>
                  {readView ? <div className="h-full overflow-auto p-4" dangerouslySetInnerHTML={{ __html: sanitizeRichText(combineHtml(titleValue, value)) }} /> : <RichTextEditor
                    theme={noteTheme}
                    value={value}
                    onChange={editing ? (html) => { setEditDraft(html); noteLegacyDraft({ title: editTitle, bodyHtml: html }); } : (html) => { setDraft(html); noteLegacyDraft({ title: draftTitle, bodyHtml: html }); }}
                    heading={titleValue}
                    onHeadingChange={editing ? (html) => { setEditTitle(html); noteLegacyDraft({ title: html, bodyHtml: editDraft }); } : (html) => { setDraftTitle(html); noteLegacyDraft({ title: html, bodyHtml: draft }); }}
                    headingAutoFocus={!editing}
                    autoFocus={editing}
                    surfaceClassName="min-h-0"
                    ariaLabel={editing ? "Edit note" : "New note"}
                    dataAttribute={editing ? "data-course-note-edit-input" : "data-course-notes-input"}
                  />}
                </div>
              }
            >
              <Suspense fallback={<div className="h-full bg-white" aria-busy="true" data-course-notes-editor-loading data-notes-theme={noteTheme} />}>
                <NoteEditor
                  key={seed.key}
                  ref={editorRef}
                  initialTitle={seed.title}
                  initialBodyHtml={seed.body}
                  theme={noteTheme}
                  // §13/§14 — the SAME BlockNote document is the view and the
                  // editor: viewing is just the document rendered read-only.
                  readOnly={readView}
                  // A fresh note lands in the title; a note that already has words
                  // (an edit, or a draft restored from the session) in the body.
                  autoFocus={readView ? false : (editing || seed.title || seed.body ? "body" : "title")}
                  ariaLabel={editing ? (readView ? "View note" : "Edit note") : "New note"}
                  dataAttribute={editing ? "data-course-note-edit-input" : "data-course-notes-input"}
                  onDraftChange={handleDraftChange}
                  onEmptyChange={setEditorEmpty}
                  onDirtyChange={setDirty}
                  onReadRequest={enterReadMode}
                  onDockChange={setDockUp}
                  // Ctrl / Cmd + Enter is the keyboard's "done": it commits the
                  // note (autosave) and returns to the read view.
                  onSaveShortcut={readView ? undefined : enterReadMode}
                />
              </Suspense>
            </EditorBoundary>
          </div>
        </div>

        {/* Read mode's bottom navigation: library (opens the panel) · previous ·
            next | new · edit | home. The 3-dot drawer button is gone — the
            library panel is the only panel there is, and this is its way in. */}
        {readView ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex justify-center px-4">
            <nav
              className={`pointer-events-auto flex items-center gap-0.5 rounded-full border px-2 py-1.5 shadow-lg backdrop-blur ${darkNote ? "border-slate-700 bg-slate-900/95 text-slate-200 shadow-black/40" : "border-slate-200 bg-white/95 text-slate-600 shadow-slate-950/15"}`}
              aria-label="Note navigation"
              data-note-read-nav
            >
              <button
                type="button"
                className={pillButtonClass}
                aria-label="Note library"
                title="Note library"
                data-note-read-library
                onClick={() => openLibrary("self")}
              >
                <Library size={16} aria-hidden="true" />
              </button>
              <button type="button" className={pillButtonClass} aria-label="Previous note" title="Previous note" data-note-read-prev disabled={!prevNote} onClick={() => { if (prevNote) openNote(prevNote); }}>
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <button type="button" className={pillButtonClass} aria-label="Next note" title="Next note" data-note-read-next disabled={!nextNote} onClick={() => { if (nextNote) openNote(nextNote); }}>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
              <span className={pillSepClass} aria-hidden="true" />
              <button type="button" className={pillButtonClass} aria-label="New note" title="New note" data-note-read-new onClick={openComposer}>
                <Plus size={16} aria-hidden="true" />
              </button>
              <button type="button" className={pillButtonClass} aria-label="Edit note" title="Edit note" data-note-read-edit onClick={enterEditMode}>
                <Pencil size={16} aria-hidden="true" />
              </button>
              <button type="button" className={pillButtonClass} aria-label="Notes home" title="Notes home" data-note-read-home onClick={goHome}>
                <House size={16} aria-hidden="true" />
              </button>
            </nav>
          </div>
        ) : null}

        {/* In edit mode the docked tray carries the black Read capsule — but the
            tray follows the CARET, so a floating one keeps the way back on
            screen whenever that tray is not up. */}
        {!readView && !dockUp ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex justify-center px-4">
            <button
              type="button"
              className="pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-slate-900 px-3.5 text-[13px] font-black text-white shadow-lg transition hover:bg-slate-800 active:bg-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
              data-note-edit-read-float
              aria-label="Read mode"
              title="Read mode"
              onClick={enterReadMode}
            >
              <BookOpen size={15} aria-hidden="true" /> Read
            </button>
          </div>
        ) : null}

        {libraryOpen ? libraryPanel : null}
        {deleteDialog}
      </div>
    );
  }

  // ── Home ───────────────────────────────────────────────────────────────
  // A clean, headerless page: three centred buttons and nothing else. (The
  // visible strip beside the library panel is the touch way out; Escape closes
  // the panel here exactly as it does over a note.)
  return (
    <div
      className="relative flex h-full flex-col overflow-hidden"
      data-course-notes-panel
      data-course-notes-mode="home"
      data-course-notes-home
      data-notes-theme={noteTheme}
      onKeyDown={(event) => { if (event.key === "Escape" && libraryOpen) closeLibrary(); }}
    >
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4">
        <div className="flex w-full max-w-[22rem] flex-col gap-2.5" data-notes-home-actions>
          <button
            type="button"
            className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-slate-900 text-base font-black text-white shadow-lg shadow-slate-950/25 transition hover:bg-slate-800 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
            data-notes-home-new
            data-course-notes-add
            aria-label="Add note"
            title="New note"
            onClick={openComposer}
          >
            <Plus size={19} strokeWidth={2.6} aria-hidden="true" /> New note
          </button>
          <button
            type="button"
            className={`flex h-14 items-center justify-between gap-2 rounded-2xl px-4 text-base font-bold transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 ${
              darkNote ? "bg-slate-900/70 text-slate-100 ring-1 ring-slate-700 hover:bg-slate-900" : "bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
            data-notes-home-library
            onClick={() => openLibrary("self")}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Library size={18} aria-hidden="true" /> My Library
            </span>
            <span className={`shrink-0 text-xs font-black tabular-nums ${darkNote ? "text-slate-400" : "text-slate-500"}`}>{noteCount}</span>
          </button>
          <button
            type="button"
            className={`flex h-14 items-center justify-between gap-2 rounded-2xl px-4 text-base font-bold transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 ${
              darkNote ? "bg-slate-900/70 text-slate-100 ring-1 ring-slate-700 hover:bg-slate-900" : "bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
            data-notes-home-course
            onClick={() => openLibrary("master")}
          >
            <span className="flex min-w-0 items-center gap-2">
              <BookOpen size={18} aria-hidden="true" /> Course Library
            </span>
            <span className={`shrink-0 text-xs font-black tabular-nums ${darkNote ? "text-slate-400" : "text-slate-500"}`}>{masterCount}</span>
          </button>
        </div>
      </div>

      {libraryOpen ? libraryPanel : null}
      {deleteDialog}
    </div>
  );
}

/** Kept exported for the tables that read a note's plain text. */
export { notePreview, noteCardTitle };
