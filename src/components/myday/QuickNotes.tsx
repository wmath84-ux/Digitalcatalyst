import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, NotebookPen, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { NoteColor, QuickNote } from "../../types";
import { cn } from "../../utils/cn";

interface QuickNotesProps {
  notes: QuickNote[];
  onAdd: (text: string) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  globalSearch?: string;
  onRequireAccess?: () => boolean;
}

const colorStyles: Record<NoteColor, { card: string; editBg: string; highlight: string }> = {
  amber: { card: "bg-white/76 border-amber-300/70 text-amber-900 shadow-sm shadow-amber-100/60 backdrop-blur-xl", editBg: "bg-amber-50/90", highlight: "bg-amber-300" },
  sky: { card: "bg-white/76 border-sky-300/70 text-sky-900 shadow-sm shadow-sky-100/60 backdrop-blur-xl", editBg: "bg-sky-50/90", highlight: "bg-sky-300" },
  rose: { card: "bg-white/76 border-rose-300/70 text-rose-900 shadow-sm shadow-rose-100/60 backdrop-blur-xl", editBg: "bg-rose-50/90", highlight: "bg-rose-300" },
  emerald: { card: "bg-white/76 border-emerald-300/70 text-emerald-900 shadow-sm shadow-emerald-100/60 backdrop-blur-xl", editBg: "bg-emerald-50/90", highlight: "bg-emerald-300" },
  violet: { card: "bg-white/76 border-violet-300/70 text-violet-900 shadow-sm shadow-violet-100/60 backdrop-blur-xl", editBg: "bg-violet-50/90", highlight: "bg-violet-300" },
};

const MAX_COLLAPSED_LENGTH = 80; // Characters before truncating

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
    }
    setEditingId(null);
    setEditText("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
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

  return (
    <div className="dc-glass rounded-3xl shadow-[0_22px_48px_-28px_rgba(79,70,229,0.46)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4 sm:px-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 to-pink-500 text-white shadow-lg shadow-rose-300/50">
          <NotebookPen className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-extrabold text-slate-900 sm:text-lg">Quick Notes</h2>
          <p className="text-xs font-medium text-slate-500">
            {notes.length} note{notes.length !== 1 ? "s" : ""} • Click to expand
          </p>
        </div>
      </div>

      <div className="px-4 pb-5 sm:px-6">
        {/* Search bar */}
        <div className={cn(
          "dc-glass-input mb-3 flex items-center gap-2 rounded-xl px-3 py-2 transition-all",
          isSearchActive
            ? "ring-2 ring-rose-100/80"
            : "focus-within:ring-2 focus-within:ring-rose-100/80"
        )}>
          <Search className={cn("h-4 w-4 shrink-0", isSearchActive ? "text-rose-500" : "text-slate-400")} />
          <input
            value={globalSearch || localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search notes..."
            disabled={!!globalSearch}
            className={cn(
              "w-full bg-transparent text-sm outline-none placeholder:text-slate-400",
              globalSearch ? "text-rose-700" : "text-slate-700"
            )}
          />
          {isSearchActive && (
            <div className="flex items-center gap-1.5">
              <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">
                {filtered.length}
              </span>
              {!globalSearch && (
                <button
                  onClick={() => setLocalSearch("")}
                  className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="dc-glass-input mb-4 flex items-start gap-2 rounded-2xl p-2 transition-all focus-within:ring-2 focus-within:ring-rose-100/80">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Type a quick thought or reminder..."
            rows={2}
            className="min-h-[40px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
          <button
            onClick={submit}
            disabled={!draft.trim()}
            aria-label="Add note"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-md shadow-rose-200 transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Notes list */}
        <div className="max-h-80 space-y-2.5 overflow-y-auto pr-0.5 custom-scrollbar">
          {filtered.length === 0 ? (
            <div className="dc-glass flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-rose-200/70 bg-white/45 py-10 text-center">
              {isSearchActive ? (
                <>
                  <Search className="h-8 w-8 text-slate-300" />
                  <p className="text-sm font-bold text-slate-500">
                    No notes match "{searchQuery}"
                  </p>
                </>
              ) : (
                <>
                  <NotebookPen className="h-8 w-8 text-slate-300" />
                  <p className="text-sm font-bold text-slate-500">No notes yet. Start jotting!</p>
                </>
              )}
            </div>
          ) : (
            filtered.map((note, idx) => {
              const isEditing = editingId === note.id;
              const isExpanded = expandedIds.has(note.id);
              const isLong = note.text.length > MAX_COLLAPSED_LENGTH;
              const cs = colorStyles[note.color];

              const displayText = isLong && !isExpanded
                ? note.text.slice(0, MAX_COLLAPSED_LENGTH) + "..."
                : note.text;

              return (
                <div
                  key={note.id}
                  className={cn(
                    "group rounded-xl border transition-all duration-200",
                    cs.card,
                    isSearchActive && "ring-2 ring-amber-200/50",
                  )}
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  {isEditing ? (
                    <div className="p-3.5 space-y-2">
                      <textarea
                        autoFocus
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        className={cn(
                          "w-full resize-none rounded-lg border-0 px-2.5 py-2 text-sm outline-none",
                          cs.editBg,
                        )}
                      />
                      <div className="flex gap-1.5 justify-end">
                        <button
                          onClick={cancelEdit}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/60 text-slate-500 hover:bg-white transition"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <button
                          onClick={saveEdit}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/60 text-emerald-600 hover:bg-white transition"
                        >
                          <Check className="h-4 w-4" strokeWidth={3} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "px-3.5 py-3 cursor-pointer",
                        isLong && "cursor-pointer"
                      )}
                      onClick={() => isLong && toggleExpand(note.id)}
                    >
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
                        <div
                          className="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => startEdit(note)}
                            aria-label="Edit note"
                            className="flex h-7 w-7 items-center justify-center rounded-lg opacity-50 transition hover:bg-white/60 hover:opacity-100"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => onDelete(note.id)}
                            aria-label="Delete note"
                            className="flex h-7 w-7 items-center justify-center rounded-lg opacity-50 transition hover:bg-white/60 hover:opacity-100"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
