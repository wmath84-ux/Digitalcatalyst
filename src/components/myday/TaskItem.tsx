import { Check, Clock3, GripVertical, Pencil, Trash2 } from "lucide-react";
import { cn } from "../../utils/cn";
import { formatTime12 } from "../../../utils/timeOfDay";
import type { Task } from "../../types";

interface TaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
  onCycleStatus: (id: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  highlightQuery?: string;
}

const priorityConfig: Record<Task["priority"], { label: string; cls: string }> = {
  high: { label: "High", cls: "bg-rose-50 text-rose-600 ring-rose-200/60" },
  medium: { label: "Med", cls: "bg-amber-50 text-amber-600 ring-amber-200/60" },
  low: { label: "Low", cls: "bg-emerald-50 text-emerald-600 ring-emerald-200/60" },
};

const statusConfig: Record<Task["status"], { border: string; bg: string; badge: string; badgeText: string }> = {
  completed: {
    border: "border-emerald-200",
    bg: "bg-emerald-50/50",
    badge: "bg-emerald-100 text-emerald-700",
    badgeText: "Done",
  },
  "in-progress": {
    border: "border-sky-200",
    bg: "bg-sky-50/40",
    badge: "bg-sky-100 text-sky-700",
    badgeText: "In Progress",
  },
  pending: {
    border: "border-slate-200",
    bg: "bg-white",
    badge: "bg-slate-100 text-slate-500",
    badgeText: "Pending",
  },
};

// Highlight matching text
function highlightText(text: string, query: string) {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-amber-200 text-amber-900 rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export default function TaskItem({ task, onToggle, onCycleStatus, onEdit, onDelete, highlightQuery = "" }: TaskItemProps) {
  const done = task.status === "completed";
  const sc = statusConfig[task.status];
  const pc = priorityConfig[task.priority];

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 rounded-2xl border bg-white p-3.5 shadow-md shadow-slate-200/80 transition-all duration-200 hover:shadow-lg sm:items-center sm:px-4",
        sc.border,
        sc.bg,
        highlightQuery && "ring-2 ring-amber-200/50"
      )}
    >
      {/* Drag handle hint */}
      <div className="hidden sm:flex shrink-0 items-center text-slate-300 cursor-grab">
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Checkbox */}
      <button
        onClick={() => onToggle(task.id)}
        aria-label={done ? "Mark as pending" : "Mark as completed"}
        className={cn(
          "mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 sm:mt-0",
          done
            ? "border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-200"
            : task.status === "in-progress"
              ? "border-sky-400 text-transparent hover:border-sky-500 hover:bg-sky-50"
              : "border-slate-300 text-transparent hover:border-indigo-400 hover:bg-indigo-50",
        )}
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </button>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-semibold text-slate-800 transition-all sm:text-[15px]",
            done && "text-slate-400 line-through",
          )}
        >
          {highlightQuery ? highlightText(task.title, highlightQuery) : task.title}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {task.subject && (
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
              {highlightQuery ? highlightText(task.subject, highlightQuery) : task.subject}
            </span>
          )}
          {task.time && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-400">
              <Clock3 className="h-3 w-3" />
              {formatTime12(task.time)}
            </span>
          )}
          <span
            className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset", pc.cls)}
          >
            {pc.label}
          </span>
          <button
            onClick={() => onCycleStatus(task.id)}
            className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide cursor-pointer transition-colors hover:opacity-80", sc.badge)}
          >
            {sc.badgeText}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(task)}
          aria-label="Edit task"
          className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onDelete(task.id)}
          aria-label="Delete task"
          className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
