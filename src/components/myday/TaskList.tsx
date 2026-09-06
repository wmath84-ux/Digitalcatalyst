import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, ListFilter, Plus, Search, X } from "lucide-react";
import type { Task, TaskStatus } from "../../types";
import TaskItem from "./TaskItem";
import { cn } from "../../utils/cn";
import { GlassSurface } from "../ui/glass";
import { GlassButton } from "../ui/glass-button";
import { GlassInput } from "../ui/glass-input";
import { GlassCard } from "../ui/GlassCard";
import { GlassToggleGroup, GlassToggleItem } from "../ui/glass-toggle-group";
import { useDragScroll } from "../../hooks/useDragScroll";

interface TaskListProps {
  tasks: Task[];
  onToggle: (id: string) => void;
  onCycleStatus: (id: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  globalSearch?: string;
  /** Id of the task a notification deep-linked to — scrolls to it + highlights it. */
  highlightId?: string | null;
}

type FilterKey = "all" | TaskStatus;

const filters: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "in-progress", label: "In Progress" },
  { key: "completed", label: "Done" },
];

export default function TaskList({ tasks, onToggle, onCycleStatus, onEdit, onDelete, onAdd, globalSearch = "", highlightId = null }: TaskListProps) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [localSearch, setLocalSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // The filter chips overflow sideways on a phone. `useDragScroll` gives a
  // mouse / pen the same grab-and-drag a thumb gets on the store's filter row
  // and the PDP tab strip — and a drag never fires the chip it ends on.
  const filterRow = useDragScroll<HTMLDivElement>();

  // Combine global and local search
  const searchQuery = globalSearch.trim() || localSearch.trim();

  // When global search is active, show all tasks regardless of filter
  useEffect(() => {
    if (globalSearch.trim()) {
      setFilter("all");
    }
  }, [globalSearch]);

  const filtered = useMemo(() => {
    let list = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.subject?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [tasks, filter, searchQuery]);

  const counts = useMemo(() => {
    const c = { all: tasks.length, pending: 0, "in-progress": 0, completed: 0 };
    tasks.forEach((t) => { c[t.status]++; });
    return c;
  }, [tasks]);

  const isSearchActive = searchQuery.length > 0;

  // A notification deep link can point at a task that is filtered out
  // (e.g. already completed); reveal it by resetting the local filter.
  useEffect(() => {
    if (highlightId && tasks.some((t) => t.id === highlightId) && filter !== "all" && !globalSearch) setFilter("all");
  }, [filter, globalSearch, highlightId, tasks]);

  useEffect(() => {
    if (!highlightId) return;
    const el = listRef.current?.querySelector(`[data-highlight="${CSS.escape(highlightId)}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [filtered, highlightId]);

  // Legibility (the same pass as Home, Store and the product page):
  // `dc-scene-plate` is the ONE shared material in src/glass.css — a dark
  // navy backing, a real rim, blur 0 and lifted `/40 · /55 · /70 · /85` ink —
  // so this panel reads at the same contrast as the cards inside it.
  return (
    <GlassSurface radius={24} className="dc-scene-plate text-white" contentClassName="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 pt-5 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-white sm:text-lg">Today's Tasks</h2>
            <p className="text-xs font-medium text-white/55">
              {counts.completed} of {counts.all} completed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GlassButton
            type="button"
            aria-label="Search tasks"
            aria-pressed={showSearch}
            onClick={() => setShowSearch((s) => !s)}
            className={cn("sm:hidden [&_.size-12]:size-9", showSearch && "text-indigo-300")}
          >
            <Search className="h-[18px] w-[18px]" />
          </GlassButton>
          <GlassButton variant="capsule" type="button" onClick={onAdd} className="[&>span>div]:h-10 [&>span>div]:gap-1.5 [&>span>div]:px-3.5 [&>span>div]:text-xs [&>span>div]:font-bold sm:[&>span>div]:px-4 sm:[&>span>div]:text-sm">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Task</span>
          </GlassButton>
        </div>
      </div>

      {/* Search bar - show when global search active or local search toggled */}
      <div className={cn("px-4 pt-3 sm:px-6", (showSearch || isSearchActive) ? "block" : "hidden sm:block")}>
        {/* Wave 13: the search field is the pack GlassInput (icon slot); the
            "n found" chip and the clear disc sit beside it. */}
        <div className="flex items-center gap-2">
          {/* `dc-scene-field` — rim + placeholder lift on the search pill, the
              same treatment the shared header's search wears. */}
          <GlassInput
            icon={<Search className={cn("h-4 w-4 shrink-0", isSearchActive ? "text-indigo-300" : "text-white/55")} />}
            value={globalSearch || localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search tasks by title or subject..."
            disabled={!!globalSearch}
            className={cn("dc-scene-field min-w-0 flex-1", isSearchActive && "ring-2 ring-indigo-400/30 rounded-full")}
          />
          {isSearchActive && (
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="rounded-md bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-bold text-indigo-300">
                {filtered.length} found
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
      </div>

      {/* Filter tabs — `dc-segment dc-scene-plate` is the store / PDP recipe:
          the shared dark backing under the pill (so an unselected chip label no
          longer washes out) and the indigo droplet indicator on top of it. */}
      <div
        ref={filterRow.ref}
        onPointerDown={filterRow.onPointerDown}
        className="flex items-center gap-1.5 overflow-x-auto px-4 pt-3.5 pb-1 sm:px-6 hide-scrollbar"
      >
        <ListFilter className="h-4 w-4 shrink-0 text-white/55 mr-1" />
        <GlassToggleGroup
          className={cn("dc-segment dc-scene-plate shrink-0", globalSearch && "opacity-50")}
          value={filter}
          onValueChange={(next) => { if (!globalSearch) setFilter(next as typeof filter); }}
          aria-label="Filter tasks"
        >
        {filters.map((f) => (
          <GlassToggleItem
            key={f.key}
            value={f.key}
            disabled={!!globalSearch}
            className={cn("whitespace-nowrap px-3.5 py-1.5 text-xs font-semibold", globalSearch && "cursor-not-allowed")}
          >
            {f.label}
            <span className={cn(
              "ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full border px-1 text-[10px] font-bold",
              filter === f.key ? "border-white/30 text-white" : "border-white/15 text-white/55",
            )}>
              {counts[f.key]}
            </span>
          </GlassToggleItem>
        ))}
        </GlassToggleGroup>
      </div>

      {/* Task list */}
      <div ref={listRef} className="space-y-2 p-4 sm:p-6 sm:pt-4">
        {filtered.length === 0 ? (
          <GlassCard contentClassName="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/15">
              {isSearchActive ? (
                <Search className="h-6 w-6 text-white/55" />
              ) : (
                <ClipboardList className="h-6 w-6 text-white/55" />
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-white/55">
                {isSearchActive
                  ? `No tasks match "${searchQuery}"`
                  : "No tasks in this category"}
              </p>
              {!isSearchActive && (
                <button
                  onClick={onAdd}
                  className="mt-2 text-sm font-semibold text-indigo-300 hover:text-indigo-200 hover:underline"
                >
                  + Create a new task
                </button>
              )}
            </div>
          </GlassCard>
        ) : (
          filtered.map((task, idx) => (
            <div
              key={task.id}
              data-highlight={task.id}
              className={cn("animate-slideUp", task.id === highlightId && "rounded-[20px] ring-2 ring-indigo-400")}
              style={{ animationDelay: `${idx * 30}ms` }}
            >
              <TaskItem
                task={task}
                onToggle={onToggle}
                onCycleStatus={onCycleStatus}
                onEdit={onEdit}
                onDelete={onDelete}
                highlightQuery={searchQuery}
              />
            </div>
          ))
        )}
      </div>
    </GlassSurface>
  );
}
