import { motion } from "framer-motion";
import { Check, Circle, Clock3 } from "lucide-react";
import type { Activity, ActivityStatus } from "../../flowpath/types/flowpath";
import { flowPathKindMeta } from "../../flowpath/types/flowpath";
import { getFlowKindIcon } from "./icons";

interface ActivityCardProps {
  activity: Activity;
  status: ActivityStatus;
  side: "left" | "right";
  onComplete: () => void;
  completing: boolean;
  /**
   * Opens the edit modal pre-populated with this activity. The card body is
   * clickable for this; the small status pill / completion circle has its own
   * handler so it doesn't double-fire.
   */
  onEdit?: () => void;
  /**
   * Restore a completed item back to active (reverse of onComplete).
   * Wired to the green tick on a completed card so a single tap re-opens it.
   */
  onUncomplete?: () => void;
}

function CardBody({ activity }: { activity: Activity }) {
  switch (activity.type) {
    case "task":
      return (
        <div className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-fp-text-45">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              activity.priority === "high"
                ? "bg-rose-500/20 fp-text-rose"
                : activity.priority === "medium"
                  ? "bg-amber-500/20 fp-text-amber"
                  : "bg-emerald-500/20 fp-text-emerald"
            }`}
          >
            {activity.priority ?? "medium"} priority
          </span>
        </div>
      );
    case "schedule": {
      // Local schedules carry startLabel/endLabel; Firestore-merged ones
      // carry scheduleStartTime/scheduleEndTime. Show whichever exists so
      // the row never renders "undefined — undefined".
      const start = activity.startLabel ?? (activity as { startTime?: string }).startTime;
      const end = activity.endLabel ?? (activity as { endTime?: string }).endTime;
      return start || end ? (
        <p className="mt-1 text-[12px] text-fp-text-55">
          {start ?? "—"} — {end ?? "—"}
        </p>
      ) : null;
    }
    case "note":
      return (
        <p className="mt-1 line-clamp-2 text-[12px] text-fp-text-50">
          {activity.preview || activity.description}
        </p>
      );
    case "revision":
      return (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-fp-text-10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-400 to-cyan-300"
              style={{ width: `${activity.progress ?? 0}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-fp-text-45">Progress {activity.progress ?? 0}%</p>
        </div>
      );
    case "mcq":
      return (
        <p className="mt-1 text-[12px] text-fp-text-50">
          {activity.totalQuestions ?? 0} Questions · {activity.completedQuestions ?? 0} Completed
        </p>
      );
    case "reminder":
      return (
        <p className="mt-1 flex items-center gap-1 text-[12px] text-fp-text-50">
          <Clock3 className="h-3 w-3" /> {activity.timeLabel.split("· ")[1] ?? activity.timeLabel}
        </p>
      );
    default:
      // Firestore-merged "lecture" items are normalised to type "other"
      // (see FlowPathView merge) but keep their flowKind; show the real
      // lecture summary instead of a bare description.
      if (activity.flowKind === "lecture") {
        const moduleTitle = activity.lectureModuleTitle;
        const minutes = activity.lectureEstimatedMinutes;
        const previewOnly = activity.lecturePreviewOnly;
        return (
          <div className="mt-1 space-y-0.5">
            {moduleTitle ? (
              <p className="truncate text-[12px] text-fp-text-50">Module · {moduleTitle}</p>
            ) : null}
            <p className="text-[11px] text-fp-text-45">
              {minutes ? `${minutes} min` : "Lecture"}
              {previewOnly ? " · Preview (not purchased)" : ""}
            </p>
          </div>
        );
      }
      return activity.description ? (
        <p className="mt-1 line-clamp-2 text-[12px] text-fp-text-50">{activity.description}</p>
      ) : null;
  }
}

export function ActivityCard({ activity, status, onComplete, completing, onEdit, onUncomplete }: ActivityCardProps) {
  // Display metadata comes from the original server kind when present
  // (so merged lecture docs show "Lecture" + their cyan styling) and
  // always falls back safely — never undefined — for unknown kinds.
  const meta = flowPathKindMeta(activity.flowKind ?? activity.type);
  const Icon = getFlowKindIcon(activity.flowKind ?? activity.type);
  const isCurrent = status === "current";
  const isCompleted = status === "completed";
  const isOverdue = status === "overdue";

  return (
    <motion.div
      initial={false}
      animate={{
        opacity: isCompleted ? 0.78 : 1,
        x: 0,
        scale: 1,
        filter: isCompleted ? "saturate(0.7) brightness(0.95)" : "saturate(1) brightness(1)",
      }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={`pointer-events-auto relative w-full rounded-2xl p-3.5 sm:p-4 ${
        isCurrent ? "glass-panel-strong" : "glass-panel"
      } ${onEdit ? "cursor-pointer transition hover:border-fp-text-30" : ""}`}
      style={{
        boxShadow: isCurrent ? `0 0 40px -8px ${meta.glow}` : undefined,
        borderColor: isOverdue ? "rgba(251,113,133,0.35)" : undefined,
      }}
      onClick={() => {
        // Don't open the edit modal when the user clicked the inner
        // status / completion controls — those have their own click
        // handlers and call e.stopPropagation() to keep this gate clean.
        if (!onEdit) return;
        onEdit();
      }}
      role={onEdit ? "button" : undefined}
      tabIndex={onEdit ? 0 : undefined}
      onKeyDown={(e) => {
        if (!onEdit) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit();
        }
      }}
      aria-label={onEdit ? `Edit ${activity.title}` : undefined}
    >
      {isCurrent && (
        <span className="fp-shimmer pointer-events-none absolute inset-0 rounded-2xl" />
      )}
      <div className="relative flex items-start gap-2.5">
        <span
          className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg"
          style={{ background: `${meta.color}26`, color: meta.color }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span
              className="truncate text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: meta.color }}
            >
              {meta.label}
            </span>
            {isOverdue && (
              <span className="shrink-0 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-semibold fp-text-rose">
                Overdue
              </span>
            )}
            {isCurrent && (
              <span className="shrink-0 rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-semibold fp-text-violet">
                Now
              </span>
            )}
          </div>
          <h3
            className={`font-display mt-0.5 truncate text-[13.5px] font-semibold sm:text-sm ${
              isCompleted
                ? "text-fp-text-55 line-through decoration-fp-text-30"
                : "text-fp-text"
            }`}
          >
            {activity.title}
          </h3>
          <p className="mt-0.5 truncate text-[11px] text-fp-text-40">{activity.timeLabel}</p>
          <CardBody activity={activity} />
        </div>

        {!isCompleted && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onComplete();
            }}
            aria-label="Mark complete"
            className="group relative mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-fp-text-20 bg-fp-text-5 transition hover:border-emerald-400/70 hover:bg-emerald-400/10"
          >
            {completing ? (
              <motion.svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5 fp-text-emerald"
                fill="none"
              >
                <motion.path
                  d="M5 13l4 4L19 7"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                />
              </motion.svg>
            ) : (
              <Circle className="h-3 w-3 text-fp-text-30 group-hover:fp-text-emerald" />
            )}
          </button>
        )}
        {isCompleted && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onUncomplete) onUncomplete();
              else onComplete();
            }}
            aria-label="Restore activity (undo complete)"
            title="Tap to restore"
            className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-400/15 fp-text-emerald transition hover:bg-emerald-400/30"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </motion.div>
  );
}
