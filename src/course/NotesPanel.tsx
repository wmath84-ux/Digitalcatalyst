// src/course/NotesPanel.tsx
//
// Course Player notes panel.
//
//   - The single "+" button (a small circular button floating at the
//     grid's bottom-right) opens the note editor — a white block-document
//     page (BlockNote, see ./NoteEditor) that fills the notes pane, so long
//     notes are comfortable to read while writing. The panel renders no header
//     rows in the list; while the editor is open the pane is a slim bar
//     (status · Cancel · Save), then the page, so the writing surface gets
//     every other pixel.
//   - "Save" collapses the note back into a square card in a grid — the
//     big surface is an editing affordance only, it never changes how a
//     saved note looks in the list.
//   - The edit icon reopens that same large editor inline.
//   - Delete removes the note.
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

import { Component, Suspense, lazy, memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Plus, X } from "lucide-react";
import "katex/dist/katex.min.css";
import { GlassButton } from "../components/ui/glass-button";
import { GlassCard } from "../components/ui/GlassCard";
import type { CoursePlayerNote } from "../types/course";
import RichTextEditor from "./RichTextEditor";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog";
import { combineHtml } from "./notesStore";
import { getCoursePanelSession, setNotesSessionView } from "./coursePanelSession";
import { firstRichTextBlock, isEmptyRichText, plainToRichText, richTextToPlain, splitFirstHeading } from "../utils/richText";
import { renderNoteHtmlWithMath } from "./noteEditor/mathRendering";
import { MAX_NOTE_HTML_LENGTH } from "../../utils/courseNotes";
import type { NoteDraft, NoteEditorHandle } from "./noteEditor/editorTypes";

// The editor (BlockNote + its stylesheet) is a separate chunk: the player and
// the notes LIST never pay for it. It is requested the moment the Notes panel
// mounts — before the learner taps "+" — so the chunk is already in the
// service-worker cache for offline use. (Code only: no editor instance exists
// until a note is opened.)
const loadNoteEditor = () => import("./NoteEditor");
const NoteEditor = lazy(loadNoteEditor);

interface NotesPanelProps {
  notes: CoursePlayerNote[];
  onAdd: (html: string) => void;
  onEdit: (id: string, html: string) => void;
  onDelete: (id: string) => void;
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
  syncState?: { status: "idle" | "loading" | "ready" | "saving" | "saved" | "error"; synced: boolean };
}

// Older notes were stored as plain text. Render them through the same
// pipeline so nothing in the list ever disappears after the upgrade.
const noteHtml = (note: CoursePlayerNote) => note.html || plainToRichText(note.text || "");
const notePreview = (note: CoursePlayerNote) => richTextToPlain(noteHtml(note)) || note.text || "";

// A saved card shows ONLY the note's first heading (or its first line of
// text), in its original format, centred in the square — the full note is
// one tap away in the editor. This child is memoized so typing in another
// note does not rerun normalization or KaTeX for every saved card.
const NoteCardPreview = memo(function NoteCardPreview({ sourceHtml, preview }: { sourceHtml: string; preview: string }) {
  const html = firstRichTextBlock(sourceHtml) || preview;
  return (
    <div
      className="course-note-card-preview min-h-0 w-full flex-1"
      title={preview}
      data-course-note-preview
      dangerouslySetInnerHTML={{ __html: renderNoteHtmlWithMath(html) }}
    />
  );
});

/** Filled, high-contrast action marks — heavier than the old outline icons. */
function PremiumEditIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.1 2.6a2.8 2.8 0 0 1 4 4L9.4 17.3l-5.2 1.5 1.5-5.2L16.1 2.6Z" />
      <path d="M3.2 20.2h17.6v2.2H3.2z" />
    </svg>
  );
}

function PremiumDeleteIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9.2 2.4h5.6l1.1 2.2H21v2.4H3V4.6h5.1L9.2 2.4Zm.6 7.2h2.3v8.4H9.8V9.6Zm4.1 0h2.3v8.4h-2.3V9.6ZM5.4 7.8h13.2l-1.1 13.4H6.5L5.4 7.8Z" />
    </svg>
  );
}

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
}: {
  editing: boolean;
  dirty: boolean;
  tooLong: boolean;
  sync: NotesPanelProps["syncState"];
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
    tone === "danger" ? "bg-rose-500" : tone === "warn" ? "bg-amber-500" : tone === "ok" ? "bg-emerald-500" : "bg-slate-300";
  const text = tone === "danger" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : "text-slate-500";
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

export default function NotesPanel({
  notes,
  onAdd,
  onEdit,
  onDelete,
  onEditorOpenChange,
  composerOpenSignal,
  syncState,
}: NotesPanelProps) {
  // Restore the panel's place from the course-player panel SESSION on mount.
  // The session survives this panel unmounting on every tab switch, so a
  // learner who left the editor open (compose or edit) comes straight back
  // into that same editor with the same draft. An edit view whose note no
  // longer exists degrades to the list instead of resurrecting a ghost.
  const sessionNotes = getCoursePanelSession().notes;
  const restoreEdit =
    sessionNotes.view === "edit" && notes.some((note) => note.id === sessionNotes.noteId);
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

  const editorOpen = composing || Boolean(editingId);

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
    discardingRef.current = false;
    composeCount.current += 1;
    setEditingId(null);
    setEditDraft("");
    setEditTitle("");
    setComposing(true);
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
    }
    setEditingId(null);
    setEditDraft("");
    setEditTitle("");
  };

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
    return (
      <div className="flex h-full flex-col overflow-hidden bg-white" data-course-notes-panel data-course-notes-mode={editing ? "edit" : "compose"}>
        {/* The pane is exactly: a slim bar (status · Cancel · Save), then the
            white page. No card, no frame — the page IS the pane. */}
        <div className="flex min-h-0 flex-1 flex-col" data-course-notes-composer>
          <div
            className="flex shrink-0 items-center justify-between gap-2 bg-white py-1.5 pl-[max(1.125rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]"
            data-course-notes-bar
          >
            <NoteStatus editing={editing} dirty={dirty} tooLong={tooLong} sync={syncState} />
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={cancel}
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
                  // A fresh note lands in the title; a note that already has words
                  // (an edit, or a draft restored from the session) in the body.
                  autoFocus={editing || seed.title || seed.body ? "body" : "title"}
                  ariaLabel={editing ? "Edit note" : "New note"}
                  dataAttribute={editing ? "data-course-note-edit-input" : "data-course-notes-input"}
                  onDraftChange={handleDraftChange}
                  onEmptyChange={setEditorEmpty}
                  onDirtyChange={setDirty}
                  onSaveShortcut={editing ? submitEdit : submitAdd}
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
      {/* No header anywhere — the note grid starts at the very top of the
          pane, and the circular "+" floats at the bottom-right of the grid. */}
      {/* Note list — square cards in a grid. A saved note always collapses
          back to a compact square; the rich formatting is preserved
          underneath and shown again the moment the note is reopened.
          An EMPTY library renders nothing at all: the circular "+" at the
          grid's bottom-right is the page's only add-new-note affordance
          (owner's direction) — no top instruction pill, no second button. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
      <div className="h-full overflow-y-auto p-3 pb-16">
        {notes.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3.5 sm:grid-cols-3" data-course-notes-list data-course-notes-grid="true">
            {notes.map((note) => {
              const preview = notePreview(note);
              return (
                <li key={note.id} className="relative aspect-square">
                  <GlassCard
                    className="h-full w-full overflow-visible [&>div:last-child]:h-full [&>div:last-child]:p-2.5"
                    data-course-note
                    data-note-id={note.id}
                  >
                  <div className="flex h-full flex-col overflow-hidden">
                    <NoteCardPreview sourceHtml={noteHtml(note)} preview={preview} />
                    <div className="mt-1.5 flex shrink-0 items-center justify-end gap-1.5">
                      <GlassButton
                        onClick={() => startEdit(note)}
                        className="shrink-0 [&_.size-12]:size-7 [&_svg]:text-sky-300"
                        aria-label="Edit note"
                        data-course-note-edit
                      >
                        <PremiumEditIcon />
                      </GlassButton>
                      <GlassButton
                        onClick={() => setPendingDeleteId(note.id)}
                        className="shrink-0 [&_.size-12]:size-7 [&_svg]:text-rose-300"
                        aria-label="Delete note"
                        data-course-note-delete
                      >
                        <PremiumDeleteIcon />
                      </GlassButton>
                    </div>
                  </div>
                  </GlassCard>
                </li>
              );
            })}
          </ul>
        ) : null}
        </div>
        {/* The one "+" — a small circular button floating at the grid's
            bottom-right. It opens the same big composer the old header "+"
            used to open. */}
        <button
          type="button"
          onClick={openComposer}
          className="absolute bottom-4 right-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-950/50 transition hover:bg-indigo-500 active:scale-95"
          aria-label="Add note"
          title="Add note"
          data-course-notes-add
        >
          <Plus size={18} strokeWidth={2.8} />
        </button>
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
