import { Clock3, GripVertical, Pencil, Trash2 } from "lucide-react";
import { cn } from "../../utils/cn";
import { formatTime12 } from "../../../utils/timeOfDay";
import type { Task } from "../../types";
import { GlassCard } from "../ui/GlassCard";
import { GlassCheckbox } from "../ui/glass-checkbox";
import { GlassButton } from "../ui/glass-button";

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

// Wave 13: the row is the pack GlassCard; only the *ring* carries the status
// meaning colour (emerald done / sky in-progress), the material never changes.
const statusConfig: Record<Task["status"], { ring: string; badge: string; badgeText: string }> = {
  completed: {
    ring: "ring-1 ring-emerald-400/40",
    badge: "border border-emerald-400/30 bg-emerald-500/20 text-emerald-200",
    badgeText: "Done",
  },
  "in-progress": {
    ring: "ring-1 ring-sky-400/40",
    badge: "border border-sky-400/30 bg-sky-500/20 text-sky-200",
    badgeText: "In Progress",
  },
  pending: {
    ring: "",
    badge: "border border-white/15 text-white/75",
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
    <GlassCard
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
        "group cursor-pointer transition-all duration-200",
        highlightQuery ? "ring-2 ring-amber-400/30" : sc.ring,
      )}
      contentClassName="flex items-start gap-3 p-3.5 sm:items-center sm:px-4"
    >
      {/* Drag handle hint */}
      <div className="hidden sm:flex shrink-0 items-center text-white/40 cursor-grab">
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Checkbox */}
      {/* The pack GlassCheckbox spreads props last, so the click-stop lives on
          a wrapper — the row's own onClick (open editor) must not fire. */}
      <span className="mt-0.5 flex shrink-0 sm:mt-0" onClick={(e) => e.stopPropagation()}>
        <GlassCheckbox
          checked={done}
          onCheckedChange={() => onToggle(task.id)}
          ariaLabel={done ? "Mark as pending" : "Mark as completed"}
        />
      </span>

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
            <span className="rounded-md border border-white/15 px-1.5 py-0.5 text-[11px] font-medium text-white/55">
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

      {/* Actions — the hide-until-hover step is gated on `(hover: hover)`:
          a touch tablet has no hover state, so Edit / Delete stay reachable
          on every device instead of only under a mouse. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex shrink-0 items-center gap-0.5 [@media(hover:hover)]:sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
      >
        <GlassButton
          onClick={(e) => { e.stopPropagation(); onEdit(task); }}
          aria-label="Edit task"
          className="[&_.size-12]:size-8 [&_svg]:text-white/70 hover:[&_svg]:text-indigo-300"
        >
          <Pencil className="h-3.5 w-3.5" />
        </GlassButton>
        <GlassButton
          onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
          aria-label="Delete task"
          className="[&_.size-12]:size-8 [&_svg]:text-white/70 hover:[&_svg]:text-rose-300"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </GlassButton>
      </div>
    </GlassCard>
  );
}
