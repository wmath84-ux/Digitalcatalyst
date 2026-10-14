import { Bell, CalendarClock, Check, Circle, ListTodo, RotateCcw, StickyNote } from "lucide-react";
import { formatWorkMyDayDue, type WorkMyDayItem, type WorkMyDayKind } from "../storage/workMyDay";

const ITEM_META: Record<WorkMyDayKind, { label: string; color: string; icon: typeof ListTodo }> = {
  task: { label: "Task", color: "#06d6a0", icon: ListTodo },
  scheduled: { label: "Scheduled", color: "#b388ff", icon: CalendarClock },
  reminder: { label: "Reminder", color: "#3a86ff", icon: Bell },
  note: { label: "Note", color: "#f97316", icon: StickyNote },
};

export default function WorkMyDayStrip({
  item,
  onOpen,
  onToggleComplete,
}: {
  item: WorkMyDayItem;
  onOpen: () => void;
  onToggleComplete: () => void;
}) {
  const meta = ITEM_META[item.kind];
  const Icon = meta.icon;
  const preview = item.bodyText?.trim() || (item.schedule?.recurrence.freq && item.schedule.recurrence.freq !== "once"
    ? `Repeats ${item.schedule.recurrence.freq}`
    : meta.label);
  const StatusIcon = item.completed ? RotateCcw : item.dueAt ? Check : Circle;

  return (
    <article className="work-myday-strip" data-work-myday-item={item.id} data-work-myday-kind={item.kind}>
      <button type="button" className="work-myday-strip-open" onClick={onOpen} aria-label={`Open ${item.title || meta.label}`}>
        <span className="work-myday-strip-type" style={{ color: meta.color, background: `${meta.color}18` }} aria-hidden="true">
          <Icon size={18} />
        </span>
        <span className="work-myday-strip-copy">
          <span className={`work-myday-strip-title${item.completed ? " is-complete" : ""}`}>{item.title.trim() || `Untitled ${meta.label.toLowerCase()}`}</span>
          <span className="work-myday-strip-preview">{preview}</span>
        </span>
        <span className="work-myday-strip-due" title={item.dueAt ? formatWorkMyDayDue(item) : meta.label}>
          {item.dueAt ? formatWorkMyDayDue(item) : meta.label}
        </span>
      </button>
      <button
        type="button"
        className={`work-myday-strip-check${item.completed ? " is-complete" : ""}`}
        aria-label={item.completed ? `Mark ${item.title || meta.label} not complete` : `Complete ${item.title || meta.label}`}
        aria-pressed={item.completed}
        onClick={onToggleComplete}
      >
        <StatusIcon size={17} aria-hidden="true" />
      </button>
    </article>
  );
}
