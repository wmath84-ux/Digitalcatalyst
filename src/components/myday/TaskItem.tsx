import type { ComponentType } from "react";
import {
  Atom,
  BookOpen,
  Calculator,
  Clock3,
  FlaskConical,
  Globe2,
  GripVertical,
  Languages,
  Music,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
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
  high: { label: "High", cls: "myday-pri myday-pri--high" },
  medium: { label: "Med", cls: "myday-pri myday-pri--med" },
  low: { label: "Low", cls: "myday-pri myday-pri--low" },
};

// The card material never changes with status — only the ring, the badge and
// a whisper of glow. Pending stays neutral glass, In Progress lifts to sky,
// Done settles into emerald. (Reference: status is a signal, not a paint can.)
const statusConfig: Record<Task["status"], {
  ring: string;
  badge: string;
  badgeText: string;
  startLabel: string;
}> = {
  completed: {
    ring: "myday-task-row--done",
    badge: "myday-status myday-status--done",
    badgeText: "Done",
    startLabel: "Move back to Pending",
  },
  "in-progress": {
    ring: "myday-task-row--progress",
    badge: "myday-status myday-status--progress",
    badgeText: "In Progress",
    startLabel: "Mark as done",
  },
  pending: {
    ring: "",
    badge: "myday-status myday-status--pending",
    badgeText: "Pending",
    startLabel: "Start this task",
  },
};

// Subject → little identity tile (icon + tint). Purely derived from the task's
// own subject string — no new data, no new state, and unknown subjects still
// get a stable colour so a list of subjects never looks like a bug.
const SUBJECT_TILES: { test: RegExp; icon: ComponentType<{ className?: string }>; tone: string }[] = [
  { test: /phys/i, icon: Atom, tone: "sky" },
  { test: /chem/i, icon: FlaskConical, tone: "rose" },
  { test: /math|algebra|geometry|calculus/i, icon: Calculator, tone: "violet" },
  { test: /bio/i, icon: FlaskConical, tone: "emerald" },
  { test: /hist|geo(?!.*math)/i, icon: Globe2, tone: "amber" },
  { test: /eng|lit|lang|french|spanish|urdu/i, icon: Languages, tone: "violet" },
  { test: /cs|code|programming|computer|it\b/i, icon: Calculator, tone: "sky" },
  { test: /music|art/i, icon: Music, tone: "rose" },
];
const FALLBACK_TONES = ["violet", "sky", "amber", "emerald", "rose"] as const;

function subjectTile(subject?: string) {
  const s = (subject || "").trim();
  const matched = s ? SUBJECT_TILES.find((entry) => entry.test.test(s)) : undefined;
  if (matched) return { Icon: matched.icon, tone: matched.tone };
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return { Icon: BookOpen, tone: FALLBACK_TONES[hash % FALLBACK_TONES.length] };
}

// Highlight matching text
function highlightText(text: string, query: string) {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="rounded bg-violet-300/25 px-0.5 text-violet-100">
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
  const { Icon: SubjectIcon, tone } = subjectTile(task.subject);

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
        "myday-task-row group cursor-pointer transition-all duration-200",
        sc.ring,
        highlightQuery && "myday-task-row--flash",
      )}
      contentClassName="flex items-center gap-2.5 px-3 py-3 sm:gap-3 sm:px-4 sm:py-3.5"
    >
      {/* Drag handle hint */}
      <div className="hidden shrink-0 items-center text-white/30 sm:flex" aria-hidden="true">
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Checkbox */}
      {/* The pack GlassCheckbox spreads props last, so the click-stop lives on
          a wrapper — the row's own onClick (open editor) must not fire. */}
      <span className="flex shrink-0" onClick={(e) => e.stopPropagation()}>
        <GlassCheckbox
          checked={done}
          onCheckedChange={() => onToggle(task.id)}
          ariaLabel={done ? "Mark as pending" : "Mark as completed"}
          className="myday-task-check"
        />
      </span>

      {/* Subject identity tile — icon + tint derived from the task's subject */}
      <span className={cn("myday-task-tile", `myday-task-tile--${tone}`)} aria-hidden="true">
        <SubjectIcon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "myday-task-title truncate text-sm font-bold leading-snug text-white/95 transition-all sm:text-[15px]",
            done && "text-white/55 line-through",
          )}
        >
          {highlightQuery ? highlightText(task.title, highlightQuery) : task.title}
        </p>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
          {task.subject && (
            <span className="max-w-[12rem] truncate text-[11.5px] font-semibold text-white/55">
              {highlightQuery ? highlightText(task.subject, highlightQuery) : task.subject}
            </span>
          )}
          {task.time && (
            <span className="myday-task-time">
              <Clock3 className="h-3 w-3" aria-hidden="true" />
              {formatTime12(task.time)}
            </span>
          )}
          <span className={cn(pc.cls, "uppercase")}>
            {pc.label}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onCycleStatus(task.id); }}
            aria-label={`Change status (currently ${sc.badgeText})`}
            className={sc.badge}
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
          onClick={(e) => { e.stopPropagation(); onCycleStatus(task.id); }}
          aria-label={sc.startLabel}
          title={sc.startLabel}
          className="myday-task-action [&_.size-12]:size-8 [&_svg]:text-indigo-200/90 hover:[&_svg]:text-white"
        >
          <Play className="h-3.5 w-3.5" />
        </GlassButton>
        <GlassButton
          onClick={(e) => { e.stopPropagation(); onEdit(task); }}
          aria-label="Edit task"
          className="myday-task-action [&_.size-12]:size-8 [&_svg]:text-white/70 hover:[&_svg]:text-indigo-300"
        >
          <Pencil className="h-3.5 w-3.5" />
        </GlassButton>
        <GlassButton
          onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
          aria-label="Delete task"
          className="myday-task-action [&_.size-12]:size-8 [&_svg]:text-white/70 hover:[&_svg]:text-rose-300"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </GlassButton>
      </div>
    </GlassCard>
  );
}
