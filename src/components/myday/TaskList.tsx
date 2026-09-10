import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  LayoutGrid,
  List,
  Plus,
  Quote,
  Search,
  Target,
  Trophy,
  X,
} from "lucide-react";
import type { Task, TaskStatus } from "../../types";
import TaskItem from "./TaskItem";
import ProgressRing from "./ProgressRing";
import HeroMountains from "./HeroArt";
import { cn } from "../../utils/cn";
import { toMinutes } from "../../../utils/timeOfDay";
import { GlassSurface } from "../ui/glass";
import { GlassInput } from "../ui/glass-input";
import { GlassToggleGroup, GlassToggleItem } from "../ui/glass-toggle-group";
import {
  GlassSelect,
  GlassSelectContent,
  GlassSelectItem,
  GlassSelectTrigger,
} from "../ui/glass-select";
import { useDragScroll } from "../../hooks/useDragScroll";
import { heroQuoteOfTheDay } from "./quotes";

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
  /** Real study streak — the mobile progress card surfaces it next to the ring. */
  streak?: number;
  /** Jumps to the Schedule page from the empty state's secondary action. */
  onViewSchedule?: () => void;
}

type FilterKey = "all" | TaskStatus;
type SortKey = "time" | "priority" | "title";
type ViewKey = "list" | "grid";

const filters: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "in-progress", label: "In Progress" },
  { key: "completed", label: "Done" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "time", label: "Sort: Time" },
  { key: "priority", label: "Sort: Priority" },
  { key: "title", label: "Sort: Title" },
];

const PRIORITY_RANK: Record<Task["priority"], number> = { high: 0, medium: 1, low: 2 };

const STUDY_TIPS = [
  { icon: CalendarCheck, title: "Plan Smarter", text: "Break your goals into tasks", tone: "sky" },
  { icon: BarChart3, title: "Stay Consistent", text: "Track your daily progress", tone: "violet" },
  { icon: Target, title: "Be Focused", text: "Eliminate distractions", tone: "rose" },
  { icon: Trophy, title: "Achieve More", text: "Turn effort into results", tone: "amber" },
] as const;

/**
 * The Tasks page, redesigned on the approved desktop + mobile references: a
 * night-sky hero carrying the day's completion ring, the functional filter /
 * sort / view toolbar, the glass search rail, the task cards and the
 * motivational strip — every one of them operating on the exact same props,
 * handlers, filters and deep-link behaviour the page has always had.
 *
 * Structure of the panel: on tablet + desktop the whole page sits inside the
 * shared `dc-scene-plate` panel the reference draws (one big glass surface);
 * below 768px the panel's own layers fade out (`[data-tasks-panel]`,
 * src/myday-overview.css) so each card floats directly on the winter scene —
 * the mobile reference's composition. Same DOM, one transparent moment.
 */
export default function TaskList({
  tasks,
  onToggle,
  onCycleStatus,
  onEdit,
  onDelete,
  onAdd,
  globalSearch = "",
  highlightId = null,
  streak,
  onViewSchedule,
}: TaskListProps) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [localSearch, setLocalSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("time");
  const [subject, setSubject] = useState("all");
  const [priority, setPriority] = useState("all");
  const [view, setView] = useState<ViewKey>("list");
  const listRef = useRef<HTMLDivElement>(null);
  // The filter chips overflow sideways on a phone. `useDragScroll` gives a
  // mouse / pen the same grab-and-drag a thumb gets on the store's filter row
  // and the PDP tab strip — and a drag never fires the chip it ends on.
  const filterRow = useDragScroll<HTMLDivElement>();

  // Combine global and local search
  const searchQuery = globalSearch.trim() || localSearch.trim();

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    [],
  );
  const heroQuote = useMemo(() => heroQuoteOfTheDay(), []);

  // When global search is active, show all tasks regardless of filter
  useEffect(() => {
    if (globalSearch.trim()) {
      setFilter("all");
    }
  }, [globalSearch]);

  const counts = useMemo(() => {
    const c = { all: tasks.length, pending: 0, "in-progress": 0, completed: 0 };
    tasks.forEach((t) => { c[t.status]++; });
    return c;
  }, [tasks]);

  const subjectOptions = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => {
      const s = (t.subject || "").trim();
      if (s) set.add(s);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  const filtered = useMemo(() => {
    let list = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);
    if (subject !== "all") {
      list = list.filter((t) => (t.subject || "").trim() === subject);
    }
    if (priority !== "all") {
      list = list.filter((t) => t.priority === priority);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.subject?.toLowerCase().includes(q),
      );
    }
    if (sort === "time") {
      list = [...list].sort((a, b) => {
        const am = toMinutes(a.time);
        const bm = toMinutes(b.time);
        // A task without a usable time keeps its place at the end.
        if (am < 0 && bm < 0) return 0;
        if (am < 0) return 1;
        if (bm < 0) return -1;
        return am - bm;
      });
    } else if (sort === "priority") {
      list = [...list].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
    } else {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    }
    return list;
  }, [tasks, filter, subject, priority, searchQuery, sort]);

  const isSearchActive = searchQuery.length > 0;
  const percent = counts.all === 0 ? 0 : Math.round((counts.completed / counts.all) * 100);

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

  const clearFilters = () => {
    setFilter("all");
    setSubject("all");
    setPriority("all");
  };
  const hasActiveFilters = filter !== "all" || subject !== "all" || priority !== "all";

  // ------------------------------------------------------------------
  // Empty states — three honest ones, all sharing the big glass card:
  //   • nothing learned yet           → "No tasks yet!" + first-task CTA
  //   • this slice is empty           → "All caught up! 🎯"
  //   • a search matches nothing      → query-specific copy + clear action
  // ------------------------------------------------------------------
  const emptyKind: "search" | "none" | "slice" = isSearchActive ? "search" : counts.all === 0 ? "none" : "slice";

  // Legibility (the same pass as Home, Store and the product page):
  // `dc-scene-plate` is the ONE shared material in src/glass.css — a dark
  // navy backing, a real rim, blur 0 and lifted `/40 · /55 · /70 · /85` ink —
  // so this panel reads at the same contrast as the cards inside it.
  return (
    <div className="myday-tasks relative">
      {/* `data-tasks-panel` marks the big panel for the mobile transparency
          moment (below `md` the plate's own layers fade out so the cards float
          on the winter scene — see src/myday-overview.css). The wrapper is
          `display: contents`, so the pinned plate string and the layout stay
          byte-for-byte intact. */}
      <div data-tasks-panel className="contents">
      <GlassSurface radius={24} className="dc-scene-plate text-white" contentClassName="flex flex-col">
        {/* ── Hero — the day's cover: date, heading, completion ring, art ── */}
        <div className="myday-tasks-hero">
          <div className="myday-hero-art" aria-hidden="true">
            <HeroMountains />
          </div>
          <div className="myday-hero-stars" aria-hidden="true" />
          <div className="myday-hero-scrim" aria-hidden="true" />

          <div className="relative z-[1] px-4 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
            <div className="myday-hero-top flex flex-wrap items-center justify-between gap-2 sm:gap-3">
              <div className="myday-date-pill">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{todayLabel}</span>
              </div>
              <button type="button" onClick={onAdd} className="myday-cta myday-tasks-add">
                <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                Add Task
              </button>
            </div>

            <div className="mt-3 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="myday-greeting text-[1.9rem] leading-tight sm:text-[2.1rem] lg:text-[2.4rem]">
                  <span className="sm:hidden">Tasks 🚀</span>
                  <span className="hidden sm:block">Today&apos;s Tasks</span>
                </h2>
                <p className="myday-subtitle mt-1 text-[0.82rem] sm:text-[0.95rem]">
                  <span className="sm:hidden">Turn today&apos;s efforts into tomorrow&apos;s success.</span>
                  <span className="hidden sm:block">Small steps, big progress! 🚀</span>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="myday-reset-filters"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                      Reset filters
                    </button>
                  )}
                </p>
                {/* Phone-only quote line — the desktop rail carries its own. */}
                <p className="myday-hero-quote myday-hero-quote--phone sm:hidden">
                  &ldquo;{heroQuote.text}&rdquo;
                </p>
              </div>

              <div className="myday-hero-rail">
                <div className="myday-ring-glow">
                  <ProgressRing percent={percent} size={110} strokeWidth={10} />
                </div>
                <p className="myday-hero-quote hidden sm:block">
                  &ldquo;{heroQuote.text}&rdquo;
                </p>
              </div>
            </div>

            {/* Mobile progress card — the reference moves the ring + streak
                into their own glass moment under the cover. */}
            <div className="myday-tasks-progress">
              <div className="myday-ring-glow shrink-0">
                <ProgressRing percent={percent} size={74} strokeWidth={8} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-extrabold leading-tight text-white">Today&apos;s Progress</p>
                <p className="mt-0.5 text-[11.5px] font-semibold leading-snug text-white/65">
                  {counts.completed} of {counts.all} tasks completed
                </p>
              </div>
              {typeof streak === "number" && (
                <span className="myday-streak-mini shrink-0">
                  <span aria-hidden="true">🔥</span>
                  {streak}-day streak
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Toolbar: live status filters + sort / subject / priority / view ── */}
        <div
          ref={filterRow.ref}
          onPointerDown={filterRow.onPointerDown}
          className="flex items-center gap-1.5 overflow-x-auto px-4 pt-3.5 pb-1 sm:px-6 hide-scrollbar"
        >
          <div className="flex w-max min-w-full flex-col items-stretch gap-2 pb-1 sm:w-full sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-3 sm:gap-y-2">
            {/* Filter tabs — `dc-segment dc-scene-plate` is the store / PDP recipe:
                the shared dark backing under the pill (so an unselected chip label no
                longer washes out) and the indigo droplet indicator on top of it. */}
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

            <div className="myday-toolbar-extra flex shrink-0 items-center gap-2">
              <GlassSelect value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <GlassSelectTrigger
                  aria-label="Sort tasks"
                  className="dc-glass-select h-8 w-auto shrink-0 rounded-full px-3 text-[11px] font-bold"
                />
                <GlassSelectContent className="dc-glass-select-pop" aria-label="Sort options">
                  {SORT_OPTIONS.map((option) => (
                    <GlassSelectItem key={option.key} value={option.key} className="text-xs font-semibold">
                      {option.label}
                    </GlassSelectItem>
                  ))}
                </GlassSelectContent>
              </GlassSelect>

              <GlassSelect value={subject} onValueChange={setSubject}>
                <GlassSelectTrigger
                  placeholder="Subject"
                  aria-label="Filter by subject"
                  className="dc-glass-select h-8 w-auto shrink-0 rounded-full px-3 text-[11px] font-bold"
                />
                <GlassSelectContent className="dc-glass-select-pop" aria-label="Subject options">
                  <GlassSelectItem value="all" className="text-xs font-semibold">
                    Subject: All
                  </GlassSelectItem>
                  {subjectOptions.map((s) => (
                    <GlassSelectItem key={s} value={s} className="text-xs font-semibold">
                      {s}
                    </GlassSelectItem>
                  ))}
                </GlassSelectContent>
              </GlassSelect>

              <GlassSelect value={priority} onValueChange={setPriority}>
                <GlassSelectTrigger
                  aria-label="Filter by priority"
                  className="dc-glass-select h-8 w-auto shrink-0 rounded-full px-3 text-[11px] font-bold"
                />
                <GlassSelectContent className="dc-glass-select-pop" aria-label="Priority options">
                  <GlassSelectItem value="all" className="text-xs font-semibold">
                    Priority: All
                  </GlassSelectItem>
                  <GlassSelectItem value="high" className="text-xs font-semibold">High</GlassSelectItem>
                  <GlassSelectItem value="medium" className="text-xs font-semibold">Medium</GlassSelectItem>
                  <GlassSelectItem value="low" className="text-xs font-semibold">Low</GlassSelectItem>
                </GlassSelectContent>
              </GlassSelect>

              <GlassToggleGroup
                className="dc-segment dc-scene-plate shrink-0"
                value={view}
                onValueChange={(next) => setView(next as ViewKey)}
                aria-label="Task view"
              >
                <GlassToggleItem value="list" aria-label="List view" className="px-2.5 py-1.5">
                  <List className="h-4 w-4" />
                </GlassToggleItem>
                <GlassToggleItem value="grid" aria-label="Grid view" className="px-2.5 py-1.5">
                  <LayoutGrid className="h-4 w-4" />
                </GlassToggleItem>
              </GlassToggleGroup>
            </div>
          </div>
        </div>

        {/* ── Search rail — the wide glass field; global search keeps the lead ── */}
        <div className="px-4 pt-3 sm:px-6">
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
                  <button
                    type="button"
                    onClick={() => setLocalSearch("")}
                    aria-label="Clear search"
                    className="myday-clear-btn"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
            <button type="button" onClick={onAdd} className="myday-cta myday-search-add" aria-label="Add task">
              Add
            </button>
          </div>
        </div>

        {/* ── Task list — one inset rail that holds the rows AND the empty state ── */}
        <div className="myday-tasks-inset">
          <div
            ref={listRef}
            className={cn("p-1.5", view === "grid" && filtered.length > 0 ? "myday-task-grid" : "space-y-2")}
          >
            {filtered.length === 0 ? (
              <div className="myday-tasks-empty">
                <span className="myday-tasks-empty-icon" aria-hidden="true">
                  {isSearchActive ? (
                    <Search className="h-8 w-8" />
                  ) : (
                    <ClipboardList className="h-8 w-8" />
                  )}
                  <i className="myday-tasks-empty-spark myday-tasks-empty-spark--a" />
                  <i className="myday-tasks-empty-spark myday-tasks-empty-spark--b" />
                </span>
                <p className="myday-tasks-empty-title">
                  {emptyKind === "search"
                    ? `No tasks match "${searchQuery}"`
                    : emptyKind === "none"
                      ? "No tasks yet!"
                      : "All caught up! 🎯"}
                </p>
                <p className="myday-tasks-empty-sub">
                  {emptyKind === "search"
                    ? "Try a different word, or clear the search to see the full day."
                    : emptyKind === "none"
                      ? "Add a task to keep track of your study plan and stay productive."
                      : "No more tasks for today. Add a new task or check your schedule."}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                  {emptyKind === "search" ? (
                    !globalSearch && (
                      <button type="button" onClick={() => setLocalSearch("")} className="myday-cta">
                        <X className="h-4 w-4" aria-hidden="true" />
                        Clear search
                      </button>
                    )
                  ) : (
                    <button type="button" onClick={onAdd} className="myday-cta">
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      {emptyKind === "none" ? "Add Your First Task" : "Add Another Task"}
                    </button>
                  )}
                  {emptyKind === "slice" && onViewSchedule && (
                    <button type="button" onClick={onViewSchedule} className="myday-ghost-btn">
                      View schedule
                    </button>
                  )}
                </div>
              </div>
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

          <p className="myday-strip-quote">
            <Quote className="myday-strip-quote-mark" aria-hidden="true" />
            Progress is the sum of small efforts, repeated day in and day out.
          </p>
        </div>
      </GlassSurface>
      </div>

      {/* ── Study-habit cards — visually secondary, never a workflow ── */}
      <ul className="myday-tips-grid" aria-label="Study habits">
        {STUDY_TIPS.map((tip) => {
          const Icon = tip.icon;
          return (
            <li key={tip.title} className="myday-tip-card">
              <span className={cn("myday-tip-icon", `myday-tip-icon--${tip.tone}`)}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-extrabold tracking-tight text-white">{tip.title}</span>
                <span className="block text-[11px] font-medium leading-snug text-white/55 sm:text-[11.5px]">{tip.text}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
