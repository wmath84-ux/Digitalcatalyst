// src/course/NotesPanel.tsx
//
// Course Player notes panel — deliberately minimal.
//
//   - A single "+" button opens a text input.
//   - "Save" turns the text into a thin strip with edit + delete icons.
//   - The edit icon reopens the same input inline; changes save immediately.
//   - Delete removes the note.
//
// Notes are stored in the user's localStorage (per user + product) so they
// stay on the device and don't collide with Firestore course progress.

import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import type { CoursePlayerNote } from "../types/course";

interface NotesPanelProps {
  notes: CoursePlayerNote[];
  onAdd: (text: string) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}

export default function NotesPanel({ notes, onAdd, onEdit, onDelete }: NotesPanelProps) {
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const openComposer = () => {
    setComposing(true);
    setDraft("");
  };

  const submitAdd = () => {
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft("");
    setComposing(false);
  };

  const startEdit = (note: CoursePlayerNote) => {
    setComposing(false);
    setEditingId(note.id);
    setEditDraft(note.text);
  };

  const submitEdit = () => {
    const text = editDraft.trim();
    if (text && editingId) onEdit(editingId, text);
    setEditingId(null);
    setEditDraft("");
  };

  return (
    <div className="flex h-full flex-col overflow-hidden" data-course-notes-panel>
      {/* Header: title + the single "+" button */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/55" data-course-notes-title>
          Notes
        </p>
        <button
          type="button"
          onClick={composing ? submitAdd : openComposer}
          className="grid h-8 w-8 place-items-center rounded-lg bg-violet-500 text-white transition hover:bg-violet-400 disabled:opacity-40"
          aria-label={composing ? "Save note" : "Add note"}
          disabled={composing && !draft.trim()}
          data-course-notes-add
        >
          {composing ? <Check size={15} /> : <Plus size={16} />}
        </button>
      </div>

      {/* Composer (only while adding a new note) */}
      {composing ? (
        <div className="shrink-0 border-b border-white/10 p-3" data-course-notes-composer>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            autoFocus
            placeholder="Write your note…"
            className="w-full rounded-lg border border-white/10 bg-white/5 p-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-violet-400"
            data-course-notes-input
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={submitAdd}
              disabled={!draft.trim()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-500 py-2 text-[11px] font-black text-white disabled:opacity-40"
              data-course-notes-save
            >
              <Check size={13} /> Save
            </button>
            <button
              type="button"
              onClick={() => { setComposing(false); setDraft(""); }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/10 py-2 text-[11px] font-black text-white/70"
              data-course-notes-cancel
            >
              <X size={13} /> Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* Note list — thin strips */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {notes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/15 p-4 text-center text-xs font-semibold text-white/40">
            No notes yet — tap + to add one.
          </p>
        ) : (
          <ul className="space-y-1.5" data-course-notes-list>
            {notes.map((note) =>
              editingId === note.id ? (
                <li key={note.id} className="rounded-lg border border-violet-400/50 bg-white/5 p-2" data-course-note data-note-id={note.id}>
                  <textarea
                    value={editDraft}
                    onChange={(event) => setEditDraft(event.target.value)}
                    rows={2}
                    autoFocus
                    className="w-full rounded-md border border-white/10 bg-white/5 p-2 text-xs text-white outline-none"
                    data-course-note-edit-input
                  />
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={submitEdit}
                      disabled={!editDraft.trim()}
                      className="flex flex-1 items-center justify-center gap-1 rounded-md bg-violet-500 py-1.5 text-[10px] font-black text-white disabled:opacity-40"
                      data-course-note-edit-save
                    >
                      <Check size={11} /> Save
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingId(null); setEditDraft(""); }}
                      className="flex flex-1 items-center justify-center gap-1 rounded-md bg-white/10 py-1.5 text-[10px] font-black text-white/70"
                      data-course-note-edit-cancel
                    >
                      <X size={11} /> Cancel
                    </button>
                  </div>
                </li>
              ) : (
                <li
                  key={note.id}
                  className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 py-1.5 pl-2.5 pr-1.5"
                  data-course-note
                  data-note-id={note.id}
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-white/80" title={note.text}>{note.text}</span>
                  <button
                    type="button"
                    onClick={() => startEdit(note)}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-white/45 transition hover:bg-white/10 hover:text-white"
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
              ),
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
