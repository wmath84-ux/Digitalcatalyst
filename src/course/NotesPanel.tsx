// src/course/NotesPanel.tsx
//
// Course Player notes panel.
//
//   - Saved notes use the shared premium study-resource card from
//     ./StudyResourceCard: a single activation opens the existing BlockNote
//     editor, while a double-click/double-tap or keyboard shortcut renames the
//     note inline. The compact responsive grid shows real course hierarchy,
//     note context, provenance and timestamps without truncating the identity.
//   - The single "+" button opens the same white block-document page
//     (BlockNote, see ./NoteEditor) that fills the notes pane. While the editor
//     is open the pane is a slim bar (status · Cancel · Save), then the page.
//   - Delete remains a two-step action from the card and is confirmed before
//     the note is removed.
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

import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Moon, Plus, Sun, X } from "lucide-react";
import "katex/dist/katex.min.css";
import type { CourseModule, CoursePlayerNote, MasterCourseNote } from "../types/course";
import type { PersonalCourseModule } from "../types/personalCourse";
import RichTextEditor from "./RichTextEditor";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog";
import { combineHtml } from "./notesStore";
import { getCoursePanelSession, setNotesSessionView } from "./coursePanelSession";
import { useCourseTheme, useMasterSelfPreference } from "./playerPreferences";
import { firstRichTextBlock, isEmptyRichText, plainToRichText, richTextToPlain, splitFirstHeading } from "../utils/richText";
import { MAX_NOTE_HTML_LENGTH } from "../../utils/courseNotes";
import { StudyLibraryEmptyState, StudyLibraryNotice, StudyResourceCard, StudyResourceCardSkeleton } from "./StudyResourceCard";
import { resolveCourseResourceContext, resolvePersonalResourceContext } from "./studyResourceContext";
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
  onAdd: (html: string) => void;
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
    status: "idle" | "loading" | "ready" | "saving" | "saved" | "error";
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
}

// Older notes were stored as plain text. Render them through the same
// pipeline so nothing in the library ever disappears after the upgrade.
const noteHtml = (note: CoursePlayerNote) => note.html || plainToRichText(note.text || "");
const notePreview = (note: CoursePlayerNote) => richTextToPlain(noteHtml(note)) || note.text || "";
const masterNotePreview = (note: MasterCourseNote) => richTextToPlain(note.bodyHtml || "");

const noteCardTitle = (note: CoursePlayerNote) => {
  const html = noteHtml(note);
  const { heading } = splitFirstHeading(html);
  const firstBlock = richTextToPlain(firstRichTextBlock(html));
  return (heading || firstBlock || notePreview(note) || `Untitled · ${String(note.id).slice(0, 8)}`).trim().slice(0, 120);
};

const noteCardTopic = (note: CoursePlayerNote, title: string) => {
  const html = noteHtml(note);
  const { heading, body } = splitFirstHeading(html);
  const fullText = notePreview(note);
  const text = heading ? richTextToPlain(body) : fullText.slice(title.length).replace(/^[\s:|·—–-]+/, "").trim();
  return text.trim().slice(0, 220);
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
}: {
  editing: boolean;
  dirty: boolean;
  tooLong: boolean;
  sync: NotesPanelProps["syncState"];
  dark?: boolean;
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
    if (sync?.status === "error") { label = "Saved on this device"; tone = "muted"; }
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

function MasterNoteViewer({ note, onClose }: { note: MasterCourseNote; onClose: () => void }) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-white" data-course-master-note-viewer data-course-notes-mode="master-readonly">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-3 py-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-3 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-600"
          data-course-master-note-back
        >
          ← MASTER library
        </button>
        <span className="shrink-0 rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-indigo-700" data-master-note-readonly>
          Read only · Master
        </span>
      </header>
      <div className="min-h-0 flex-1" data-course-master-note-renderer>
        <Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-500" aria-busy="true">Loading master note…</div>}>
          <NoteEditor
            key={`master:${note.id}`}
            initialTitle={note.title}
            initialBodyHtml={note.bodyHtml}
            readOnly
            autoFocus={false}
            ariaLabel={`Master course note: ${note.title}`}
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
  courseTitle = "",
  modules = [],
  personalModules = [],
  onRetrySync,
  onEditorOpenChange,
  composerOpenSignal,
  syncState,
  openMasterNoteSignal,
  uid = null,
}: NotesPanelProps) {
  // Restore the panel's place from the course-player panel SESSION on mount.
  // The session survives this panel unmounting on every tab switch, so a
  // learner who left the editor open (compose or edit) comes straight back
  // into that same editor with the same draft. An edit view whose note no
  // longer exists degrades to the list instead of resurrecting a ghost.
  const sessionNotes = getCoursePanelSession().notes;
  const restoreEdit =
    sessionNotes.view === "edit" && notes.some((note) => note.id === sessionNotes.noteId);
  // §16 — the MASTER/SELF choice is a remembered, per-user preference (shared
  // layer), not ephemeral state: it survives closing and reopening the player.
  const masterSelfPref = useMasterSelfPreference("notes", uid, "master");
  const [activeCollection, setActiveCollection] = useState<"master" | "self">(() =>
    sessionNotes.view === "compose" || restoreEdit ? "self" : masterSelfPref.mode,
  );
  const selectCollection = (mode: "master" | "self") => {
    setActiveCollection(mode);
    masterSelfPref.setMode(mode);
  };
  // Note-editor Light/Dark toggle (Part 2 small update): the SAME shared theme
  // layer the rest of the player uses (persisted per user, no inversion). The
  // paper defaults to light; the header's compact sun/moon flips it to dark.
  const noteThemeCtl = useCourseTheme("notes", uid, "light");
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
        setNotesSessionView({ view: "edit", noteId: editingId, draft: next.bodyHtml, title: next.title });
      } else {
        setDraft(next.bodyHtml);
        setDraftTitle(next.title);
        setNotesSessionView({ view: "compose", draft: next.bodyHtml, title: next.title });
      }
    },
    [editingId],
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
    onAdd(html);
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
      // §14 — after a successful save the SAME note stays open as a read-only
      // view, so the action slot reads "Edit" again (not back to the list).
      const { heading, body } = splitFirstHeading(html);
      setEditTitle(heading);
      setEditDraft(body);
      setSeed({ key: `edit:${editingId}`, title: heading, body });
      setSelfReadOnly(true);
      setDirty(false);
      setTooLong(false);
    }
  };

  // MASTER resources open in the same BlockNote renderer in read-only mode;
  // they never enter the SELF editor state or the learner-note persistence hook.
  if (viewingMasterNote) {
    return (
      <MasterNoteViewer
        note={viewingMasterNote}
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
    const darkNote = noteThemeCtl.theme === "dark";
    return (
      <div
        className={`flex h-full flex-col overflow-hidden ${darkNote ? "bg-slate-950" : "bg-white"}`}
        data-course-notes-panel
        data-course-notes-mode={editing ? "edit" : "compose"}
        data-notes-theme={noteThemeCtl.theme}
      >
        {/* The pane is exactly: a slim bar (status · theme · Cancel · Save),
            then the page. No card, no frame — the page IS the pane. */}
        <div className="flex min-h-0 flex-1 flex-col" data-course-notes-composer>
          <div
            className={`flex shrink-0 items-center justify-between gap-2 border-b py-1.5 pl-[max(1.125rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] ${darkNote ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"}`}
            data-course-notes-bar
          >
            <NoteStatus editing={editing} dirty={dirty} tooLong={tooLong} sync={syncState} dark={darkNote} />
            <div className="flex shrink-0 items-center gap-1">
              {/* Compact Light/Dark control inside the editor header (Part 2).
                  Reuses the shared persisted theme state — no second system. */}
              <button
                type="button"
                onClick={noteThemeCtl.toggleTheme}
                aria-pressed={darkNote}
                aria-label={darkNote ? "Switch note editor to light theme" : "Switch note editor to dark theme"}
                title={darkNote ? "Light editor" : "Dark editor"}
                data-course-note-theme-toggle={noteThemeCtl.theme}
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
                  darkNote ? "text-slate-300 hover:bg-slate-800" : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {darkNote ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              {/* §14 — one action slot: a saved note that is merely being
                  VIEWED shows "Edit"; while EDITING that exact slot becomes
                  "Save" (plus Cancel). Compose always shows Cancel + Save. */}
              {editing && selfReadOnly ? (
                <>
                  <button
                    type="button"
                    onClick={cancel}
                    aria-label="Close note"
                    title="Close note"
                    className="flex h-10 items-center gap-1 rounded-full px-3 text-[13px] font-bold text-slate-600 transition hover:bg-slate-100 active:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    data-course-note-view-close
                  >
                    <X size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelfReadOnly(false)}
                    className="flex h-10 items-center gap-1 rounded-full bg-indigo-600 px-4 text-[13px] font-black text-white transition hover:bg-indigo-500 active:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    data-course-note-edit
                  >
                    Edit
                  </button>
                </>
              ) : (
                <>
              <button
                type="button"
                onClick={editing ? () => setSelfReadOnly(true) : cancel}
                className="flex h-10 items-center gap-1 rounded-full px-3 text-[13px] font-bold text-slate-600 transition hover:bg-slate-100 active:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                {...(editing ? { "data-course-note-edit-cancel": true } : { "data-course-notes-cancel": true })}
              >
                <X size={15} /> Cancel
              </button>
              <button
                type="button"
                onClick={editing ? submitEdit : submitAdd}
                disabled={empty || tooLong}
                className="flex h-10 items-center gap-1 rounded-full bg-indigo-600 px-4 text-[13px] font-black text-white transition hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                {...(editing ? { "data-course-note-edit-save": true } : { "data-course-notes-save": true })}
              >
                <Check size={15} /> Save
              </button>
                </>
              )}
            </div>
          </div>
          <div className="relative min-h-0 flex-1">
            <EditorBoundary
              onFail={() => setLegacyFallback(true)}
              fallback={
                <div className="flex h-full min-h-0 flex-col bg-slate-950 p-3">
                  <RichTextEditor
                    value={value}
                    onChange={editing ? (html) => setEditDraft(html) : (html) => setDraft(html)}
                    heading={titleValue}
                    onHeadingChange={editing ? (html) => setEditTitle(html) : (html) => setDraftTitle(html)}
                    headingAutoFocus={!editing}
                    autoFocus={editing}
                    surfaceClassName="min-h-0"
                    ariaLabel={editing ? "Edit note" : "New note"}
                    dataAttribute={editing ? "data-course-note-edit-input" : "data-course-notes-input"}
                  />
                </div>
              }
            >
              <Suspense fallback={<div className="h-full bg-white" aria-busy="true" data-course-notes-editor-loading />}>
                <NoteEditor
                  key={seed.key}
                  ref={editorRef}
                  initialTitle={seed.title}
                  initialBodyHtml={seed.body}
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
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden" data-course-notes-panel data-course-notes-mode="list">
      {/* The library is one responsive resource-card system: the panel owns
          the add affordance; each resource card itself is the open target. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto overscroll-contain p-3 pb-16" data-course-notes-list>
          <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3">
            <div className="flex items-center justify-between gap-3" data-course-note-collections>
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-700">Note library</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Master course material and your private notes stay separate.</p>
              </div>
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
            </div>

            {activeCollection === "master" ? (
              masterNotes.length > 0 ? (
                <ul className="grid min-w-0 gap-3" data-course-master-notes-grid data-study-resource-grid>
                  {masterNotes.map((note) => {
                    const wordCount = (note.bodyHtml || "").trim().split(/\s+/).filter(Boolean).length;
                    return (
                      <li key={note.id} className="min-w-0 min-h-[212px]" data-course-master-note-card>
                        <StudyResourceCard
                          kind="note"
                          resourceId={note.resourceId}
                          title={note.title || "Untitled master note"}
                          contextPath={[courseTitle, ...note.modulePath].filter(Boolean)}
                          contextDetail="Admin-authored course note · read only"
                          metadata={[wordCount ? `${wordCount} words` : ""].filter(Boolean)}
                          sourceLabel="MASTER"
                          createdAt={note.createdAt}
                          updatedAt={note.updatedAt}
                          onOpen={() => setViewingMasterNoteId(note.id)}
                        />
                      </li>
                    );
                  })}
                </ul>
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
                title="Checking your library"
                message="Your saved notes are available while cloud sync finishes."
              />
            ) : null}
            {notes.length > 0 && syncState?.status === "error" ? (
              <StudyLibraryNotice
                state="error"
                title="Cloud sync needs attention"
                message={syncState.errorMessage || "Your notes stay saved on this device. Try syncing again when your connection is ready."}
                onRetry={onRetrySync}
              />
            ) : null}

            {notes.length > 0 ? (
              <ul className="grid min-w-0 gap-3" data-course-notes-grid="true" data-study-resource-grid>
                {notes.map((note) => {
                  const title = noteCardTitle(note);
                  const topic = noteCardTopic(note, title);
                  const isPersonal = Boolean(note.personalModuleId || note.personalResourceId);
                  const hierarchy = isPersonal
                    ? resolvePersonalResourceContext(
                        personalModules,
                        note.personalModuleId || note.moduleId,
                        note.personalResourceId || note.resourceId,
                      )
                    : resolveCourseResourceContext(modules, note.moduleId, note.resourceId);
                  const contextPath = [
                    courseTitle,
                    ...(isPersonal ? ["My Modules", ...hierarchy.modulePath] : hierarchy.modulePath),
                  ].filter(Boolean);
                  const wordCount = notePreview(note).trim().split(/\s+/).filter(Boolean).length;
                  const metadata = [
                    wordCount ? `${wordCount} words` : "",
                    note.links?.length ? `${note.links.length} linked ${note.links.length === 1 ? "note" : "notes"}` : "",
                    aiKindLabel(note),
                  ].filter(Boolean);
                  return (
                    <li key={note.id} className="min-w-0 min-h-[212px]">
                      <StudyResourceCard
                        kind="note"
                        resourceId={note.id}
                        title={title}
                        contextPath={contextPath}
                        contextDetail={hierarchy.resourceName ? `Lesson · ${hierarchy.resourceName}` : undefined}
                        topic={topic || undefined}
                        topicLabel="Note context"
                        metadata={metadata}
                        sourceLabel="Self"
                        createdAt={note.createdAt}
                        updatedAt={note.updatedAt}
                        onOpen={() => startEdit(note)}
                        onRename={(nextTitle) => {
                          const html = noteHtml(note);
                          const split = splitFirstHeading(html);
                          // Notes without a heading keep their original body;
                          // the new explicit title is added above it.
                          onEdit(note.id, combineHtml(nextTitle, split.heading ? split.body : html));
                        }}
                        onDelete={() => setPendingDeleteId(note.id)}
                        deleteLabel={`Delete note ${title}`}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : syncState?.status === "loading" ? (
              <ul className="grid min-w-0 gap-3" data-course-notes-list data-course-notes-grid="true" data-study-resource-grid aria-busy="true">
                {[0, 1, 2].map((index) => (
                  <li key={index} className="min-w-0 min-h-[212px]">
                    <StudyResourceCardSkeleton kind="note" />
                  </li>
                ))}
              </ul>
            ) : syncState?.status === "error" ? (
              <>
                <StudyLibraryNotice
                  state="error"
                  title="Notes could not be synced"
                  message={syncState.errorMessage || "No cloud copy could be confirmed. Try again, or continue with notes saved on this device."}
                  onRetry={onRetrySync}
                />
                <StudyLibraryEmptyState
                  kind="note"
                  title="Your course notes remain yours"
                  description="Reconnect and try again to load your latest library. Anything already on this device stays safe."
                />
              </>
            ) : (
              <StudyLibraryEmptyState
                kind="note"
                title="Start a study note"
                description="Capture a formula, a question, or a lesson recap. Use the + button to open the Note Editor."
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

      {/* Two-step delete confirmation. Rendered through a portal so the
          player's clipped/overflow-hidden sheet can never cut it off, and
          it always sits above the overlay + dock on phones and tablets. */}
      <ConfirmDeleteDialog
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
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
