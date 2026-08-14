// src/course/NotesPanel.tsx
//
// Course Player notes panel.
//
//   - A single "+" button opens a LARGE rich-text editor that fills the
//     notes sheet, so long notes are comfortable to read while writing.
//   - "Save" collapses the note back into the same thin one-line strip the
//     panel has always shown — the big surface is an editing affordance
//     only, it never changes how a saved note looks in the list.
//   - The edit icon reopens that same large editor inline.
//   - Delete removes the note.
//   - Pasting from anywhere (Docs, Notion, a website, an IDE, chat) keeps
//     the exact formatting: bold, italics, headings, lists, tables, links,
//     code blocks, colours, highlights, images and emoji.
//
// Notes are stored in the user's localStorage (per user + product) so they
// stay on the device and don't collide with Firestore course progress.

import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import type { CoursePlayerNote } from "../types/course";
import RichTextEditor from "./RichTextEditor";
import { isEmptyRichText, plainToRichText, richTextToPlain } from "../utils/richText";

interface NotesPanelProps {
  notes: CoursePlayerNote[];
  onAdd: (html: string) => void;
  onEdit: (id: string, html: string) => void;
  onDelete: (id: string) => void;
  /** Lets the overlay grow the sheet while the big editor is open. */
  onEditorOpenChange?: (open: boolean) => void;
}

// Older notes were stored as plain text. Render them through the same
// pipeline so nothing in the list ever disappears after the upgrade.
const noteHtml = (note: CoursePlayerNote) => note.html || plainToRichText(note.text || "");
const notePreview = (note: CoursePlayerNote) => richTextToPlain(noteHtml(note)) || note.text || "";

export default function NotesPanel({ notes, onAdd, onEdit, onDelete, onEditorOpenChange }: NotesPanelProps) {
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const editorOpen = composing || Boolean(editingId);

  // The overlay expands the notes sheet while the editor is open so the
  // writing surface gets the full notes area.
  useEffect(() => { onEditorOpenChange?.(editorOpen); }, [editorOpen, onEditorOpenChange]);
  useEffect(() => () => onEditorOpenChange?.(false), [onEditorOpenChange]);

  const draftEmpty = isEmptyRichText(draft);
  const editDraftEmpty = isEmptyRichText(editDraft);

  const openComposer = () => {
    setEditingId(null);
    setComposing(true);
    setDraft("");
  };

  const submitAdd = () => {
    if (isEmptyRichText(draft)) return;
    onAdd(draft);
    setDraft("");
    setComposing(false);
  };

  const startEdit = (note: CoursePlayerNote) => {
    setComposing(false);
    setEditingId(note.id);
    setEditDraft(noteHtml(note));
  };

  const submitEdit = () => {
    if (editingId && !isEmptyRichText(editDraft)) onEdit(editingId, editDraft);
    setEditingId(null);
    setEditDraft("");
  };

  // The composer and the inline editor both take over the whole panel so the
  // writing surface is as large as the notes area allows.
  if (editorOpen) {
    const editing = Boolean(editingId);
    const value = editing ? editDraft : draft;
    const empty = editing ? editDraftEmpty : draftEmpty;
    const cancel = () => {
      if (editing) { setEditingId(null); setEditDraft(""); }
      else { setComposing(false); setDraft(""); }
    };
    return (
      <div className="flex h-full flex-col overflow-hidden" data-course-notes-panel data-course-notes-mode={editing ? "edit" : "compose"}>
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--course-border)] px-4 py-2">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--course-muted)]" data-course-notes-title>
            {editing ? "Edit note" : "New note"}
          </p>
          <button
            type="button"
            onClick={editing ? submitEdit : submitAdd}
            className="grid h-8 w-8 place-items-center rounded-lg bg-violet-500 text-white transition hover:bg-violet-400 disabled:opacity-40"
            aria-label="Save note"
            disabled={empty}
            data-course-notes-add
          >
            <Check size={15} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col p-3" data-course-notes-composer>
          <RichTextEditor
            value={value}
            onChange={editing ? setEditDraft : setDraft}
            autoFocus
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
      {/* Header: title + the single "+" button */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--course-border)] px-4 py-2">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--course-muted)]" data-course-notes-title>
          Notes
        </p>
        <button
          type="button"
          onClick={openComposer}
          className="grid h-8 w-8 place-items-center rounded-lg bg-violet-500 text-white transition hover:bg-violet-400 disabled:opacity-40"
          aria-label="Add note"
          data-course-notes-add
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Note list — thin strips. A saved note always collapses back to one
          slim line; the rich formatting is preserved underneath and shown
          again the moment the note is reopened for editing. */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {notes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--course-border)] p-4 text-center text-xs font-semibold text-[var(--course-muted)]">
            No notes yet — tap + to add one.
          </p>
        ) : (
          <ul className="space-y-1.5" data-course-notes-list>
            {notes.map((note) => {
              const preview = notePreview(note);
              return (
                <li
                  key={note.id}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--course-border)] bg-[var(--course-soft)] py-1.5 pl-2.5 pr-1.5"
                  data-course-note
                  data-note-id={note.id}
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-[var(--course-muted)]" title={preview}>{preview}</span>
                  <button
                    type="button"
                    onClick={() => startEdit(note)}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[var(--course-muted)] transition hover:bg-[var(--course-soft-hover)] hover:text-[var(--course-text)]"
                    aria-label="Edit note"
                    data-course-note-edit
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(note.id)}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-rose-300/70 transition hover:bg-rose-500/15 hover:text-rose-200"
                    aria-label="Delete note"
                    data-course-note-delete
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
