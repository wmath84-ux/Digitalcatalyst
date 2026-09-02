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
  high: { label: "High", cls: "bg-rose-500/15 text-rose-300 ring-rose-400/30" },
  medium: { label: "Med", cls: "bg-amber-500/15 text-amber-300 ring-amber-400/30" },
  low: { label: "Low", cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30" },
};

const statusConfig: Record<Task["status"], { border: string; bg: string; badge: string; badgeText: string }> = {
  completed: {
    border: "border-emerald-400/30",
    bg: "bg-white/[0.08] backdrop-blur-xl",
    badge: "border border-emerald-400/30 bg-emerald-500/20 text-emerald-200",
    badgeText: "Done",
  },
  "in-progress": {
    border: "border-sky-400/30",
    bg: "bg-white/[0.08] backdrop-blur-xl",
    badge: "border border-sky-400/30 bg-sky-500/20 text-sky-200",
    badgeText: "In Progress",
  },
  pending: {
    border: "border-white/10",
    bg: "bg-white/[0.08] backdrop-blur-xl",
    badge: "border border-white/10 bg-white/[0.08] text-white/75",
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
      <mark key={i} className="bg-amber-200 text-amber-200 rounded px-0.5">
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
      onClick={() => onEdit(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit(task);
        }
      }}
      aria-label={`Edit task: ${task.title}`}
      className={cn(
        "group relative flex items-start gap-3 rounded-2xl border p-3.5 transition-all duration-200 sm:items-center sm:px-4 cursor-pointer",
        sc.border,
        sc.bg,
        highlightQuery && "ring-2 ring-amber-400/30"
      )}
    >
      {/* Drag handle hint */}
      <div className="hidden sm:flex shrink-0 items-center text-white/40 cursor-grab">
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Checkbox */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(task.id); }}
        aria-label={done ? "Mark as pending" : "Mark as completed"}
        className={cn(
          "mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 sm:mt-0",
          done
            ? "border-emerald-500 bg-emerald-500 text-white"
            : task.status === "in-progress"
              ? "border-sky-400 text-transparent hover:border-sky-500 hover:bg-sky-500/15"
              : "border-white/10 text-transparent hover:border-indigo-400 hover:bg-indigo-500/15",
        )}
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </button>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-semibold text-white/85 transition-all sm:text-[15px]",
            done && "text-white/55 line-through",
          )}
        >
          {highlightQuery ? highlightText(task.title, highlightQuery) : task.title}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {task.subject && (
            <span className="rounded-md border border-white/10 bg-white/[0.08] px-1.5 py-0.5 text-[11px] font-medium text-white/55 backdrop-blur">
              {highlightQuery ? highlightText(task.subject, highlightQuery) : task.subject}
            </span>
          )}
          {task.time && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-white/55">
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
            onClick={(e) => { e.stopPropagation(); onCycleStatus(task.id); }}
            className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide cursor-pointer transition-colors hover:opacity-80", sc.badge)}
          >
            {sc.badgeText}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
      >
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(task); }}
          aria-label="Edit task"
          className="flex h-8 w-8 items-center justify-center rounded-xl text-white/55 transition-colors hover:bg-indigo-500/15 hover:text-indigo-300"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
          aria-label="Delete task"
          className="flex h-8 w-8 items-center justify-center rounded-xl text-white/55 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
