import { Bell, CalendarClock, Check, ListTodo, List, StickyNote } from "lucide-react";
import type { WorkMyDayFilter } from "../storage/workPrefs";

const FILTERS: { id: WorkMyDayFilter; label: string; icon: typeof List }[] = [
  { id: "all", label: "All", icon: List },
  { id: "task", label: "Tasks", icon: ListTodo },
  { id: "scheduled", label: "Scheduled", icon: CalendarClock },
  { id: "reminder", label: "Reminders", icon: Bell },
  { id: "note", label: "Notes", icon: StickyNote },
  { id: "done", label: "Completed", icon: Check },
];

export default function WorkMyDayFilters({
  value,
  onChange,
}: {
  value: WorkMyDayFilter;
  onChange: (filter: WorkMyDayFilter) => void;
}) {
  return (
    <div className="work-myday-filter-rail" role="toolbar" aria-label="Filter My Day items" data-no-swipe="">
      {FILTERS.map(({ id, label, icon: Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(id)}
            className="work-myday-filter-chip"
            data-active={active ? "true" : "false"}
          >
            <Icon size={14} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
