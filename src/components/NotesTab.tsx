import { useState } from "react";
import type { Note } from "../types/course";
import { cn } from "../utils/cn";

interface NotesTabProps {
  notes: Note[];
  lessonTitle: string;
  onAddNote: (text: string) => void;
  onUpdateNote: (id: string, text: string) => void;
  onDeleteNote: (id: string) => void;
}

export default function NotesTab({ notes, lessonTitle, onAddNote, onUpdateNote, onDeleteNote }: NotesTabProps) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const handleAdd = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAddNote(trimmed);
    setDraft("");
  };

  const startEdit = (note: Note) => {
    setEditingId(note.id);
    setEditDraft(note.text);
  };

  const saveEdit = (id: string) => {
    const trimmed = editDraft.trim();
    if (trimmed) onUpdateNote(id, trimmed);
    setEditingId(null);
    setEditDraft("");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p className="mb-2 text-[11px] font-medium text-white/40">
          Note for <span className="text-white/70">{lessonTitle}</span>
        </p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type your thoughts, timestamps, or key takeaways here..."
          rows={3}
          className="w-full resize-none rounded-lg border border-white/10 bg-black/20 p-2.5 text-[13px] text-white placeholder:text-white/30 outline-none focus:border-violet-400/50"
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={handleAdd}
            disabled={!draft.trim()}
            className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-1.5 text-[12px] font-semibold text-white shadow shadow-violet-900/40 disabled:opacity-40"
          >
            + Add Note
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {notes.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-[12.5px] text-white/35">
            No notes yet for this lesson. Jot down what stands out to you!
          </div>
        )}

        {notes.map((note) => (
          <div key={note.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            {editingId === note.id ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  rows={3}
                  autoFocus
                  className="w-full resize-none rounded-lg border border-violet-400/40 bg-black/20 p-2.5 text-[13px] text-white outline-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded-lg bg-white/10 px-3 py-1 text-[11.5px] font-medium text-white/70"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => saveEdit(note.id)}
                    className="rounded-lg bg-violet-500 px-3 py-1 text-[11.5px] font-semibold text-white"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10.5px] font-medium text-white/35">{note.timestamp}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => startEdit(note)}
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-md text-white/50 hover:text-white active:bg-white/10"
                      )}
                      aria-label="Edit note"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onDeleteNote(note.id)}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-white/50 hover:text-rose-400 active:bg-white/10"
                      aria-label="Delete note"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
                      </svg>
                    </button>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-white/85">{note.text}</p>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
