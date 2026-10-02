// src/components/myday/QuickNotes.tsx
//
// My Day quick notes — the SAME note editor as the course player's.
//
// Layout:
//   - Square cards in a responsive grid (2-col phone, 3-col tablet+).
//   - A single circular "+" floats at the bottom-right of the grid.
//   - Tapping the pencil opens the note editor and it REPLACES the grid;
//     saving collapses back to the square card.
//
// ── The editor ─────────────────────────────────────────────────────────────
// It is literally the course player's editor — `src/course/NoteEditor.tsx`,
// the BlockNote block-document page — imported from there, not copied. So My
// Day gets, unchanged and for free: the white page with its serif title, the
// slash menu, the block side menu, the toolbar that follows the CURSOR (up the
// instant a text field has a caret, on a phone, a desktop, a big tablet in
// desktop view or a floating window), paste from Docs / Notion / an IDE
// sanitised into blocks with nothing dropped, undo history per note, and the
// batched draft reporting that keeps typing off React's render path.
//
// It is wired exactly as `src/course/NotesPanel.tsx` wires it:
//   · the editor is its own lazy chunk, warmed while the grid is on screen;
//   · it is UNCONTROLLED — opened once from a seed and keyed by the note's
//     identity, so typing never re-renders this panel and switching notes
//     disposes the old instance and its undo history;
//   · Save reads through the handle (flushing the editor first), so it never
//     writes the debounced copy and never loses the last words;
//   · the previous `RichTextEditor` stays as the emergency fallback for the
//     one case the block editor cannot cover — the chunk failing to load on a
//     first-ever visit made offline — bound to the same draft.
//
// Backward compatibility:
//   Older notes were stored as plain text in `QuickNote.text`.  New notes
//   also store rich HTML in `QuickNote.html`.  The preview and editor
//   degrade gracefully: no `html` → `text` is used everywhere.

import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { MAX_NOTE_HTML_LENGTH } from "../../../utils/courseNotes";
import type { NoteDraft, NoteEditorHandle } from "../../course/noteEditor/editorTypes";

// The editor (BlockNote + its stylesheet) is a separate chunk: the My Day page
// and the notes GRID never pay for it. It is requested the moment this panel
// mounts — before the learner taps "+" — and it is the SAME chunk the course
// player loads, so a learner who has opened a course note already has it.
const loadNoteEditor = () => import("../../course/NoteEditor");
const NoteEditor = lazy(loadNoteEditor);

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

/**
 * The editor chunk failed to load (a first-ever visit made while offline, in a
 * browser that has not cached it). The card must never go blank and a learner
 * must never be unable to write: fall back to the previous editor — which is
 * still in the My Day bundle — bound to the same draft.
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

/** The slim status line: New note · Unsaved · Saved (never loud). */
function NoteStatus({ editing, dirty, tooLong }: { editing: boolean; dirty: boolean; tooLong: boolean }) {
  let label = "New note";
  let tone = "muted";
  if (tooLong) {
    label = "Too long to save";
    tone = "danger";
  } else if (dirty) {
    label = "Unsaved";
    tone = "warn";
  } else if (editing) {
    label = "Saved";
    tone = "ok";
  }
  const dot =
    tone === "danger" ? "bg-rose-500" : tone === "warn" ? "bg-amber-500" : tone === "ok" ? "bg-emerald-500" : "bg-slate-300";
  const text = tone === "danger" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-slate-500" : "text-slate-400";
  return (
    <span
      role="status"
      aria-live="polite"
      data-myday-notes-status={tone}
      className={`flex min-w-0 items-center gap-1.5 truncate text-[12px] font-semibold ${text}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <span className="truncate">{label}</span>
    </span>
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
  // The panel has two views: the note GRID (list) and the EDITOR (compose or
  // edit), which replaces it. The editor is the course player's block document.
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editTitle, setEditTitle] = useState("");

  // The editor is UNCONTROLLED: it is opened once from this seed and owns its
  // content from then on — typing never re-renders this panel. `key` is the
  // note's identity, so switching notes disposes the old editor and its undo
  // history (the only clean history boundary ProseMirror offers).
  const [seed, setSeed] = useState({ key: "compose:0", title: "", body: "" });
  const composeCount = useRef(0);
  const editorRef = useRef<NoteEditorHandle | null>(null);
  // Set the moment Save / Cancel closes the editor, so the editor's final
  // flush on unmount can never write a closed draft back into state.
  const discardingRef = useRef(false);
  const [editorEmpty, setEditorEmpty] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [tooLong, setTooLong] = useState(false);
  const [legacyFallback, setLegacyFallback] = useState(false);

  // Two-step delete (same pattern as the course player).
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDeleteNote = pendingDeleteId
    ? notes.find((n) => n.id === pendingDeleteId) || null
    : null;

  const editorOpen = composing || Boolean(editingId);

  // The editor reports a BATCHED draft (≤ one per 250 ms of typing, and one
  // last one as it unmounts), never one per keystroke.
  const handleDraftChange = useCallback(
    (next: NoteDraft) => {
      if (discardingRef.current) return;
      setTooLong(combineHtml(next.title, next.bodyHtml).length > MAX_NOTE_HTML_LENGTH);
      if (editingId) {
        setEditDraft(next.bodyHtml);
        setEditTitle(next.title);
      } else {
        setDraft(next.bodyHtml);
        setDraftTitle(next.title);
      }
    },
    [editingId],
  );

  // Warm the editor chunk while the learner is still looking at the grid — in
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
    if (onRequireAccess && !onRequireAccess()) return;
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

  const startEdit = (note: QuickNote) => {
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

  // ── Filter for search ───────────────────────────────────────────────────
  const searchQuery = globalSearch.trim();
  const filtered = searchQuery
    ? notes.filter((n) => notePreview(n).toLowerCase().includes(searchQuery.toLowerCase()))
    : notes;

  // ── EDITOR VIEW ─────────────────────────────────────────────────────────
  // Takes over the whole notes area while composing or editing: a slim bar
  // (status · Cancel · Save), then the white page. No card inside a card — the
  // page IS the surface, exactly as it is in the course player.
  if (editorOpen) {
    const editing = Boolean(editingId);
    const value = editing ? editDraft : draft;
    const titleValue = editing ? editTitle : draftTitle;
    const cancel = () => {
      // Cancel discards the draft without saving.
      discardingRef.current = true;
      if (editing) { setEditingId(null); setEditDraft(""); setEditTitle(""); }
      else { setComposing(false); setDraft(""); setDraftTitle(""); }
    };
    const empty = legacyFallback ? isEmptyRichText(combineHtml(titleValue, value)) : editorEmpty;

    return (
      <GlassCard
        className="flex h-[min(72dvh,680px)] flex-col overflow-hidden sm:h-[min(75dvh,720px)]"
        contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
        data-myday-notes-editor
        data-myday-notes-mode={editing ? "edit" : "compose"}
      >
        <div className="flex min-h-0 flex-1 flex-col bg-white" data-myday-notes-composer>
          <div
            className="flex shrink-0 items-center justify-between gap-2 bg-white py-1.5 pl-[max(1.125rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]"
            data-myday-notes-bar
          >
            <NoteStatus editing={editing} dirty={dirty} tooLong={tooLong} />
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={cancel}
                className="flex h-10 items-center gap-1 rounded-full px-3 text-[13px] font-bold text-slate-600 transition hover:bg-slate-100 active:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                data-myday-note-cancel
              >
                <X size={15} /> Cancel
              </button>
              <button
                type="button"
                onClick={editing ? submitEdit : submitAdd}
                disabled={empty || tooLong}
                className="flex h-10 items-center gap-1 rounded-full bg-indigo-600 px-4 text-[13px] font-black text-white transition hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                aria-label="Save note"
                data-myday-note-save
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
                    dataAttribute={editing ? "data-myday-note-edit-input" : "data-myday-notes-input"}
                  />
                </div>
              }
            >
              <Suspense fallback={<div className="h-full bg-white" aria-busy="true" data-myday-notes-editor-loading />}>
                <NoteEditor
                  key={seed.key}
                  ref={editorRef}
                  initialTitle={seed.title}
                  initialBodyHtml={seed.body}
                  // A fresh note lands in the title; a note that already has
                  // words (an edit) in the body.
                  autoFocus={editing || seed.title || seed.body ? "body" : "title"}
                  ariaLabel={editing ? "Edit note" : "New note"}
                  dataAttribute={editing ? "data-myday-note-edit-input" : "data-myday-notes-input"}
                  onDraftChange={handleDraftChange}
                  onEmptyChange={setEditorEmpty}
                  onDirtyChange={setDirty}
                  onSaveShortcut={editing ? submitEdit : submitAdd}
                />
              </Suspense>
            </EditorBoundary>
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

      {/* The single "+" — bottom-right FAB, always visible above the
          bottom nav (same placement as Study Library's FAB). Previously it
          was absolute inside the grid and appeared centered when the grid
          was short. */}
      <button
        type="button"
        onClick={openComposer}
        className="fixed bottom-24 right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-[0_12px_30px_-10px_rgba(124,92,255,0.9)] transition hover:brightness-110 active:scale-95 sm:bottom-28 sm:right-6 lg:bottom-8"
        aria-label="Add note"
        title="Add note"
        data-myday-notes-add
      >
        <Plus size={26} strokeWidth={2.8} />
      </button>

      {/* Two-step delete confirmation (same as course player). */}
      {pendingDeleteNote ? (
        <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto pt-[max(env(safe-area-inset-top,0px),clamp(0.75rem,9vh,3rem))] pb-[max(env(safe-area-inset-bottom,0px),1rem)] px-[max(env(safe-area-inset-left,0px),1rem)]" data-myday-confirm-dialog>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px]" aria-hidden="true" onClick={() => setPendingDeleteId(null)} />
          <div className="relative z-10 w-[min(100%,26rem)] shrink-0 overflow-hidden rounded-3xl border border-white/15 bg-[#1a1a2e] p-5 text-white shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2.6 2.6 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
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
