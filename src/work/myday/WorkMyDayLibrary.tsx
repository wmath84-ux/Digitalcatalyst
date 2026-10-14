import { useState } from "react";
import { Bell, CalendarClock, ListTodo, Plus, StickyNote, X } from "lucide-react";
import { filterWorkMyDayItems, type WorkMyDayItem, type WorkMyDayKind, type WorkMyDayNotebook } from "../storage/workMyDay";
import type { WorkMyDayFilter } from "../storage/workPrefs";
import WorkMyDayFilters from "./WorkMyDayFilters";
import WorkMyDayStrip from "./WorkMyDayStrip";

const QUICK_ADD: { kind: WorkMyDayKind; label: string; hint: string; color: string; icon: typeof ListTodo }[] = [
  { kind: "task", label: "Task", hint: "Something to get done", color: "#06d6a0", icon: ListTodo },
  { kind: "scheduled", label: "Schedule", hint: "Block a time", color: "#b388ff", icon: CalendarClock },
  { kind: "reminder", label: "Reminder", hint: "A time-based nudge", color: "#3a86ff", icon: Bell },
  { kind: "note", label: "Note", hint: "Capture an idea", color: "#f97316", icon: StickyNote },
];

export default function WorkMyDayLibrary({
  items,
  notebooks,
  filter,
  selectedNotebookId,
  loading,
  error,
  onFilterChange,
  onOpenItem,
  onCreate,
  onToggleComplete,
}: {
  items: WorkMyDayItem[];
  notebooks: WorkMyDayNotebook[];
  filter: WorkMyDayFilter;
  selectedNotebookId: string | null;
  loading: boolean;
  error: string | null;
  onFilterChange: (filter: WorkMyDayFilter) => void;
  onOpenItem: (id: string) => void;
  onCreate: (kind: WorkMyDayKind) => void;
  onToggleComplete: (id: string) => void;
}) {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const byFilter = filterWorkMyDayItems(items, filter);
  const rows = selectedNotebookId
    ? byFilter.filter((item) => item.notebookId === selectedNotebookId)
    : byFilter;
  const selectedNotebook = notebooks.find((notebook) => notebook.id === selectedNotebookId);
  const heading = filter === "all"
    ? "Your day, in one place"
    : filter === "done"
      ? "Completed"
      : filter === "scheduled"
        ? "Schedule"
        : `${filter[0].toUpperCase()}${filter.slice(1)}s`;

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" data-work-page-body="myday-library" data-work-myday-library="">
      <WorkMyDayFilters value={filter} onChange={onFilterChange} />
      <div className="work-myday-list" data-no-swipe="">
        <div className="work-myday-list-heading">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-[var(--text-tertiary)]">{selectedNotebook?.title || "Your workspace"}</p>
            <h2 className="mt-0.5 truncate text-base font-bold tracking-tight text-[var(--text-primary)]">
              {heading}
            </h2>
          </div>
          <span className="work-myday-local-badge"><span /> Saved on this device</span>
        </div>

        {error ? (
          <div className="work-myday-state-card" role="alert">
            <strong>My Day could not open.</strong>
            <span>{error}</span>
          </div>
        ) : loading ? (
          <div className="work-myday-state-card" aria-live="polite">Opening your device library…</div>
        ) : rows.length ? (
          <div className="work-myday-rows">
            {rows.map((item) => (
              <WorkMyDayStrip
                key={item.id}
                item={item}
                onOpen={() => onOpenItem(item.id)}
                onToggleComplete={() => onToggleComplete(item.id)}
              />
            ))}
          </div>
        ) : (
          <div className="work-myday-empty" data-work-myday-empty="">
            <div className="work-myday-empty-art" aria-hidden="true"><span /><span /><span /></div>
            <h3>{filter === "done" ? "Nothing completed yet" : "Nothing here yet"}</h3>
            <p>{filter === "all" ? "Tap + to plan a task, add a reminder or start a note." : "Try another filter, or add something new to your day."}</p>
            <button type="button" onClick={() => onCreate("task")}>Create your first item</button>
          </div>
        )}
      </div>

      {quickAddOpen ? (
        <div className="work-myday-quick-add" role="menu" aria-label="Choose what to create">
          {QUICK_ADD.map(({ kind, label, hint, color, icon: Icon }) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              onClick={() => { setQuickAddOpen(false); onCreate(kind); }}
            >
              <span style={{ color, background: `${color}18` }}><Icon size={17} aria-hidden="true" /></span>
              <span><strong>{label}</strong><small>{hint}</small></span>
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className="work-myday-fab"
        onClick={() => setQuickAddOpen((open) => !open)}
        aria-label={quickAddOpen ? "Close create menu" : "Create a new My Day item"}
        aria-haspopup="menu"
        aria-expanded={quickAddOpen}
        title="New item"
      >
        {quickAddOpen ? <X size={23} strokeWidth={2.2} aria-hidden="true" /> : <Plus size={25} strokeWidth={2.2} aria-hidden="true" />}
      </button>
      <p className="work-myday-reminder-note">On web, reminders can alert you while Work is open. Install the app for background alarms.</p>
    </div>
  );
}
