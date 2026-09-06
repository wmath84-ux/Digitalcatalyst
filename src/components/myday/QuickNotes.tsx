import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckSquare, ChevronDown, ChevronUp, NotebookPen, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/glass-tooltip";
import type { NoteColor, QuickNote } from "../../types";
import { cn } from "../../utils/cn";
import { GlassSurface } from "../ui/glass";
import { GlassButton } from "../ui/glass-button";
import { GlassInput } from "../ui/glass-input";
import { GlassCard } from "../ui/GlassCard";

interface QuickNotesProps {
  notes: QuickNote[];
  onAdd: (text: string) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  globalSearch?: string;
  onRequireAccess?: () => boolean;
}

// Wave 13: every note is the pack GlassCard; the note colour lives only in the
// ring + ink (meaning colour), never in the material.
const colorStyles: Record<NoteColor, { ring: string; ink: string; editBg: string; highlight: string }> = {
  amber: { ring: "ring-1 ring-amber-300/50", ink: "text-amber-200", editBg: "bg-amber-500/15", highlight: "bg-amber-300" },
  sky: { ring: "ring-1 ring-sky-300/50", ink: "text-sky-200", editBg: "bg-sky-500/15", highlight: "bg-sky-300" },
  rose: { ring: "ring-1 ring-rose-300/50", ink: "text-rose-200", editBg: "bg-rose-500/15", highlight: "bg-rose-300" },
  emerald: { ring: "ring-1 ring-emerald-300/50", ink: "text-emerald-200", editBg: "bg-emerald-500/15", highlight: "bg-emerald-300" },
  violet: { ring: "ring-1 ring-violet-300/50", ink: "text-violet-200", editBg: "bg-violet-500/15", highlight: "bg-violet-300" },
};

const MAX_COLLAPSED_LENGTH = 80; // Characters before truncating

// ── Big note editor ────────────────────────────────────────────────────────
// Both the new-note composer and the edit view share this one surface. It is
// deliberately LARGE and always the same size — a generous 200px floor that
// grows with the content up to 55% of the viewport height — so writing is
// comfortable and the box never shrinks or grows unpredictably. The old
// editor lived inside the notes list's own scroll box and sized itself off
// the note's length (rows + 45vh), which is exactly why it "kabhi pura
// dikhta tha, kabhi nahi": a short note opened a small box, a long note a
// tall one, and near the list edge the container clipped it.
//
// The editor replaces the list area while open (maximum area, no clipping)
// and scrolls itself into view + focuses on mount. The action row carries
// [Delete?] [Cancel] and a CHECKBOX-style Save: one click saves and closes
// the editor.
const EDITOR_MIN_HEIGHT_PX = 200;
const EDITOR_MAX_HEIGHT_DVH = 55;

interface BigNoteEditorProps {
  kind: "compose" | "edit";
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  placeholder: string;
  /** aria-label of the checkbox-save button ("Save note" for edit). */
  saveAriaLabel: string;
  surfaceClassName?: string;
}

function BigNoteEditor({
  kind,
  value,
  onChange,
  onSave,
  onCancel,
  onDelete,
  placeholder,
  saveAriaLabel,
  surfaceClassName,
}: BigNoteEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow: the box follows the content line by line between the 200px
  // floor and the 55dvh cap, then scrolls internally.
  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const cap = Math.max(EDITOR_MIN_HEIGHT_PX, Math.round(window.innerHeight * (EDITOR_MAX_HEIGHT_DVH / 100)));
    el.style.height = `${Math.min(el.scrollHeight, cap)}px`;
  }, []);

  useEffect(() => { resize(); }, [value, resize]);

  // Opening the editor: bring the FULL box into view and land the caret at
  // the end. The explicit focus (in a frame) is more reliable than the
  // autoFocus attribute, which can silently fail when the editor mounts
  // inside a freshly-swapped area — another cause of the half-visible box.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const raf = requestAnimationFrame(() => {
      el.focus();
      const end = el.value.length;
      try { el.setSelectionRange(end, end); } catch { /* ignore */ }
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="space-y-2.5" data-myday-note-editor data-myday-note-editor-kind={kind}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onInput={resize}
        rows={6}
        placeholder={placeholder}
        onKeyDown={(event) => {
          // In the big editor Enter makes a new line; Ctrl/Cmd+Enter saves.
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            onSave();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        className={cn(
          "w-full resize-none rounded-xl border-0 px-3 py-2.5 text-sm text-white/85 outline-none min-h-[200px] max-h-[55dvh] overflow-y-auto custom-scrollbar placeholder:text-white/55 focus:ring-2 focus:ring-rose-400/30",
          surfaceClassName ?? "border border-white/10 bg-transparent",
        )}
      />
      {/* Wave 4: the two icon actions keep their hooks and colours, but the
          browser's grey `title` bubble became the glass tooltip (delayed,
          focusable, and it no longer leaks into screenshots). The cancel hint
          also lost its stale half-Hinglish wording. */}
      <TooltipProvider delayMs={300}>
      <div className="flex items-center justify-end gap-1.5">
        {onDelete ? (
          <Tooltip>
            <TooltipTrigger
              onClick={onDelete}
              aria-label="Delete note"
              data-myday-note-editor-delete
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-rose-300 transition hover:bg-rose-500/15"
            >
              <Trash2 className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent side="top">
              <span>Delete note</span>
            </TooltipContent>
          </Tooltip>
        ) : null}
        <Tooltip>
          <TooltipTrigger
            onClick={onCancel}
            aria-label="Cancel editing"
            data-myday-note-editor-cancel
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-white/70 transition hover:text-white"
          >
            <X className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent side="top">
            <span className="text-white/85">Close without saving</span>
          </TooltipContent>
        </Tooltip>
        {/* Checkbox-style Save: one click saves the note AND closes the
            editor. It sits next to Delete / Cancel, styled like a check
            box so the action is unmistakable. */}
        <button
          onClick={onSave}
          disabled={!value.trim()}
          aria-label={saveAriaLabel}
          title={kind === "edit" ? "Save note & close editor" : "Save note & close"}
          data-myday-note-save
          className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-emerald-500 bg-emerald-500/15 text-emerald-300 transition hover:bg-emerald-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {kind === "edit" ? <Check className="h-4 w-4" strokeWidth={3} /> : <CheckSquare className="h-4 w-4" strokeWidth={2.5} />}
        </button>
      </div>
      </TooltipProvider>
    </div>
  );
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Highlight matching text
function highlightText(text: string, query: string, highlightClass: string) {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className={cn(highlightClass, "rounded px-0.5")}>
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export default function QuickNotes({ notes, onAdd, onEdit, onDelete, globalSearch = "", onRequireAccess }: QuickNotesProps) {
  const [draft, setDraft] = useState("");
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [localSearch, setLocalSearch] = useState("");

  // Combined search query
  const searchQuery = globalSearch.trim() || localSearch.trim();

  // When global search is active, expand all matching notes
  useEffect(() => {
    if (globalSearch.trim()) {
      const matchingIds = notes
        .filter((n) => n.text.toLowerCase().includes(globalSearch.toLowerCase()))
        .map((n) => n.id);
      setExpandedIds(new Set(matchingIds));
    }
  }, [globalSearch, notes]);

  const submit = () => {
    if (onRequireAccess && !onRequireAccess()) return;
    if (!draft.trim()) return;
    onAdd(draft.trim());
    setDraft("");
    setComposerExpanded(false);
  };

  const startEdit = (note: QuickNote) => {
    // No access check for editing existing notes - users should always be able to edit their own items
    setEditingId(note.id);
    setEditText(note.text);
    setExpandedIds((prev) => new Set(prev).add(note.id));
  };

  const saveEdit = () => {
    // No access check for saving edited notes - editing existing items is always allowed
    if (editingId && editText.trim()) {
      onEdit(editingId, editText.trim());
      // Minimize the note back to its compact display state after saving.
      setExpandedIds((prev) => {
        if (!prev.has(editingId)) return prev;
        const next = new Set(prev);
        next.delete(editingId);
        return next;
      });
    }
    setEditingId(null);
    setEditText("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  // Deleting from inside the editor: remove the note and fall straight back
  // to the list (the expanded flag goes too, so nothing stale remains).
  const deleteEditingNote = (note: QuickNote) => {
    onDelete(note.id);
    setEditingId(null);
    setEditText("");
    setExpandedIds((prev) => {
      if (!prev.has(note.id)) return prev;
      const next = new Set(prev);
      next.delete(note.id);
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Filter notes based on search
  const filtered = useMemo(() => {
    let list = notes.slice().sort((a, b) => b.createdAt - a.createdAt);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((n) => n.text.toLowerCase().includes(q));
    }
    return list;
  }, [notes, searchQuery]);

  const isSearchActive = searchQuery.length > 0;

  // The note currently open in the big editor (null → list view).
  const editingNote = editingId ? notes.find((n) => n.id === editingId) ?? null : null;
  const editingColor = editingNote ? colorStyles[editingNote.color] : null;

  // Legibility (the same pass as Home, Store and the product page):
  // `dc-scene-plate` is the ONE shared material in src/glass.css — a dark
  // navy backing, a real rim, blur 0 and lifted `/40 · /55 · /70 · /85` ink —
  // so this panel reads at the same contrast as the cards inside it.
  return (
    <GlassSurface radius={24} className="dc-scene-plate text-white" contentClassName="flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4 sm:px-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500 text-white">
          <NotebookPen className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-extrabold text-white sm:text-lg">Quick Notes</h2>
          <p className="text-xs font-medium text-white/55">
            {notes.length} note{notes.length !== 1 ? "s" : ""} • Click to edit
          </p>
        </div>
      </div>

      <div className="px-4 pb-5 sm:px-6">
        {/* Search bar */}
        <div className="mb-3 flex items-center gap-2">
          {/* `dc-scene-field`: the pack pill paints a 16.8% grey with no
              boundary on the plated panel, and its placeholder drops under
              3:1. The hook adds the rim + lifts the placeholder ink. */}
          <GlassInput
            icon={<Search className={cn("h-4 w-4 shrink-0", isSearchActive ? "text-rose-300" : "text-white/55")} />}
            value={globalSearch || localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search notes..."
            disabled={!!globalSearch}
            className={cn("dc-scene-field min-w-0 flex-1", isSearchActive && "rounded-full ring-2 ring-rose-400/30")}
          />
          {isSearchActive && (
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="rounded-md bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
                {filtered.length}
              </span>
              {!globalSearch && (
                <GlassButton
                  onClick={() => setLocalSearch("")}
                  aria-label="Clear search"
                  className="[&_.size-12]:size-8 [&_svg]:text-white/70"
                >
                  <X className="h-3.5 w-3.5" />
                </GlassButton>
              )}
            </div>
          )}
        </div>

        {/* Composer — a compact strip that EXPANDS into the big editor the
            moment the learner starts writing, so short notes get the same
            comfortable surface as edits. Cancel collapses it back without
            losing the draft. */}
        {/* The composer well is a GlassSurface around a bare textarea, so it
            takes `dc-scene-field` rather than a second plate: a real rim and
            blur 0, without stacking another navy backing inside the panel's. */}
        {composerExpanded ? (
          <GlassSurface radius={20} className="dc-scene-field mb-4 transition-all focus-within:ring-2 focus-within:ring-rose-400/30" contentClassName="p-2.5">
            <BigNoteEditor
              kind="compose"
              value={draft}
              onChange={setDraft}
              onSave={submit}
              onCancel={() => setComposerExpanded(false)}
              placeholder="Type a quick thought or reminder..."
              saveAriaLabel="Add note"
              surfaceClassName="bg-transparent"
            />
          </GlassSurface>
        ) : (
          <GlassSurface radius={20} className="dc-scene-field mb-4 transition-all focus-within:ring-2 focus-within:ring-rose-400/30" contentClassName="flex items-start gap-2 p-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => setComposerExpanded(true)}
              placeholder="Type a quick thought or reminder..."
              rows={1}
              className="min-h-[40px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-white/85 outline-none placeholder:text-white/55"
            />
            <GlassButton
              type="button"
              onClick={submit}
              disabled={!draft.trim()}
              aria-label="Add note"
              className="shrink-0 disabled:cursor-not-allowed disabled:opacity-40 [&_.size-12]:size-9"
            >
              <Plus className="h-4 w-4" />
            </GlassButton>
          </GlassSurface>
        )}

        {/* Notes area — the big editor REPLACES the list while a note is open,
            so it always gets the full card area and can never be clipped by
            the list's own scroll box. Saving / cancelling / deleting brings
            the list straight back. */}
        {editingNote && editingColor ? (
          <GlassCard
            className={cn("transition-all duration-200", editingColor.ring, editingColor.ink)}
            contentClassName="p-3.5"
            data-myday-note-edit-card
          >
            <BigNoteEditor
              kind="edit"
              value={editText}
              onChange={setEditText}
              onSave={saveEdit}
              onCancel={cancelEdit}
              onDelete={() => deleteEditingNote(editingNote)}
              placeholder="Write your note..."
              saveAriaLabel="Save note"
              surfaceClassName={editingColor.editBg}
            />
          </GlassCard>
        ) : (
          <div className="max-h-80 space-y-2.5 overflow-y-auto pr-0.5 custom-scrollbar">
            {filtered.length === 0 ? (
              <GlassCard contentClassName="flex flex-col items-center justify-center gap-2 py-10 text-center">
                {isSearchActive ? (
                  <>
                    <Search className="h-8 w-8 text-white/40" />
                    <p className="text-sm font-bold text-white/55">
                      No notes match "{searchQuery}"
                    </p>
                  </>
                ) : (
                  <>
                    <NotebookPen className="h-8 w-8 text-white/40" />
                    <p className="text-sm font-bold text-white/55">No notes yet. Start jotting!</p>
                  </>
                )}
              </GlassCard>
            ) : (
              filtered.map((note, idx) => {
                const isExpanded = expandedIds.has(note.id);
                const isLong = note.text.length > MAX_COLLAPSED_LENGTH;
                const cs = colorStyles[note.color];

                const displayText = isLong && !isExpanded
                  ? note.text.slice(0, MAX_COLLAPSED_LENGTH) + "..."
                  : note.text;

                return (
                  <GlassCard
                    key={note.id}
                    className={cn(
                      "group transition-all duration-200",
                      cs.ink,
                      isSearchActive ? "ring-2 ring-amber-400/30" : cs.ring,
                    )}
                    contentClassName="p-0"
                    style={{ animationDelay: `${idx * 30}ms` }}
                  >
                    <div className="px-3.5 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                            {searchQuery
                              ? highlightText(displayText, searchQuery, cs.highlight)
                              : displayText
                            }
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <p className="text-[10px] font-medium opacity-50">
                              {timeAgo(note.createdAt)}
                            </p>
                            {isLong && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExpand(note.id);
                                }}
                                className="inline-flex items-center gap-0.5 text-[10px] font-semibold opacity-70 hover:opacity-100 transition"
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronUp className="h-3 w-3" />
                                    Show less
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="h-3 w-3" />
                                    Show more
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Note actions — the hide-until-hover step is gated on
                            `(hover: hover)`, so a touch tablet (no hover state)
                            keeps Expand / Delete reachable. */}
                        <div
                          className="flex shrink-0 items-center gap-0.5 [@media(hover:hover)]:sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <TooltipProvider delayMs={300}>
                            <Tooltip>
                              <TooltipTrigger
                                onClick={() => startEdit(note)}
                                aria-label="Edit note"
                                className="flex h-7 w-7 items-center justify-center rounded-lg opacity-50 transition hover:opacity-100"
                              >
                                <Pencil className="h-3 w-3" />
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <span className="text-white/85">Edit note</span>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger
                                onClick={() => onDelete(note.id)}
                                aria-label="Delete note"
                                className="flex h-7 w-7 items-center justify-center rounded-lg opacity-50 transition hover:opacity-100"
                              >
                                <Trash2 className="h-3 w-3" />
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <span className="text-white/85">Delete note</span>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                    </div>
                  </GlassCard>
                );
              })
            )}
          </div>
        )}
      </div>
    </GlassSurface>
  );
}
