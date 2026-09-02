import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, ListFilter, Plus, Search, X } from "lucide-react";
import type { Task, TaskStatus } from "../../types";
import TaskItem from "./TaskItem";
import { cn } from "../../utils/cn";

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

  return (
    <div className="dc-glass rounded-3xl shadow-[0_22px_48px_-28px_rgba(79,70,229,0.46)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 pt-5 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg">
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
          <button
            onClick={() => setShowSearch((s) => !s)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl transition sm:hidden",
              showSearch ? "bg-indigo-100 text-indigo-600" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            )}
          >
            <Search className="h-[18px] w-[18px]" />
          </button>
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg transition hover:shadow-xl hover: sm:px-4 sm:text-sm"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Task</span>
          </button>
        </div>
      </div>

      {/* Search bar - show when global search active or local search toggled */}
      <div className={cn("px-4 pt-3 sm:px-6", (showSearch || isSearchActive) ? "block" : "hidden sm:block")}>
        <div className={cn(
          "dc-glass-input flex items-center gap-2 rounded-xl px-3 py-2.5 transition-all",
          isSearchActive
            ? "ring-2 ring-indigo-100/70"
            : "focus-within:ring-2 focus-within:ring-indigo-100/70"
        )}>
          <Search className={cn("h-4 w-4 shrink-0", isSearchActive ? "text-indigo-500" : "text-white/55")} />
          <input
            value={globalSearch || localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search tasks by title or subject..."
            disabled={!!globalSearch}
            className={cn(
              "w-full bg-transparent text-sm outline-none placeholder:text-white/55",
              globalSearch ? "text-indigo-700" : "text-white/85"
            )}
          />
          {isSearchActive && (
            <div className="flex items-center gap-1.5">
              <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600">
                {filtered.length} found
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
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto px-4 pt-3.5 pb-1 sm:px-6 hide-scrollbar">
        <ListFilter className="h-4 w-4 shrink-0 text-white/55 mr-1" />
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            disabled={!!globalSearch}
            className={cn(
              "relative shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all",
              filter === f.key
                ? "border border-indigo-300/70 bg-indigo-500/15 text-indigo-700 shadow-[0_14px_30px_-18px_rgba(79,70,229,0.65)] backdrop-blur-xl"
                : "dc-glass-chip text-white/55 hover:bg-white/[0.08] hover:text-white/85",
              globalSearch && "opacity-50 cursor-not-allowed"
            )}
          >
            {f.label}
            <span className={cn(
              "ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold",
              filter === f.key ? "bg-white/20 text-white" : "bg-white/[0.12] text-white/55",
            )}>
              {counts[f.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Task list */}
      <div ref={listRef} className="space-y-2 p-4 sm:p-6 sm:pt-4">
        {filtered.length === 0 ? (
          <div className="dc-glass flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-indigo-200/70 bg-white/45 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 shadow-inner">
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
                  className="mt-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
                >
                  + Create a new task
                </button>
              )}
            </div>
          </div>
        ) : (
          filtered.map((task, idx) => (
            <div
              key={task.id}
              data-highlight={task.id}
              className={cn("animate-slideUp", task.id === highlightId && "rounded-2xl ring-2 ring-indigo-400 ring-offset-2 ring-offset-white")}
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
    </div>
  );
}
