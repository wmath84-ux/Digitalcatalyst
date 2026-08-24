import { motion } from "framer-motion";
import { Check, Circle, Clock3 } from "lucide-react";
import type { Activity, ActivityStatus } from "../../flowpath/types/flowpath";
import { ACTIVITY_TYPE_META } from "../../flowpath/types/flowpath";
import { ACTIVITY_ICONS } from "./icons";

interface ActivityCardProps {
  activity: Activity;
  status: ActivityStatus;
  side: "left" | "right";
  onComplete: () => void;
  completing: boolean;
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
            {activity.priority} priority
          </span>
        </div>
      );
    case "schedule":
      return (
        <p className="mt-1 text-[12px] text-fp-text-55">
          {activity.startLabel} — {activity.endLabel}
        </p>
      );
    case "note":
      return <p className="mt-1 line-clamp-2 text-[12px] text-fp-text-50">{activity.preview}</p>;
    case "revision":
      return (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-fp-text-10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-400 to-cyan-300"
              style={{ width: `${activity.progress}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-fp-text-45">Progress {activity.progress}%</p>
        </div>
      );
    case "mcq":
      return (
        <p className="mt-1 text-[12px] text-fp-text-50">
          {activity.totalQuestions} Questions · {activity.completedQuestions} Completed
        </p>
      );
    case "reminder":
      return (
        <p className="mt-1 flex items-center gap-1 text-[12px] text-fp-text-50">
          <Clock3 className="h-3 w-3" /> {activity.timeLabel.split("· ")[1] ?? activity.timeLabel}
        </p>
      );
    default:
      return activity.description ? (
        <p className="mt-1 line-clamp-2 text-[12px] text-fp-text-50">{activity.description}</p>
      ) : null;
  }
}

export function ActivityCard({ activity, status, side, onComplete, completing }: ActivityCardProps) {
  const meta = ACTIVITY_TYPE_META[activity.type];
  const Icon = ACTIVITY_ICONS[activity.type];
  const isCurrent = status === "current";
  const isCompleted = status === "completed";
  const isOverdue = status === "overdue";

  return (
    <motion.div
      initial={{ opacity: 0, x: side === "right" ? 28 : -28, scale: 0.92 }}
      animate={{
        opacity: isCompleted ? 0.55 : 1,
        x: 0,
        scale: 1,
        filter: isCompleted ? "saturate(0.55) brightness(0.92)" : "saturate(1) brightness(1)",
      }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={`pointer-events-auto relative w-full rounded-2xl p-3.5 sm:p-4 ${
        isCurrent ? "glass-panel-strong" : "glass-panel"
      }`}
      style={{
        boxShadow: isCurrent ? `0 0 40px -8px ${meta.glow}` : undefined,
        borderColor: isOverdue ? "rgba(251,113,133,0.35)" : undefined,
      }}
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
            onClick={onComplete}
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
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-400/15 fp-text-emerald">
            <Check className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </motion.div>
  );
}
