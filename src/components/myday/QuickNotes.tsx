// src/components/myday/QuickNotes.tsx
//
// My Day quick notes — redesigned to match the course player's NotesPanel.
//
// Layout:
//   - Square cards in a responsive grid (2-col phone, 3-col tablet+).
//   - A single circular "+" floats at the bottom-right of the grid.
//   - Tapping a card opens the same RichTextEditor the course player uses,
//     with heading + body, toolbar, and full formatting support.
//   - The editor REPLACES the grid while open; saving collapses back.
//
// Backward compatibility:
//   Older notes were stored as plain text in `QuickNote.text`.  New notes
//   also store rich HTML in `QuickNote.html`.  The preview and editor
//   degrade gracefully: no `html` → `text` is used everywhere.

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import type { QuickNote } from "../../types";
import { GlassCard } from "../ui/GlassCard";
import { GlassButton } from "../ui/glass-button";
import RichTextEditor from "../../course/RichTextEditor";
import {
  combineHtml,
} from "../../course/notesStore";
import {
  firstRichTextBlock,
  isEmptyRichText,
  plainToRichText,
  richTextToPlain,
  splitFirstHeading,
} from "../../utils/richText";

interface QuickNotesProps {
  notes: QuickNote[];
  onAdd: (html: string) => void;
  onEdit: (id: string, html: string) => void;
  onDelete: (id: string) => void;
  globalSearch?: string;
  onRequireAccess?: () => boolean;
}

// Resolve a note's rich body — new notes have `html`, legacy notes fall
// back to their plain `text` converted on the fly.
const noteHtml = (note: QuickNote) =>
  note.html || plainToRichText(note.text || "");

const notePreview = (note: QuickNote) =>
  richTextToPlain(noteHtml(note)) || note.text || "";

// The saved card shows ONLY the first heading (or first line) of the note,
// with its original formatting, centred in the square.
const noteCardHtml = (note: QuickNote) =>
  firstRichTextBlock(noteHtml(note)) || notePreview(note);

/** Filled, high-contrast edit icon — same as the course player. */
function PremiumEditIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.1 2.6a2.8 2.8 0 0 1 4 4L9.4 17.3l-5.2 1.5 1.5-5.2L16.1 2.6Z" />
      <path d="M3.2 20.2h17.6v2.2H3.2z" />
    </svg>
  );
}

/** Filled, high-contrast delete icon — same as the course player. */
function PremiumDeleteIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9.2 2.4h5.6l1.1 2.2H21v2.4H3V4.6h5.1L9.2 2.4Zm.6 7.2h2.3v8.4H9.8V9.6Zm4.1 0h2.3v8.4h-2.3V9.6ZM5.4 7.8h13.2l-1.1 13.4H6.5L5.4 7.8Z" />
    </svg>
  );
}

export default function QuickNotes({
  notes,
  onAdd,
  onEdit,
  onDelete,
  globalSearch = "",
  onRequireAccess,
}: QuickNotesProps) {
  // ── Editor state ────────────────────────────────────────────────────────
  // The panel has two views: the note GRID (list) and the full-screen EDITOR
  // (compose or edit).  The editor uses the same RichTextEditor the course
  // player ships, with a heading + body split and the full formatting toolbar.
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editTitle, setEditTitle] = useState("");

  // Two-step delete (same pattern as the course player).
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDeleteNote = pendingDeleteId
    ? notes.find((n) => n.id === pendingDeleteId) || null
    : null;

  const editorOpen = composing || Boolean(editingId);

  const draftEmpty = isEmptyRichText(combineHtml(draftTitle, draft));
  const editDraftEmpty = isEmptyRichText(combineHtml(editTitle, editDraft));

  const openComposer = () => {
    if (onRequireAccess && !onRequireAccess()) return;
    setEditingId(null);
    setEditDraft("");
    setEditTitle("");
    setComposing(true);
    setDraft("");
    setDraftTitle("");
  };

  const submitAdd = () => {
    const html = combineHtml(draftTitle, draft);
    if (isEmptyRichText(html)) return;
    onAdd(html);
    setDraft("");
    setDraftTitle("");
    setComposing(false);
  };

  const startEdit = (note: QuickNote) => {
    setComposing(false);
    setDraft("");
    setDraftTitle("");
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

  // ── Filter for search ───────────────────────────────────────────────────
  const searchQuery = globalSearch.trim();
  const filtered = searchQuery
    ? notes.filter((n) => notePreview(n).toLowerCase().includes(searchQuery.toLowerCase()))
    : notes;

  // ── EDITOR VIEW ─────────────────────────────────────────────────────────
  // Takes over the whole notes area while composing or editing.
  if (editorOpen) {
    const editing = Boolean(editingId);
    const value = editing ? editDraft : draft;
    const titleValue = editing ? editTitle : draftTitle;
    const empty = editing ? editDraftEmpty : draftEmpty;
    const cancel = () => {
      if (editing) { setEditingId(null); setEditDraft(""); setEditTitle(""); }
      else { setComposing(false); setDraft(""); setDraftTitle(""); }
    };

    return (
      <GlassCard
        className="overflow-hidden"
        contentClassName="flex flex-col p-0"
        data-myday-notes-editor
        data-myday-notes-mode={editing ? "edit" : "compose"}
      >
        <div className="flex min-h-[340px] flex-col p-3" data-myday-notes-composer>
          <RichTextEditor
            value={value}
            onChange={editing ? (html) => setEditDraft(html) : (html) => setDraft(html)}
            heading={titleValue}
            onHeadingChange={editing ? (html) => setEditTitle(html) : (html) => setDraftTitle(html)}
            headingAutoFocus={!editing}
            autoFocus={editing}
            surfaceClassName="min-h-0"
            ariaLabel={editing ? "Edit note" : "New note"}
            dataAttribute={editing ? "data-myday-note-edit-input" : "data-myday-notes-input"}
          />
          <div className="mt-2 flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={editing ? submitEdit : submitAdd}
              disabled={empty}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-indigo-600 py-2 text-[11px] font-black text-white transition hover:bg-indigo-500 disabled:opacity-40"
              data-myday-note-save
            >
              <Check size={13} /> Save
            </button>
            <GlassButton
              variant="capsule"
              onClick={cancel}
              className="flex-1 text-[11px] font-black [&>span>div]:h-9 [&>span>div]:w-full [&>span>div]:px-4"
              data-myday-note-cancel
            >
              <span className="flex items-center justify-center gap-1.5"><X size={13} /> Cancel</span>
            </GlassButton>
          </div>
        </div>
      </GlassCard>
    );
  }

  // ── GRID VIEW ───────────────────────────────────────────────────────────
  // Square cards in a responsive grid, with a circular "+" floating at the
  // bottom-right — the same layout as the course player's NotesPanel.
  return (
    <div className="relative min-h-[280px]" data-myday-notes-panel data-myday-notes-mode="list">
      <div className="h-full overflow-y-auto pb-16">
        {filtered.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3.5 sm:grid-cols-3" data-myday-notes-list data-myday-notes-grid>
            {filtered.map((note) => {
              const preview = notePreview(note);
              return (
                <li key={note.id} className="relative aspect-square">
                  <GlassCard
                    className="h-full w-full overflow-visible [&>div:last-child]:h-full [&>div:last-child]:p-2.5"
                    data-myday-note
                    data-note-id={note.id}
                  >
                    <div className="flex h-full flex-col overflow-hidden">
                      <div
                        className="course-note-card-preview min-h-0 w-full flex-1"
                        title={preview}
                        data-myday-note-preview
                        dangerouslySetInnerHTML={{ __html: noteCardHtml(note) }}
                      />
                      <div className="mt-1.5 flex shrink-0 items-center justify-end gap-1.5">
                        <GlassButton
                          onClick={() => startEdit(note)}
                          className="shrink-0 [&_.size-12]:size-7 [&_svg]:text-sky-300"
                          aria-label="Edit note"
                          data-myday-note-edit
                        >
                          <PremiumEditIcon />
                        </GlassButton>
                        <GlassButton
                          onClick={() => setPendingDeleteId(note.id)}
                          className="shrink-0 [&_.size-12]:size-7 [&_svg]:text-rose-300"
                          aria-label="Delete note"
                          data-myday-note-delete
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
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-white/40">
            <p className="text-sm font-bold text-white/55">
              {searchQuery ? `No notes match "${searchQuery}"` : "No notes yet. Tap + to create one."}
            </p>
          </div>
        )}
      </div>

      {/* The single "+" — a small circular button floating at the grid's
          bottom-right.  Opens the same rich-text composer the course player
          uses. */}
      <button
        type="button"
        onClick={openComposer}
        className="absolute bottom-4 right-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-950/50 transition hover:bg-indigo-500 active:scale-95"
        aria-label="Add note"
        title="Add note"
        data-myday-notes-add
      >
        <Plus size={18} strokeWidth={2.8} />
      </button>

      {/* Two-step delete confirmation (same as course player). */}
      {pendingDeleteNote ? (
        <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto pt-[max(env(safe-area-inset-top,0px),clamp(0.75rem,9vh,3rem))] pb-[max(env(safe-area-inset-bottom,0px),1rem)] px-[max(env(safe-area-inset-left,0px),1rem)]" data-myday-confirm-dialog>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px]" aria-hidden="true" onClick={() => setPendingDeleteId(null)} />
          <div className="relative z-10 w-[min(100%,26rem)] shrink-0 overflow-hidden rounded-3xl border border-white/15 bg-[#1a1a2e] p-5 text-white shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-black leading-snug">Delete this note?</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-white/70">
                  &ldquo;{notePreview(pendingDeleteNote) || "Untitled note"}&rdquo; will be permanently removed.
                </p>
                <p className="mt-2 rounded-xl bg-white/10 px-3 py-2 text-[11px] font-semibold text-white/75">
                  This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
              <GlassButton
                variant="capsule"
                onClick={() => setPendingDeleteId(null)}
                className="flex-1 text-sm font-bold [&>span>div]:h-11 [&>span>div]:w-full [&>span>div]:px-4"
              >
                Cancel
              </GlassButton>
              <button
                type="button"
                onClick={() => {
                  if (pendingDeleteId) onDelete(pendingDeleteId);
                  setPendingDeleteId(null);
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-rose-600 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-500 active:scale-[0.99]"
                aria-label="Delete note"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M9.2 2.4h5.6l1.1 2.2H21v2.4H3V4.6h5.1L9.2 2.4Zm.6 7.2h2.3v8.4H9.8V9.6Zm4.1 0h2.3v8.4h-2.3V9.6ZM5.4 7.8h13.2l-1.1 13.4H6.5L5.4 7.8Z" />
                </svg>
                Delete note
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
