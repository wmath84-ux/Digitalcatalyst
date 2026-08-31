// src/course/NotesPanel.tsx
//
// Course Player notes panel.
//
//   - The single "+" button (in the overlay's MAIN header) opens a LARGE
//     rich-text editor that fills the notes sheet, so long notes are
//     comfortable to read while writing. The panel itself renders no
//     header rows: the overlay's main header is the only header, and
//     while the writing box is open even that one is hidden — leaving
//     toolbar on top, the writing surface in the middle and Save /
//     Cancel on the bottom for maximum writing space.
//   - "Save" collapses the note back into a square card in a grid — the
//     big surface is an editing affordance only, it never changes how a
//     saved note looks in the list.
//   - The edit icon reopens that same large editor inline.
//   - Delete removes the note.
//   - Pasting from anywhere (Docs, Notion, a website, an IDE, chat) keeps
//     the exact formatting: bold, italics, headings, lists, tables, links,
//     code blocks, colours, highlights, images and emoji.
//
// Notes are stored in the user's localStorage (per user + product) so they
// stay on the device and don't collide with Firestore course progress.
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

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import type { CoursePlayerNote } from "../types/course";
import RichTextEditor from "./RichTextEditor";
import { combineHtml } from "./notesStore";
import { getCoursePanelSession, setNotesSessionView } from "./coursePanelSession";
import { firstRichTextBlock, isEmptyRichText, plainToRichText, richTextToPlain, splitFirstHeading } from "../utils/richText";

interface NotesPanelProps {
  notes: CoursePlayerNote[];
  onAdd: (html: string) => void;
  onEdit: (id: string, html: string) => void;
  onDelete: (id: string) => void;
  /** Lets the overlay grow the sheet while the big editor is open. */
  onEditorOpenChange?: (open: boolean) => void;
  /**
   * Monotonic counter from the overlay's main header "+" button. Each
   * increment asks this panel to open its composer — the button moved to
   * the overlay's main header, so the panel listens for the signal instead
   * of owning its own header row.
   */
  composerOpenSignal?: number;
}

// Older notes were stored as plain text. Render them through the same
// pipeline so nothing in the list ever disappears after the upgrade.
const noteHtml = (note: CoursePlayerNote) => note.html || plainToRichText(note.text || "");
const notePreview = (note: CoursePlayerNote) => richTextToPlain(noteHtml(note)) || note.text || "";

// A saved card shows ONLY the note's first heading (or its first line of
// text), in its original format, centred in the square — the full note is
// one tap away in the editor. Falling back to the plain preview keeps a
// card from ever rendering blank.
const noteCardHtml = (note: CoursePlayerNote) => firstRichTextBlock(noteHtml(note)) || notePreview(note);

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

export default function NotesPanel({
  notes,
  onAdd,
  onEdit,
  onDelete,
  onEditorOpenChange,
  composerOpenSignal,
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

  // A note counts as non-empty when EITHER its title or its body has
  // content — a heading-only note is a perfectly valid note.
  const draftEmpty = isEmptyRichText(combineHtml(draftTitle, draft));
  const editDraftEmpty = isEmptyRichText(combineHtml(editTitle, editDraft));

  const openComposer = () => {
    setEditingId(null);
    setEditDraft("");
    setEditTitle("");
    setComposing(true);
    setDraft("");
    setDraftTitle("");
  };

  // The main header's "+" (in the overlay) asks for a fresh composer.
  // `> 0` keeps the first mount (signal 0) from auto-opening the editor.
  useEffect(() => {
    if (composerOpenSignal && composerOpenSignal > 0) openComposer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerOpenSignal]);

  const submitAdd = () => {
    const html = combineHtml(draftTitle, draft);
    if (isEmptyRichText(html)) return;
    onAdd(html);
    setDraft("");
    setDraftTitle("");
    setComposing(false);
  };

  const startEdit = (note: CoursePlayerNote) => {
    setComposing(false);
    setDraft("");
    setDraftTitle("");
    // The stored note's leading heading becomes the title field; the rest
    // (minus the divider that separated them) stays in the body.
    const { heading, body } = splitFirstHeading(noteHtml(note));
    setEditingId(note.id);
    setEditTitle(heading);
    setEditDraft(body);
  };

  const submitEdit = () => {
    const html = combineHtml(editTitle, editDraft);
    if (editingId && !isEmptyRichText(html)) onEdit(editingId, html);
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
    const empty = editing ? editDraftEmpty : draftEmpty;
    const cancel = () => {
      // Cancel discards the draft without saving (the session sync effect
      // records the cleared state on the next render).
      if (editing) { setEditingId(null); setEditDraft(""); setEditTitle(""); }
      else { setComposing(false); setDraft(""); setDraftTitle(""); }
    };
    return (
      <div className="flex h-full flex-col overflow-hidden" data-course-notes-panel data-course-notes-mode={editing ? "edit" : "compose"}>
        {/* No header here: with the overlay's main header hidden in writing
            mode, the sheet is exactly toolbar (top) / heading + divider
            / writing surface (middle) / Save + Cancel (bottom) — maximum
            writing space. */}
        <div className="flex min-h-0 flex-1 flex-col p-3" data-course-notes-composer>
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
          <div className="mt-2 flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={editing ? submitEdit : submitAdd}
              disabled={empty}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-500 py-2 text-[11px] font-black text-white disabled:opacity-40"
              {...(editing ? { "data-course-note-edit-save": true } : { "data-course-notes-save": true })}
            >
              <Check size={13} /> Save
            </button>
            <button
              type="button"
              onClick={cancel}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--course-soft-hover)] py-2 text-[11px] font-black text-[var(--course-muted)]"
              {...(editing ? { "data-course-note-edit-cancel": true } : { "data-course-notes-cancel": true })}
            >
              <X size={13} /> Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden" data-course-notes-panel data-course-notes-mode="list">
      {/* No secondary header — the overlay's main header carries the
          title, the "+" (new note) button and the close button, so the
          note grid starts at the very top of the sheet. */}
      {/* Note list — square cards in a grid. A saved note always collapses
          back to a compact square; the rich formatting is preserved
          underneath and shown again the moment the note is reopened. */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {notes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--course-border)] bg-[var(--course-soft)] p-4 text-center text-xs font-semibold text-[var(--course-muted)]">
            No notes yet — tap + to add one.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3.5 sm:grid-cols-3" data-course-notes-list data-course-notes-grid="true">
            {notes.map((note) => {
              const preview = notePreview(note);
              return (
                <li
                  key={note.id}
                  className="relative aspect-square overflow-visible rounded-2xl p-2.5"
                  data-course-note
                  data-note-id={note.id}
                >
                  <div className="flex h-full flex-col overflow-hidden">
                    <div
                      className="course-note-card-preview min-h-0 w-full flex-1"
                      title={preview}
                      data-course-note-preview
                      dangerouslySetInnerHTML={{ __html: noteCardHtml(note) }}
                    />
                    <div className="mt-1.5 flex shrink-0 items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => startEdit(note)}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-md shadow-blue-200/50 transition hover:brightness-110"
                        aria-label="Edit note"
                        data-course-note-edit
                      >
                        <PremiumEditIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(note.id)}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-rose-400 to-rose-600 text-white shadow-md shadow-rose-200/50 transition hover:brightness-110"
                        aria-label="Delete note"
                        data-course-note-delete
                      >
                        <PremiumDeleteIcon />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
