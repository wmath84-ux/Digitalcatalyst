// src/course/NotesPanel.tsx
//
// Part 11 — Course Player notes panel.
//
// CRUD over the per-product progress doc:
//   - Add (typed in the textarea, press "Save")
//   - Edit (pencil icon, inline form, "Save changes" or "Cancel")
//   - Delete (trash icon, with confirm step)
//
// Notes are stored on `users/{uid}/courseProgress/{productId}` as
// `notes: Array<{ id, text, createdAt, updatedAt?, moduleId?, resourceId? }>`.
// The Firestore listener in `CoursePlayerApp` propagates writes
// to every other device the user signs in on (multi-device
// sync is automatic).
//
// We also accept `productId` + `selectedModuleId` + `selectedResourceId`
// so the new note is auto-tagged with the context the user was
// viewing. The Course Player re-renders when these props change.

import { useState } from "react";
import { Check, Pencil, Save, Trash2, X } from "lucide-react";
import type { CoursePlayerNote } from "../types/course";

interface NotesPanelProps {
  notes: CoursePlayerNote[];
  draft: string;
  setDraft: (value: string) => void;
  onSave: () => void;
  onEdit: (id: string, nextText: string) => void;
  onDelete: (id: string) => void;
  productTitle: string;
  moduleTitle?: string | null;
  resourceTitle?: string | null;
}

export default function NotesPanel({
  notes,
  draft,
  setDraft,
  onSave,
  onEdit,
  onDelete,
  productTitle,
  moduleTitle,
  resourceTitle,
}: NotesPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<string>("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const startEdit = (note: CoursePlayerNote) => {
    setEditingId(note.id);
    setEditDraft(note.text);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const commitEdit = (id: string) => {
    const text = editDraft.trim();
    if (!text) return;
    onEdit(id, text);
    cancelEdit();
  };

  const confirmDelete = (id: string) => {
    onDelete(id);
    setPendingDelete(null);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden" data-course-notes-panel>
      <div className="shrink-0 border-b border-white/10 p-4">
        <p className="text-[10px] font-black uppercase tracking-wider text-white/40">
          Notes are saved to your account and sync across devices
        </p>
        <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3 text-[11px] font-bold text-cyan-200">
          Context: {productTitle}
          {moduleTitle ? ` · ${moduleTitle}` : ""}
          {resourceTitle ? ` · ${resourceTitle}` : ""}
        </div>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={4}
          placeholder="Write a course note…"
          className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-violet-400"
          data-course-notes-input
        />
        <button
          type="button"
          disabled={!draft.trim()}
          onClick={onSave}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-violet-500 py-2.5 text-xs font-black text-white transition disabled:opacity-40"
          data-course-notes-save
        >
          <Check size={14} /> Save note
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {notes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/15 bg-white/5 p-4 text-center text-xs font-semibold text-white/40">
            No notes yet — your first note will appear here and sync across all your devices.
          </p>
        ) : (
          <ul className="space-y-2" data-course-notes-list>
            {notes.map((note) => {
              const isEditing = editingId === note.id;
              const isConfirmingDelete = pendingDelete === note.id;
              return (
                <li
                  key={note.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-3"
                  data-course-note
                  data-note-id={note.id}
                >
                  {isEditing ? (
                    <div>
                      <textarea
                        value={editDraft}
                        onChange={(event) => setEditDraft(event.target.value)}
                        rows={3}
                        autoFocus
                        className="w-full rounded-lg border border-violet-400/60 bg-white/5 p-2 text-xs text-white outline-none"
                        data-course-note-edit-input
                      />
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => commitEdit(note.id)}
                          disabled={!editDraft.trim()}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-500 py-2 text-[11px] font-black text-white disabled:opacity-40"
                          data-course-note-edit-save
                        >
                          <Save size={13} /> Save changes
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/10 py-2 text-[11px] font-black text-white/70"
                          data-course-note-edit-cancel
                        >
                          <X size={13} /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="whitespace-pre-wrap text-xs leading-5 text-white/80">{note.text}</p>
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-white/35">
                        <span>
                          {new Date(note.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {note.updatedAt && note.updatedAt > note.createdAt ? (
                          <span className="rounded-full bg-white/10 px-1.5 py-0.5 font-bold uppercase tracking-wider">Edited</span>
                        ) : null}
                        {(note.moduleId || note.resourceId) ? (
                          <span className="truncate text-cyan-300/80">· tagged</span>
                        ) : null}
                      </p>
                      {isConfirmingDelete ? (
                        <div className="mt-2 flex items-center gap-2" data-course-note-delete-confirm>
                          <button
                            type="button"
                            onClick={() => confirmDelete(note.id)}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-500 py-2 text-[11px] font-black text-white"
                            data-course-note-delete-confirm-yes
                          >
                            <Trash2 size={12} /> Delete this note
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(null)}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/10 py-2 text-[11px] font-black text-white/70"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="mt-2 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEdit(note)}
                            className="grid h-7 w-7 place-items-center rounded-lg bg-white/5 text-white/55 transition hover:bg-white/10 hover:text-white"
                            aria-label="Edit note"
                            data-course-note-edit
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(note.id)}
                            className="grid h-7 w-7 place-items-center rounded-lg bg-white/5 text-rose-300/80 transition hover:bg-rose-500/15 hover:text-rose-200"
                            aria-label="Delete note"
                            data-course-note-delete
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
