// src/course/NotesPanel.tsx
//
// Course Player notes panel.
//
//   - Saved notes and master notes share one listing, the Branched Menu
//     (./branched-menu): MASTER notes group by their course module chain, SELF
//     notes group under "My Modules" or their official module, and notes with no
//     module context sit under "Unfiled notes". A single activation opens the
//     note (the BlockNote editor for SELF, read-only for MASTER).
//   - The single "+" button opens the same white block-document page
//     (BlockNote, see ./NoteEditor) that fills the notes pane. The editor's
//     chrome follows the reference design: no conventional header — only a
//     top-left button (notes library drawer, where notes can be renamed) and
//     a top-right one (this note's options: status, read/edit switch, Save ·
//     Cancel · Delete); the bottom carries a centred navigation pill in read
//     mode and the floating editing pill in edit mode.
//   - Delete asks for confirmation in a dialog before the note is removed.
//   - Pasting from anywhere (Docs, Notion, a website, an IDE, chat) is
//     sanitised and imported as blocks; what the editor cannot hold (tables,
//     images, …) is preserved verbatim, never dropped.
//
// The owning hook stores notes in Firestore with a device mirror, per user
// and course scope.
//
// ── Session persistence ─────────────────────────────────────────────────
// The panel's UI state (list vs. the big editor, plus any open draft) lives
// in the course-player panel SESSION (src/course/coursePanelSession.ts), not
// in component state. Switching tabs unmounts this panel, so the session is
// what keeps the learner's place: open the editor, jump to the Module tab,
// come back — the editor is still open with the same draft. The session is
// synced on every render, so an unmount can never lose a keystroke.
//
// ── Reset on player exit ───────────────────────────────────────────────
// When the learner LEAVES the course player, the parent (CoursePlayerApp)
// preserves any open draft as a saved note and then resets the whole panel
// session — the next visit starts on the notes list, exactly like the mind
// map restarts on its library.

import { useDoubleTapToEdit } from "./useDoubleTapToEdit";
import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import "./study-light-surfaces.css";
import { ArrowLeft, BookOpen, Check, ChevronLeft, ChevronRight, FileText, MoreHorizontal, NotebookPen, PanelLeft, PanelRight, Pencil, Plus, Trash2, X } from "lucide-react";
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
import CoursePageHeader from "./CoursePageHeader";
import { courseModuleSegments, personalModuleSegments } from "./studyResourceContext";
import type { NoteDraft, NoteEditorHandle } from "./noteEditor/editorTypes";

// The editor (BlockNote + its stylesheet) is a separate chunk: the player and
// the notes LIST never pay for it. It is requested the moment the Notes panel
// mounts — before the learner taps "+" — so the chunk is already in the
// service-worker cache for offline use. (Code only: no editor instance exists
// until a note is opened.)
const loadNoteEditor = () => import("./NoteEditor");
const NoteEditor = lazy(loadNoteEditor);

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
   * fresh composer. The panel's own circular "+" is the primary trigger.
   */
  composerOpenSignal?: number;
  /**
   * The persistence hook's live state (`useCourseNotes`), shown as the subtle
   * Saving… / Synced indicator while a note is open. Optional: without it the
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

function MasterNoteViewer({ note, onClose, theme }: { note: MasterCourseNote; onClose: () => void; theme: CoursePlayerTheme }) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-white" data-course-master-note-viewer data-course-notes-mode="master-readonly" data-notes-theme={theme}>
      {/* Headerless like the SELF editor: floating corner actions only — back
          to the library on the left, the read-only badge on the right. */}
      <div className="flex h-11 shrink-0 items-center justify-between px-2" data-note-editor-chrome>
        <button
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 active:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          aria-label="Back to MASTER library"
          title="Back to MASTER library"
          data-course-master-note-back
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <span className="shrink-0 rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-indigo-700" data-master-note-readonly>
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
  // longer exists degrades to the list instead of resurrecting a ghost.
  const sessionNotes = storageOnly ? { view: "list" as const } : getCoursePanelSession().notes;
  const restoreEdit =
    sessionNotes.view === "edit" && notes.some((note) => note.id === sessionNotes.noteId);
  // §16 — the MASTER/SELF choice is a remembered, per-user preference (shared
  // layer), not ephemeral state: it survives closing and reopening the player.
  const masterSelfPref = useMasterSelfPreference("notes", uid, "master");
  const [activeCollection, setActiveCollection] = useState<"master" | "self">(() =>
    storageOnly || sessionNotes.view === "compose" || restoreEdit ? "self" : masterSelfPref.mode,
  );
  const selectCollection = (mode: "master" | "self") => {
    const next = storageOnly ? "self" : mode;
    setActiveCollection(next);
    if (!storageOnly) masterSelfPref.setMode(next);
  };
  useEffect(() => { if (storageOnly) setActiveCollection("self"); }, [storageOnly]);
  // Notes use the shared player preference by default; Work may explicitly
  // supply its shell theme so the feature stays visually scoped to that app.
  const noteThemeCtl = useCourseTheme("notes", uid, "light");
  const noteTheme = themeOverride ?? noteThemeCtl.theme;
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
  // Part 1 §14 — a saved note opens in VIEW (the same BlockNote document, read
  // only) with a single "Edit" action; tapping Edit flips the SAME document to
  // editable and the same slot becomes "Save". No separate preview renderer.
  const [selfReadOnly, setSelfReadOnly] = useState(true);
  // The editor's side panels (reference design): "left" = the learner's note
  // library drawer, "right" = this note's options drawer. At most one is open.
  const [sidePanel, setSidePanel] = useState<"left" | "right" | null>(null);

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
  // Read ↔ edit on the SAME document: flip the panel state and the live
  // editor together (the read-mode double-tap / Enter gesture, the read
  // pill's Edit button and the right panel's mode toggle all land here).
  const enterEditMode = useCallback(() => {
    discardingRef.current = false;
    focusAfterEditRef.current = true;
    setSelfReadOnly(false);
    editorRef.current?.setReadOnly(false);
    editorRef.current?.focusBody();
  }, []);
  const enterReadMode = useCallback(() => {
    setSelfReadOnly(true);
    editorRef.current?.setReadOnly(true);
  }, []);
  // Closing a side panel over an EDITING note hands the caret back to the
  // document (the app's usual end-of-body landing) so writing resumes; in
  // read view it simply closes.
  const closeSidePanel = () => {
    setSidePanel(null);
    if (!selfReadOnly) editorRef.current?.focusBody();
  };
  const editGesture = useDoubleTapToEdit(Boolean(editingId && selfReadOnly), enterEditMode);
  useEffect(() => {
    if (selfReadOnly || !focusAfterEditRef.current) return;
    focusAfterEditRef.current = false;
    editorRef.current?.focusBody();
  }, [selfReadOnly]);
  // Set the moment Save / Cancel closes the editor, so the editor's final
  // flush on unmount can never write a closed draft back into the session.
  const discardingRef = useRef(false);
  const [editorEmpty, setEditorEmpty] = useState(() => isEmptyRichText(combineHtml(seed.title, seed.body)));
  const [dirty, setDirty] = useState(false);
  const [tooLong, setTooLong] = useState(false);
  const [legacyFallback, setLegacyFallback] = useState(false);

  // Deletion is a two-step act: the red trash opens a confirmation overlay
  // and the note is removed ONLY after the learner taps the red confirm
  // button. Cancel / backdrop tap / Escape never delete.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDeleteNote = pendingDeleteId
    ? notes.find((note) => note.id === pendingDeleteId) || null
    : null;

  const editorOpen = composing || Boolean(editingId) || Boolean(viewingMasterNote);

  // Keep the session in sync on every render so the current view + draft are
  // immediately available to the next mount (tab switch) and to the player's
  // exit flush — even if this component unmounts before an effect fires.
  useEffect(() => {
    if (storageOnly) return;
    // A full-panel note (the editor, or a MASTER note open for reading) is
    // one of the player's immersive pages: the footer navigation hides
    // while it is up and returns on the notes list (isFooterHiddenPage).
    setNotesEditorOpen(editorOpen);
    if (composing) {
      setNotesSessionView({ view: "compose", draft, title: draftTitle });
    } else if (editingId) {
      setNotesSessionView({ view: "edit", noteId: editingId, draft: editDraft, title: editTitle });
    } else {
      setNotesSessionView({ view: "list" });
    }
  });

  // The editor reports a BATCHED draft (≤ one per 250 ms of typing, and one
  // last one as it unmounts). It lands in the panel state AND, synchronously,
  // in the session — so a tab switch or the player closing a moment after the
  // last keystroke still finds the latest words there.
  const handleDraftChange = useCallback(
    (next: NoteDraft) => {
      if (discardingRef.current) return;
      setTooLong(combineHtml(next.title, next.bodyHtml).length > MAX_NOTE_HTML_LENGTH);
      if (editingId) {
        setEditDraft(next.bodyHtml);
        setEditTitle(next.title);
        if (!storageOnly) setNotesSessionView({ view: "edit", noteId: editingId, draft: next.bodyHtml, title: next.title });
      } else {
        setDraft(next.bodyHtml);
        setDraftTitle(next.title);
        if (!storageOnly) setNotesSessionView({ view: "compose", draft: next.bodyHtml, title: next.title });
      }
    },
    [editingId, storageOnly],
  );

  // The overlay expands the notes sheet while the editor is open so the
  // writing surface gets the full notes area.
  //
  // Reported on EVERY render (not only when `editorOpen` changes): the
  // sheet closes and reopens WITHOUT unmounting this panel (the hidden
  // sheet stays in the tree), and a deps-gated effect would not re-fire
  // after a reopen when the editor state never changed in between — which
  // is exactly how the overlay's mirror went stale and the sheet came back
  // as a plain overlay instead of the landscape split. Reporting the same
  // boolean again is a cheap no-op for React (it bails out), so this costs
  // nothing.
  useEffect(() => { onEditorOpenChange?.(editorOpen); });
  useEffect(() => () => { onEditorOpenChange?.(false); }, [onEditorOpenChange]);

  // Warm the editor chunk while the learner is still looking at the list — in
  // idle time, so it never competes with the first paint (code only; no editor
  // instance exists until a note is opened).
  useEffect(() => {
    const warm = () => { void loadNoteEditor().catch(() => undefined); };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(warm, { timeout: 4000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(warm, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  const openComposer = () => {
    setActiveCollection("self");
    discardingRef.current = false;
    composeCount.current += 1;
    setEditingId(null);
    setEditDraft("");
    setEditTitle("");
    setComposing(true);
    setSelfReadOnly(false);
    setDraft("");
    setDraftTitle("");
    setSeed({ key: `compose:${composeCount.current}`, title: "", body: "" });
    setEditorEmpty(true);
    setDirty(false);
    setTooLong(false);
  };

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

  // What Save writes: the editor's latest content, flushed first (never the
  // debounced copy), through the same `combineHtml` the stored note always used.
  const currentHtml = (fallbackTitle: string, fallbackBody: string) => {
    const live = editorRef.current?.read();
    return combineHtml(live ? live.title : fallbackTitle, live ? live.bodyHtml : fallbackBody);
  };

  const submitAdd = () => {
    const html = currentHtml(draftTitle, draft);
    if (isEmptyRichText(html)) return;
    // The stored note is capped (utils/courseNotes). Never truncate silently:
    // keep the draft open and say so.
    if (html.length > MAX_NOTE_HTML_LENGTH) { setTooLong(true); return; }
    discardingRef.current = true;
    const saved = onAdd(html);
    if (saved === null) { discardingRef.current = false; return; }
    setSidePanel(null);
    if (saved) {
      startEdit(saved);
      return;
    }
    setDraft("");
    setDraftTitle("");
    setComposing(false);
  };

  const startEdit = (note: CoursePlayerNote) => {
    setActiveCollection("self");
    discardingRef.current = false;
    setComposing(false);
    setDraft("");
    setDraftTitle("");
    // The stored note's leading heading becomes the title field; the rest
    // (minus the divider that separated them) stays in the body.
    const { heading, body } = splitFirstHeading(noteHtml(note));
    setEditingId(note.id);
    setEditTitle(heading);
    setEditDraft(body);
    setSelfReadOnly(true); // §14 — open the saved note as a read-only view
    setSeed({ key: `edit:${note.id}`, title: heading, body });
    setEditorEmpty(isEmptyRichText(combineHtml(heading, body)));
    setDirty(false);
    setTooLong(false);
  };

  const submitEdit = () => {
    const html = currentHtml(editTitle, editDraft);
    if (editingId && !isEmptyRichText(html)) {
      if (html.length > MAX_NOTE_HTML_LENGTH) { setTooLong(true); return; }
      discardingRef.current = true;
      onEdit(editingId, html);
      editorRef.current?.markSaved();
      setSidePanel(null);
      // §14 — after a successful save the SAME note stays open as a read-only
      // view, with all tools hidden until the next direct edit gesture.
      const { heading, body } = splitFirstHeading(html);
      setEditTitle(heading);
      setEditDraft(body);
      setSeed({ key: `edit:${editingId}`, title: heading, body });
      setSelfReadOnly(true);
      setDirty(false);
      setTooLong(false);
    }
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
          onRename: (nextTitle) => {
            const html = noteHtml(note);
            const split = splitFirstHeading(html);
            // Notes without a heading keep their original body; the new
            // explicit title is added above it.
            onEdit(note.id, combineHtml(nextTitle, split.heading ? split.body : html));
          },
          onDelete: () => setPendingDeleteId(note.id),
          deleteLabel: `Delete note ${title}`,
          dataAttrs: { "data-course-note-open": "", "data-note-id": note.id },
        },
      };
    }),
  );

  const masterOpen = useBranchedOpen(masterTree);
  const selfOpen = useBranchedOpen(selfTree);
  // A different note (or the composer) always starts with both side panels shut.
  useEffect(() => { setSidePanel(null); }, [seed.key]);

  // Two-step delete confirmation, shared by the library and the editor (the
  // right panel's Delete lands here too). Rendered through a portal so the
  // player's clipped sheet can never cut it off. Deleting the note that is
  // open in the editor closes the editor with it.
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
        if (pendingDeleteId && pendingDeleteId === editingId) {
          discardingRef.current = true;
          setEditingId(null);
          setEditDraft("");
          setEditTitle("");
          setSelfReadOnly(true);
        }
        setPendingDeleteId(null);
        setSidePanel(null);
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

  // MASTER resources open in the same BlockNote renderer in read-only mode;
  // they never enter the SELF editor state or the learner-note persistence hook.
  if (viewingMasterNote) {
    return (
      <MasterNoteViewer
        note={viewingMasterNote}
        theme={noteTheme}
        onClose={() => setViewingMasterNoteId(null)}
      />
    );
  }

  // The composer and the inline editor both take over the whole panel so the
  // writing surface is as large as the notes area allows.
  if (editorOpen) {
    const editing = Boolean(editingId);
    const value = editing ? editDraft : draft;
    const titleValue = editing ? editTitle : draftTitle;
    const cancel = () => {
      // Cancel discards the draft without saving (the session sync effect
      // records the cleared state on the next render).
      discardingRef.current = true;
      if (editing) { setEditingId(null); setEditDraft(""); setEditTitle(""); }
      else { setComposing(false); setDraft(""); setDraftTitle(""); }
    };
    const empty = legacyFallback ? isEmptyRichText(combineHtml(titleValue, value)) : editorEmpty;
    const darkNote = noteTheme === "dark";
    const readView = editing && selfReadOnly;
    // Previous / next SELF note for the read-mode bottom navigation.
    const editingIndex = editingId ? notes.findIndex((note) => note.id === editingId) : -1;
    const prevNote = editingIndex > 0 ? notes[editingIndex - 1] : null;
    const nextNote = editingIndex >= 0 && editingIndex < notes.length - 1 ? notes[editingIndex + 1] : null;
    const cornerButtonClass = `grid h-9 w-9 shrink-0 place-items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${darkNote ? "text-slate-300 hover:bg-slate-800 active:bg-slate-700" : "text-slate-500 hover:bg-slate-100 active:bg-slate-200"}`;
    const pillButtonClass = `grid h-9 w-9 shrink-0 place-items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:pointer-events-none disabled:opacity-35 ${darkNote ? "hover:bg-slate-800 active:bg-slate-700" : "hover:bg-slate-100 active:bg-slate-200"}`;
    const pillSepClass = `mx-1 h-5 w-px shrink-0 ${darkNote ? "bg-slate-700" : "bg-slate-200"}`;
    return (
      <div
        className={`relative flex h-full flex-col overflow-hidden ${darkNote ? "bg-slate-950" : "bg-white"}`}
        data-course-notes-panel
        data-course-notes-mode={editing ? "edit" : "compose"}
        data-notes-theme={noteTheme}
        data-note-view-mode={editing && selfReadOnly ? "read" : "edit"}
        tabIndex={editing && selfReadOnly ? 0 : undefined}
        aria-label={editing && selfReadOnly ? "Saved note. Double tap or press Enter to edit. Escape returns to the library." : undefined}
        {...editGesture}
        onKeyDown={(event) => {
          if (event.key === "Escape" && sidePanel) { closeSidePanel(); return; }
          if (event.key === "Escape" && selfReadOnly) cancel();
          else editGesture.onKeyDown(event);
        }}
      >
        {/* No conventional header (reference design): the pane is the page,
            with only two corner buttons — top-left opens the notes library
            drawer, top-right opens this note's options drawer. Status, the
            read/edit switch and Save / Cancel live in the right drawer; the
            bottom chrome switches with the mode (see below). */}
        <div className="flex min-h-0 flex-1 flex-col" data-course-notes-composer>
          <div className="flex h-11 shrink-0 items-center justify-between px-2" data-note-editor-chrome>
            <button
              type="button"
              className={cornerButtonClass}
              aria-label="Open notes panel"
              title="Notes"
              data-note-open-left-panel
              onClick={() => setSidePanel("left")}
            >
              <PanelLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={cornerButtonClass}
              aria-label="Open note options"
              title="Note options"
              data-note-open-right-panel
              onClick={() => setSidePanel("right")}
            >
              <PanelRight size={18} aria-hidden="true" />
            </button>
          </div>
          {selfReadOnly && syncState?.status === "error" ? (
            <StudyLibraryNotice
              state="error"
              title={storageOnly ? "Device save needs attention" : "Note sync needs attention"}
              message={syncState.errorMessage || (storageOnly ? "Your note could not be saved on this device." : "Your local note is safe. Retry to sync.")}
              onRetry={storageOnly ? undefined : onRetrySync}
            />
          ) : null}
          {editing && selfReadOnly ? <button type="button" className="sr-only focus:not-sr-only focus:absolute focus:z-20 focus:bg-white focus:p-2" onClick={cancel}>Back to notes library</button> : null}
          <div className="relative min-h-0 flex-1">
            <EditorBoundary
              onFail={() => setLegacyFallback(true)}
              fallback={
                <div className="flex h-full min-h-0 flex-col bg-slate-950 p-3" data-course-notes-legacy-fallback>
                  {editing && selfReadOnly ? <div className="h-full overflow-auto p-4" dangerouslySetInnerHTML={{ __html: sanitizeRichText(combineHtml(titleValue, value)) }} /> : <RichTextEditor
                    theme={noteTheme}
                    value={value}
                    onChange={editing ? (html) => setEditDraft(html) : (html) => setDraft(html)}
                    heading={titleValue}
                    onHeadingChange={editing ? (html) => setEditTitle(html) : (html) => setDraftTitle(html)}
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
                  readOnly={Boolean(editing && selfReadOnly)}
                  // A fresh note lands in the title; a note that already has words
                  // (an edit, or a draft restored from the session) in the body.
                  autoFocus={editing && selfReadOnly ? false : (editing || seed.title || seed.body ? "body" : "title")}
                  ariaLabel={editing ? (selfReadOnly ? "View note" : "Edit note") : "New note"}
                  dataAttribute={editing ? "data-course-note-edit-input" : "data-course-notes-input"}
                  onDraftChange={handleDraftChange}
                  onEmptyChange={setEditorEmpty}
                  onDirtyChange={setDirty}
                  onSaveShortcut={editing && !selfReadOnly ? submitEdit : editing ? undefined : submitAdd}
                />
              </Suspense>
            </EditorBoundary>
          </div>
        </div>

        {/* Read mode's bottom navigation (reference design): one centred
            floating pill — library · previous · next | new · edit · more.
            In edit mode it unmounts and the editor's own editing pill takes
            the bottom of the note instead (NoteDockedToolbar). */}
        {readView ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex justify-center px-4">
            <nav
              className={`pointer-events-auto flex items-center gap-0.5 rounded-full border px-2 py-1.5 shadow-lg backdrop-blur ${darkNote ? "border-slate-700 bg-slate-900/95 text-slate-200 shadow-black/40" : "border-slate-200 bg-white/95 text-slate-600 shadow-slate-950/15"}`}
              aria-label="Note navigation"
              data-note-read-nav
            >
              <button type="button" className={pillButtonClass} aria-label="Back to notes library" title="Back to notes library" data-note-read-back onClick={cancel}>
                <ArrowLeft size={16} aria-hidden="true" />
              </button>
              <button type="button" className={pillButtonClass} aria-label="Previous note" title="Previous note" data-note-read-prev disabled={!prevNote} onClick={() => { if (prevNote) startEdit(prevNote); }}>
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <button type="button" className={pillButtonClass} aria-label="Next note" title="Next note" data-note-read-next disabled={!nextNote} onClick={() => { if (nextNote) startEdit(nextNote); }}>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
              <span className={pillSepClass} aria-hidden="true" />
              <button type="button" className={pillButtonClass} aria-label="New note" title="New note" data-note-read-new onClick={openComposer}>
                <Plus size={16} aria-hidden="true" />
              </button>
              <button type="button" className={pillButtonClass} aria-label="Edit note" title="Edit note" data-note-read-edit onClick={enterEditMode}>
                <Pencil size={16} aria-hidden="true" />
              </button>
              <button type="button" className={pillButtonClass} aria-label="More note options" title="More note options" data-note-read-more onClick={() => setSidePanel("right")}>
                <MoreHorizontal size={16} aria-hidden="true" />
              </button>
            </nav>
          </div>
        ) : null}

        {/* LEFT side panel: the learner's own notes. Picking a note opens it
            (as a read view, like everywhere else); each row keeps the library
            menu's rename + delete, so a note can be renamed from right here
            inside the editor. */}
        {sidePanel === "left" ? (
          <>
            <button type="button" aria-label="Close notes panel" data-note-panel-scrim className="absolute inset-0 z-30 bg-slate-950/30" onClick={closeSidePanel} />
            <aside
              className={`absolute inset-y-0 left-0 z-40 flex w-[280px] max-w-[85%] flex-col border-r shadow-2xl ${darkNote ? "border-slate-800 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}
              aria-label="My notes"
              data-note-left-panel
            >
              <div className={`flex h-12 shrink-0 items-center gap-2 border-b px-3 ${darkNote ? "border-slate-800" : "border-slate-100"}`}>
                <NotebookPen size={16} className="shrink-0 text-indigo-500" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">My notes</span>
                <span className={`shrink-0 text-xs font-semibold ${darkNote ? "text-slate-400" : "text-slate-400"}`}>{notes.length}</span>
                <button type="button" className={cornerButtonClass} aria-label="Close notes panel" data-note-close-left-panel onClick={closeSidePanel}>
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
                {notes.length > 0 ? (
                  <BranchedMenu
                    items={selfTree}
                    openValues={selfOpen.openValues}
                    onToggle={selfOpen.toggle}
                    activeValue={editingId ? `note:${editingId}` : null}
                    onSelect={(value) => {
                      const note = notes.find((entry) => `note:${entry.id}` === value);
                      if (note) startEdit(note);
                      setSidePanel(null);
                    }}
                    ariaLabel="Your notes"
                    fullWidth
                    rowHeight={40}
                    className="notes-library-menu"
                    dataAttrs={{ "data-note-left-panel-menu": "" }}
                  />
                ) : (
                  <p className={`px-3 py-4 text-sm ${darkNote ? "text-slate-400" : "text-slate-500"}`}>Your saved notes will appear here.</p>
                )}
              </div>
              <div className={`shrink-0 space-y-2 border-t p-3 ${darkNote ? "border-slate-800" : "border-slate-100"}`}>
                <button
                  type="button"
                  className="flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-indigo-600 text-[13px] font-black text-white transition hover:bg-indigo-500 active:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                  data-note-panel-new
                  onClick={() => { openComposer(); setSidePanel(null); }}
                >
                  <Plus size={15} aria-hidden="true" /> New note
                </button>
                <button
                  type="button"
                  className={`flex h-10 w-full items-center justify-center gap-1.5 rounded-full text-[13px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${darkNote ? "text-slate-300 hover:bg-slate-800" : "text-slate-600 hover:bg-slate-100"}`}
                  data-note-panel-back
                  onClick={cancel}
                >
                  <ArrowLeft size={15} aria-hidden="true" /> Back to library
                </button>
              </div>
            </aside>
          </>
        ) : null}

        {/* RIGHT side panel: this note's status, the read/edit switch, and
            Save / Cancel / Delete — everything the old top bar carried, moved
            behind the top-right corner button. */}
        {sidePanel === "right" ? (
          <>
            <button type="button" aria-label="Close note options" data-note-panel-scrim className="absolute inset-0 z-30 bg-slate-950/30" onClick={closeSidePanel} />
            <aside
              className={`absolute inset-y-0 right-0 z-40 flex w-[300px] max-w-[85%] flex-col border-l shadow-2xl ${darkNote ? "border-slate-800 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}
              aria-label="Note options"
              data-note-right-panel
            >
              <div className={`flex h-12 shrink-0 items-center gap-2 border-b px-3 ${darkNote ? "border-slate-800" : "border-slate-100"}`}>
                <span className="min-w-0 flex-1 truncate text-sm font-bold">Note options</span>
                <button type="button" className={cornerButtonClass} aria-label="Close note options" data-note-close-right-panel onClick={closeSidePanel}>
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
                <div>
                  <p className={`mb-1.5 text-[11px] font-black uppercase tracking-wide ${darkNote ? "text-slate-400" : "text-slate-400"}`}>Status</p>
                  <NoteStatus editing={editing} dirty={dirty} tooLong={tooLong} sync={syncState} dark={darkNote} storageOnly={storageOnly} />
                </div>
                {editing ? (
                  <div>
                    <p className={`mb-1.5 text-[11px] font-black uppercase tracking-wide ${darkNote ? "text-slate-400" : "text-slate-400"}`}>Mode</p>
                    {readView ? (
                      <button
                        type="button"
                        className={`flex h-10 w-full items-center gap-2 rounded-full px-3 text-[13px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${darkNote ? "text-slate-200 hover:bg-slate-800" : "text-slate-700 hover:bg-slate-100"}`}
                        data-note-mode-edit
                        onClick={() => { enterEditMode(); setSidePanel(null); }}
                      >
                        <Pencil size={15} aria-hidden="true" /> Edit note
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`flex h-10 w-full items-center gap-2 rounded-full px-3 text-[13px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${darkNote ? "text-slate-200 hover:bg-slate-800" : "text-slate-700 hover:bg-slate-100"}`}
                        data-note-mode-read
                        onClick={() => { enterReadMode(); setSidePanel(null); }}
                      >
                        <BookOpen size={15} aria-hidden="true" /> Reading view
                      </button>
                    )}
                  </div>
                ) : null}
                <div>
                  <p className={`mb-1.5 text-[11px] font-black uppercase tracking-wide ${darkNote ? "text-slate-400" : "text-slate-400"}`}>Actions</p>
                  <div className="space-y-2">
                    {!readView ? (
                      <button
                        type="button"
                        onClick={() => { if (editing) submitEdit(); else submitAdd(); }}
                        disabled={empty || tooLong}
                        className="flex h-10 w-full items-center justify-center gap-1 rounded-full bg-indigo-600 px-4 text-[13px] font-black text-white transition hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                        {...(editing ? { "data-course-note-edit-save": true } : { "data-course-notes-save": true })}
                      >
                        <Check size={15} aria-hidden="true" /> Save
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={cancel}
                      className={`flex h-10 w-full items-center justify-center gap-1 rounded-full px-3 text-[13px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${darkNote ? "text-slate-300 hover:bg-slate-800" : "text-slate-600 hover:bg-slate-100"}`}
                      {...(editing ? { "data-course-note-edit-cancel": true } : { "data-course-notes-cancel": true })}
                    >
                      <X size={15} aria-hidden="true" /> {readView ? "Back to library" : "Cancel"}
                    </button>
                    {editing ? (
                      <button
                        type="button"
                        className={`flex h-10 w-full items-center justify-center gap-1 rounded-full px-3 text-[13px] font-bold text-rose-600 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 ${darkNote ? "hover:bg-rose-500/10" : "hover:bg-rose-50"}`}
                        data-note-delete
                        onClick={() => { if (editingId) setPendingDeleteId(editingId); }}
                      >
                        <Trash2 size={15} aria-hidden="true" /> Delete note
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </aside>
          </>
        ) : null}

        {deleteDialog}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden" data-course-notes-panel data-course-notes-mode="list" data-notes-theme={noteTheme}>
      {/* The shared page header (the Resource Library header's size): the
          page name, bold with its icon, and the MASTER / SELF control inside
          the header — no longer a row that scrolls away with the list. */}
      <CoursePageHeader
        title="Notes"
        icon={<NotebookPen size={20} aria-hidden="true" />}
        dataAttrs={{ "data-course-note-collections": "" }}
      >
        {!storageOnly ? (
                <div className="inline-flex shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-1" role="tablist" aria-label="Note collection">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeCollection === "master"}
                    data-course-note-collection="master"
                    onClick={() => selectCollection("master")}
                    className={`rounded-lg px-3 py-2 text-xs font-black tracking-wide ${activeCollection === "master" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}
                  >
                    MASTER <span className="ml-1 text-[10px]">{masterNotes.length}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeCollection === "self"}
                    data-course-note-collection="self"
                    onClick={() => selectCollection("self")}
                    className={`rounded-lg px-3 py-2 text-xs font-black tracking-wide ${activeCollection === "self" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}
                  >
                    SELF <span className="ml-1 text-[10px]">{notes.length}</span>
                  </button>
                </div>
        ) : null}
      </CoursePageHeader>
      {/* The library is one responsive resource-card system: the panel owns
          the add affordance; each resource card itself is the open target. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto overscroll-contain p-3 pb-16" data-course-notes-list>
          <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3">
            {activeCollection === "master" ? (
              masterNotes.length > 0 ? (
                <BranchedMenu
                  items={masterTree}
                  openValues={masterOpen.openValues}
                  onToggle={masterOpen.toggle}
                  onSelect={(value) => {
                    const note = masterNotes.find((entry) => `master:${entry.id}` === value);
                    if (note) setViewingMasterNoteId(note.id);
                  }}
                  ariaLabel="Master course notes"
                  fullWidth
                  rowHeight={40}
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
            {notes.length > 0 && syncState?.status === "loading" ? (
              <StudyLibraryNotice
                state="loading"
                title={storageOnly ? "Loading device notes" : "Checking your library"}
                message={storageOnly ? "Your notes are stored only in this browser on this device." : "Your saved notes are available while cloud sync finishes."}
              />
            ) : null}
            {notes.length > 0 && syncState?.status === "error" ? (
              <StudyLibraryNotice
                state="error"
                title={storageOnly ? "Device save needs attention" : "Cloud sync needs attention"}
                message={syncState.errorMessage || (storageOnly
                  ? "Your notes could not be saved locally. Export them before leaving."
                  : "Your notes stay saved on this device. Try syncing again when your connection is ready.")}
                onRetry={storageOnly ? undefined : onRetrySync}
              />
            ) : null}

            {notes.length > 0 ? (
              <BranchedMenu
                items={selfTree}
                openValues={selfOpen.openValues}
                onToggle={selfOpen.toggle}
                activeValue={editingId ? `note:${editingId}` : null}
                onSelect={(value) => {
                  const note = notes.find((entry) => `note:${entry.id}` === value);
                  if (note) startEdit(note);
                }}
                ariaLabel="Your notes"
                fullWidth
                rowHeight={40}
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
                  : "Capture a formula, a question, or a lesson recap. Use the + button to open the Note Editor."}
              />
            )}
              </>
            )}
          </div>
        </div>
        {activeCollection === "self" ? (
        <button
          type="button"
          onClick={openComposer}
          className="absolute bottom-4 right-4 z-10 grid h-11 w-11 place-items-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-950/50 transition hover:bg-indigo-500 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
          aria-label="Add note"
          title="Add note"
          data-course-notes-add
        >
          <Plus size={19} strokeWidth={2.8} />
        </button>
        ) : null}
      </div>

      {deleteDialog}
    </div>
  );
}
